<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A-9. Receiving the same purchase order from two devices booked the
 * delivery twice: only the `purchase_order_items.quantity_received` UPDATE
 * was version-checked, so one of the two lost the version race and the PO
 * showed a single receipt — while the accompanying `stock_batches` INSERT
 * and `stock_movements` INSERT from both devices were independent rows that
 * were both accepted, doubling on-hand stock.
 *
 * The client half keys the receipt's batch and movement on a deterministic
 * id (PO line + already-received balance), so the second device's copy
 * arrives with the first device's ids and collapses onto them here. This
 * file pins both that collapse and the server-side backstop: a
 * `quantity_received` that would exceed `quantity_ordered` is rejected
 * outright, whatever produced it.
 */
class SyncPushPurchaseOrderReceiptTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Main Branch',
            'email' => 'main@dumosrx.com',
            'phone' => '1111111111',
            'address' => '1 Main St',
            'slug' => 'main-branch',
            'device_id' => 'WEB-MAIN',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();

        DB::table('products')->insert([
            'id' => 'prod-1',
            'store_id' => $this->store->id,
            'user_id' => $this->owner->id,
            'name' => 'Zyrtec',
            'selling_price' => 150,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('purchase_orders')->insert([
            'id' => 'po-1',
            'store_id' => $this->store->id,
            'order_number' => 'PO-0001',
            'supplier_id' => null,
            'ordered_by' => $this->owner->id,
            'status' => 'pending',
            'total_amount' => 100000,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('purchase_order_items')->insert([
            'id' => 'poi-1',
            'purchase_order_id' => 'po-1',
            'product_id' => 'prod-1',
            'quantity_ordered' => 1000,
            'quantity_received' => 0,
            'unit_cost' => 100,
            'total_cost' => 100000,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** The three changes one device pushes for one receipt of one PO line. */
    protected function receiptChanges(string $batchId, string $movementId): array
    {
        return [
            [
                'table_name' => 'stock_batches',
                'operation' => 'INSERT',
                'record_id' => $batchId,
                'payload' => [
                    'id' => $batchId,
                    'product_id' => 'prod-1',
                    'store_id' => $this->store->id,
                    'batch_number' => 'PO-0001',
                    'quantity' => 1000,
                    'cost_price' => 100,
                    'is_active' => 1,
                    '_version' => 1,
                ],
            ],
            [
                'table_name' => 'stock_movements',
                'operation' => 'INSERT',
                'record_id' => $movementId,
                'payload' => [
                    'id' => $movementId,
                    'product_id' => 'prod-1',
                    'store_id' => $this->store->id,
                    'stock_batch_id' => $batchId,
                    'movement_type' => 'purchase',
                    'quantity' => 1000,
                    'unit_cost' => 100,
                    'total_cost' => 100000,
                    'reference_id' => 'po-1',
                    'reference_type' => 'purchase_order',
                    'performed_by' => $this->owner->id,
                    '_version' => 1,
                ],
            ],
            [
                'table_name' => 'purchase_order_items',
                'operation' => 'UPDATE',
                'record_id' => 'poi-1',
                'payload' => [
                    'id' => 'poi-1',
                    'quantity_received' => 100,
                    'bulk_quantity' => 100,
                    'units_per_bulk' => 10,
                    '_version' => 1,
                ],
            ],
        ];
    }

    protected function push(array $changes)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => $changes,
        ]);
    }

    public function test_a_second_devices_copy_of_the_same_receipt_does_not_double_the_stock()
    {
        $this->push($this->receiptChanges('batch-deterministic', 'movement-deterministic'))
            ->assertStatus(200);

        $this->assertEquals(
            1000,
            DB::table('stock_batches')->where('id', 'batch-deterministic')->value('quantity'),
        );

        // The other device booked the same delivery before it had pulled the
        // first one, so it derived the same batch/movement ids.
        $this->push($this->receiptChanges('batch-deterministic', 'movement-deterministic'))
            ->assertStatus(200);

        $this->assertEquals(
            1000,
            DB::table('stock_batches')->where('id', 'batch-deterministic')->value('quantity'),
        );
        $this->assertEquals(1, DB::table('stock_batches')->where('product_id', 'prod-1')->count());
        $this->assertEquals(1, DB::table('stock_movements')->where('product_id', 'prod-1')->count());
        $this->assertEquals(
            1000,
            DB::table('purchase_order_items')->where('id', 'poi-1')->value('quantity_received'),
        );
    }

    public function test_a_quantity_received_update_beyond_quantity_ordered_is_rejected()
    {
        DB::table('purchase_order_items')->where('id', 'poi-1')->update([
            'quantity_received' => 1000,
            '_version' => 2,
        ]);

        $response = $this->push([
            [
                'table_name' => 'purchase_order_items',
                'operation' => 'UPDATE',
                'record_id' => 'poi-1',
                'payload' => [
                    'id' => 'poi-1',
                    // A cumulative received balance of 200 bulk units — 2000
                    // base units — against the 100 bulk units (1000 base)
                    // this line was ordered at.
                    'quantity_received' => 200,
                    'bulk_quantity' => 100,
                    'units_per_bulk' => 10,
                    '_version' => 2,
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'failed');
        $response->assertJsonPath('failed.0.reason', 'quantity_received_exceeds_ordered');

        $this->assertEquals(
            1000,
            DB::table('purchase_order_items')->where('id', 'poi-1')->value('quantity_received'),
        );
    }

    public function test_a_legitimate_partial_receipt_within_the_ordered_quantity_still_applies()
    {
        $response = $this->push([
            [
                'table_name' => 'purchase_order_items',
                'operation' => 'UPDATE',
                'record_id' => 'poi-1',
                'payload' => [
                    'id' => 'poi-1',
                    'quantity_received' => 60,
                    'bulk_quantity' => 100,
                    'units_per_bulk' => 10,
                    '_version' => 1,
                ],
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertEquals(
            600,
            DB::table('purchase_order_items')->where('id', 'poi-1')->value('quantity_received'),
        );
    }
}
