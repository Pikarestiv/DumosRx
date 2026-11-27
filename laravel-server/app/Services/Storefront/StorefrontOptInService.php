<?php

namespace App\Services\Storefront;

use App\Exceptions\StoreActionBlockedException;
use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/** An owner switching on a plan's opt-in storefront (Starter); see laravel-server/AGENTS.md, "Starter storefront". */
class StorefrontOptInService
{
    public function __construct(
        private readonly StorefrontCatalogService $catalog,
        private readonly StorefrontListingTrimmer $trimmer,
    ) {}

    public const BY_OWNER = 'owner';

    public const BY_ADMIN = 'admin';

    public function optIn(User $owner, string $by = self::BY_OWNER): Storefront
    {
        return DB::transaction(function () use ($owner, $by) {
            $storefront = $this->storefrontOf($owner);
            if ($storefront->owner_opted_in_at !== null) {
                return $storefront;
            }

            Storefront::whereKey($storefront->id)->toBase()->update(['owner_opted_in_at' => now(), 'opted_in_by' => $by]);
            ActivityLog::create([
                'user_id' => $by === self::BY_ADMIN ? (Auth::id() ?? $owner->id) : $owner->id,
                'action' => $by === self::BY_ADMIN ? 'STOREFRONT_ADMIN_OPTED_IN' : 'STOREFRONT_OWNER_OPTED_IN',
                'description' => ($by === self::BY_ADMIN ? 'Switched on the online storefront for the owner' : 'Switched on the online storefront')
                    ." for store: {$storefront->name} ({$storefront->primary_store_id})",
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
