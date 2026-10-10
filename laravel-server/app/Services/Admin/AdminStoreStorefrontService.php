<?php

namespace App\Services\Admin;

use App\Exceptions\StoreActionBlockedException;
use App\Models\ActivityLog;
use App\Models\Store;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Publishes or unpublishes a store's public storefront on the owner's behalf,
 * and sets the slug that storefront resolves at. Its own service rather than
 * another method on AdminStoreService, which is already past the repo's
 * 350-line rule - same reason AdminStoreReferrerService and
 * AdminUserDeviceService were split out. See web/AGENTS.md, "Store Details:
 * bounded lists, the storefront switch, separators", for why setting this flag
 * is not the last word on whether a storefront is reachable, and why an admin
 * write to store_slug has to refuse rather than normalise.
 */
class AdminStoreStorefrontService
{
    private const MAX_SLUG_LENGTH = 100;

    public function setEnabled(string $id, bool $enabled, ?string $requestedSlug = null): Store
    {
        return DB::transaction(function () use ($id, $enabled, $requestedSlug) {
            $store = Store::findOrFail($id);
            $slugChangedFrom = null;

            if ($requestedSlug !== null) {
                $slugChangedFrom = $this->applySlug($store, $requestedSlug);
            }

            if ($enabled && blank($store->store_slug)) {
                throw new StoreActionBlockedException(
                    'This store has no storefront slug yet, so publishing it would produce no reachable page. Set the slug with the toggle, or the owner sets it in the app.',
                );
            }

            $store->online_store_enabled = $enabled;
            $store->save();

            ActivityLog::create([
                'user_id' => Auth::id(),
                'action' => $enabled ? 'STOREFRONT_PUBLISHED' : 'STOREFRONT_UNPUBLISHED',
                'description' => ($enabled ? 'Published' : 'Unpublished')
                    ." the online storefront for store: {$store->name} ({$store->id})"
                    .($slugChangedFrom === null
                        ? ''
                        : " - storefront slug changed from '{$slugChangedFrom}' to '{$store->store_slug}'"),
            ]);

            return $store->refresh();
        });
    }

    /**
     * Returns the slug that was replaced, or null when nothing changed.
     */
    private function applySlug(Store $store, string $requestedSlug): ?string
    {
        $slug = Str::slug($requestedSlug);

        if ($slug === '' || strlen($slug) > self::MAX_SLUG_LENGTH) {
            throw new StoreActionBlockedException(
                'That is not a usable storefront address. Use letters, numbers and hyphens, up to '.self::MAX_SLUG_LENGTH.' characters.',
            );
        }

        if ($slug === $store->store_slug) {
            return null;
        }

        $previousSlug = $store->store_slug;

        // withTrashed: store_slug is DB-unique across archived rows too, so an
        // archived store's slug is not actually free to reuse.
        $taken = Store::withTrashed()
            ->where('store_slug', $slug)
            ->where('id', '!=', $store->id)
            ->exists();

        if ($taken) {
            throw new StoreActionBlockedException(
                "Another store already uses the address '{$slug}'. Storefront addresses are public and must be unique, so pick a different one.",
            );
        }

        $store->store_slug = $slug;
        $store->save();

        if ($store->refresh()->store_slug !== $slug) {
            throw new StoreActionBlockedException(
                "The slug change was rejected - a store's storefront address can only change once every 6 months, and this one changed recently.",
            );
        }

        return $previousSlug;
    }
}
