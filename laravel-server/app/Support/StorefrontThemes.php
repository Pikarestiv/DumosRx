<?php

namespace App\Support;

/**
 * The storefront theme allow-list. web/lib/storefront-themes.ts mirrors these
 * ids and web/__tests__/storefront-themes.test.ts pins the two lists equal.
 */
final class StorefrontThemes
{
    public const DEFAULT = 'emerald';

    public const IDS = ['emerald', 'forest', 'navy', 'rose', 'amber', 'slate', 'violet', 'workshop', 'clinic', 'studio'];

    /** The presets a store owner may pick; the classic accent themes stay admin-only. */
    public const OWNER_IDS = ['workshop', 'clinic', 'studio'];
}
