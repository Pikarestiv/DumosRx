<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * A JSON list column that is authoritative about being a list.
 *
 * Laravel's built-in 'array' cast json_encode()s whatever it is given on
 * write. Every one of these columns originates on the Tauri client, where it
 * is a SQLite TEXT column holding JSON, so the sync push (SyncController
 * push() -> Model::forceFill($payload)) hands the cast a *string* that is
 * already JSON. The built-in cast encodes it a second time, and the value
 * decodes back to a PHP string rather than an array on every subsequent read.
 *
 * A true SQL NULL is passed through as null rather than normalised to [].
 * Laravel short-circuits NULL for primitive casts but not for class casts, so
 * without that the "column was never set" state would read back as "every
 * payment method is disabled". See docs/FIXED_BUGS.md -> A-29 and A-32.
 */
class JsonList implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?array
    {
        if ($value === null) {
            return null;
        }

        return $this->toList($value);
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): array
    {
        if ($value === null) {
            return [$key => null];
        }

        return [$key => json_encode($this->toList($value))];
    }

    /**
     * Decodes repeatedly so an already double-encoded row heals on read
     * rather than needing a data migration, and yields [] for anything that
     * is not a JSON list (a bare word, an object, a scalar).
     */
    private function toList(mixed $value): array
    {
        for ($depth = 0; $depth < self::MAX_DECODE_DEPTH; $depth++) {
            if (is_array($value)) {
                return array_is_list($value) ? $value : [];
            }

            if (!is_string($value)) {
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
