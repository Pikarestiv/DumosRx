<?php

namespace App\Services\Storefront;

use App\Models\Product;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\User;

/** Notices plan changes nothing else announces (lapse, grace expiry, admin change) through storefronts.applied_plan. */
class StorefrontPlanWatcher
{
    public function __construct(
        private readonly StorefrontEntitlements $entitlements,
        private readonly StorefrontListingTrimmer $trimmer,
    ) {}

    /** @return int how many storefronts moved from one recorded plan to another */
    public function reconcile(): int
    {
        $storefronts = Storefront::all();
        $owners = User::whereIn('id', $storefronts->pluck('user_id')->unique())->get()->keyBy('id');
        $changed = 0;

        foreach ($storefronts as $storefront) {
            $owner = $owners[$storefront->user_id] ?? null;
            $plan = $owner ? $this->entitlements->effectivePlan($owner) : 'free';
            if ($storefront->applied_plan === $plan) {
                continue;
            }

            $carriesOver = $storefront->owner_opted_in_at === null && $this->entitlements->requiresOwnerOptIn($plan)
                && $this->entitlements->carriesStorefrontOver($storefront->applied_plan);
            Storefront::whereKey($storefront->id)->toBase()->update(['applied_plan' => $plan, ...($carriesOver ? ['owner_opted_in_at' => now(), 'opted_in_by' => 'plan_change'] : [])]);
            Store::where('user_id', $storefront->user_id)->where('online_store_enabled', true)->get()
                ->each(function (Store $store) {
                    $this->trimmer->trimToCap($store);
                    $this->trimmer->relistTrimmed($store);
                });

            if ($storefront->applied_plan !== null) {
                Product::markStorefrontsDirty([], [$storefront->user_id]);
                $changed++;
            }
        }

        return $changed;
    }
}
