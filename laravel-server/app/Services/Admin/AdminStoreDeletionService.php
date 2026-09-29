<?php

namespace App\Services\Admin;

use App\Exceptions\StoreActionBlockedException;
use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The two destructive store actions, kept out of AdminStoreService so the
 * irreversible one lives in a file whose whole purpose is obvious.
 *
 * Archive is Store's SoftDeletes column: the row and every child record
 * stay exactly as they are, and the model's global scope drops the store
 * out of the fleet list, sync and every other Store query until it is
 * restored.
 *
 * Purge is the founder's escape hatch for a store created by mistake. Most
 * store_id columns in this schema carry no database-level foreign key (see
 * add_store_id_to_domain_tables), so nothing cascades on its own and a
 * plain Store::forceDelete() would leave every product, sale and staff row
 * behind as an orphan. Instead the purge introspects the live schema for
 * every table carrying a store_id and clears each one, which also means a
 * table added later is covered without touching this file.
 */
class AdminStoreDeletionService
{
    /** Tables whose rows belong to a store through something other than a
     * store_id column, cleared explicitly during a purge. */
    private const OWNER_SCOPED_TABLES = [
        'subscriptions' => 'user_id',
        'payment_transactions' => 'user_id',
    ];

    /** Roles whose accounts run the platform rather than a shop; purging a
     * store they own would take the account with it. */
    private const PLATFORM_ROLES = ['super_admin', 'platform_admin', 'agent'];

    public function __construct(private ForeignKeyCascadeEmulator $cascades)
    {
    }

    public function archiveStore(string $storeId, ?string $reason, User $actor): ?Store
    {
        $store = Store::withTrashed()->find($storeId);

        if (!$store || $store->trashed()) {
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
                'action' => 'STORE_ARCHIVED',
                'description' => "Archived store: {$store->name} ({$store->id}). Reason: ".($reason ?: 'N/A'),
                'status' => 'success',
            ]);
        });

        return $store;
    }

    public function restoreStore(string $storeId, User $actor): ?Store
    {
        $store = Store::onlyTrashed()->find($storeId);

        if (!$store) {
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
                'action' => 'STORE_RESTORED',
                'description' => "Restored archived store: {$store->name} ({$store->id})",
                'status' => 'success',
            ]);
        });

        return $store;
    }

    /**
     * @return array<string, int>|null Rows removed per table, or null if no
     *                                 such store exists.
     */
    public function purgeStore(string $storeId, User $actor): ?array
    {
        $store = Store::withTrashed()->find($storeId);

        if (!$store) {
            return null;
        }

        $this->assertPurgeAllowed($store, $actor);

        $storeName = $store->name;
        $removed = [];

        // SQLite ignores `PRAGMA foreign_keys` inside an open transaction, so
        // the constraint suspension has to wrap the transaction, not sit in it.
        Schema::withoutForeignKeyConstraints(function () use ($store, &$removed) {
            DB::transaction(function () use ($store, &$removed) {
                // Read inside the transaction, under a row lock on the
                // owner's stores, so a store created concurrently for the
                // same owner cannot be missed by the solely-owns check.
                $ownerId = $store->user_id;
                $staffIds = User::withTrashed()->where('store_id', $store->id)->pluck('id')->all();
                $ownedStoreIds = $ownerId
                    ? Store::withTrashed()->where('user_id', $ownerId)->lockForUpdate()->pluck('id')->all()
                    : [];
                $ownerIsSolelyThisStore = $ownerId
                    && array_values(array_diff($ownedStoreIds, [$store->id])) === [];

                foreach ($this->storeScopedTables() as $table) {
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
                    if (!Schema::hasTable($table)) {
                        continue;
                    }
                    $count = DB::table($table)->whereIn($column, $userIds)->delete();
                    if ($count > 0) {
                        $removed[$table] = ($removed[$table] ?? 0) + $count;
                    }
                }

                $this->revokeSessions($userIds);
                $this->cascades->cascadeChildren('users', $userIds, $removed, ['stores']);

                $removed['users'] = User::withTrashed()->whereIn('id', $userIds)->forceDelete();
            });
        });

        ActivityLog::create([
            'user_id' => $actor->id,
            'action' => 'STORE_PURGED',
            'description' => "Permanently deleted store: {$storeName} ({$storeId}). Rows removed: "
                .json_encode($removed),
            'status' => 'success',
        ]);

        return $removed;
    }

    /**
     * AdminUserService::deleteUser() archives the owner's store as a side
     * effect of soft-deleting the owner. Restoring such a store on its own
     * would put a live store back in the fleet with a deleted owner, so the
     * owner has to come back first.
     */
    private function assertRestoreAllowed(Store $store): void
    {
        if (!$store->user_id) {
            return;
        }

        $owner = User::withTrashed()->find($store->user_id);

        if ($owner && $owner->trashed()) {
            throw new StoreActionBlockedException(
                'This store was archived along with its owner. Restore the owner account first.'
            );
        }
    }

    /**
     * Refuses a purge that would take a platform account with it, or that
     * the acting admin aimed at their own store. Both used to run and then
     * fail partway through on the activity-log foreign key.
     */
    private function assertPurgeAllowed(Store $store, User $actor): void
    {
        $owner = $store->user_id ? User::withTrashed()->find($store->user_id) : null;

        if (!$owner) {
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
     * Sales synced before sales.store_id existed carry a null store_id and
     * are attributed to a store through the cashier, exactly as
     * AdminStoreService::revenueSubquery() and AdminStoreMetricsService do.
     * Left behind, they silently reattribute this store's revenue to
     * whichever other store the surviving owner still has.
     *
     * @param  list<string>  $staffIds
     * @param  array<string, int>  $removed
     */
    private function purgeLegacyCashierSales(array $staffIds, ?string $ownerId, array &$removed): void
    {
        $cashierIds = array_values(array_filter(array_merge($staffIds, [$ownerId])));

        if ($cashierIds === [] || !Schema::hasTable('sales')) {
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

        $this->cascades->cascadeChildren('sales', $saleIds, $removed);

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

    /**
     * Archiving has to cut the store off from the API, not just hide it
     * from admin listings: the sync endpoints resolve their tenant scope
     * from users.store_id and would happily keep accepting pushes.
     *
     * @param  list<string>  $userIds
     */
    private function revokeSessions(array $userIds): void
    {
        if ($userIds === [] || !Schema::hasTable('personal_access_tokens')) {
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

        foreach (Schema::getTableListing() as $table) {
            $name = str_contains($table, '.') ? substr($table, strrpos($table, '.') + 1) : $table;

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
