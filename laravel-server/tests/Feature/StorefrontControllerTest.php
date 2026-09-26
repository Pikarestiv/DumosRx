<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Payment\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the storefront fixes:
 * - show()/checkout() had no per-store product scoping at all — every
 *   storefront showed the same global catalog and could buy any store's
 *   product through any other store's checkout.
 * - checkout() trusted a client-supplied paystack_reference to mark an
 *   order paid with no server-side verification.
 * - none of slugs()/show()/checkout() re-checked the owner's plan still
 *   includes the `store_url` feature, so a downgraded/lapsed account kept
 *   serving (and charging for) its storefront forever.
 * - checkout() didn't apply show()'s own is_active/show_online filter, so a
 *   deactivated/hidden product id was still purchasable, and it never
 *   checked stock, so an order could be placed for more than the store has.
 */
class StorefrontControllerTest extends TestCase
{
    use RefreshDatabase;

    /**
     * A product that passes checkout()'s is_active/show_online filter, with
     * enough stock (via a stock_batches row - products carry no stock field
     * of their own) to cover any quantity these tests order.
     */
    private function purchasableProduct(array $attrs): Product
    {
        $product = Product::create(array_merge([
            'is_active' => true,
            'show_online' => true,
        ], $attrs));

        StockBatch::create([
            'product_id' => $product->id,
            'user_id' => $attrs['user_id'] ?? null,
            'batch_number' => 'B-' . $product->id,
            'quantity' => 100,
            'cost_price' => 10,
            'expiry_date' => now()->addYear(),
        ]);

        return $product;
    }

    /**
     * Step 1 of the two-step online-payment flow: asks the server to mint a
     * payment reference reserved for this exact cart on this store. Returns
     * the reference checkout() will then accept.
     *
     * $items is the same [['product_id' => ..., 'quantity' => ...], ...]
     * shape the checkout call takes.
     */
    private function initializePaystackCheckout(array $items, string $reference = 'DRX-SF-REF', string $slug = 'store-a'): \Illuminate\Testing\TestResponse
    {
        // These flows exercise the confirm step (checkout()), not the
        // subaccount gate itself — give the target store a subaccount so
        // initializeCheckout()'s new gate doesn't 422 before reaching it.
        Store::where('store_slug', $slug)->update(['paystack_subaccount_code' => 'ACCT_test']);

        $this->mock(PaymentService::class, function ($mock) use ($reference) {
            $mock->shouldReceive('initializeTransaction')
                ->once()
                ->andReturn([
                    'provider' => 'paystack',
                    'reference' => $reference,
                    'checkout_url' => 'https://checkout.paystack.com/' . $reference,
                ]);
        });

        return $this->postJson("/api/v1/storefront/{$slug}/checkout/initialize", [
            'customer_email' => 'jane@example.com',
            'items' => $items,
        ]);
    }

    protected User $ownerA;
    protected Store $storeA;
    protected User $ownerB;

    protected function setUp(): void
    {
        parent::setUp();

        // Only plan-gating behavior is under test in the dedicated
        // test_* methods below; every other test here is about storefront
        // isolation and payment handling, so grant `store_url` by default
        // (free tier is `false` in the real seeded config) to keep those
        // scenarios independent of billing state.
        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['store_url' => true]],
            ],
        ]);

        $this->ownerA = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'ownerA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $this->ownerA->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'WEB-A',
            'online_store_enabled' => true,
        ]);

        $this->ownerB = User::create([
            'first_name' => 'Owner', 'last_name' => 'B',
            'email' => 'ownerB@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_storefront_only_shows_its_own_stores_products()
    {
        Product::create(['name' => 'Store A Product', 'selling_price' => 100, 'is_active' => true, 'show_online' => true, 'user_id' => $this->ownerA->id]);
        Product::create(['name' => 'Store B Product', 'selling_price' => 100, 'is_active' => true, 'show_online' => true, 'user_id' => $this->ownerB->id]);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'products');
        $response->assertJsonMissing(['name' => 'Store B Product']);
    }

    public function test_show_does_not_leak_internal_product_columns()
    {
        Product::create([
            'name' => 'Panadol', 'selling_price' => 100, 'markup_percentage' => 42,
            'is_active' => true, 'show_online' => true, 'user_id' => $this->ownerA->id,
            'store_id' => $this->storeA->id,
        ]);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(200);
        $product = $response->json('products.0');

        // cost_price was dropped from `products` in 2026_06_28, but assert on
        // it anyway so a future re-add can't silently reappear here.
        foreach (['cost_price', 'markup_percentage', 'store_id', 'user_id', '_version', '_synced', '_deleted', 'deleted_at'] as $internal) {
            $this->assertArrayNotHasKey($internal, $product, "Public storefront leaked `{$internal}`");
        }

        // The fields the storefront frontend actually consumes are still there.
        $this->assertSame('Panadol', $product['name']);
        $this->assertArrayHasKey('id', $product);
        $this->assertArrayHasKey('selling_price', $product);
    }

    public function test_checkout_rejects_a_product_belonging_to_another_store()
    {
        $foreignProduct = Product::create(['name' => 'Store B Product', 'selling_price' => 100, 'user_id' => $this->ownerB->id]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $foreignProduct->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(404);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_with_in_store_payment_does_not_require_verification()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('online_orders', ['payment_status' => 'pending', 'payment_method' => 'in_store']);
    }

    public function test_checkout_with_paystack_requires_a_reference()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_initialize_reserves_the_reference_for_this_cart_and_store()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $response = $this->initializePaystackCheckout(
            [['product_id' => $product->id, 'quantity' => 2]],
            'DRX-SF-INIT'
        );

        $response->assertStatus(200);
        $response->assertJson([
            'success' => true,
            'transaction_reference' => 'DRX-SF-INIT',
            'payment_url' => 'https://checkout.paystack.com/DRX-SF-INIT',
        ]);

        // The durable "reference R is reserved for cart C on store S" record
        // exists BEFORE the customer could ever have paid.
        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'DRX-SF-INIT',
            'store_id' => $this->storeA->id,
            'status' => 'pending',
            'amount' => 200.00,
        ]);
    }

    public function test_initialize_prices_the_cart_server_side_and_rejects_unpurchasable_items()
    {
        $foreignProduct = Product::create(['name' => 'Store B Product', 'selling_price' => 100, 'user_id' => $this->ownerB->id]);

        // No PaymentService mock: the provider must never be called for a
        // cart that can't be priced against this store's own catalog.
        $response = $this->postJson('/api/v1/storefront/store-a/checkout/initialize', [
            'customer_email' => 'jane@example.com',
            'items' => [['product_id' => $foreignProduct->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(404);
        $this->assertDatabaseCount('storefront_payment_intents', 0);
    }

    /**
     * The gap this whole two-step flow exists to close: a reference for a
     * charge made entirely outside this app (the merchant's Paystack
     * dashboard, a payment link, another product on the same account) is
     * genuinely "successful for at least the order total in NGN", so every
     * verification check below would pass it. It is rejected because no
     * initialize step ever minted it for this cart.
     */
    public function test_checkout_rejects_a_reference_this_app_never_issued_even_if_paystack_verifies_it()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $this->mock(PaymentService::class, function ($mock) {
            // Would happily confirm the charge - it must never be asked.
            $mock->shouldNotReceive('verifyTransaction');
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'CHARGE-MADE-IN-THE-PAYSTACK-DASHBOARD',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_rejects_a_reference_reserved_on_a_different_store()
    {
        $storeB = Store::create([
            'user_id' => $this->ownerB->id, 'name' => 'Store B',
            'store_slug' => 'store-b', 'device_id' => 'WEB-B',
            'online_store_enabled' => true,
        ]);
        $productB = $this->purchasableProduct(['name' => 'B Panadol', 'selling_price' => 100, 'user_id' => $this->ownerB->id]);
        $productA = $this->purchasableProduct(['name' => 'A Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $init = $this->initializePaystackCheckout(
            [['product_id' => $productB->id, 'quantity' => 1]],
            'DRX-SF-FOR-STORE-B',
            'store-b'
        );
        $init->assertStatus(200);
        $this->assertSame($storeB->id, \App\Models\StorefrontPaymentIntent::first()->store_id);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldNotReceive('verifyTransaction');
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'DRX-SF-FOR-STORE-B',
            'items' => [['product_id' => $productA->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_rejects_a_reference_reserved_for_a_different_cart()
    {
        $cheap = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $expensive = $this->purchasableProduct(['name' => 'Insulin', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $this->initializePaystackCheckout(
            [['product_id' => $cheap->id, 'quantity' => 1]],
            'DRX-SF-CART-A'
        )->assertStatus(200);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldNotReceive('verifyTransaction');
        });

        // Same money, different basket: still not the order that was paid for.
        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'DRX-SF-CART-A',
            'items' => [['product_id' => $expensive->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_rejects_an_unverifiable_paystack_reference()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 1]];

        $this->initializePaystackCheckout($items, 'FAKE-REF')->assertStatus(200);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => false, 'message' => 'Paystack verification failed']);
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'FAKE-REF',
            'items' => $items,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
        // A failed confirmation must not burn the reservation - the customer
        // can retry the same reference once the payment actually lands.
        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'FAKE-REF', 'status' => 'pending',
        ]);
    }

    public function test_checkout_rejects_a_verified_payment_that_underpays_the_total()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 2]];

        $this->initializePaystackCheckout($items, 'REAL-BUT-UNDERPAID')->assertStatus(200);

        $this->mock(PaymentService::class, function ($mock) {
            // Verified real payment, but for less than the 2-unit order total (200).
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 100, 'currency' => 'NGN']);
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'REAL-BUT-UNDERPAID',
            'items' => $items,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_rejects_a_verified_payment_settled_in_another_currency()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 1]];

        $this->initializePaystackCheckout($items, 'REAL-BUT-WRONG-CURRENCY')->assertStatus(200);

        $this->mock(PaymentService::class, function ($mock) {
            // 100 of something that isn't naira can't satisfy a ₦100 order.
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 100, 'currency' => 'GHS']);
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'REAL-BUT-WRONG-CURRENCY',
            'items' => $items,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_accepts_a_verified_sufficient_paystack_payment()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 1]];

        $this->initializePaystackCheckout($items, 'REAL-REF-123')->assertStatus(200);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 100, 'currency' => 'NGN']);
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'REAL-REF-123',
            'items' => $items,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('online_orders', [
            'payment_status' => 'paid',
            'paystack_reference' => 'REAL-REF-123',
        ]);
        // The reservation is spent, and points at the order it paid for.
        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'REAL-REF-123',
            'status' => 'consumed',
            'online_order_id' => $response->json('order.id'),
        ]);
    }

    public function test_a_non_ngn_store_completes_the_initialize_to_verify_round_trip()
    {
        $this->storeA->update(['currency' => 'KES']);
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 1]];

        $this->initializePaystackCheckout($items, 'KES-REF-1')->assertStatus(200);

        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'KES-REF-1',
            'currency' => 'KES',
        ]);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 100, 'currency' => 'KES']);
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'KES-REF-1',
            'items' => $items,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('online_orders', [
            'payment_status' => 'paid',
            'paystack_reference' => 'KES-REF-1',
        ]);
    }

    public function test_a_paid_checkout_that_sold_out_during_the_paystack_detour_is_refunded()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 2]];

        $this->initializePaystackCheckout($items, 'SOLD-OUT-WHILE-PAYING')->assertStatus(200);

        // Everything the cart needed is gone by the time the customer returns
        // from Paystack's hosted page - but they have already been charged.
        StockBatch::where('product_id', $product->id)->update(['quantity' => 0]);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->andReturn(['success' => true, 'amount' => 200, 'currency' => 'NGN']);
            $mock->shouldReceive('refundTransaction')
                ->once()
                ->with('SOLD-OUT-WHILE-PAYING', 'paystack')
                ->andReturn(['success' => true, 'message' => 'Refunded']);
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'SOLD-OUT-WHILE-PAYING',
            'items' => $items,
        ]);

        $response->assertStatus(422);
        $response->assertJsonFragment(['refunded' => true]);
        $this->assertDatabaseCount('online_orders', 0);
        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'SOLD-OUT-WHILE-PAYING',
            'status' => 'refunded',
        ]);
    }

    public function test_a_paid_checkout_whose_product_was_deactivated_is_refunded()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 1]];

        $this->initializePaystackCheckout($items, 'DEACTIVATED-WHILE-PAYING')->assertStatus(200);

        $product->update(['is_active' => false]);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->andReturn(['success' => true, 'amount' => 100, 'currency' => 'NGN']);
            $mock->shouldReceive('refundTransaction')
                ->once()
                ->andReturn(['success' => true, 'message' => 'Refunded']);
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'DEACTIVATED-WHILE-PAYING',
            'items' => $items,
        ]);

        $response->assertStatus(422);
        $response->assertJsonFragment(['refunded' => true]);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_an_unpaid_failed_checkout_is_never_refunded()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 2]];

        $this->initializePaystackCheckout($items, 'NEVER-PAID')->assertStatus(200);
        StockBatch::where('product_id', $product->id)->update(['quantity' => 0]);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->andReturn(['success' => false, 'message' => 'Payment not completed']);
            $mock->shouldNotReceive('refundTransaction');
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'NEVER-PAID',
            'items' => $items,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseHas('storefront_payment_intents', [
            'reference' => 'NEVER-PAID',
            'status' => 'pending',
        ]);
    }

    public function test_checkout_rejects_orders_for_a_suspended_store()
    {
        $this->storeA->update(['status' => 'suspended']);
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(403);
    }

    public function test_show_rejects_a_store_with_online_store_disabled()
    {
        $this->storeA->update(['online_store_enabled' => false]);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(404);
    }

    public function test_checkout_rejects_a_store_with_online_store_disabled()
    {
        $this->storeA->update(['online_store_enabled' => false]);
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(404);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_show_rejects_a_store_whose_plan_no_longer_includes_store_url()
    {
        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['store_url' => false]],
            ],
        ]);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(404);
    }

    public function test_checkout_rejects_a_store_whose_plan_no_longer_includes_store_url()
    {
        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['store_url' => false]],
            ],
        ]);
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(404);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_slugs_excludes_a_store_whose_plan_no_longer_includes_store_url()
    {
        SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['store_url' => false]],
            ],
        ]);

        $response = $this->getJson('/api/v1/storefront-slugs');

        $response->assertStatus(200);
        $response->assertJsonMissing(['store-a']);
    }

    public function test_checkout_rejects_a_paystack_reference_already_used_by_another_order()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 1]];

        $this->initializePaystackCheckout($items, 'REPLAYED-REF')->assertStatus(200);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 100, 'currency' => 'NGN']);
        });

        $first = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'REPLAYED-REF',
            'items' => $items,
        ]);
        $first->assertStatus(201);

        // A second checkout replaying the exact same (genuinely verified,
        // genuinely app-issued) reference must not mint a second paid order.
        $replay = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'REPLAYED-REF',
            'items' => $items,
        ]);

        $replay->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 1);
    }

    /**
     * Regression: OnlineOrder soft-deletes, so the duplicate-reference
     * lookup has to run withTrashed() - otherwise a reference could be
     * replayed by first getting the order it paid for cancelled/deleted.
     * The consumed payment intent is a second, independent guard on the
     * same replay.
     */
    public function test_checkout_rejects_a_reference_whose_order_has_since_been_soft_deleted()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $items = [['product_id' => $product->id, 'quantity' => 1]];

        $this->initializePaystackCheckout($items, 'TRASHED-REF')->assertStatus(200);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 100, 'currency' => 'NGN']);
        });

        $first = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'TRASHED-REF',
            'items' => $items,
        ]);
        $first->assertStatus(201);

        \App\Models\OnlineOrder::findOrFail($first->json('order.id'))->delete();

        $replay = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'TRASHED-REF',
            'items' => $items,
        ]);

        $replay->assertStatus(422);
        $this->assertSame(1, \App\Models\OnlineOrder::withTrashed()->count());
    }

    /**
     * Regression: a reference already consumed to activate somebody's
     * subscription (recorded in payment_transactions, not online_orders)
     * must not be spendable on storefront goods.
     */
    public function test_checkout_rejects_a_reference_already_recorded_as_a_subscription_payment()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        \App\Models\PaymentTransaction::create([
            'provider' => 'paystack',
            'provider_reference' => 'SUBSCRIPTION-REF',
            'amount' => 5000,
            'currency' => 'NGN',
            'status' => 'success',
        ]);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldNotReceive('verifyTransaction');
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'SUBSCRIPTION-REF',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    /**
     * Regression: the duplicate-reference guard originally only ran (and
     * only handled the unique-index QueryException) when
     * payment_method === 'paystack'. Since paystack_reference is a plain
     * optional string accepted for any payment method, and the column's
     * uniqueness is shared across all of them, an in_store/transfer order
     * carrying a reference could otherwise let a duplicate slip past the
     * pre-check and 500 on the QueryException instead of 422ing.
     */
    public function test_checkout_rejects_a_duplicate_reference_even_when_the_first_order_was_not_paystack()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $first = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'paystack_reference' => 'SHARED-REF',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);
        $first->assertStatus(201);

        $second = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'transfer',
            'paystack_reference' => 'SHARED-REF',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $second->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 1);
    }

    public function test_checkout_notifies_the_store_owner_and_its_staff()
    {
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);
        $staff = User::create([
            'first_name' => 'Store', 'last_name' => 'Staff',
            'email' => 'staffA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->storeA->id,
        ]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseCount('notifications', 2);
        foreach ([$this->ownerA, $staff] as $recipient) {
            $this->assertDatabaseHas('notifications', [
                'user_id' => $recipient->id,
                'title' => 'New Online Order',
                'type' => 'online_order',
            ]);
        }
    }

    public function test_checkout_rejects_a_deactivated_product()
    {
        $product = $this->purchasableProduct([
            'name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id,
            'is_active' => false,
        ]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(404);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_rejects_a_product_hidden_from_the_online_store()
    {
        $product = $this->purchasableProduct([
            'name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id,
            'show_online' => false,
        ]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(404);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_rejects_an_order_exceeding_available_stock()
    {
        $product = Product::create([
            'name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id,
            'is_active' => true, 'show_online' => true,
        ]);
        StockBatch::create([
            'product_id' => $product->id,
            'user_id' => $this->ownerA->id,
            'batch_number' => 'B-LOW',
            'quantity' => 2,
            'cost_price' => 10,
            'expiry_date' => now()->addYear(),
        ]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 3]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    /**
     * The sibling of test_storefront_only_shows_its_own_stores_products, which
     * builds two different OWNERS and therefore only ever exercised
     * cross-tenant isolation. Multi-store is a supported, plan-gated state, and
     * one owner's two storefronts are separate shops: products were scoped by
     * user_id alone, so each storefront listed both stores' catalogues.
     */
    private function secondStoreForOwnerA(): Store
    {
        return Store::create([
            'user_id' => $this->ownerA->id, 'name' => 'Store A2',
            'store_slug' => 'store-a2', 'device_id' => 'WEB-A2',
            'online_store_enabled' => true,
        ]);
    }

    public function test_storefront_excludes_products_belonging_to_another_store_of_the_same_owner()
    {
        $storeA2 = $this->secondStoreForOwnerA();

        Product::create([
            'name' => 'Store A Only', 'selling_price' => 100, 'is_active' => true,
            'show_online' => true, 'user_id' => $this->ownerA->id, 'store_id' => $this->storeA->id,
        ]);
        Product::create([
            'name' => 'Store A2 Only', 'selling_price' => 100, 'is_active' => true,
            'show_online' => true, 'user_id' => $this->ownerA->id, 'store_id' => $storeA2->id,
        ]);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'products');
        $response->assertJsonMissing(['name' => 'Store A2 Only']);
    }

    public function test_checkout_rejects_a_product_belonging_to_another_store_of_the_same_owner()
    {
        $storeA2 = $this->secondStoreForOwnerA();
        $product = $this->purchasableProduct([
            'name' => 'Store A2 Panadol', 'selling_price' => 100,
            'user_id' => $this->ownerA->id, 'store_id' => $storeA2->id,
        ]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(404);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_availability_does_not_count_another_stores_stock_batches()
    {
        $storeA2 = $this->secondStoreForOwnerA();
        $product = Product::create([
            'name' => 'Shared Name', 'selling_price' => 100, 'is_active' => true,
            'show_online' => true, 'user_id' => $this->ownerA->id, 'store_id' => $this->storeA->id,
        ]);

        StockBatch::create([
            'product_id' => $product->id, 'user_id' => $this->ownerA->id,
            'store_id' => $this->storeA->id, 'batch_number' => 'B-A1',
            'quantity' => 1, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
        ]);
        StockBatch::create([
            'product_id' => $product->id, 'user_id' => $this->ownerA->id,
            'store_id' => $storeA2->id, 'batch_number' => 'B-A2',
            'quantity' => 50, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
        ]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 5]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    /**
     * Online orders don't deduct stock at placement (staff deduct when they
     * fulfil), so raw batch quantity sold the last unit to every customer who
     * asked for it. Availability now nets off everything already committed to
     * pending orders.
     */
    public function test_checkout_rejects_an_order_for_stock_already_committed_to_a_pending_order()
    {
        $product = Product::create([
            'name' => 'Last Unit', 'selling_price' => 100, 'is_active' => true,
            'show_online' => true, 'user_id' => $this->ownerA->id, 'store_id' => $this->storeA->id,
        ]);
        StockBatch::create([
            'product_id' => $product->id, 'user_id' => $this->ownerA->id,
            'store_id' => $this->storeA->id, 'batch_number' => 'B-ONE',
            'quantity' => 1, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
        ]);

        $order = [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ];

        $this->postJson('/api/v1/storefront/store-a/checkout', $order)->assertStatus(201);
        $this->postJson('/api/v1/storefront/store-a/checkout', $order)->assertStatus(422);

        $this->assertDatabaseCount('online_orders', 1);
    }

    public function test_a_fulfilled_order_stops_holding_stock_against_availability()
    {
        $product = Product::create([
            'name' => 'Restockable', 'selling_price' => 100, 'is_active' => true,
            'show_online' => true, 'user_id' => $this->ownerA->id, 'store_id' => $this->storeA->id,
        ]);
        StockBatch::create([
            'product_id' => $product->id, 'user_id' => $this->ownerA->id,
            'store_id' => $this->storeA->id, 'batch_number' => 'B-TWO',
            'quantity' => 2, 'cost_price' => 10, 'expiry_date' => now()->addYear(),
        ]);

        $order = [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 2]],
        ];

        $first = $this->postJson('/api/v1/storefront/store-a/checkout', $order);
        $first->assertStatus(201);

        \App\Models\OnlineOrder::find($first->json('order.id'))->update(['order_status' => 'fulfilled']);

        // The fulfilled order's stock has left the ledger in the POS client, so
        // its quantity must not ALSO be held back here - otherwise a store that
        // restocks can never sell the product online again.
        $this->postJson('/api/v1/storefront/store-a/checkout', $order)->assertStatus(201);
    }

    public function test_show_caps_how_many_products_one_storefront_response_returns()
    {
        $reflection = new \ReflectionClass(\App\Http\Controllers\Api\Public\StorefrontController::class);
        $cap = $reflection->getConstant('MAX_STOREFRONT_PRODUCTS');

        $this->assertIsInt($cap);
        $this->assertLessThanOrEqual(500, $cap);

        $rows = [];
        for ($i = 0; $i < $cap + 3; $i++) {
            $rows[] = [
                'id' => (string) \Illuminate\Support\Str::uuid(),
                'name' => 'Bulk '.str_pad((string) $i, 5, '0', STR_PAD_LEFT),
                'selling_price' => 100,
                'is_active' => 1,
                'show_online' => 1,
                'user_id' => $this->ownerA->id,
                'store_id' => $this->storeA->id,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        foreach (array_chunk($rows, 200) as $chunk) {
            \Illuminate\Support\Facades\DB::table('products')->insert($chunk);
        }

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(200);
        $response->assertJsonCount($cap, 'products');
    }

    public function test_show_reports_online_payment_unavailable_when_the_store_has_no_subaccount()
    {
        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(200);
        $response->assertJson(['online_payment_available' => false]);
    }

    public function test_show_reports_online_payment_available_when_the_store_has_a_subaccount()
    {
        $this->storeA->update(['paystack_subaccount_code' => 'ACCT_available']);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertStatus(200);
        $response->assertJson(['online_payment_available' => true]);
    }

    public function test_initialize_checkout_uses_the_stores_own_currency_and_subaccount()
    {
        $this->storeA->update([
            'paystack_subaccount_code' => 'ACCT_kenya',
            'currency' => 'KES',
        ]);
        $product = $this->purchasableProduct(['name' => 'Panadol', 'selling_price' => 500, 'user_id' => $this->ownerA->id]);

        \Illuminate\Support\Facades\Http::fake([
            'api.paystack.co/transaction/initialize' => \Illuminate\Support\Facades\Http::response([
                'status' => true,
                'data' => ['reference' => 'ref_kenya', 'authorization_url' => 'https://paystack.com/pay/ref_kenya'],
            ], 200),
        ]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout/initialize', [
            'customer_email' => 'kenyan-customer@example.com',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(200);
        \Illuminate\Support\Facades\Http::assertSent(function ($request) {
            return ($request['subaccount'] ?? null) === 'ACCT_kenya'
                && ($request['currency'] ?? null) === 'KES';
        });
    }
}
