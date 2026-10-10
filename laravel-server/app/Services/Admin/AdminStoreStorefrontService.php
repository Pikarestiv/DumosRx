<?php

namespace App\Services\Admin;

use App\Exceptions\StoreActionBlockedException;
use App\Models\ActivityLog;
use App\Models\Store;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Publishes or unpublishes a store's public storefront on the owner's behalf.
 * Its own service rather than another method on AdminStoreService, which is
 * already past the repo's 350-line rule - same reason AdminStoreReferrerService
 * and AdminUserDeviceService were split out. See web/AGENTS.md, "Store Details:
 * bounded lists, the storefront switch, separators", for why setting this flag
 * is not the last word on whether a storefront is reachable.
 */
class AdminStoreStorefrontService
{
    public function setEnabled(string $id, bool $enabled): Store
    {
        return DB::transaction(function () use ($id, $enabled) {
            $store = Store::findOrFail($id);

            if ($enabled && blank($store->store_slug)) {
                throw new StoreActionBlockedException(
                    'This store has no storefront slug yet, so publishing it would produce no reachable page. The owner sets the slug in the app first.',
                );
            }

            $store->online_store_enabled = $enabled;
            $store->save();

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => $enabled ? 'STOREFRONT_PUBLISHED' : 'STOREFRONT_UNPUBLISHED',
                'description' => ($enabled ? 'Published' : 'Unpublished')
                    ." the online storefront for store: {$store->name} ({$store->id})",
            ]);

            return $store->refresh();
        });
    }
}
