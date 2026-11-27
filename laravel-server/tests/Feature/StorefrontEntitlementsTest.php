<?php

namespace Tests\Feature;

use App\Models\SystemConfig;
use App\Services\Storefront\StorefrontEntitlements;
use App\Support\StorefrontThemes;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsStorefrontPlans;
use Tests\TestCase;

/** Which storefront features each plan gets (config/storefront_entitlements.php). */
class StorefrontEntitlementsTest extends TestCase
{
    use BuildsStorefrontPlans;
    use RefreshDatabase;

    private const PRESET_KEY = 'storefront.pro_allowed_presets';

    protected function setUp(): void
    {
        parent::setUp();
        $this->grantStoreUrlToEveryPlan();
    }

    private function entitlementsOn(?string $plan): array
    {
        [$owner] = $this->storefrontOwner('owner-'.($plan ?? 'none'), $plan);

        return app(StorefrontEntitlements::class)->forOwner($owner);
    }

    public function test_pro_gets_a_storefront_with_the_lighter_feature_set(): void
    {
        $pro = $this->entitlementsOn('pro');

        $this->assertTrue($pro['storefront_enabled']);
        $this->assertSame(['workshop', 'clinic', 'market'], $pro['allowed_presets']);
        $this->assertSame(300, $pro['max_online_products']);
        $this->assertSame('scheduled', $pro['rebuild_mode']);
        foreach (['checkout_whatsapp', 'checkout_transfer_mobile_money', 'checkout_pay_on_delivery'] as $granted) {
            $this->assertTrue($pro[$granted], "Pro should get {$granted}");
        }
        foreach (['custom_accent_colour', 'checkout_paystack', 'checkout_flutterwave', 'remove_powered_by_badge',
            'services_on_storefront', 'visitor_language_switch', 'owner_self_edit_look', 'custom_domain'] as $withheld) {
            $this->assertFalse($pro[$withheld], "Pro should not get {$withheld}");
        }
    }

    public function test_enterprise_gets_every_storefront_feature_and_every_preset(): void
    {
        $enterprise = $this->entitlementsOn('enterprise');

        $this->assertSame(StorefrontThemes::PRESET_IDS, $enterprise['allowed_presets']);
        $this->assertNull($enterprise['max_online_products']);
        $this->assertSame('on_demand', $enterprise['rebuild_mode']);
        foreach ($enterprise as $flag => $value) {
            if (is_bool($value)) {
                $this->assertTrue($value, "Enterprise should get {$flag}");
            }
        }
    }

    public function test_free_and_planless_owners_get_no_storefront(): void
    {
        foreach (['free', null] as $plan) {
            $entitlements = $this->entitlementsOn($plan);
            $this->assertFalse($entitlements['storefront_enabled'], 'plan '.($plan ?? 'none'));
            $this->assertSame([], $entitlements['allowed_presets']);
            $this->assertFalse($entitlements['checkout_paystack']);
        }
    }

    public function test_a_starter_owner_who_has_not_opted_in_gets_no_storefront(): void
    {
        $starter = $this->entitlementsOn('starter');

        $this->assertFalse($starter['storefront_enabled']);
        $this->assertFalse($starter['checkout_paystack']);
    }

    public function test_a_plan_without_store_url_in_the_plan_editor_gets_no_storefront(): void
    {
        SystemConfig::setVal('subscription_plans', ['tiers' => ['pro' => ['features' => ['store_url' => false]]]]);

        $this->assertFalse($this->entitlementsOn('pro')['storefront_enabled']);
    }

    public function test_entitlements_follow_the_grace_period_then_drop_to_free(): void
    {
        [$inGrace] = $this->storefrontOwner('in-grace', null);
        $this->subscribe($inGrace, 'enterprise', now()->subDay());
        [$lapsed] = $this->storefrontOwner('lapsed', null);
        $this->subscribe($lapsed, 'enterprise', now()->subDays(10));

        $service = app(StorefrontEntitlements::class);
        $this->assertTrue($service->forOwner($inGrace)['checkout_paystack']);
        $this->assertFalse($service->forOwner($lapsed)['storefront_enabled']);
    }

    public function test_staff_inherit_their_owners_entitlements(): void
    {
        [$owner, $store] = $this->storefrontOwner('staffed', 'enterprise');
        $staff = \App\Models\User::create([
            'first_name' => 'Cashier', 'last_name' => 'One', 'email' => 'cashier@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'cashier', 'store_id' => $store->id,
        ]);

        $this->assertTrue(app(StorefrontEntitlements::class)->forOwner($staff)['owner_self_edit_look']);
    }

    public function test_an_admin_chosen_pro_preset_list_overrides_the_default(): void
    {
        SystemConfig::setVal(self::PRESET_KEY, ['grove', 'studio']);

        $this->assertSame(['studio', 'grove'], $this->entitlementsOn('pro')['allowed_presets']);
    }

    public function test_a_missing_empty_or_unusable_pro_preset_list_falls_back_to_the_default_never_to_none(): void
    {
        $service = app(StorefrontEntitlements::class);
        $this->assertSame(['workshop', 'clinic', 'market'], $service->proAllowedPresets());

        foreach ([[], ['not-a-preset'], 'workshop', null, ['emerald']] as $saved) {
            SystemConfig::setVal(self::PRESET_KEY, $saved);
            $this->assertSame(['workshop', 'clinic', 'market'], $service->proAllowedPresets(), json_encode($saved));
        }
    }

    public function test_unknown_keys_in_the_admin_list_are_ignored_and_the_rest_kept(): void
    {
        SystemConfig::setVal(self::PRESET_KEY, ['boutique', 'gone-preset']);

        $this->assertSame(['boutique'], app(StorefrontEntitlements::class)->proAllowedPresets());
    }

    public function test_enterprise_presets_ignore_the_pro_list_so_a_new_preset_reaches_enterprise_first(): void
    {
        SystemConfig::setVal(self::PRESET_KEY, ['workshop']);
        $newest = StorefrontThemes::PRESET_IDS[array_key_last(StorefrontThemes::PRESET_IDS)];

        $this->assertContains($newest, $this->entitlementsOn('enterprise')['allowed_presets']);
        $this->assertNotContains($newest, app(StorefrontEntitlements::class)->forPlan('pro')['allowed_presets']);
    }

    public function test_an_unknown_plan_name_resolves_like_free(): void
    {
        $this->assertFalse(app(StorefrontEntitlements::class)->forPlan('basic')['storefront_enabled']);
    }

    public function test_a_preset_outside_the_plan_falls_back_to_the_first_allowed_and_classic_themes_are_never_gated(): void
    {
        $service = app(StorefrontEntitlements::class);
        $pro = $service->forPlan('pro');

        $this->assertSame('workshop', $service->effectiveTheme('studio', $pro));
        $this->assertSame('market', $service->effectiveTheme('market', $pro));
        $this->assertSame('violet', $service->effectiveTheme('violet', $pro));
        $this->assertSame(StorefrontThemes::DEFAULT, $service->effectiveTheme(null, $pro));
        $this->assertSame('studio', $service->effectiveTheme('studio', $service->forPlan('enterprise')));
    }
}
