<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\StockBatch;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for two bugs found in the same review pass
 * (docs/KNOWN_BUGS.md): every endpoint here 500'd unconditionally on a
 * stale `->with('medicine')` eager-load (StockBatch has no `medicine()`
 * relation, only `product()`), and separately scoped by the caller's own
 * id instead of resolving the tenant owner, so a staff caller always saw
 * empty results.
 */
class StockBatchControllerTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected User $staff;
    protected Store $store;
    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store A',
            'store_slug' => 'store-a',
            'device_id' => 'WEB-A',
        ]);

        $this->staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'A',
            'email' => 'staff@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        $this->product = Product::create([
            'name' => 'Panadol', 'selling_price' => 100,
            'user_id' => $this->owner->id, 'is_active' => true,
        ]);

        StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-1', 'quantity' => 5, 'reorder_level' => 10,
            'cost_price' => 40, 'expiry_date' => now()->addDays(30),
        ]);
    }

    public function test_index_returns_200_with_product_eager_loaded()
    {
        $response = $this->actingAs($this->owner)->getJson('/api/v1/app/stock-batches');

        $response->assertStatus(200);
        $response->assertJsonPath('data.0.product.id', $this->product->id);
    }

    public function test_low_stock_returns_200()
    {
        $response = $this->actingAs($this->owner)->getJson('/api/v1/app/stock-batches/low-stock');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json());
    }

    public function test_expiring_returns_200()
    {
        $response = $this->actingAs($this->owner)->getJson('/api/v1/app/stock-batches/expiring');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json());
    }

    public function test_value_returns_200()
    {
        $response = $this->actingAs($this->owner)->getJson('/api/v1/app/stock-batches/value');

        $response->assertStatus(200);
        $response->assertJson(['total_value' => 200]); // 5 * 40
    }

    public function test_staff_sees_their_store_owners_batches_not_an_empty_list()
    {
        $response = $this->actingAs($this->staff)->getJson('/api/v1/app/stock-batches');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
    }

    public function test_staff_low_stock_sees_owners_batches()
    {
        $response = $this->actingAs($this->staff)->getJson('/api/v1/app/stock-batches/low-stock');

        $response->assertStatus(200);
        $this->assertCount(1, $response->json());
    }

    public function test_staff_value_matches_owners()
    {
        $response = $this->actingAs($this->staff)->getJson('/api/v1/app/stock-batches/value');

        $response->assertStatus(200);
        $response->assertJson(['total_value' => 200]);
    }
}
