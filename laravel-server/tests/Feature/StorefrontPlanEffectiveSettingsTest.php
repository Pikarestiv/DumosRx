<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Service;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\Subscription;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsStorefrontPlans;
use Tests\TestCase;

/**
 * The public storefront applies the owner's plan at read time and never
 * rewrites the saved settings, so a downgrade is undone by an upgrade.
 */
class StorefrontPlanEffectiveSettingsTest extends TestCase
{
    use BuildsStorefrontPlans;
    use RefreshDatabase;

    private const SAVED = [
        'theme' => 'studio', 'accent' => '#7A4252', 'show_services' => true,
        'locale' => 'fr', 'enabled_locales' => ['fr', 'en'],
    ];

    protected User $owner;

    protected Store $store;

    protected Storefront $storefront;

    protected Subscription $subscription;

    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->grantStoreUrlToEveryPlan();

        [$this->owner, $this->store] = $this->storefrontOwner('divamax', null, ['paystack_subaccount_code' => 'ACCT_divamax']);
        $this->subscription = $this->subscribe($this->owner, 'pro');
        $this->storefront = $this->storefrontRow($this->owner, $this->store, [
            ...self::SAVED, 'payment_instructions' => 'MoMo 677 000 000', 'pay_on_delivery' => true,
        ]);
        $this->product = Product::create([
            'name' => 'Bulb', 'selling_price' => 1500, 'is_active' => true, 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'batch_number' => 'B1', 'quantity' => 50, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
        ]);
        Service::create(['store_id' => $this->store->id, 'name' => 'Fitting', 'price' => 500, 'is_active' => true]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function onPlan(string $plan): void
    {
        $this->subscription->update(['plan_name' => $plan]);
    }

    private function checkout(string $method, array $extra = [])
    {
        return $this->postJson('/api/v1/storefront/divamax/checkout', [
            'customer_name' => 'Marie', 'customer_phone' => '677123456', 'payment_method' => $method,
            'items' => [['product_id' => $this->product->id, 'quantity' => 1]], ...$extra,
        ]);
    }

    public function test_pro_reads_the_plan_limited_look_while_the_saved_settings_stay_untouched(): void
    {
        $this->getJson('/api/v1/storefront/divamax')->assertOk()
            ->assertJsonPath('storefront.theme', 'workshop')
            ->assertJsonPath('storefront.accent', null)
            ->assertJsonPath('storefront.show_services', false)
            ->assertJsonPath('storefront.locale', 'fr')
            ->assertJsonPath('storefront.enabled_locales', ['fr'])
            ->assertJsonPath('storefront.show_powered_by', true)
            ->assertJsonPath('online_payment_available', false)
            ->assertJsonPath('store.online_payment_available', false);

        $saved = $this->storefront->refresh();
        $this->assertSame(self::SAVED, ['theme' => $saved->theme, 'accent' => $saved->accent, 'show_services' => $saved->show_services,
            'locale' => $saved->locale, 'enabled_locales' => $saved->enabled_locales]);
    }

    public function test_enterprise_reads_everything_that_was_saved(): void
    {
        $this->onPlan('enterprise');

        $this->getJson('/api/v1/storefront/divamax')->assertOk()
            ->assertJsonPath('storefront.theme', 'studio')
            ->assertJsonPath('storefront.accent', '#7A4252')
            ->assertJsonPath('storefront.show_services', true)
            ->assertJsonPath('storefront.enabled_locales', ['fr', 'en'])
            ->assertJsonPath('storefront.show_powered_by', false)
            ->assertJsonPath('online_payment_available', true);
    }

    public function test_a_downgrade_then_an_upgrade_restores_the_original_look(): void
    {
        $this->onPlan('enterprise');
        $before = $this->getJson('/api/v1/storefront/divamax')->json('storefront');
        $this->onPlan('pro');
        $this->getJson('/api/v1/storefront/divamax')->assertJsonPath('storefront.theme', 'workshop');
        $this->onPlan('enterprise');

        $this->assertSame($before, $this->getJson('/api/v1/storefront/divamax')->json('storefront'));
    }

    public function test_an_allowed_pro_preset_and_a_classic_theme_are_served_as_saved(): void
    {
        foreach (['market', 'violet'] as $theme) {
            $this->storefront->update(['theme' => $theme]);
            $this->getJson('/api/v1/storefront/divamax')->assertJsonPath('storefront.theme', $theme);
        }
    }

    public function test_the_shop_page_reports_no_online_payment_on_pro(): void
    {
        $this->getJson('/api/v1/storefront/divamax/products')->assertOk()->assertJsonPath('store.online_payment_available', false);

        $this->onPlan('enterprise');
        $this->getJson('/api/v1/storefront/divamax/products')->assertJsonPath('store.online_payment_available', true);
    }

    public function test_services_are_not_listed_on_pro_even_when_switched_on(): void
    {
        $this->getJson('/api/v1/storefront/divamax/services')->assertOk()->assertExactJson(['data' => []]);

        $this->onPlan('enterprise');
        $this->getJson('/api/v1/storefront/divamax/services')->assertOk()->assertJsonPath('data.0.name', 'Fitting');
    }

    public function test_pro_refuses_paystack_at_both_checkout_endpoints_but_takes_transfer(): void
    {
        $this->postJson('/api/v1/storefront/divamax/checkout/initialize', [
            'customer_email' => 'marie@example.com', 'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'online'));

        $this->checkout('paystack', ['paystack_reference' => 'ref-1'])->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);

        $this->checkout('transfer')->assertCreated();
    }

    public function test_pro_cannot_connect_a_paystack_payment_account_and_enterprise_can(): void
    {
        $this->store->update(['paystack_subaccount_code' => null]);
        $url = "/api/v1/stores/{$this->store->id}/payment-account";

        $this->actingAs($this->owner)->postJson($url, [])->assertForbidden()->assertJsonPath('code', 'UPGRADE_REQUIRED');

        $this->onPlan('enterprise');
        $this->actingAs($this->owner)->postJson($url, [])->assertStatus(422)->assertJsonValidationErrors('account_number');
    }

    public function test_starter_has_no_storefront_at_all(): void
    {
        $this->onPlan('starter');

        $this->getJson('/api/v1/storefront/divamax')->assertNotFound();
        $this->checkout('in_store')->assertNotFound();
    }
}
