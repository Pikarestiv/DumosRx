<?php

namespace App\Services\Admin;

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

        $storeName = $store->name;
        $staffIds = User::withTrashed()->where('store_id', $store->id)->pluck('id')->all();
        $ownerId = $store->user_id;
        $ownerIsSolelyThisStore = $ownerId
            && !Store::withTrashed()->where('user_id', $ownerId)->where('id', '!=', $store->id)->exists();

        $removed = [];

        // SQLite ignores `PRAGMA foreign_keys` inside an open transaction, so
        // the constraint suspension has to wrap the transaction, not sit in it.
        Schema::withoutForeignKeyConstraints(function () use ($store, $staffIds, $ownerId, $ownerIsSolelyThisStore, &$removed) {
            DB::transaction(function () use ($store, $staffIds, $ownerId, $ownerIsSolelyThisStore, &$removed) {
                foreach ($this->storeScopedTables() as $table) {
                    $count = DB::table($table)->where('store_id', $store->id)->delete();
                    if ($count > 0) {
                        $removed[$table] = $count;
                    }
                }

                $userIds = $staffIds;
                if ($ownerIsSolelyThisStore) {
                    $userIds[] = $ownerId;
                }

                if ($userIds !== []) {
                    foreach (self::OWNER_SCOPED_TABLES as $table => $column) {
                        if (!Schema::hasTable($table)) {
                            continue;
                        }
                        $count = DB::table($table)->whereIn($column, $userIds)->delete();
                        if ($count > 0) {
                            $removed[$table] = ($removed[$table] ?? 0) + $count;
                        }
                    }

                    if (Schema::hasTable('personal_access_tokens')) {
                        DB::table('personal_access_tokens')
                            ->where('tokenable_type', User::class)
                            ->whereIn('tokenable_id', $userIds)
                            ->delete();
                    }

                    $removed['users'] = User::withTrashed()->whereIn('id', $userIds)->forceDelete();
                }

                $store->forceDelete();
                $removed['stores'] = 1;
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
