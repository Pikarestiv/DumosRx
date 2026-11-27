<?php

namespace Tests\Feature;

use App\Models\SystemConfig;
use Database\Seeders\SystemConfigSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** A fresh install seeds the production plan config (database/seeders/data/subscription_plans.json). */
class SystemConfigSeederPlansTest extends TestCase
{
    use RefreshDatabase;

    private function seededPlans(): array
    {
        (new SystemConfigSeeder)->run();

        return SystemConfig::getVal('subscription_plans');
    }

    public function test_a_fresh_install_seeds_the_production_plans(): void
    {
        $plans = $this->seededPlans();

        $this->assertSame('pro', $plans['trial_plan']);
        $this->assertSame(14, $plans['trial_days']);
        $this->assertTrue($plans['enable_flutterwave']);
        $this->assertTrue($plans['enable_manual_payment']);
        $this->assertSame('Moniepoint', $plans['manual_payment_bank']);
        $this->assertSame(1, $plans['tiers']['free']['limits']['staff']);
        $this->assertSame(30, $plans['tiers']['pro']['limits']['sync_interval']);
        $this->assertSame(15000, $plans['tiers']['enterprise']['price_monthly']);
        $this->assertTrue($plans['tiers']['starter']['features']['proforma_quotes']);
    }

    public function test_store_url_is_the_storefront_key_and_ecommerce_survives_only_for_old_bundles(): void
    {
        $tiers = $this->seededPlans()['tiers'];

        $this->assertFalse($tiers['free']['features']['store_url']);
        $this->assertFalse($tiers['starter']['features']['store_url']);
        $this->assertTrue($tiers['pro']['features']['store_url']);
        $this->assertTrue($tiers['enterprise']['features']['store_url']);
        $this->assertTrue($tiers['enterprise']['features']['ecommerce']);
        $this->assertArrayNotHasKey('ecommerce', $tiers['pro']['features']);
    }

    public function test_the_seed_never_carries_a_real_bank_account_number(): void
    {
        $this->assertDoesNotMatchRegularExpression('/\d{6,}/', (string) $this->seededPlans()['manual_payment_account_number']);
    }

    public function test_an_existing_plan_config_is_never_overwritten(): void
    {
        SystemConfig::setVal('subscription_plans', ['tiers' => ['pro' => ['price_monthly' => 9999]]]);

        (new SystemConfigSeeder)->run();

        $this->assertSame(['tiers' => ['pro' => ['price_monthly' => 9999]]], SystemConfig::getVal('subscription_plans'));
    }
}
