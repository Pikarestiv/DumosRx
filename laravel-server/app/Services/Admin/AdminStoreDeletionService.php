<?php

namespace App\Services\Admin;

use App\Exceptions\StoreActionBlockedException;
use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use App\Support\SchemaTables;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** Archive, restore and purge for a store. Behaviour and rationale: docs/ADMIN_STORE_LIFECYCLE.md. */
class AdminStoreDeletionService
{
    /** Tables whose rows belong to a store through something other than store_id. */
    private const OWNER_SCOPED_TABLES = [
        'subscriptions' => 'user_id',
        'payment_transactions' => 'user_id',
    ];

    /** Roles whose accounts run the platform rather than a shop. */
    private const PLATFORM_ROLES = ['super_admin', 'platform_admin', 'agent'];

    public function __construct(
        private ForeignKeyCascadeEmulator $cascades,
        private PurgedUserRowSweeper $userRows,
    ) {}

    public function archiveStore(string $storeId, ?string $reason, User $actor): ?Store
    {
        $store = Store::withTrashed()->find($storeId);

        if (! $store || $store->trashed()) {
            return null;
        }

        DB::transaction(function () use ($store, $reason, $actor) {
            $store->forceFill([
                'deleted_by_id' => $actor->id,
                'deletion_reason' => $reason,
            ])->save();

            $store->delete();

            $this->revokeSessions($this->storeUserIds($store));

            ActivityLog::create([
                'user_id' => $actor->id,
                'store_id' => $store->id,
                'action' => 'STORE_ARCHIVED',
                'description' => "Archived store: {$store->name} ({$store->id}). Reason: ".($reason ?: 'N/A'),
            ]);
        });

        return $store;
    }

    public function restoreStore(string $storeId, User $actor): ?Store
    {
        $store = Store::onlyTrashed()->find($storeId);

        if (! $store) {
            return null;
        }

        $this->assertRestoreAllowed($store);

        DB::transaction(function () use ($store, $actor) {
            $store->restore();

            $store->forceFill([
                'deleted_by_id' => null,
                'deletion_reason' => null,
            ])->save();

            ActivityLog::create([
                'user_id' => $actor->id,
                'store_id' => $store->id,
                'action' => 'STORE_RESTORED',
                'description' => "Restored archived store: {$store->name} ({$store->id})"
                    .$this->suspensionNote($store),
            ]);
        });

        return $store;
    }

    /** @return array{was_suspended: bool, suspension_reason: string|null, warning: string|null} */
    public function restoreWarnings(Store $store): array
    {
        if (! $store->isSuspended()) {
            return ['was_suspended' => false, 'suspension_reason' => null, 'warning' => null];
        }

        return [
            'was_suspended' => true,
            'suspension_reason' => $store->suspension_reason,
            'warning' => 'This store was suspended before it was archived and is still suspended: '
                .'its owner and staff cannot sign in until it is unsuspended.',
        ];
    }

    private function suspensionNote(Store $store): string
    {
        if (! $store->isSuspended()) {
            return '';
        }

        return '. Store remains suspended. Reason: '.($store->suspension_reason ?: 'N/A');
    }

    /**
     * @return array<string, int>|null Rows removed per table, or null if no
     *                                 such store exists.
     */
    public function purgeStore(string $storeId, User $actor): ?array
    {
        $store = Store::withTrashed()->find($storeId);

        if (! $store) {
            return null;
        }

        $this->assertPurgeAllowed($store, $actor);

        $storeName = $store->name;
        $removed = [];

        // SQLite ignores `PRAGMA foreign_keys` inside an open transaction, so this wraps it.
        Schema::withoutForeignKeyConstraints(function () use ($store, $storeId, $storeName, $actor, &$removed) {
            DB::transaction(function () use ($store, $storeId, $storeName, $actor, &$removed) {
                $this->purgeRows($store, $removed);

                ActivityLog::create([
                    'user_id' => $actor->id,
                    'action' => 'STORE_PURGED',
                    'description' => mb_substr("Permanently deleted store: {$storeName} ({$storeId})", 0, 255),
                    'properties' => ['rows_removed' => $removed],
                ]);
            });
        });

        return $removed;
    }

    /** @param  array<string, int>  $removed */
    private function purgeRows(Store $store, array &$removed): void
    {
        $ownerId = $store->user_id;
        $staffIds = User::withTrashed()->where('store_id', $store->id)->pluck('id')->all();
        $ownedStoreIds = $ownerId
            ? Store::withTrashed()->where('user_id', $ownerId)->lockForUpdate()->pluck('id')->all()
            : [];
        $ownerIsSolelyThisStore = $ownerId
            && array_values(array_diff($ownedStoreIds, [$store->id])) === [];

        $storeScopedTables = $this->storeScopedTables();

        foreach ($storeScopedTables as $table) {
            $count = DB::table($table)->where('store_id', $store->id)->delete();
            if ($count > 0) {
                $removed[$table] = $count;
            }
        }

        $this->purgeLegacyCashierSales($staffIds, $ownerId, $removed);

        $store->forceDelete();
        $removed['stores'] = 1;

        $userIds = $staffIds;
        if ($ownerIsSolelyThisStore) {
            $userIds[] = $ownerId;
        }

        if ($userIds === []) {
            return;
        }

        foreach (self::OWNER_SCOPED_TABLES as $table => $column) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            $count = DB::table($table)->whereIn($column, $userIds)->delete();
            if ($count > 0) {
                $removed[$table] = ($removed[$table] ?? 0) + $count;
            }
        }

        $this->revokeSessions($userIds);
        $this->userRows->sweep(
            $userIds,
            (bool) $ownerIsSolelyThisStore,
            $storeScopedTables,
            ['users', 'stores', ...array_keys(self::OWNER_SCOPED_TABLES)],
            $removed,
        );
        $this->cascades->cascadeChildren('users', $userIds, $removed, ['stores', ...$storeScopedTables]);

        $removed['users'] = (int) User::withTrashed()->whereIn('id', $userIds)->forceDelete();
    }

    private function assertRestoreAllowed(Store $store): void
    {
        if (! $store->user_id) {
            return;
        }

        $owner = User::withTrashed()->find($store->user_id);

        if ($owner && $owner->trashed()) {
            throw new StoreActionBlockedException(
                'This store was archived along with its owner. Restore the owner account first.'
            );
        }
    }

    private function assertPurgeAllowed(Store $store, User $actor): void
    {
        $owner = $store->user_id ? User::withTrashed()->find($store->user_id) : null;

        if (! $owner) {
            return;
        }

        if ($owner->id === $actor->id) {
            throw new StoreActionBlockedException(
                'You cannot permanently delete a store owned by your own account.'
            );
        }

        if (in_array($owner->role, self::PLATFORM_ROLES, true)) {
            throw new StoreActionBlockedException(
                "This store is owned by a platform account ({$owner->role}). Reassign the store to a shop owner before deleting it."
            );
        }
    }

    /**
     * @param  list<string>  $staffIds
     * @param  array<string, int>  $removed
     */
    private function purgeLegacyCashierSales(array $staffIds, ?string $ownerId, array &$removed): void
    {
        $cashierIds = array_values(array_filter(array_merge($staffIds, [$ownerId])));

        if ($cashierIds === [] || ! Schema::hasTable('sales')) {
            return;
        }

        $saleIds = DB::table('sales')
            ->whereNull('store_id')
            ->whereIn('cashier_id', $cashierIds)
            ->pluck('id')
            ->all();

        if ($saleIds === []) {
            return;
        }

        $this->userRows->sweepChildren('sales', $saleIds, $removed);
        $this->cascades->cascadeChildren('sales', $saleIds, $removed, $this->storeScopedTables());

        $count = DB::table('sales')->whereIn('id', $saleIds)->delete();

        if ($count > 0) {
            $removed['sales'] = ($removed['sales'] ?? 0) + $count;
        }
    }

    /** @return list<string> Owner plus every staff member of $store. */
    private function storeUserIds(Store $store): array
    {
        return User::withTrashed()
            ->where('store_id', $store->id)
            ->pluck('id')
            ->push($store->user_id)
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    /** @param  list<string>  $userIds */
    private function revokeSessions(array $userIds): void
    {
        if ($userIds === [] || ! Schema::hasTable('personal_access_tokens')) {
            return;
        }

        DB::table('personal_access_tokens')
            ->where('tokenable_type', User::class)
            ->whereIn('tokenable_id', $userIds)
            ->delete();
    }

    /** @return string[] */
    private function storeScopedTables(): array
    {
        $tables = [];

        foreach (SchemaTables::names() as $name) {
            if ($name === 'stores' || $name === 'users') {
                continue;
            }

            if (Schema::hasColumn($name, 'store_id')) {
                $tables[] = $name;
            }
        }

        return $tables;
    }
}
