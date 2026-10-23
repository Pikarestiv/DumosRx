<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Removes what a purge's force-deleted users leave behind without relying on declared foreign keys.
 * Rules and why: docs/ADMIN_STORE_LIFECYCLE.md, "Rows keyed to a purged user".
 */
class PurgedUserRowSweeper
{
    /** @var array<string, list<string>> Columns the schema declares ON DELETE SET NULL against users. */
    private const POINTER_COLUMNS = [
        'users' => ['account_manager_id', 'referred_by_id', 'registered_by_id'],
        'coupons' => ['created_by', 'assigned_to_user_id'],
        'referral_credit_transactions' => ['referred_user_id'],
    ];

    /**
     * @param  list<string>  $userIds
     * @param  list<string>  $skipTables  Tables the caller clears itself.
     * @param  array<string, int>  $removed
     */
    public function sweep(array $userIds, array $skipTables, array &$removed): void
    {
        if ($userIds === []) {
            return;
        }

        foreach ($this->userKeyedTables($skipTables) as $table => $hasStoreId) {
            $query = DB::table($table)->whereIn('user_id', $userIds);
            if ($hasStoreId) {
                $query->whereNull('store_id');
            }

            $this->count($removed, $table, $query->delete());
        }

        $this->clearPointers($userIds);
    }

    /**
     * @param  list<string>  $saleIds
     * @param  array<string, int>  $removed
     */
    public function sweepSaleChildren(array $saleIds, array &$removed): void
    {
        if ($saleIds === [] || !Schema::hasTable('sale_items')) {
            return;
        }

        $saleItemIds = DB::table('sale_items')->whereIn('sale_id', $saleIds)->pluck('id')->all();

        if ($saleItemIds !== [] && Schema::hasTable('sale_item_batches')) {
            $this->count($removed, 'sale_item_batches', DB::table('sale_item_batches')->whereIn('sale_item_id', $saleItemIds)->delete());
        }

        $this->count($removed, 'sale_items', DB::table('sale_items')->whereIn('sale_id', $saleIds)->delete());
    }

    /** @param array<string, int> $removed */
    private function count(array &$removed, string $table, int $count): void
    {
        if ($count > 0) {
            $removed[$table] = ($removed[$table] ?? 0) + $count;
        }
    }

    /** @param list<string> $userIds */
    private function clearPointers(array $userIds): void
    {
        foreach (self::POINTER_COLUMNS as $table => $columns) {
            $columns = Schema::hasTable($table) ? array_values(array_filter($columns, fn ($c) => Schema::hasColumn($table, $c))) : [];
            if ($columns === []) {
                continue;
            }

            $rowIds = DB::table($table)
                ->where(fn ($q) => array_map(fn ($c) => $q->orWhereIn($c, $userIds), $columns))
                ->pluck('id')
                ->all();
            if ($rowIds === []) {
                continue;
            }

            foreach ($columns as $column) {
                DB::table($table)->whereIn('id', $rowIds)->whereIn($column, $userIds)->update([$column => null]);
            }

            if (Schema::hasColumn($table, '_version')) {
                DB::table($table)->whereIn('id', $rowIds)->update(['_version' => DB::raw('COALESCE(_version, 0) + 1')]);
            }
        }
    }

    /**
     * @param  list<string>  $skipTables
     * @return array<string, bool> Table name to whether it also carries store_id.
     */
    private function userKeyedTables(array $skipTables): array
    {
        $tables = [];

        foreach (Schema::getTableListing() as $table) {
            $name = str_contains($table, '.') ? substr($table, strrpos($table, '.') + 1) : $table;

            if (in_array($name, $skipTables, true) || !Schema::hasColumn($name, 'user_id')) {
                continue;
            }

            $tables[$name] = Schema::hasColumn($name, 'store_id');
        }

        return $tables;
    }
}
