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

    /** @var array<string, array<string, string>> Parent table to [child table => column naming the parent]; children are swept depth first. */
    public const CHILDREN = [
        'sales' => ['sale_items' => 'sale_id', 'returns' => 'sale_id'],
        'sale_items' => ['sale_item_batches' => 'sale_item_id'],
        'returns' => ['return_items' => 'return_id'],
        'prescriptions' => ['prescription_items' => 'prescription_id'],
    ];

    /** Tenant business data with a user_id and no store_id: removed only when the whole tenant goes. */
    private const TENANT_TABLES_WITHOUT_STORE = ['vendors'];

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
            if (in_array($table, $skipTables, true) || ! in_array('user_id', Schema::getColumnListing($table), true)) {
                continue;
            }

            $isStoreScoped = in_array($table, $storeScopedTables, true);
            $isTenantData = $isStoreScoped || in_array($table, self::TENANT_TABLES_WITHOUT_STORE, true);
            if ($isTenantData && ! $wholeTenantGone) {
                continue;
            }

            $query = DB::table($table)->whereIn('user_id', $userIds);
            if ($isStoreScoped) {
                $query->whereNull('store_id');
            }
            if (isset(self::CHILDREN[$table])) {
                $this->sweepChildren($table, (clone $query)->pluck('id')->all(), $removed);
            }

            $this->count($removed, $table, $query->delete());
        }

        $this->clearPointers($userIds);
    }

    /**
     * Deletes every descendant of $parentIds in $parentTable, per CHILDREN. Does not delete the parents.
     *
     * @param  list<string>  $parentIds
     * @param  array<string, int>  $removed
     */
    public function sweepChildren(string $parentTable, array $parentIds, array &$removed): void
    {
        if ($parentIds === []) {
            return;
        }

        foreach (self::CHILDREN[$parentTable] ?? [] as $childTable => $column) {
            if (! Schema::hasTable($childTable)) {
                continue;
            }

            if (isset(self::CHILDREN[$childTable])) {
                $this->sweepChildren($childTable, DB::table($childTable)->whereIn($column, $parentIds)->pluck('id')->all(), $removed);
            }

            $this->count($removed, $childTable, DB::table($childTable)->whereIn($column, $parentIds)->delete());
        }
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
}
