<?php

namespace App\Services\Admin;

use App\Support\SchemaTables;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Removes what a purge's force-deleted users leave behind without relying on declared foreign keys.
 * Rules and why: docs/ADMIN_STORE_LIFECYCLE.md, "Rows keyed to a purged user".
 */
class PurgedUserRowSweeper
{
    /** @var array<string, list<string>> Columns the schema declares ON DELETE SET NULL against users. */
    public const POINTER_COLUMNS = [
        'users' => ['account_manager_id', 'referred_by_id', 'registered_by_id'],
        'coupons' => ['created_by', 'assigned_to_user_id'],
        'referral_credit_transactions' => ['referred_user_id'],
    ];

    /** @var array<string, array<string, string>> Child table to its parent column, for parents carrying no user_id of their own. */
    private const CHILDREN = [
        'prescriptions' => ['prescription_items' => 'prescription_id'],
        'returns' => ['return_items' => 'return_id'],
    ];

    /**
     * @param  list<string>  $userIds
     * @param  list<string>  $storeScopedTables  Tables carrying store_id.
     * @param  list<string>  $skipTables  Tables the caller clears itself.
     * @param  array<string, int>  $removed
     */
    public function sweep(array $userIds, bool $wholeTenantGone, array $storeScopedTables, array $skipTables, array &$removed): void
    {
        if ($userIds === []) {
            return;
        }

        foreach (SchemaTables::names() as $table) {
            if (in_array($table, $skipTables, true) || !Schema::hasColumn($table, 'user_id')) {
                continue;
            }

            $isStoreScoped = in_array($table, $storeScopedTables, true);
            if ($isStoreScoped && !$wholeTenantGone) {
                continue;
            }

            $query = DB::table($table)->whereIn('user_id', $userIds);
            if ($isStoreScoped) {
                $query->whereNull('store_id');
                $this->sweepChildren($table, (clone $query)->pluck('id')->all(), $removed);
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

    /**
     * @param  list<string>  $parentIds
     * @param  array<string, int>  $removed
     */
    private function sweepChildren(string $parentTable, array $parentIds, array &$removed): void
    {
        if ($parentIds === []) {
            return;
        }

        if ($parentTable === 'sales') {
            $this->sweepSaleChildren($parentIds, $removed);

            return;
        }

        foreach (self::CHILDREN[$parentTable] ?? [] as $childTable => $column) {
            if (Schema::hasTable($childTable)) {
                $this->count($removed, $childTable, DB::table($childTable)->whereIn($column, $parentIds)->delete());
            }
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

            $rows = DB::table($table)->where(fn ($q) => array_map(fn ($c) => $q->orWhereIn($c, $userIds), $columns));
            if ($table === 'users') {
                $rows->whereNotIn('id', $userIds);
            }
            $rowIds = $rows->pluck('id')->all();
            if ($rowIds === []) {
                continue;
            }

            foreach ($columns as $column) {
                DB::table($table)->whereIn('id', $rowIds)->whereIn($column, $userIds)->update([$column => null]);
            }

            DB::table($table)->whereIn('id', $rowIds)->update($this->syncStamp($table));
        }
    }

    /** @return array<string, mixed> What moves a raw update into the next pull (A-245, A-286). */
    private function syncStamp(string $table): array
    {
        $stamp = [];
        if (Schema::hasColumn($table, '_version')) {
            $stamp['_version'] = DB::raw('COALESCE(_version, 0) + 1');
        }
        foreach (['updated_at', '_synced_at'] as $column) {
            if (Schema::hasColumn($table, $column)) {
                $stamp[$column] = now();
            }
        }

        return $stamp;
    }

    /** @param array<string, int> $removed */
    private function count(array &$removed, string $table, int $count): void
    {
        if ($count > 0) {
            $removed[$table] = ($removed[$table] ?? 0) + $count;
        }
    }
}
