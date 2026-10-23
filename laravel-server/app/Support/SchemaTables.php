<?php

namespace App\Support;

use Illuminate\Support\Facades\Schema;

class SchemaTables
{
    /** @return list<string> Every table in the live schema, unqualified. */
    public static function names(): array
    {
        return array_map(fn (string $table) => self::unqualified($table), Schema::getTableListing());
    }

    public static function unqualified(string $table): string
    {
        return str_contains($table, '.') ? substr($table, strrpos($table, '.') + 1) : $table;
    }
}
