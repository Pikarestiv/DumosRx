<?php

namespace App\Services\Admin;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Applies, in PHP, the ON DELETE actions the database would have applied
 * by itself.
 *
 * AdminStoreDeletionService::purgeStore() runs inside
 * Schema::withoutForeignKeyConstraints(), because most store_id columns in
 * this schema carry no constraint at all and the ones that do would reject
 * the deletion order the purge needs. Suspending the checks also suspends
 * every ON DELETE CASCADE / SET NULL trigger though, on MySQL and SQLite
 * alike, so deleting a user used to leave dangling notifications,
 * permission rows and referral pointers behind. This walks the live
 * schema's foreign keys and performs those actions explicitly instead.
 *
 * Reads the schema through Schema::getForeignKeys(), so a table added
 * later is covered without touching this file.
 */
class ForeignKeyCascadeEmulator
{
    private const MAX_DEPTH = 3;

    /** @var array<string, list<array{table: string, column: string, action: string}>>|null */
    private ?array $referencesByParent = null;

    /**
     * Deletes or nulls every row that references $ids in $parentTable, the
     * way the schema's own ON DELETE actions would have. Does NOT delete
     * the parent rows themselves.
     *
     * @param  list<string|int>  $ids
     * @param  array<string, int>  $removed  Row counts, accumulated per table.
     * @param  list<string>  $skipTables  Tables the caller clears itself.
     */
    public function cascadeChildren(string $parentTable, array $ids, array &$removed, array $skipTables = [], int $depth = 0): void
    {
        if ($ids === [] || $depth > self::MAX_DEPTH) {
            return;
        }

        foreach ($this->referencesTo($parentTable) as $reference) {
            if (in_array($reference['table'], $skipTables, true)) {
                continue;
            }

            if ($reference['action'] === 'set null') {
                DB::table($reference['table'])
                    ->whereIn($reference['column'], $ids)
                    ->update([$reference['column'] => null]);

                continue;
            }

            if ($reference['action'] !== 'cascade') {
                continue;
            }

            $this->cascadeDelete($reference['table'], $reference['column'], $ids, $removed, $skipTables, $depth);
        }
    }

    /**
     * @param  list<string|int>  $ids
     * @param  array<string, int>  $removed
     * @param  list<string>  $skipTables
     */
    private function cascadeDelete(string $table, string $column, array $ids, array &$removed, array $skipTables, int $depth): void
    {
        if (Schema::hasColumn($table, 'id')) {
            $childIds = DB::table($table)->whereIn($column, $ids)->pluck('id')->all();
            $this->cascadeChildren($table, $childIds, $removed, $skipTables, $depth + 1);
        }

        $count = DB::table($table)->whereIn($column, $ids)->delete();

        if ($count > 0) {
            $removed[$table] = ($removed[$table] ?? 0) + $count;
        }
    }

    /** @return list<array{table: string, column: string, action: string}> */
    private function referencesTo(string $parentTable): array
    {
        return $this->schemaReferences()[$parentTable] ?? [];
    }

    /** @return array<string, list<array{table: string, column: string, action: string}>> */
    private function schemaReferences(): array
    {
        if ($this->referencesByParent !== null) {
            return $this->referencesByParent;
        }

        $map = [];

        foreach (Schema::getTableListing() as $table) {
            $name = str_contains($table, '.') ? substr($table, strrpos($table, '.') + 1) : $table;

            foreach (Schema::getForeignKeys($name) as $foreignKey) {
                if (count($foreignKey['columns']) !== 1) {
                    continue;
                }

                $parent = $foreignKey['foreign_table'];
                $parent = str_contains($parent, '.') ? substr($parent, strrpos($parent, '.') + 1) : $parent;

                $map[$parent][] = [
                    'table' => $name,
                    'column' => $foreignKey['columns'][0],
                    'action' => strtolower((string) ($foreignKey['on_delete'] ?? '')),
                ];
            }
        }

        return $this->referencesByParent = $map;
    }
}
