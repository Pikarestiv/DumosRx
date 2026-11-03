<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Two owners, an attacker and a victim, with the row fixtures the A-325 push tests write against. */
abstract class SyncPushTwoTenantTestCase extends TestCase
{
    use RefreshDatabase;

    protected User $victimOwner;

    protected Store $victimStore;

    protected User $attackerOwner;

    protected Store $attackerStore;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        [$this->victimOwner, $this->victimStore] = $this->makeTenant('victim');
        [$this->attackerOwner, $this->attackerStore] = $this->makeTenant('attacker');

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);

        $this->withoutMiddleware();
    }

    protected function makeTenant(string $slug): array
    {
        $owner = User::create([
            'first_name' => ucfirst($slug),
            'last_name' => 'Owner',
            'email' => $slug.'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $store = Store::create([
            'user_id' => $owner->id,
            'name' => ucfirst($slug).' Store',
            'slug' => $slug.'-store',
            'device_id' => 'WEB-'.strtoupper($slug),
            'currency' => 'NGN',
        ]);
        $owner->update(['store_id' => $store->id]);

        return [$owner, $store];
    }

    protected function seedProduct(Store $store, User $owner): string
    {
        $id = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $id, 'store_id' => $store->id, 'user_id' => $owner->id, 'name' => 'Painkillers',
            'selling_price' => 500, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    protected function seedBatch(string $productId, ?string $storeId): string
    {
        $id = (string) Str::uuid();
        DB::table('stock_batches')->insert([
            'id' => $id, 'product_id' => $productId, 'store_id' => $storeId, 'batch_number' => 'B-'.substr($id, 0, 6),
            'quantity' => 10, 'cost_price' => 100, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    protected function seedPurchaseOrder(Store $store, User $owner): string
    {
        $id = (string) Str::uuid();
        DB::table('purchase_orders')->insert([
            'id' => $id, 'store_id' => $store->id, 'ordered_by' => $owner->id, 'order_number' => 'PO-'.substr($id, 0, 6), 'status' => 'pending',
            'total_amount' => 0, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    protected function seedPurchaseOrderItem(string $purchaseOrderId, string $productId): string
    {
        $id = (string) Str::uuid();
        DB::table('purchase_order_items')->insert([
            'id' => $id, 'purchase_order_id' => $purchaseOrderId, 'product_id' => $productId,
            'quantity_ordered' => 5, 'unit_cost' => 100, 'total_cost' => 500, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    protected function seedSale(Store $store, User $owner, bool $deleted = false): string
    {
        $id = (string) Str::uuid();
        DB::table('sales')->insert([
            'id' => $id, 'store_id' => $store->id, 'transaction_number' => 'TXN-'.substr($id, 0, 6), 'cashier_id' => $owner->id,
            'total_amount' => 100, 'amount_paid' => 100, 'payment_method' => 'cash',
            'created_at' => now(), 'updated_at' => now(), 'deleted_at' => $deleted ? now() : null,
        ]);

        return $id;
    }

    protected function seedSaleItem(string $saleId, string $productId): string
    {
        $id = (string) Str::uuid();
        DB::table('sale_items')->insert([
            'id' => $id, 'sale_id' => $saleId, 'product_id' => $productId, 'quantity' => 1,
            'unit_price' => 100, 'total_price' => 100, 'cost_price' => 50, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    protected function pushUpdate(User $as, string $table, string $recordId, array $payload, string $operation = 'UPDATE')
    {
        return $this->actingAs($as)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'id' => 11,
                'table_name' => $table,
                'operation' => $operation,
                'record_id' => $recordId,
                'payload' => ['id' => $recordId, '_version' => 1, 'updated_at' => now()->toDateTimeString()] + $payload,
            ]],
        ]);
    }

    protected function assertRefusedAsForbidden($response, string $table, string $recordId): void
    {
        $response->assertStatus(200);
        $this->assertContains(
            ['id' => 11, 'table_name' => $table, 'record_id' => $recordId, 'reason' => 'forbidden'],
            array_map(fn ($f) => array_intersect_key($f, array_flip(['id', 'table_name', 'record_id', 'reason'])), $response->json('failed') ?? []),
        );
    }
}
