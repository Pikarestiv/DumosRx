<?php

namespace App\Services\Storefront;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Storefront;
use Illuminate\Support\Facades\Auth;

/**
 * Applies changes to a storefront's look and details, whoever makes them. A
 * super admin's changes wait for a manual rebuild (the admin owns the timing);
 * a store owner has no rebuild button, so theirs also queue the debounced
 * automatic rebuild.
 */
class StorefrontStyleService
{
    /**
     * @param  array<string, mixed>  $settings
     */
    public function apply(Storefront $storefront, array $settings, string $storeLabel, bool $queueAutomaticRebuild): Storefront
    {
        $storefront->fill($settings);

        if (! $storefront->isDirty()) {
            return $storefront;
        }

        $changed = array_keys($storefront->getDirty());
        $storefront->style_dirty_at = now();
        $storefront->save();

        if ($queueAutomaticRebuild) {
            Product::markStorefrontsDirty([], [$storefront->user_id]);
        }

        ActivityLog::create([
            'user_id' => Auth::id(),
            'action' => 'STOREFRONT_SETTINGS_CHANGED',
            'description' => 'Changed storefront settings ('.implode(', ', $changed)."){$storeLabel}",
        ]);

        return $storefront->refresh();
    }
}
