<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** What moves a raw update of a synced row into the next pull: laravel-server/AGENTS.md, "A raw `update()` on a synced table must move `_version`". */
final class SyncRowStamp
{
    /** @var array<string, list<string>> */
    private static array $columns = [];

    /** @return array<string, mixed> */
    public static function for(string $table): array
    {
        self::$columns[$table] ??= array_values(array_filter(
            ['_version', 'updated_at', '_synced_at'],
            fn (string $column) => Schema::hasColumn($table, $column),
        ));

        $stamp = [];
        foreach (self::$columns[$table] as $column) {
            $stamp[$column] = $column === '_version' ? DB::raw('COALESCE(_version, 0) + 1') : now();
        }

        return $stamp;
    }
}
