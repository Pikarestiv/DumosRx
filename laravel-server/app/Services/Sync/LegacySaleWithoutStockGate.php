<?php

namespace App\Services\Sync;

/** Refuses to switch stores.allow_sale_without_stock on from a bundle older than INTRODUCED_IN.
 * Retire once no active device reports an older X-App-Version; see laravel-server/AGENTS.md. */
final class LegacySaleWithoutStockGate
{
    public const COLUMN = 'allow_sale_without_stock';

    public const INTRODUCED_IN = '0.0.41';

    public static function apply(array $payload, ?string $appVersion): array
    {
        if (! empty($payload[self::COLUMN]) && self::isLegacyBundle($appVersion)) {
            unset($payload[self::COLUMN]);
        }

        return $payload;
    }

    private static function isLegacyBundle(?string $appVersion): bool
    {
        return ! $appVersion || version_compare($appVersion, self::INTRODUCED_IN, '<');
    }
}
