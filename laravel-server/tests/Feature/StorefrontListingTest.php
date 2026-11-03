<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StorefrontListingTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['store_url' => true]]],
        ]);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'listing-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'WEB-A',
            'online_store_enabled' => true,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function product(string $name, array $attrs = []): Product
    {
        return Product::create(array_merge([
            'name' => $name,
            'selling_price' => 100,
            'is_active' => true,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
        ], $attrs));
    }

    private function stock(Product $product, float $quantity, ?string $storeId = null): void
    {
        StockBatch::create([
            'product_id' => $product->id,
            'user_id' => $this->owner->id,
            'store_id' => $storeId ?? $this->store->id,
            'batch_number' => 'B-'.$product->id.'-'.$quantity,
            'quantity' => $quantity,
            'cost_price' => 10,
            'expiry_date' => now()->addYear(),
        ]);
    }

    public function test_a_controlled_product_is_never_listed_even_when_shown_online(): void
    {
        $this->product('Panadol');
        $this->product('Tramadol', ['is_controlled' => true, 'show_online' => true]);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertOk();
        $response->assertJsonCount(1, 'products');
        $response->assertJsonMissing(['name' => 'Tramadol']);
    }

    public function test_a_controlled_product_cannot_be_checked_out(): void
    {
        $controlled = $this->product('Tramadol', ['is_controlled' => true, 'show_online' => true]);
        $this->stock($controlled, 100);

        $response = $this->postJson('/api/v1/storefront/store-a/checkout', [
            'customer_name' => 'Jane Doe',
            'customer_phone' => '08000000000',
            'payment_method' => 'in_store',
            'items' => [['product_id' => $controlled->id, 'quantity' => 1]],
        ]);

        $response->assertNotFound();
        $this->assertDatabaseCount('online_orders', 0);
    }

    public function test_in_stock_products_are_listed_before_out_of_stock_ones(): void
    {
        $this->product('Aspirin');
        $soldOut = $this->product('Amoxil');
        $this->stock($soldOut, 0);
        $this->stock($this->product('Zinc'), 5);
        $this->stock($this->product('Vitamin C'), 2);

        $names = collect($this->getJson('/api/v1/storefront/store-a')->assertOk()->json('products'))->pluck('name')->all();

        $this->assertSame(['Vitamin C', 'Zinc', 'Amoxil', 'Aspirin'], $names);
    }

    public function test_another_stores_stock_does_not_count_as_in_stock(): void
    {
        $sibling = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A2',
            'store_slug' => 'store-a2', 'device_id' => 'WEB-A2',
        ]);
        $this->stock($this->product('Aspirin'), 50, $sibling->id);
        $this->stock($this->product('Zinc'), 1);

        $names = collect($this->getJson('/api/v1/storefront/store-a')->assertOk()->json('products'))->pluck('name')->all();

        $this->assertSame(['Zinc', 'Aspirin'], $names);
    }
}

