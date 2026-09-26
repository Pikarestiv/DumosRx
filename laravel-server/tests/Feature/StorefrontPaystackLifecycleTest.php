<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * One end-to-end pass over the whole storefront online-payment lifecycle for
 * a NON-NGN store (Kenya/KES): connect a subaccount, mint a reference,
 * confirm the order, then cancel it and refund. Deliberately fakes Paystack
 * at the HTTP layer rather than mocking PaymentService, so the currency the
 * charge is minted in, stamped with, and verified against is the real one the
 * store settles in - the per-task tests all mocked PaymentService, which is
 * how a global-config currency comparison shipped unnoticed.
 */
class StorefrontPaystackLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        config(['payment.paystack.secret_key' => 'sk_test_fake']);

        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['store_url' => true]],
            ],
        ]);
        SystemConfig::setVal('storefront_platform_fee_percentage', 2.0);

        $this->owner = User::create([
            'first_name' => 'Kenyan', 'last_name' => 'Owner',
            'email' => 'lifecycle-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Nairobi Chemist',
            'store_slug' => 'nairobi-chemist', 'device_id' => 'WEB-KE',
            'currency' => 'KES', 'online_store_enabled' => true,
        ]);

        $this->product = Product::create([
            'name' => 'Panadol', 'selling_price' => 250,
            'is_active' => true, 'show_online' => true,
            'user_id' => $this->owner->id, 'store_id' => $this->store->id,
        ]);
        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-KE-1', 'quantity' => 10, 'cost_price' => 100,
            'expiry_date' => now()->addYear(),
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_a_kes_store_can_connect_charge_confirm_and_refund_an_online_order()
    {
        Http::fake([
            'api.paystack.co/bank*' => Http::response([
                'status' => true, 'data' => [['name' => 'KCB Bank', 'code' => '01']],
            ], 200),
            'api.paystack.co/subaccount' => Http::response([
                'status' => true, 'data' => ['subaccount_code' => 'ACCT_nairobi'],
            ], 200),
            'api.paystack.co/transaction/initialize' => Http::response([
                'status' => true,
                'data' => [
                    'reference' => 'KES-LIFECYCLE-1',
                    'authorization_url' => 'https://checkout.paystack.com/KES-LIFECYCLE-1',
                ],
            ], 200),
            'api.paystack.co/transaction/verify/*' => Http::response([
                'status' => true,
                'data' => ['status' => 'success', 'amount' => 50000, 'currency' => 'KES'],
            ], 200),
            'api.paystack.co/refund' => Http::response(['status' => true, 'message' => 'Refunded'], 200),
        ]);

        // A country Paystack resolves (Kenya isn't one), so the owner's
        // explicit confirmation is the legitimate path here.
        $this->actingAs($this->owner)
            ->postJson("/api/v1/stores/{$this->store->id}/payment-account", [
                'account_number' => '1234567890',
                'bank_code' => '01',
                'country' => 'kenya',
                'confirmed_unverifiable' => true,
            ])
            ->assertStatus(200);

        $this->store->refresh();
        $this->assertSame('ACCT_nairobi', $this->store->paystack_subaccount_code);

        $items = [['product_id' => $this->product->id, 'quantity' => 2]];

        $this->postJson('/api/v1/storefront/nairobi-chemist/checkout/initialize', [
            'customer_email' => 'wanjiku@example.com',
            'items' => $items,
        ])->assertStatus(200)->assertJson(['transaction_reference' => 'KES-LIFECYCLE-1']);

        // The charge really was minted in KES against this store's subaccount.
        Http::assertSent(fn ($request) => $request->url() === 'https://api.paystack.co/transaction/initialize'
            && $request['currency'] === 'KES'
            && $request['subaccount'] === 'ACCT_nairobi'
            && $request['amount'] === 50000);

        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'KES-LIFECYCLE-1', 'currency' => 'KES', 'status' => 'pending',
        ]);

        $confirm = $this->postJson('/api/v1/storefront/nairobi-chemist/checkout', [
            'customer_name' => 'Wanjiku',
            'customer_phone' => '0700000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'KES-LIFECYCLE-1',
            'items' => $items,
        ]);

        $confirm->assertStatus(201);
        $orderId = $confirm->json('order.id');
        $this->assertDatabaseHas('online_orders', [
            'id' => $orderId, 'payment_status' => 'paid', 'total_amount' => 500.00,
        ]);
        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'KES-LIFECYCLE-1', 'status' => 'consumed', 'online_order_id' => $orderId,
        ]);

        $this->actingAs($this->owner)
            ->postJson("/api/v1/app/online-orders/{$orderId}/fulfill", ['status' => 'cancelled'])
            ->assertStatus(200);

        Http::assertSent(fn ($request) => $request->url() === 'https://api.paystack.co/refund'
            && $request['transaction'] === 'KES-LIFECYCLE-1');

        $this->assertDatabaseHas('online_orders', [
            'id' => $orderId, 'order_status' => 'cancelled', 'payment_status' => 'refunded',
        ]);
    }
}
