<?php

namespace App\Services\Storefront;

use App\Models\Store;
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
    public function forPlan(string $plan): array
    {
        $plans = (array) config('storefront_entitlements.plans');
        $entitlements = $plans[$plan] ?? $plans['free'];

        $entitlements['allowed_presets'] = match (true) {
            $entitlements['allowed_presets'] === 'all' => StorefrontThemes::PRESET_IDS,
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

            return [$plan => $entitlements];
        })->all();
    }

    /**
     * @return array<string, mixed>
     */
    public function forOwner(User $user): array
    {
        $owner = $this->subscriptions->getSubscriptionOwner($user);
        $entitlements = $this->forPlan($this->subscriptions->resolveEffectivePlan($owner));
        $entitlements['storefront_enabled'] = $entitlements['storefront_enabled'] && $this->subscriptions->hasFeature($owner, 'store_url');

        return $entitlements;
    }

    /**
     * @return array<string, mixed>
     */
    public function forStore(Store $store): array
    {
        $owner = User::find($store->user_id);

        return $owner ? $this->forOwner($owner) : $this->forPlan('free');
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
            $paymentMethod === 'paystack' && ! $entitlements['checkout_paystack'] => 'This store does not take online card payments. Pay by transfer or when you collect your order.',
            $paymentMethod === 'transfer' && ! $entitlements['checkout_transfer_mobile_money'] => 'This store does not take transfers. Pay when you collect your order.',
            $paymentMethod === 'in_store' && $fulfilment === 'delivery' && ! $entitlements['checkout_pay_on_delivery'] => 'This store does not accept payment on delivery. Pay by transfer or online.',
            default => null,
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
