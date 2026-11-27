<?php

namespace App\Support;

/**
 * The store_type allow-list. client/lib/constants/store-types.ts and
 * web/lib/constants/store-types.ts mirror IDS; see laravel-server/AGENTS.md "Store types".
 */
final class StoreTypes
{
    public const FALLBACK = 'general';

    public const IDS = ['pharmacy', 'supermarket', 'grocery', 'general', 'beauty', 'hardware', 'fashion', 'electronics', 'auto_parts', 'stationery', 'agro', 'other'];

    public const LEGACY_IDS = ['retail'];

    public const ACCEPTED_IDS = [...self::IDS, ...self::LEGACY_IDS];

    public static function rule(): string
    {
        return 'nullable|string|in:'.implode(',', self::ACCEPTED_IDS);
    }

    public static function normalize(?string $type): string
    {
        return in_array($type, self::ACCEPTED_IDS, true) ? $type : self::FALLBACK;
    }
}
