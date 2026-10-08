<?php

namespace App\Services\Admin\Support;

class QueryInput
{
    public static function stringOrNull(mixed $value): ?string
    {
        return is_string($value) ? $value : null;
    }
}
