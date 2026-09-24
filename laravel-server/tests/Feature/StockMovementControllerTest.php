<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\StockBatch;
use App\Models\StockMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for two bugs found in the same review pass
 * (docs/KNOWN_BUGS.md): every endpoint here 500'd unconditionally on a
 * stale `->with('medicine')` eager-load (StockMovement has no
 * `medicine()` relation, only `product()`), and separately scoped by
 * `Store::where('user_id', $user->id)` directly instead of resolving the
 * tenant owner, so a staff caller always saw an empty ledger.
 */
class StockMovementControllerTest extends TestCase
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

        $batch = StockBatch::create([
            'product_id' => $this->product->id, 'user_id' => $this->owner->id,
            'batch_number' => 'B-1', 'quantity' => 5, 'cost_price' => 40,
        ]);

        StockMovement::create([
            'product_id' => $this->product->id,
            'stock_batch_id' => $batch->id,
            'movement_type' => 'adjustment',
            'quantity' => -3,
            'reason' => 'Damaged',
            'performed_by' => $this->owner->id,
        ]);
    }

    public function test_index_returns_200_with_product_eager_loaded()
    {
        $response = $this->actingAs($this->owner)->getJson('/api/v1/stock-movements');

        $response->assertStatus(200);
        $response->assertJsonPath('data.0.medicine.id', $this->product->id);
        $response->assertJsonPath('data.0.medicine_name', 'Panadol');
    }

    public function test_adjustments_returns_200()
    {
        $response = $this->actingAs($this->owner)->getJson('/api/v1/stock-adjustments');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
    }

    public function test_staff_sees_their_store_owners_movements_not_an_empty_ledger()
    {
        $response = $this->actingAs($this->staff)->getJson('/api/v1/stock-movements');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
    }

    public function test_staff_sees_their_store_owners_adjustments()
    {
        $response = $this->actingAs($this->staff)->getJson('/api/v1/stock-adjustments');

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data');
    }
}
