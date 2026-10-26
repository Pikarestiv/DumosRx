<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/** docs/superpowers/specs/2026-10-26-sell-at-zero-stock-design.md: the Stage-0 server must land where the client does. */
class SellAtZeroStockServerParityTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Schema::disableForeignKeyConstraints();
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);
        $this->withoutMiddleware();

        $this->owner = User::create([
            'first_name' => 'Yard', 'last_name' => 'Owner', 'email' => 'yard-parity@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'admin',
        ]);
        $this->store = Store::create(['user_id' => $this->owner->id, 'name' => 'Yard', 'device_id' => 'WEB-YARD-P']);
        $this->owner->update(['store_id' => $this->store->id]);

        DB::table('products')->insert([
            'id' => 'cement', 'store_id' => $this->store->id, 'user_id' => $this->owner->id, 'name' => 'Cement',
            'selling_price' => 5000, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('stock_batches')->insert([
            'id' => 'batch-1', 'product_id' => 'cement', 'batch_number' => 'B1', 'quantity' => 3,
            'cost_price' => 4000, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function movement(string $id, float $quantity, string $type, ?string $referenceType): array
    {
        return [
            'table_name' => 'stock_movements', 'operation' => 'INSERT', 'record_id' => $id,
            'payload' => [
                'id' => $id, 'stock_batch_id' => 'batch-1', 'product_id' => 'cement', 'quantity' => $quantity,
                'movement_type' => $type, 'reference_type' => $referenceType, 'reference_id' => 'sale-1',
                'performed_by' => $this->owner->id,
                'created_at' => now()->toDateTimeString(), 'updated_at' => now()->toDateTimeString(),
            ],
        ];
    }

    private function push(array $changes)
    {
        return $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', ['setup' => true, 'changes' => $changes])
            ->assertOk();
    }

    private function batchQuantity(): float
    {
        return (float) DB::table('stock_batches')->where('id', 'batch-1')->value('quantity');
    }

    public function test_a_sale_and_its_backorder_in_one_push_land_on_zero_as_the_client_does()
    {
        $this->push([$this->movement('m-sale', -5, 'sale', 'sale'), $this->movement('m-owed', 2, 'adjustment', 'backorder')]);

        $this->assertSame(0.0, $this->batchQuantity());
        $this->assertSame('backorder', DB::table('stock_movements')->where('id', 'm-owed')->value('reference_type'));
    }

    public function test_a_chunk_split_gives_the_bounded_a217_shape()
    {
        $this->push([$this->movement('m-sale', -5, 'sale', 'sale')]);
        $this->push([$this->movement('m-owed', 2, 'adjustment', 'backorder')]);

        $this->assertSame(2.0, $this->batchQuantity());
    }

    public function test_a_re_costed_sale_item_update_is_accepted()
    {
        DB::table('sales')->insert([
            'id' => 'sale-1', 'store_id' => $this->store->id, 'transaction_number' => 'TXN-1', 'subtotal' => 25000,
            'total_amount' => 25000, 'amount_paid' => 25000, 'payment_method' => 'cash', 'cashier_id' => $this->owner->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('sale_items')->insert([
            'id' => 'item-1', 'sale_id' => 'sale-1', 'product_id' => 'cement', 'quantity' => 5, 'unit_price' => 5000,
            'total_price' => 25000, 'cost_price' => 4000, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->push([[
            'table_name' => 'sale_items', 'operation' => 'UPDATE', 'record_id' => 'item-1',
            'payload' => ['id' => 'item-1', '_version' => 1, 'cost_price' => 4600],
        ]]);

        $this->assertSame(4600.0, (float) DB::table('sale_items')->where('id', 'item-1')->value('cost_price'));
    }
}
