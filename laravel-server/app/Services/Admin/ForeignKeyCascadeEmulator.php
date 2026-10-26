<?php

namespace App\Services\Admin;

use App\Support\SchemaTables;
use App\Support\SyncRowStamp;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Replays the schema's declared ON DELETE actions in PHP. A backstop only: production declares none.
 * See docs/ADMIN_STORE_LIFECYCLE.md, "Rows keyed to a purged user".
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
                    ->update([$reference['column'] => null, ...SyncRowStamp::for($reference['table'])]);

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

        foreach (SchemaTables::names() as $name) {
            foreach (Schema::getForeignKeys($name) as $foreignKey) {
                if (count($foreignKey['columns']) !== 1) {
                    continue;
                }

                $parent = SchemaTables::unqualified($foreignKey['foreign_table']);

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
