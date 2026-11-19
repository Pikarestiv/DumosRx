<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Voiding a receipt (2026-11-19): a deterministic reversal movement that two tills can both send. */
class SyncPushPurchaseOrderReceiptVoidTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();


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

    protected function reversalChanges(): array
    {
        return [
            [
                'table_name' => 'stock_movements',
                'operation' => 'INSERT',
                'record_id' => 'reversal-deterministic',
                'payload' => [
                    'id' => 'reversal-deterministic',
                    'product_id' => 'prod-1',
                    'store_id' => $this->store->id,
                    'stock_batch_id' => 'batch-1',
                    'movement_type' => 'adjustment',
                    'quantity' => -1000,
                    'unit_cost' => 100,
                    'total_cost' => 100000,
                    'reference_id' => 'po-1',
                    'reference_type' => 'purchase_order_reversal',
                    'performed_by' => $this->owner->id,
                    '_version' => 1,
                ],
            ],
        ];
    }

    public function test_a_void_sent_by_two_tills_takes_the_receipt_out_once()
    {
        $this->push($this->receiptChanges('batch-1', 'movement-1'))->assertStatus(200);
        $this->assertEquals(1000, DB::table('stock_batches')->where('id', 'batch-1')->value('quantity'));

        $this->push($this->reversalChanges())->assertStatus(200);
        $this->push($this->reversalChanges())->assertStatus(200);

        $this->assertEquals(0, DB::table('stock_batches')->where('id', 'batch-1')->value('quantity'));
        $this->assertEquals(1, DB::table('stock_movements')->where('reference_type', 'purchase_order_reversal')->count());
    }
}
