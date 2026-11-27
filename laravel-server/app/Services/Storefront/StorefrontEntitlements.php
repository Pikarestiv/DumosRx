<?php

namespace App\Services\Storefront;

use App\Models\Store;
use App\Models\Storefront;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\SubscriptionService;
use App\Support\StorefrontThemes;

/** What a plan's storefront may do; see laravel-server/AGENTS.md, "Storefront plan entitlements". */
class StorefrontEntitlements
{
    public const PLANS = ['free', 'starter', 'pro', 'enterprise'];

    public function __construct(private readonly SubscriptionService $subscriptions) {}

    /**
     * @return array<string, mixed>
     */
    public function forPlan(string $plan, ?string $storeType = null): array
    {
        $plans = (array) config('storefront_entitlements.plans');
        $entitlements = $plans[$plan] ?? $plans['free'];

        $entitlements['allowed_presets'] = match (true) {
            $entitlements['allowed_presets'] === 'all' => StorefrontThemes::PRESET_IDS,
            $entitlements['allowed_presets'] === 'store_type_default' => [StorefrontThemes::defaultPresetFor($storeType)],
            $plan === 'pro' => $this->proAllowedPresets(),
            default => $this->knownPresets((array) $entitlements['allowed_presets']),
        };

        return $entitlements;
    }

    /**
     * Every plan's entitlements as the client sees them beside the plan editor's features.
     *
     * @param  array<string, mixed>  $subscriptionPlans
     * @return array<string, array<string, mixed>>
     */
    public function forEveryPlan(array $subscriptionPlans): array
    {
        return collect(self::PLANS)->mapWithKeys(function (string $plan) use ($subscriptionPlans) {
            $entitlements = $this->forPlan($plan);
            $entitlements['storefront_enabled'] = $entitlements['storefront_enabled'] && ! empty($subscriptionPlans['tiers'][$plan]['features']['store_url']);
            $entitlements['owner_opt_in_required'] = $this->requiresOwnerOptIn($plan);

            return [$plan => $entitlements];
        })->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function forOwner(User $user, ?string $storeType = null): array
    {
        $owner = $this->subscriptions->getSubscriptionOwner($user);
        $plan = $this->subscriptions->resolveEffectivePlan($owner);
        if ($storeType === null && config("storefront_entitlements.plans.{$plan}.allowed_presets") === 'store_type_default') {
            $storeType = $this->ownerStoreType($owner);
        }

        $entitlements = $this->forPlan($plan, $storeType);
        $entitlements['storefront_enabled'] = $entitlements['storefront_enabled']
            && $this->subscriptions->hasFeature($owner, 'store_url')
            && (! $this->requiresOwnerOptIn($plan) || $this->hasOwnerOptedIn($owner));

        return $entitlements;
    }

    /** The plan offers a storefront at all, before any owner opt-in. */
    public function planOffersStorefront(User $user): bool
    {
        $owner = $this->subscriptions->getSubscriptionOwner($user);

        return $this->forPlan($this->subscriptions->resolveEffectivePlan($owner))['storefront_enabled']
            && $this->subscriptions->hasFeature($owner, 'store_url');
    }

    public function requiresOwnerOptIn(string $plan): bool
    {
        return in_array($plan, (array) config('storefront_entitlements.owner_opt_in_plans'), true);
    }

    public function relistsTrimmedOnUpgrade(string $plan): bool
    {
        return in_array($plan, (array) config('storefront_entitlements.relist_trimmed_on_upgrade_plans'), true);
    }

    /** Opted in by the owner, or carried over from a plan that needed no opt-in (a downgrade keeps a live storefront live). */
    public function hasOwnerOptedIn(User $user): bool
    {
        $storefront = Storefront::where('user_id', $this->subscriptions->getSubscriptionOwner($user)->id)
            ->first(['owner_opted_in_at', 'applied_plan']);

        return $storefront !== null && ($storefront->owner_opted_in_at !== null || $this->carriesStorefrontOver($storefront->applied_plan));
    }

    public function carriesStorefrontOver(?string $previousPlan): bool
    {
        return $previousPlan !== null && $this->forPlan($previousPlan)['storefront_enabled'] && ! $this->requiresOwnerOptIn($previousPlan);
    }

    private function ownerStoreType(User $owner): string
    {
        $primary = Storefront::where('user_id', $owner->id)->value('primary_store_id');

        return (string) Store::where('user_id', $owner->id)
            ->when($primary, fn ($query) => $query->whereKey($primary))
            ->orderBy('created_at')
            ->value('store_type');
    }

    /**
     * @return array<string, mixed>
     */
    public function forStore(Store $store): array
    {
        $owner = User::find($store->user_id);

        return $owner ? $this->forOwner($owner, (string) $store->store_type) : $this->forPlan('free');
    }

    public function effectivePlan(User $owner): string
    {
        return $this->subscriptions->resolveEffectivePlan($this->subscriptions->getSubscriptionOwner($owner));
    }

    /**
     * @return array<int, string>
     */
    public function proAllowedPresets(): array
    {
        $raw = SystemConfig::getVal(config('storefront_entitlements.pro_allowed_presets_key'));
        $saved = is_array($raw) ? $this->knownPresets($raw) : [];

        return $saved !== [] ? $saved : $this->knownPresets((array) config('storefront_entitlements.plans.pro.allowed_presets'));
    }

    /**
     * @param  array<string, mixed>  $entitlements
     */
    public function effectiveTheme(?string $theme, array $entitlements): string
    {
        $theme = $theme ?: StorefrontThemes::DEFAULT;

        if (! in_array($theme, StorefrontThemes::PRESET_IDS, true) || in_array($theme, $entitlements['allowed_presets'], true)) {
            return $theme;
        }

        return $entitlements['allowed_presets'][0] ?? StorefrontThemes::DEFAULT;
    }

    /**
     * @param  array<string, mixed>  $entitlements
     */
    public function checkoutRefusal(array $entitlements, string $paymentMethod, string $fulfilment): ?string
    {
        return match (true) {
            $paymentMethod === 'paystack' && ! $entitlements['checkout_paystack'] => 'This store does not take online card payments. '.$this->otherWaysToPay($entitlements),
            $paymentMethod === 'transfer' && ! $entitlements['checkout_transfer_mobile_money'] => 'This store does not take transfers. '.$this->otherWaysToPay($entitlements),
            $paymentMethod === 'in_store' && $fulfilment === 'delivery' && ! $entitlements['checkout_pay_on_delivery'] => 'This store does not accept payment on delivery. '.$this->upfrontWaysToPay($entitlements),
            default => null,
        };
    }

    /** @param  array<string, mixed>  $entitlements */
    private function otherWaysToPay(array $entitlements): string
    {
        return match (true) {
            (bool) $entitlements['checkout_transfer_mobile_money'] => 'Pay by transfer or when you collect your order.',
            (bool) $entitlements['checkout_pay_on_delivery'] => 'Pay when you collect your order or on delivery.',
            default => 'Pay when you collect your order.',
        };
    }

    /** @param  array<string, mixed>  $entitlements */
    private function upfrontWaysToPay(array $entitlements): string
    {
        return match (true) {
            $entitlements['checkout_transfer_mobile_money'] && $entitlements['checkout_paystack'] => 'Pay by transfer or online.',
            (bool) $entitlements['checkout_transfer_mobile_money'] => 'Pay by transfer.',
            (bool) $entitlements['checkout_paystack'] => 'Pay online.',
            default => 'Choose pickup and pay when you collect your order.',
        };
    }

    /**
     * @param  array<int|string, mixed>  $presets
     * @return array<int, string>
     */
    private function knownPresets(array $presets): array
    {
        return array_values(array_intersect(StorefrontThemes::PRESET_IDS, array_filter($presets, 'is_string')));
    }
}
