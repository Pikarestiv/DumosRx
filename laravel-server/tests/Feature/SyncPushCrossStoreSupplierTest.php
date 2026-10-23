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

    public function test_a_soft_deleted_same_named_supplier_stays_deleted_and_a_new_one_is_created()
    {
        $this->supplierB->delete();

        $this->push($this->purchaseOrderInsert('po-deleted-1', $this->supplierA->id))->assertStatus(200);

        $ownedId = $this->storedSupplierId('purchase_orders', 'po-deleted-1');
        $this->assertNotContains($ownedId, [$this->supplierA->id, $this->supplierB->id]);
        $this->assertNotNull(Supplier::withTrashed()->find($this->supplierB->id)->deleted_at);
    }

    public function test_a_soft_deleted_referent_in_a_sibling_store_is_still_re_owned()
    {
        $this->supplierA->delete();

        $this->push($this->purchaseOrderInsert('po-trashed-ref-1', $this->supplierA->id))->assertStatus(200);

        $this->assertSame($this->supplierB->id, $this->storedSupplierId('purchase_orders', 'po-trashed-ref-1'));
    }

    public function test_an_update_moving_the_row_to_another_store_is_checked_against_the_new_store()
    {
        $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->storeA->id])
            ->postJson('/api/v1/app/sync/push', ['setup' => true, 'changes' => [
                $this->purchaseOrderInsert('po-move-1', $this->supplierA->id),
            ]])->assertStatus(200);

        $this->push([
            'table_name' => 'purchase_orders',
            'operation' => 'UPDATE',
            'record_id' => 'po-move-1',
            'payload' => ['id' => 'po-move-1', 'store_id' => $this->storeB->id, 'supplier_id' => $this->supplierA->id, '_version' => 1],
        ])->assertStatus(200);

        $this->assertSame($this->supplierB->id, $this->storedSupplierId('purchase_orders', 'po-move-1'));
    }

    public function test_a_rejected_update_creates_no_supplier()
    {
        $fidson = $this->makeSupplier($this->storeA->id, 'Fidson');
        $this->push($this->purchaseOrderInsert('po-stale-1', $this->supplierB->id))->assertStatus(200);

        $response = $this->push([
            'table_name' => 'purchase_orders',
            'operation' => 'UPDATE',
            'record_id' => 'po-stale-1',
            'payload' => ['id' => 'po-stale-1', 'supplier_id' => $fidson->id, '_version' => 7],
        ]);

        $response->assertJsonPath('failed.0.record_id', 'po-stale-1');
        $this->assertSame(0, Supplier::withTrashed()->where('store_id', $this->storeB->id)->where('name', 'Fidson')->count());
        $this->assertDatabaseMissing('sync_failures', ['record_id' => 'po-stale-1', 'reason' => 'cross_store_reference']);
    }

    public function test_a_change_that_rolls_back_does_not_leave_a_later_change_on_a_vanished_supplier()
    {
        $fidson = $this->makeSupplier($this->storeA->id, 'Fidson');
        $broken = $this->purchaseOrderInsert('po-broken-1', $fidson->id);
        $broken['payload']['column_that_does_not_exist'] = 'x';

        $response = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->storeB->id])
            ->postJson('/api/v1/app/sync/push', ['setup' => true, 'changes' => [
                $broken,
                $this->purchaseOrderInsert('po-after-1', $fidson->id),
            ]]);

        $response->assertJsonPath('failed.0.record_id', 'po-broken-1');
        $ownedId = $this->storedSupplierId('purchase_orders', 'po-after-1');
        $this->assertNotNull(Supplier::find($ownedId));
        $this->assertSame($this->storeB->id, Supplier::find($ownedId)->store_id);
        $this->assertDatabaseMissing('sync_failures', ['record_id' => 'po-broken-1', 'reason' => 'cross_store_reference']);
    }

    public function test_a_created_supplier_is_stamped_for_the_next_pull()
    {
        $fidson = $this->makeSupplier($this->storeA->id, 'Fidson');

        $this->push($this->purchaseOrderInsert('po-stamp-1', $fidson->id))->assertStatus(200);

        $ownedId = $this->storedSupplierId('purchase_orders', 'po-stamp-1');
        $this->assertNotNull(DB::table('suppliers')->where('id', $ownedId)->value('_synced_at'));
    }

    public function test_another_tenants_supplier_is_never_copied_into_this_store()
    {
        $stranger = User::create([
            'first_name' => 'Other',
            'last_name' => 'Tenant',
            'email' => 'other-tenant@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $foreignStore = Store::create([
            'user_id' => $stranger->id,
            'name' => 'Foreign Store',
            'email' => 'foreign@dumosrx.com',
            'phone' => '5999999999',
            'address' => 'Foreign St',
            'slug' => 'foreign-store',
            'device_id' => 'WEB-FOREIGN',
        ]);
        $secret = $this->makeSupplier($foreignStore->id, 'Secret Wholesaler');

        $this->push($this->purchaseOrderInsert('po-foreign-1', $secret->id))->assertStatus(200);

        $this->assertSame(0, Supplier::where('store_id', $this->storeB->id)->where('name', 'Secret Wholesaler')->count());
        $this->assertDatabaseMissing('sync_failures', ['record_id' => 'po-foreign-1', 'reason' => 'cross_store_reference']);
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

    private function pushBatch(string $batchId, ?string $batchStoreId, string $productStoreId): void
    {
        $productId = 'prod-'.$batchId;
        DB::table('products')->insert([
            'id' => $productId, 'store_id' => $productStoreId, 'user_id' => $this->owner->id,
            'name' => 'Paracetamol', 'selling_price' => 100, '_version' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->push([
            'table_name' => 'stock_batches',
            'operation' => 'INSERT',
            'record_id' => $batchId,
            'payload' => array_filter([
                'id' => $batchId, 'product_id' => $productId, 'store_id' => $batchStoreId,
                'supplier_id' => $this->supplierA->id, 'batch_number' => 'B-'.$batchId,
                'quantity' => 1, 'cost_price' => 50, '_version' => 1,
            ], fn ($v) => $v !== null),
        ])->assertStatus(200);
    }

    public function test_a_legacy_batch_with_no_store_of_its_own_is_re_owned_through_its_product()
    {
        $this->pushBatch('batch-legacy', null, $this->storeB->id);

        $this->assertSame($this->supplierB->id, $this->storedSupplierId('stock_batches', 'batch-legacy'));
    }

    public function test_a_batch_is_judged_by_its_products_store_not_its_own()
    {
        $this->pushBatch('batch-drifted', $this->storeA->id, $this->storeB->id);

        $this->assertSame($this->supplierB->id, $this->storedSupplierId('stock_batches', 'batch-drifted'));
    }

    public function test_a_created_supplier_belongs_to_the_stores_owner()
    {
        $fidson = $this->makeSupplier($this->storeA->id, 'Fidson');

        $this->push($this->purchaseOrderInsert('po-owner-1', $fidson->id))->assertStatus(200);

        $this->assertSame($this->owner->id, Supplier::find($this->storedSupplierId('purchase_orders', 'po-owner-1'))->user_id);
    }

    public function test_an_existing_supplier_that_was_only_matched_is_not_restamped()
    {
        DB::table('suppliers')->where('id', $this->supplierB->id)->update(['_synced_at' => now()->subDay(), 'updated_at' => now()->subDays(2)]);
        $stamp = DB::table('suppliers')->where('id', $this->supplierB->id)->value('_synced_at');

        $this->push($this->purchaseOrderInsert('po-matched-1', $this->supplierA->id))->assertStatus(200);

        $this->assertSame($stamp, DB::table('suppliers')->where('id', $this->supplierB->id)->value('_synced_at'));
    }
}
