<?php

namespace App\Services\Sync;

use Illuminate\Database\Eloquent\Builder;

/** Withholds the services tables, and held carts holding a service line, from bundles older than INTRODUCED_IN.
 * Retire once no active device reports an older X-App-Version; see laravel-server/AGENTS.md. */
final class LegacyServicesPullGate
{
    public const INTRODUCED_IN = '0.0.42';

    public const SERVICE_TABLES = ['services', 'sale_services', 'return_services'];

    private const SERVICE_LINE_MARKERS = ['%"item_type":"service"%', '%"item_type": "service"%'];

    public static function tables(array $tables, ?string $appVersion): array
    {
        return self::isLegacyBundle($appVersion) ? array_values(array_diff($tables, self::SERVICE_TABLES)) : $tables;
    }

    public static function scope(Builder $query, string $table, ?string $appVersion): void
    {
        if ($table !== 'held_transactions' || ! self::isLegacyBundle($appVersion)) {
            return;
        }
        foreach (self::SERVICE_LINE_MARKERS as $marker) {
            $query->where('items_json', 'not like', $marker);
        }
    }

    private static function isLegacyBundle(?string $appVersion): bool
    {
        return ! $appVersion || version_compare($appVersion, self::INTRODUCED_IN, '<');
    }
}
