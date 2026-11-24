<?php

namespace App\Support;

/**
 * The storefront theme allow-list. web/lib/storefront-themes.ts mirrors these
 * ids and web/__tests__/storefront-themes.test.ts pins the two lists equal.
 */
final class StorefrontThemes
{
    public const DEFAULT = 'emerald';

    public const CLASSIC_IDS = ['emerald', 'forest', 'navy', 'rose', 'amber', 'slate', 'violet'];

    public const PRESET_IDS = ['workshop', 'clinic', 'studio', 'market', 'boutique', 'grove'];

    public const IDS = [...self::CLASSIC_IDS, ...self::PRESET_IDS];
}
