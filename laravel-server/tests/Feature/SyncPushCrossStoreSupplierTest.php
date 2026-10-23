<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** A-321: the supplier counterpart of SyncPushCrossStoreCategoryTest (A-302). */
class SyncPushCrossStoreSupplierTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $storeA;
    protected Store $storeB;
    protected Supplier $supplierA;
    protected Supplier $supplierB;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Supply',
            'last_name' => 'Owner',
            'email' => 'supply-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->storeA = $this->makeStore('A', 'supply-a');
        $this->storeB = $this->makeStore('B', 'supply-b');
        $this->owner->update(['store_id' => $this->storeA->id]);

        $this->supplierA = $this->makeSupplier($this->storeA->id, 'Emzor');
        $this->supplierB = $this->makeSupplier($this->storeB->id, 'Emzor');

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function makeStore(string $tag, string $slug): Store
    {
        return Store::create([
            'user_id' => $this->owner->id,
            'name' => "Supply Store {$tag}",
            'email' => "{$slug}@dumosrx.com",
            'phone' => '500000000'.strlen($slug),
            'address' => "{$tag} Supply St",
            'slug' => $slug,
            'device_id' => 'WEB-'.strtoupper($slug),
        ]);
    }

    private function makeSupplier(?string $storeId, string $name): Supplier
    {
        $supplier = new Supplier();
        $supplier->name = $name;
        $supplier->store_id = $storeId;
        $supplier->is_active = true;
        $supplier->save();

        return $supplier;
    }

    private function push(array $change)
    {
        return $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->storeB->id])
            ->postJson('/api/v1/app/sync/push', ['setup' => true, 'changes' => [$change]]);
    }

    private function purchaseOrderInsert(string $id, string $supplierId): array
    {
        return [
            'table_name' => 'purchase_orders',
            'operation' => 'INSERT',
            'record_id' => $id,
            'payload' => [
                'id' => $id,
                'order_number' => 'PO-'.$id,
                'supplier_id' => $supplierId,
                'status' => 'pending',
                'total_amount' => 5000,
                'ordered_by' => $this->owner->id,
            ],
        ];
    }

    private function storedSupplierId(string $table, string $id): ?string
    {
        return DB::table($table)->where('id', $id)->value('supplier_id');
    }

    public function test_an_inserted_purchase_order_naming_another_stores_supplier_is_remapped_to_its_own()
    {
        $response = $this->push($this->purchaseOrderInsert('po-insert-1', $this->supplierA->id));

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertSame($this->supplierB->id, $this->storedSupplierId('purchase_orders', 'po-insert-1'));
        $this->assertDatabaseHas('sync_failures', [
            'table_name' => 'purchase_orders',
            'record_id' => 'po-insert-1',
            'reason' => 'cross_store_reference',
        ]);
    }

    public function test_an_updated_purchase_order_naming_another_stores_supplier_is_remapped_to_its_own()
    {
        $this->push($this->purchaseOrderInsert('po-update-1', $this->supplierB->id))->assertStatus(200);

        $response = $this->push([
            'table_name' => 'purchase_orders',
            'operation' => 'UPDATE',
            'record_id' => 'po-update-1',
            'payload' => ['id' => 'po-update-1', 'supplier_id' => $this->supplierA->id, '_version' => 1],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertSame($this->supplierB->id, $this->storedSupplierId('purchase_orders', 'po-update-1'));
    }

    public function test_a_supplier_payment_naming_another_stores_supplier_is_remapped_to_its_own()
    {
        $response = $this->push([
            'table_name' => 'supplier_payments',
            'operation' => 'INSERT',
            'record_id' => 'pay-1',
            'payload' => ['id' => 'pay-1', 'supplier_id' => $this->supplierA->id, 'amount' => 2500],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertSame($this->supplierB->id, $this->storedSupplierId('supplier_payments', 'pay-1'));
    }

    public function test_a_stock_batch_naming_another_stores_supplier_is_remapped_to_its_own()
    {
        DB::table('products')->insert([
            'id' => 'prod-b',
            'store_id' => $this->storeB->id,
            'user_id' => $this->owner->id,
            'name' => 'Paracetamol',
            'selling_price' => 100,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->push([
            'table_name' => 'stock_batches',
            'operation' => 'INSERT',
            'record_id' => 'batch-1',
            'payload' => [
                'id' => 'batch-1',
                'product_id' => 'prod-b',
                'store_id' => $this->storeB->id,
                'supplier_id' => $this->supplierA->id,
                'batch_number' => 'B-1',
                'quantity' => 10,
                'cost_price' => 50,
                '_version' => 1,
            ],
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $this->assertSame($this->supplierB->id, $this->storedSupplierId('stock_batches', 'batch-1'));
    }

    public function test_a_store_without_the_name_gets_its_own_supplier_created_with_the_name_only()
    {
        $fidson = $this->makeSupplier($this->storeA->id, 'Fidson');
        $fidson->phone = '08000000000';
        $fidson->save();

        $this->push($this->purchaseOrderInsert('po-create-1', $fidson->id))->assertStatus(200);

        $ownedId = $this->storedSupplierId('purchase_orders', 'po-create-1');
        $this->assertNotSame($fidson->id, $ownedId);
        $owned = Supplier::find($ownedId);
        $this->assertSame($this->storeB->id, $owned->store_id);
        $this->assertSame('Fidson', $owned->name);
        $this->assertNull($owned->phone);
    }

    public function test_a_soft_deleted_same_named_supplier_is_revived_rather_than_duplicated()
    {
        $this->supplierB->delete();

        $this->push($this->purchaseOrderInsert('po-revive-1', $this->supplierA->id))->assertStatus(200);

        $this->assertSame($this->supplierB->id, $this->storedSupplierId('purchase_orders', 'po-revive-1'));
        $this->assertNull(Supplier::withTrashed()->find($this->supplierB->id)->deleted_at);
        $this->assertSame(1, Supplier::withTrashed()->where('store_id', $this->storeB->id)->count());
    }

    public function test_a_supplier_with_no_store_of_its_own_is_left_untouched()
    {
        $legacy = $this->makeSupplier(null, 'Emzor');

        $this->push($this->purchaseOrderInsert('po-legacy-1', $legacy->id))->assertStatus(200);

        $this->assertSame($legacy->id, $this->storedSupplierId('purchase_orders', 'po-legacy-1'));
    }

    public function test_the_stores_own_supplier_is_left_untouched()
    {
        $this->push($this->purchaseOrderInsert('po-own-1', $this->supplierB->id))->assertStatus(200);

        $this->assertSame($this->supplierB->id, $this->storedSupplierId('purchase_orders', 'po-own-1'));
        $this->assertDatabaseMissing('sync_failures', ['record_id' => 'po-own-1']);
    }
}
