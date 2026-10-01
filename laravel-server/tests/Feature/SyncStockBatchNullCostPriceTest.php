<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Legacy audit/adjustment stock_batches rows hold a real local NULL
 * cost_price (the client column is nullable, the server's is NOT NULL
 * DEFAULT 0). A whole-row requeue re-sends that NULL explicitly, which used
 * to reach forceFill() and be rejected by the database — see A-128 in
 * docs/FIXED_BUGS.md.
 */
class SyncStockBatchNullCostPriceTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->owner = User::create([
            'first_name' => 'Batch',
            'last_name' => 'Owner',
            'email' => 'batch-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Batch Store',
            'store_slug' => 'batch-store',
            'device_id' => 'WEB-BATCH',
        ]);

        $this->product = Product::create([
            'id' => 'prod-batch-cost',
            'name' => 'Panadol',
            'selling_price' => 100,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'is_active' => true,
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();
    }

    #[Test]
    public function an_insert_carrying_a_null_cost_price_lands_as_zero()
    {
        $response = $this->push('INSERT', 'batch-null-insert');

        $response->assertStatus(200);
        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertEquals(0, StockBatch::find('batch-null-insert')->cost_price);
    }

    #[Test]
    public function a_requeued_insert_against_an_existing_row_coalesces_null_cost_price_to_zero()
    {
        StockBatch::create([
            'id' => 'batch-null-requeue',
            'product_id' => $this->product->id,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'batch_number' => 'B-1',
            'quantity' => 5,
            'cost_price' => 40,
        ]);

        $response = $this->push('INSERT', 'batch-null-requeue');

        $response->assertStatus(200);
        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertEquals(0, StockBatch::find('batch-null-requeue')->cost_price);
    }

    #[Test]
    public function an_update_carrying_a_null_cost_price_lands_as_zero()
    {
        StockBatch::create([
            'id' => 'batch-null-update',
            'product_id' => $this->product->id,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'batch_number' => 'B-2',
            'quantity' => 5,
            'cost_price' => 40,
        ]);

        $response = $this->push('UPDATE', 'batch-null-update');

        $response->assertStatus(200);
        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertEquals(0, StockBatch::find('batch-null-update')->cost_price);
    }

    private function push(string $operation, string $recordId)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'stock_batches',
                'operation' => $operation,
                'record_id' => $recordId,
                'payload' => [
                    'id' => $recordId,
                    'product_id' => $this->product->id,
                    'store_id' => $this->store->id,
                    'batch_number' => 'B-legacy',
                    'quantity' => 5,
                    'cost_price' => null,
                ],
            ]],
        ]);
    }
}
