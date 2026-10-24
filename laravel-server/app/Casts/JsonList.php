<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/** A client-originated JSON list column that heals double-encoded rows on read.
 * Why it exists and its NULL handling: docs/FIXED_BUGS.md A-29 and A-42. */
class JsonList implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        if ($value === null) {
            return null;
        }

        return self::decodeList($value);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): array
    {
        if ($value === null) {
            return [$key => null];
        }

        return [$key => json_encode(self::decodeList($value))];
    }

    /** Decodes repeatedly; yields [] for anything that is not a JSON list. */
    public static function decodeList(mixed $value): array
    {
        for ($depth = 0; $depth < self::MAX_DECODE_DEPTH; $depth++) {
            if (is_array($value)) {
                return array_is_list($value) ? $value : [];
            }

            if (! is_string($value)) {
                return [];
            }

            $decoded = json_decode($value, true);

            if ($decoded === null) {
                return [];
            }

            $value = $decoded;
        }

        return [];
    }

    private const MAX_DECODE_DEPTH = 4;
}
