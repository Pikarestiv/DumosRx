<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\Subscription;
use App\Models\User;
use App\Services\Storefront\StorefrontEntitlements;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\BuildsStorefrontPlans;
use Tests\TestCase;

/** The Starter storefront: opt-in only, 50 products, WhatsApp/pickup/pay on delivery, one preset, the badge, nightly rebuilds. */
class StorefrontStarterTierTest extends TestCase
{
    use BuildsStorefrontPlans;
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected Subscription $subscription;

    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->grantStoreUrlToEveryPlan();
        config(['dumos.github.token' => 'gh-test-token', 'dumos.github.repo' => 'dumos/dumosrx', 'dumos.storefront.rebuild_token' => null]);
        Http::fake(['api.github.com/*' => Http::response(null, 204)]);

        [$this->owner, $this->store] = $this->storefrontOwner('corner-shop', null, [
            'store_type' => 'pharmacy', 'paystack_subaccount_code' => 'ACCT_corner',
        ]);
        $this->subscription = $this->subscribe($this->owner, 'starter');
        $this->storefrontRow($this->owner, $this->store, [
            'theme' => 'studio', 'accent' => '#7A4252', 'whatsapp' => '+237 677 000 000',
            'payment_instructions' => 'MoMo 677 000 000', 'pay_on_delivery' => true, 'delivery_available' => true,
        ]);
        $this->product = $this->product('Paracetamol');
        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'batch_number' => 'B1', 'quantity' => 50, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function product(string $name, bool $listed = true): Product
    {
        return Product::create([
            'name' => $name, 'selling_price' => 100, 'is_active' => true, 'show_online' => $listed,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
    }

    private function optIn()
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/storefront/opt-in');
    }

    private function checkout(string $method, array $extra = [])
    {
        return $this->postJson('/api/v1/storefront/corner-shop/checkout', [
            'customer_name' => 'Marie', 'customer_phone' => '677123456', 'payment_method' => $method,
            'items' => [['product_id' => $this->product->id, 'quantity' => 1]], ...$extra,
        ]);
    }

    /** @return array<int, string> */
    private function listedNames(): array
    {
        return Product::where('store_id', $this->store->id)->where('show_online', true)->orderBy('name')->pluck('name')->all();
    }

    private function reconcile(): void
    {
        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();
    }

    public function test_an_opted_in_starter_gets_the_limited_storefront_from_plan_data(): void
    {
        $this->optIn()->assertOk();

        $starter = app(StorefrontEntitlements::class)->forOwner($this->owner);

        $this->assertTrue($starter['storefront_enabled']);
        $this->assertSame(50, $starter['max_online_products']);
        $this->assertSame(['clinic'], $starter['allowed_presets']);
        $this->assertSame('scheduled', $starter['rebuild_mode']);
        foreach (['checkout_whatsapp', 'checkout_pay_on_delivery'] as $granted) {
            $this->assertTrue($starter[$granted], "Starter should get {$granted}");
        }
        foreach (['checkout_transfer_mobile_money', 'checkout_paystack', 'checkout_flutterwave', 'custom_accent_colour',
            'remove_powered_by_badge', 'services_on_storefront', 'visitor_language_switch', 'owner_self_edit_look', 'custom_domain'] as $withheld) {
            $this->assertFalse($starter[$withheld], "Starter should not get {$withheld}");
        }
    }

    public function test_the_one_starter_preset_follows_the_store_type_the_storefront_payload_reports(): void
    {
        $service = app(StorefrontEntitlements::class);

        $this->assertSame(['clinic'], $service->forPlan('starter', 'pharmacy')['allowed_presets']);
        $this->assertSame(['workshop'], $service->forPlan('starter', 'hardware')['allowed_presets']);
        foreach ([null, '', 'store'] as $unknown) {
            $this->assertSame(['workshop'], $service->forPlan('starter', $unknown)['allowed_presets'], var_export($unknown, true));
        }

        $this->store->update(['store_type' => 'supermarket']);
        $this->assertSame(['workshop'], $service->forStore($this->store->refresh())['allowed_presets']);
    }

    public function test_an_existing_starter_store_already_switched_on_stays_dark_until_the_owner_opts_in(): void
    {
        foreach (range(1, 60) as $i) {
            $this->product("Item {$i}");
        }

        $this->reconcile();

        $this->getJson('/api/v1/storefront/corner-shop')->assertNotFound();
        $this->checkout('in_store')->assertNotFound();
        $this->assertSame('starter', Storefront::where('user_id', $this->owner->id)->value('applied_plan'));
        $this->assertCount(61, $this->listedNames());
        $this->assertSame(0, Notification::count());
        $this->assertFalse(app(StorefrontEntitlements::class)->forOwner($this->owner)['storefront_enabled']);
    }

    public function test_the_settings_read_tells_the_till_an_opt_in_is_needed_then_that_it_happened(): void
    {
        $this->actingAs($this->owner)->getJson('/api/v1/app/storefront-settings')->assertOk()
            ->assertJsonPath('allowed', false)
            ->assertJsonPath('opt_in_required', true)
            ->assertJsonPath('opted_in', false)
            ->assertJsonPath('entitlements.storefront_enabled', false)
            ->assertJsonPath('entitlements.max_online_products', 50);

        $this->optIn()->assertOk()->assertJsonPath('opted_in', true)->assertJsonPath('entitlements.storefront_enabled', true);

        $this->actingAs($this->owner)->getJson('/api/v1/app/storefront-settings')
            ->assertJsonPath('opted_in', true)
            ->assertJsonPath('entitlements.allowed_presets', ['clinic']);
    }

    public function test_opting_in_publishes_the_switched_on_store_at_the_next_nightly_rebuild(): void
    {
        $this->optIn()->assertOk();

        $this->getJson('/api/v1/storefront/corner-shop')->assertOk();
        $this->assertNotNull($this->store->refresh()->storefront_dirty_at);
        $this->assertDatabaseHas('activity_logs', ['user_id' => $this->owner->id, 'action' => 'STOREFRONT_OWNER_OPTED_IN']);

        $this->reconcile();
        Http::assertNothingSent();
        $this->artisan('storefront:rebuild-if-dirty', ['--include-scheduled' => true])->assertSuccessful();
        Http::assertSentCount(1);
    }

    public function test_opting_in_is_idempotent_and_keeps_the_first_time(): void
    {
        $this->optIn()->assertOk();
        $first = Storefront::where('user_id', $this->owner->id)->value('owner_opted_in_at');
        $this->travel(2)->days();

        $this->optIn()->assertOk();

        $this->assertEquals($first, Storefront::where('user_id', $this->owner->id)->value('owner_opted_in_at'));
        $this->assertSame(1, \App\Models\ActivityLog::where('action', 'STOREFRONT_OWNER_OPTED_IN')->count());
    }

    public function test_only_the_owner_on_a_plan_with_a_storefront_can_opt_in(): void
    {
        $staff = User::create([
            'first_name' => 'Cashier', 'last_name' => 'One', 'email' => 'cashier@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'cashier', 'store_id' => $this->store->id,
        ]);
        $this->actingAs($staff)->postJson('/api/v1/app/storefront/opt-in')->assertForbidden();

        $this->subscription->update(['plan_name' => 'free']);
        $this->optIn()->assertForbidden()->assertJsonPath('code', 'UPGRADE_REQUIRED');

        $this->assertNull(Storefront::where('user_id', $this->owner->id)->value('owner_opted_in_at'));
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/app/storefront/opt-in')->assertUnauthorized();
    }

    public function test_an_owner_without_a_storefront_address_cannot_opt_in_yet(): void
    {
        [$bare] = $this->storefrontOwner('bare', 'starter', ['store_slug' => null]);

        $this->actingAs($bare)->postJson('/api/v1/app/storefront/opt-in')->assertStatus(422);
        $this->assertSame(0, Storefront::where('user_id', $bare->id)->count());
    }

    public function test_starter_checkout_takes_pickup_and_pay_on_delivery_and_refuses_online_payment_and_transfer(): void
    {
        $this->optIn()->assertOk();

        $this->postJson('/api/v1/storefront/corner-shop/checkout/initialize', [
            'customer_email' => 'marie@example.com', 'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ])->assertStatus(422);
        $this->checkout('paystack', ['paystack_reference' => 'ref-1'])->assertStatus(422);
        $this->checkout('transfer')->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);

        $this->checkout('in_store')->assertCreated();
        $this->checkout('in_store', ['fulfilment_method' => 'delivery', 'customer_address' => '12 Rue Joss'])->assertCreated();
        $this->assertDatabaseCount('online_orders', 2);
    }

    public function test_starter_cannot_connect_a_paystack_payment_account(): void
    {
        $this->optIn()->assertOk();
        $this->store->update(['paystack_subaccount_code' => null]);

        $this->actingAs($this->owner)->postJson("/api/v1/stores/{$this->store->id}/payment-account", [])
            ->assertForbidden()->assertJsonPath('code', 'UPGRADE_REQUIRED');
    }

    public function test_the_public_payload_shows_the_badge_the_one_preset_whatsapp_and_no_way_to_pay_online_or_by_transfer(): void
    {
        $this->optIn()->assertOk();

        $this->getJson('/api/v1/storefront/corner-shop')->assertOk()
            ->assertJsonPath('storefront.show_powered_by', true)
            ->assertJsonPath('storefront.theme', 'clinic')
            ->assertJsonPath('storefront.accent', null)
            ->assertJsonPath('storefront.whatsapp', '+237 677 000 000')
            ->assertJsonPath('storefront.payment_instructions', null)
            ->assertJsonPath('storefront.pay_on_delivery', true)
            ->assertJsonPath('store.online_payment_available', false);
        $this->getJson('/api/v1/storefront/corner-shop/products')->assertOk()->assertJsonPath('store.online_payment_available', false);

        $saved = Storefront::where('user_id', $this->owner->id)->sole();
        $this->assertSame(['studio', '#7A4252', 'MoMo 677 000 000'], [$saved->theme, $saved->accent, $saved->payment_instructions]);
    }

    public function test_a_starter_owner_cannot_change_the_look_or_publish_on_demand(): void
    {
        $this->optIn()->assertOk();
        Storefront::where('user_id', $this->owner->id)->update(['owner_style_enabled' => true]);

        $this->actingAs($this->owner)->putJson('/api/v1/app/storefront-settings', ['theme' => 'clinic'])
            ->assertForbidden()->assertJsonPath('code', 'UPGRADE_REQUIRED');
        $this->actingAs($this->owner)->postJson('/api/v1/app/storefront/rebuild')->assertForbidden();
        Http::assertNothingSent();
    }

    public function test_opting_in_over_the_cap_keeps_the_best_sellers_and_the_rest_stay_stored(): void
    {
        config(['storefront_entitlements.plans.starter.max_online_products' => 2]);
        $this->product('Bandage');
        $this->product('Syrup');
        $this->sellUnits('Syrup', 9);
        $this->sellUnits('Bandage', 4);

        $this->optIn()->assertOk();

        $this->assertSame(['Bandage', 'Syrup'], $this->listedNames());
        $this->assertSame(3, Product::where('store_id', $this->store->id)->count());
        $this->assertDatabaseHas('storefront_trimmed_listings', ['store_id' => $this->store->id, 'product_id' => $this->product->id]);
    }

    public function test_a_downgrade_from_pro_keeps_the_storefront_live_trims_to_the_cap_and_an_upgrade_relists_everything(): void
    {
        config(['storefront_entitlements.plans.starter.max_online_products' => 2]);
        Storefront::where('user_id', $this->owner->id)->update(['applied_plan' => 'pro']);
        foreach (['Bandage', 'Syrup', 'Vitamin C'] as $name) {
            $this->product($name);
        }
        $this->sellUnits('Syrup', 9);
        $this->sellUnits('Vitamin C', 4);

        $this->getJson('/api/v1/storefront/corner-shop')->assertOk();
        $this->reconcile();

        $this->getJson('/api/v1/storefront/corner-shop')->assertOk();
        $this->assertSame(['Syrup', 'Vitamin C'], $this->listedNames());
        $this->assertSame(4, Product::where('store_id', $this->store->id)->count());
        $versionBefore = Product::where('name', 'Bandage')->value('_version');

        $this->subscription->update(['plan_name' => 'pro']);
        $this->reconcile();

        $this->assertSame(['Bandage', 'Paracetamol', 'Syrup', 'Vitamin C'], $this->listedNames());
        $this->assertGreaterThan($versionBefore, Product::where('name', 'Bandage')->value('_version'));
        $this->assertDatabaseCount('storefront_trimmed_listings', 0);
        $this->assertStringContainsString('2 products', Notification::where('user_id', $this->owner->id)->latest('id')->first()->message);
    }

    public function test_relisting_on_upgrade_respects_the_new_cap_and_skips_deleted_products(): void
    {
        config(['storefront_entitlements.plans.starter.max_online_products' => 1, 'storefront_entitlements.plans.pro.max_online_products' => 2]);
        $this->product('Bandage');
        $this->product('Syrup');
        $this->sellUnits('Syrup', 9);
        $this->sellUnits('Bandage', 4);
        $this->optIn()->assertOk();
        $this->assertSame(['Syrup'], $this->listedNames());
        Product::where('name', 'Paracetamol')->first()->delete();

        $this->subscription->update(['plan_name' => 'pro']);
        $this->reconcile();

        $this->assertSame(['Bandage', 'Syrup'], $this->listedNames());
        $this->assertFalse((bool) Product::withTrashed()->where('name', 'Paracetamol')->value('show_online'));
    }

    public function test_a_pro_trim_is_still_not_relisted_on_an_upgrade_to_enterprise(): void
    {
        config(['storefront_entitlements.plans.pro.max_online_products' => 1]);
        $this->subscription->update(['plan_name' => 'pro']);
        Storefront::where('user_id', $this->owner->id)->update(['applied_plan' => 'enterprise']);
        $this->product('Bandage');
        $this->reconcile();
        $this->assertCount(1, $this->listedNames());

        $this->subscription->update(['plan_name' => 'enterprise']);
        $this->reconcile();

        $this->assertCount(1, $this->listedNames());
        $this->assertDatabaseCount('storefront_trimmed_listings', 0);
    }

    public function test_the_sync_push_withholds_a_listing_past_the_starter_cap(): void
    {
        config(['storefront_entitlements.plans.starter.max_online_products' => 1]);
        \App\Models\SystemConfig::setVal('subscription_plans', ['tiers' => ['starter' => [
            'features' => ['store_url' => true, 'cloud_sync' => true], 'limits' => ['stores' => -1],
        ]]]);
        $this->optIn()->assertOk();
        $id = (string) \Illuminate\Support\Str::uuid();

        $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'changes' => [['table_name' => 'products', 'operation' => 'INSERT', 'record_id' => $id, 'payload' => [
                'id' => $id, 'name' => 'New', 'selling_price' => 50, 'is_active' => 1, 'show_online' => 1,
                'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            ]]],
        ], ['X-Store-Id' => $this->store->id])->assertOk();

        $created = Product::findOrFail($id);
        $this->assertFalse($created->show_online);
        $this->assertGreaterThan(1, $created->_version);
    }

    public function test_the_plan_map_the_till_caches_says_which_plans_need_an_owner_opt_in(): void
    {
        $map = $this->getJson('/api/v1/system-configs/subscription_plans')->assertOk()->json('data.storefront_entitlements');

        $this->assertTrue($map['starter']['owner_opt_in_required']);
        $this->assertTrue($map['starter']['storefront_enabled']);
        $this->assertSame(50, $map['starter']['max_online_products']);
        $this->assertFalse($map['pro']['owner_opt_in_required']);
        $this->assertFalse($map['enterprise']['owner_opt_in_required']);
    }

    private function sellUnits(string $productName, int $units): void
    {
        $sale = \App\Models\Sale::create([
            'cashier_id' => $this->owner->id, 'store_id' => $this->store->id, 'subtotal' => 100, 'total_amount' => 100,
            'amount_paid' => 100, 'payment_method' => 'cash', 'payment_status' => 'completed', 'transaction_date' => now()->subDay(),
        ]);
        \App\Models\SaleItem::create([
            'sale_id' => $sale->id, 'product_id' => Product::where('name', $productName)->value('id'),
            'quantity' => $units, 'unit_price' => 100, 'total_price' => 100 * $units,
        ]);
    }
}
