<?php

namespace Tests\Concerns;

use App\Models\Store;
use App\Models\Storefront;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Support\Str;

trait BuildsStorefrontPlans
{
    protected function grantStoreUrlToEveryPlan(): void
    {
        SystemConfig::setVal('subscription_plans', [
            'grace_period_days' => 3,
            'tiers' => collect(['free', 'starter', 'pro', 'enterprise'])
                ->mapWithKeys(fn ($plan) => [$plan => ['features' => ['store_url' => true]]])
                ->all(),
        ]);
    }

    /**
     * Storefront tests that are about isolation or payments rather than plans
     * keep working on a planless owner by giving every plan Enterprise's storefront.
     */
    protected function grantEveryStorefrontEntitlementToEveryPlan(): void
    {
        $enterprise = config('storefront_entitlements.plans.enterprise');
        foreach (['free', 'starter', 'pro'] as $plan) {
            config(["storefront_entitlements.plans.{$plan}" => $enterprise]);
        }
    }

    protected function subscribe(User $owner, string $plan, ?\DateTimeInterface $endsAt = null): Subscription
    {
        return Subscription::create([
            'user_id' => $owner->id, 'plan_name' => $plan, 'status' => 'active', 'license_key' => 'LIC-'.Str::random(10),
            'start_date' => now()->subMonths(2), 'end_date' => $endsAt ?? now()->addMonth(),
        ]);
    }

    /**
     * @return array{0: User, 1: Store}
     */
    protected function storefrontOwner(string $slug, ?string $plan, array $storeAttrs = []): array
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => ucfirst($slug),
            'email' => "{$slug}@dumosrx.com", 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $store = Store::create(array_merge([
            'user_id' => $owner->id, 'name' => ucfirst($slug), 'store_slug' => $slug,
            'device_id' => 'DEV-'.$slug, 'status' => 'Active', 'online_store_enabled' => true,
        ], $storeAttrs));
        if ($plan !== null) {
            $this->subscribe($owner, $plan);
        }

        return [$owner, $store];
    }

    protected function storefrontRow(User $owner, Store $store, array $attrs = []): Storefront
    {
        return Storefront::create(array_merge([
            'user_id' => $owner->id, 'slug' => $store->store_slug, 'name' => $store->name,
            'primary_store_id' => $store->id, 'is_active' => true,
        ], $attrs));
    }
}
