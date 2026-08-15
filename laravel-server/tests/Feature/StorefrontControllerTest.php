<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
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
 */
class StorefrontControllerTest extends TestCase
{
    use RefreshDatabase;

    protected User $ownerA;
    protected Store $storeA;
    protected User $ownerB;

    protected function setUp(): void
    {
        parent::setUp();

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
        $product = Product::create(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

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
        $product = Product::create(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_rejects_an_unverifiable_paystack_reference()
    {
        $product = Product::create(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

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
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_rejects_a_verified_payment_that_underpays_the_total()
    {
        $product = Product::create(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $this->mock(PaymentService::class, function ($mock) {
            // Verified real payment, but for less than the 2-unit order total (200).
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 100]);
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'REAL-BUT-UNDERPAID',
            'items' => [['product_id' => $product->id, 'quantity' => 2]],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_checkout_accepts_a_verified_sufficient_paystack_payment()
    {
        $product = Product::create(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $this->mock(PaymentService::class, function ($mock) {
            $mock->shouldReceive('verifyTransaction')
                ->once()
                ->andReturn(['success' => true, 'amount' => 100]);
        });

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'paystack',
            'paystack_reference' => 'REAL-REF-123',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('online_orders', [
            'payment_status' => 'paid',
            'paystack_reference' => 'REAL-REF-123',
        ]);
    }

    public function test_checkout_rejects_orders_for_a_suspended_store()
    {
        $this->storeA->update(['status' => 'suspended']);
        $product = Product::create(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

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
        $product = Product::create(['name' => 'Panadol', 'selling_price' => 100, 'user_id' => $this->ownerA->id]);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $product->id, 'quantity' => 1]],
        ]);

        $response->assertStatus(404);
        $this->assertDatabaseCount('online_orders', 0);
    }
}
