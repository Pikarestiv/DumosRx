<?php

namespace App\Support;

use Illuminate\Support\Facades\Schema;

class SchemaTables
{
    /** @return list<string> Every table in the live schema, unqualified. */
    public static function names(): array
    {
        return array_map(
            fn (string $table) => str_contains($table, '.') ? substr($table, strrpos($table, '.') + 1) : $table,
            Schema::getTableListing(),
        );
    }
}
