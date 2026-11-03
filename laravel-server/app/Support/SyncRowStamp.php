<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** What moves a raw update of a synced row into the next pull: laravel-server/AGENTS.md, "A raw `update()` on a synced table must move `_version`". */
final class SyncRowStamp
{
    /** @return array<string, mixed> */
    public static function for(string $table): array
    {
        $stamp = [];
        foreach (['_version', 'updated_at', '_synced_at'] as $column) {
            if (Schema::hasColumn($table, $column)) {
                $stamp[$column] = $column === '_version' ? DB::raw('COALESCE(_version, 0) + 1') : now();
            }
        }

        return $stamp;
    }

    /** For a model just saved: `save()` never moves `_version`, and `_version` is not fillable, so stamp the row by key. */
    public static function bump(Model $model): void
    {
        if (! $model->wasChanged()) {
            return;
        }

        $query = $model->newQueryWithoutScopes()->whereKey($model->getKey());
        $query->toBase()->update(self::for($model->getTable()));

        if (array_key_exists('_version', $model->getAttributes())) {
            $model->setAttribute('_version', $query->value('_version'));
            $model->syncOriginalAttribute('_version');
        }
    }
}
