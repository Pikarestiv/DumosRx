<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\StorefrontPaymentIntent;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Payment\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * PG-1: the storefront's charge is pinned to Paystack, and every lookup of
 * that charge afterwards reads the provider off the intent rather than
 * assuming one. See laravel-server/AGENTS.md's storefront payment section.
 */
class StorefrontProviderPinningTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'payment.paystack.secret_key' => 'sk_test_fake',
            'payment.flutterwave.secret_key' => 'flw_test_fake',
        ]);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['store_url' => true]]],
            'enable_paystack' => true,
            'enable_flutterwave' => true,
        ]);

        $this->owner = User::create([
            'first_name' => 'Pin', 'last_name' => 'Owner',
            'email' => 'pinning-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Pinned Pharmacy',
            'store_slug' => 'pinned-pharmacy', 'device_id' => 'WEB-PIN',
            'currency' => 'NGN', 'online_store_enabled' => true,
            'paystack_subaccount_code' => 'ACCT_pinned',
        ]);

        $this->product = Product::create([
            'name' => 'Paracetamol', 'selling_price' => 100,
            'is_active' => true, 'show_online' => true,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-PIN-1', 'quantity' => 50, 'cost_price' => 40,
            'expiry_date' => now()->addYear(),
        ]);

        $this->withoutMiddleware([
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_a_paystack_failure_at_initialize_never_falls_back_to_flutterwave()
    {
        Http::fake([
            'api.paystack.co/transaction/initialize' => Http::response(['status' => false], 503),
            'api.flutterwave.com/*' => Http::response([
                'status' => 'success', 'data' => ['link' => 'https://flutterwave.com/pay/should-not-happen'],
            ], 200),
        ]);

        $this->postJson('/api/v1/storefront/pinned-pharmacy/checkout/initialize', [
            'customer_email' => 'buyer@example.com',
            'items' => [['product_id' => $this->product->id, 'quantity' => 2]],
        ])->assertStatus(500);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'flutterwave.com'));
        $this->assertDatabaseCount('storefront_payment_intents', 0);
    }

    public function test_the_subscription_flow_keeps_its_flutterwave_fallback()
    {
        Http::fake([
            'api.paystack.co/transaction/initialize' => Http::response(['status' => false], 503),
            'api.flutterwave.com/v3/payments' => Http::response([
                'status' => 'success', 'data' => ['link' => 'https://flutterwave.com/pay/fallback'],
            ], 200),
        ]);

        $result = app(PaymentService::class)->initializeTransaction(3000, 'sub@example.com');

        $this->assertSame('flutterwave', $result['provider']);
        $this->assertSame('https://flutterwave.com/pay/fallback', $result['checkout_url']);
    }

    public function test_confirming_an_order_verifies_against_the_provider_recorded_on_the_intent()
    {
        $items = [[
            'product_id' => $this->product->id, 'quantity' => 2,
            'unit_price' => 100, 'subtotal' => 200,
        ]];

        StorefrontPaymentIntent::create([
            'store_id' => $this->store->id,
            'reference' => 'DRX-FW-LEGACY-1',
            'provider' => 'flutterwave',
            'amount' => 200,
            'currency' => 'NGN',
            'status' => 'pending',
            'items' => $items,
            'customer_email' => 'buyer@example.com',
        ]);

        Http::fake([
            'api.paystack.co/transaction/verify/*' => Http::response(['status' => false], 404),
            'api.flutterwave.com/v3/transactions/verify_by_reference*' => Http::response([
                'status' => 'success',
                'data' => ['status' => 'successful', 'amount' => 200, 'currency' => 'NGN'],
            ], 200),
        ]);

        $this->postJson('/api/v1/storefront/pinned-pharmacy/checkout', [
            'customer_name' => 'Buyer',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'DRX-FW-LEGACY-1',
            'items' => [['product_id' => $this->product->id, 'quantity' => 2]],
        ])->assertStatus(201);

        Http::assertSent(fn ($request) => str_contains($request->url(), 'flutterwave.com/v3/transactions/verify_by_reference'));
    }
}
