<?php

namespace App\Services\Storefront;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Storefront;
use Illuminate\Support\Facades\Auth;

/** Applies storefront look and details changes; rationale in laravel-server/AGENTS.md. */
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
        if (array_diff($changed, ['owner_style_enabled']) !== []) {
            $storefront->style_dirty_at = now();
        }
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
