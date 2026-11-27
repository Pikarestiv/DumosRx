<?php

namespace App\Services\Storefront;

use App\Exceptions\StoreActionBlockedException;
use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** An owner switching on a plan's opt-in storefront (Starter); see laravel-server/AGENTS.md, "Starter storefront". */
class StorefrontOptInService
{
    public function __construct(
        private readonly StorefrontCatalogService $catalog,
        private readonly StorefrontListingTrimmer $trimmer,
    ) {}

    public function optIn(User $owner): Storefront
    {
        return DB::transaction(function () use ($owner) {
            $storefront = $this->storefrontOf($owner);
            if ($storefront->owner_opted_in_at !== null) {
                return $storefront;
            }

            Storefront::whereKey($storefront->id)->toBase()->update(['owner_opted_in_at' => now()]);
            ActivityLog::create([
                'user_id' => $owner->id,
                'action' => 'STOREFRONT_OWNER_OPTED_IN',
                'description' => "Switched on the online storefront for store: {$storefront->name} ({$storefront->primary_store_id})",
            ]);
            Store::where('user_id', $owner->id)->where('online_store_enabled', true)->get()
                ->each(fn (Store $store) => $this->trimmer->trimToCap($store));
            Product::markStorefrontsDirty([], [$owner->id]);

            return $storefront->refresh();
        });
    }

    private function storefrontOf(User $owner): Storefront
    {
        $existing = Storefront::where('user_id', $owner->id)->lockForUpdate()->first();
        if ($existing) {
            return $existing;
        }

        $slugged = Store::where('user_id', $owner->id)->whereNotNull('store_slug')->where('store_slug', '!=', '')->orderBy('created_at')->first();
        if (! $slugged) {
            throw new StoreActionBlockedException('Your online store has no address yet. Contact your account manager and they will set it up for you.');
        }

        return $this->catalog->storefrontForStore($slugged);
    }
}
