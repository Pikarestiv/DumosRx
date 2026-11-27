<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\Role;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\Subscription;
use App\Models\User;
use App\Services\Storefront\StorefrontEntitlements;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\BuildsStorefrontPlans;
use Tests\TestCase;

/** A super admin switching a Starter storefront on counts as the opt-in; a flag already sitting in the database does not. */
class StorefrontStarterAdminEnableTest extends TestCase
{
    use BuildsStorefrontPlans;
    use RefreshDatabase;

    protected User $owner;

    protected User $admin;

    protected Store $store;

    protected Subscription $subscription;

    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RolesAndPermissionsSeeder::class);
        $this->grantStoreUrlToEveryPlan();
        [$this->owner, $this->store] = $this->storefrontOwner('corner-shop', null, ['store_type' => 'pharmacy', 'online_store_enabled' => false]);
        $this->subscription = $this->subscribe($this->owner, 'starter');
        $this->storefrontRow($this->owner, $this->store, ['payment_instructions' => 'MoMo 677', 'pay_on_delivery' => true]);
        $this->admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin', 'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin', 'role_id' => Role::where('slug', 'super_admin')->first()?->id, 'is_active' => true,
        ]);
        $this->product = Product::create([
            'name' => 'Paracetamol', 'selling_price' => 100, 'is_active' => true, 'show_online' => true,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
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

    private function adminSwitch(bool $enabled)
    {
        return $this->actingAs($this->admin)->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", ['enabled' => $enabled])->assertOk();
    }

    private function storefront(): Storefront
    {
        return Storefront::where('user_id', $this->owner->id)->sole();
    }

    private function storeDetail(): array
    {
        return $this->actingAs($this->admin)->getJson("/api/v1/admin/stores/{$this->store->id}")->assertOk()->json('storefront');
    }

    private function checkout(string $method, array $extra = [])
    {
        return $this->postJson('/api/v1/storefront/corner-shop/checkout', [
            'customer_name' => 'Marie', 'customer_phone' => '677123456', 'payment_method' => $method,
            'items' => [['product_id' => $this->product->id, 'quantity' => 1]], ...$extra,
        ]);
    }

    public function test_an_admin_switching_a_starter_storefront_on_puts_it_live_without_the_owner(): void
    {
        $this->adminSwitch(true);

        $this->getJson('/api/v1/storefront/corner-shop')->assertOk();
        $this->assertNotNull($this->storefront()->owner_opted_in_at);
        $this->assertSame('admin', $this->storefront()->opted_in_by);
        $this->assertDatabaseHas('activity_logs', ['user_id' => $this->admin->id, 'action' => 'STOREFRONT_ADMIN_OPTED_IN']);
    }

    public function test_an_enabled_flag_already_in_the_database_without_an_enable_action_stays_dark(): void
    {
        $this->store->update(['online_store_enabled' => true]);

        $this->getJson('/api/v1/storefront/corner-shop')->assertNotFound();
        $this->artisan('storefront:rebuild-if-dirty')->assertSuccessful();
        $this->getJson('/api/v1/storefront/corner-shop')->assertNotFound();
        $this->assertNull($this->storefront()->owner_opted_in_at);
    }

    public function test_an_admin_re_saving_an_already_flagged_starter_store_as_on_counts_as_the_enable_action(): void
    {
        $this->store->update(['online_store_enabled' => true]);

        $this->adminSwitch(true);

        $this->getJson('/api/v1/storefront/corner-shop')->assertOk();
    }

    public function test_changing_the_address_of_an_already_flagged_store_is_not_the_enable_action(): void
    {
        $this->store->update(['online_store_enabled' => true]);

        $this->actingAs($this->admin)->putJson("/api/v1/admin/stores/{$this->store->id}/storefront", ['enabled' => true, 'store_slug' => 'corner-shop-2'])->assertOk();

        $this->assertNull($this->storefront()->owner_opted_in_at);
    }

    public function test_switching_off_then_on_again_keeps_the_first_opt_in_and_logs_it_once(): void
    {
        $this->adminSwitch(true);
        $first = $this->storefront()->owner_opted_in_at;
        $this->travel(1)->days();

        $this->adminSwitch(false);
        $this->getJson('/api/v1/storefront/corner-shop')->assertNotFound();
        $this->adminSwitch(true);

        $this->getJson('/api/v1/storefront/corner-shop')->assertOk();
        $this->assertEquals($first, $this->storefront()->owner_opted_in_at);
        $this->assertSame(1, ActivityLog::where('action', 'STOREFRONT_ADMIN_OPTED_IN')->count());
    }

    public function test_the_owner_button_still_works_and_records_the_owner(): void
    {
        $this->store->update(['online_store_enabled' => true]);

        $this->actingAs($this->owner)->postJson('/api/v1/app/storefront/opt-in')->assertOk();

        $this->getJson('/api/v1/storefront/corner-shop')->assertOk();
        $this->assertSame('owner', $this->storefront()->opted_in_by);
    }

    public function test_an_admin_enable_on_pro_or_enterprise_records_no_opt_in(): void
    {
        foreach (['pro', 'enterprise'] as $plan) {
            $this->subscription->update(['plan_name' => $plan]);
            $this->adminSwitch(false);
            $this->adminSwitch(true);

            $this->getJson('/api/v1/storefront/corner-shop')->assertOk();
            $this->assertNull($this->storefront()->owner_opted_in_at, $plan);
        }
        $this->assertSame(0, ActivityLog::where('action', 'STOREFRONT_ADMIN_OPTED_IN')->count());
    }

    public function test_the_admin_store_detail_shows_who_opted_in_and_when(): void
    {
        $detail = $this->storeDetail();
        $this->assertTrue($detail['opt_in_required']);
        $this->assertNull($detail['opted_in_at']);
        $this->assertNull($detail['opted_in_by']);

        $this->adminSwitch(true);

        $detail = $this->storeDetail();
        $this->assertSame('admin', $detail['opted_in_by']);
        $this->assertNotNull($detail['opted_in_at']);
        $this->assertTrue($detail['storefront_live']);
    }

    public function test_starter_refusals_name_only_the_ways_a_starter_store_takes_payment(): void
    {
        $this->adminSwitch(true);

        $paystack = $this->checkout('paystack', ['paystack_reference' => 'ref-1'])->assertStatus(422)->json('message');
        $transfer = $this->checkout('transfer')->assertStatus(422)->json('message');

        foreach ([$paystack, $transfer] as $message) {
            $this->assertStringNotContainsStringIgnoringCase('transfer or', $message);
            $this->assertStringContainsString('when you collect your order or on delivery', $message);
        }
    }

    public function test_pro_refusal_wording_is_unchanged(): void
    {
        $this->subscription->update(['plan_name' => 'pro']);
        $refusal = app(StorefrontEntitlements::class)->checkoutRefusal(app(StorefrontEntitlements::class)->forPlan('pro'), 'paystack', 'pickup');

        $this->assertSame('This store does not take online card payments. Pay by transfer or when you collect your order.', $refusal);
    }
}
