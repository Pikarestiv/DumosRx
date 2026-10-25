<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/** A-325: an UPDATE may not repoint a child row at a parent outside the session's scope. Rules: laravel-server/AGENTS.md, "A child UPDATE's new parent must be in scope". */
class ZzThrowawayRepointBypassTest extends TestCase
{
    use RefreshDatabase;

    private User $victimOwner;

    private Store $victimStore;

    private User $attackerOwner;

    private Store $attackerStore;

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

    private function makeTenant(string $slug): array
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

    private function seedProduct(Store $store, User $owner): string
    {
        $id = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $id, 'store_id' => $store->id, 'user_id' => $owner->id, 'name' => 'Painkillers',
            'selling_price' => 500, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function seedBatch(string $productId, ?string $storeId): string
    {
        $id = (string) Str::uuid();
        DB::table('stock_batches')->insert([
            'id' => $id, 'product_id' => $productId, 'store_id' => $storeId, 'batch_number' => 'B-'.substr($id, 0, 6),
            'quantity' => 10, 'cost_price' => 100, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function seedPurchaseOrder(Store $store, User $owner): string
    {
        $id = (string) Str::uuid();
        DB::table('purchase_orders')->insert([
            'id' => $id, 'store_id' => $store->id, 'ordered_by' => $owner->id, 'order_number' => 'PO-'.substr($id, 0, 6), 'status' => 'pending',
            'total_amount' => 0, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function seedPurchaseOrderItem(string $purchaseOrderId, string $productId): string
    {
        $id = (string) Str::uuid();
        DB::table('purchase_order_items')->insert([
            'id' => $id, 'purchase_order_id' => $purchaseOrderId, 'product_id' => $productId,
            'quantity_ordered' => 5, 'unit_cost' => 100, 'total_cost' => 500, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function seedSale(Store $store, User $owner, bool $deleted = false): string
    {
        $id = (string) Str::uuid();
        DB::table('sales')->insert([
            'id' => $id, 'store_id' => $store->id, 'transaction_number' => 'TXN-'.substr($id, 0, 6), 'cashier_id' => $owner->id,
            'total_amount' => 100, 'amount_paid' => 100, 'payment_method' => 'cash',
            'created_at' => now(), 'updated_at' => now(), 'deleted_at' => $deleted ? now() : null,
        ]);

        return $id;
    }

    private function seedSaleItem(string $saleId, string $productId): string
    {
        $id = (string) Str::uuid();
        DB::table('sale_items')->insert([
            'id' => $id, 'sale_id' => $saleId, 'product_id' => $productId, 'quantity' => 1,
            'unit_price' => 100, 'total_price' => 100, 'cost_price' => 50, 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function pushUpdate(User $as, string $table, string $recordId, array $payload, string $operation = 'UPDATE')
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

    private function assertRefusedAsForbidden($response, string $table, string $recordId): void
    {
        $response->assertStatus(200);
        $this->assertContains(
            ['id' => 11, 'table_name' => $table, 'record_id' => $recordId, 'reason' => 'forbidden'],
            array_map(fn ($f) => array_intersect_key($f, array_flip(['id', 'table_name', 'record_id', 'reason'])), $response->json('failed') ?? []),
        );
    }

    public function test_a_batch_update_repointing_its_product_at_another_tenants_product_is_refused(): void
    {
        $victimProduct = $this->seedProduct($this->victimStore, $this->victimOwner);
        $batch = $this->seedBatch($this->seedProduct($this->attackerStore, $this->attackerOwner), $this->attackerStore->id);

        $response = $this->pushUpdate($this->attackerOwner, 'stock_batches', $batch, ['product_id' => $victimProduct, 'quantity' => 999]);

        $this->assertRefusedAsForbidden($response, 'stock_batches', $batch);
        $this->assertNotSame($victimProduct, DB::table('stock_batches')->where('id', $batch)->value('product_id'));
    }

    public function test_a_resent_batch_insert_repointing_its_product_at_another_tenants_product_is_refused(): void
    {
        $victimProduct = $this->seedProduct($this->victimStore, $this->victimOwner);
        $batch = $this->seedBatch($this->seedProduct($this->attackerStore, $this->attackerOwner), $this->attackerStore->id);

        $response = $this->pushUpdate($this->attackerOwner, 'stock_batches', $batch, [
            'product_id' => $victimProduct, 'batch_number' => 'B-X', 'quantity' => 999, 'cost_price' => 1,
        ], 'INSERT');

        $this->assertRefusedAsForbidden($response, 'stock_batches', $batch);
        $this->assertNotSame($victimProduct, DB::table('stock_batches')->where('id', $batch)->value('product_id'));
    }

    public function test_a_purchase_order_line_repointed_at_another_tenants_order_is_refused(): void
    {
        $product = $this->seedProduct($this->attackerStore, $this->attackerOwner);
        $line = $this->seedPurchaseOrderItem($this->seedPurchaseOrder($this->attackerStore, $this->attackerOwner), $product);
        $victimOrder = $this->seedPurchaseOrder($this->victimStore, $this->victimOwner);

        $response = $this->pushUpdate($this->attackerOwner, 'purchase_order_items', $line, ['purchase_order_id' => $victimOrder]);

        $this->assertRefusedAsForbidden($response, 'purchase_order_items', $line);
        $this->assertNotSame($victimOrder, DB::table('purchase_order_items')->where('id', $line)->value('purchase_order_id'));
    }

    public function test_a_sale_line_repointed_at_another_tenants_voided_sale_is_refused(): void
    {
        $product = $this->seedProduct($this->attackerStore, $this->attackerOwner);
        $line = $this->seedSaleItem($this->seedSale($this->attackerStore, $this->attackerOwner), $product);
        $victimVoidedSale = $this->seedSale($this->victimStore, $this->victimOwner, true);

        $response = $this->pushUpdate($this->attackerOwner, 'sale_items', $line, ['sale_id' => $victimVoidedSale]);

        $this->assertRefusedAsForbidden($response, 'sale_items', $line);
        $this->assertNotSame($victimVoidedSale, DB::table('sale_items')->where('id', $line)->value('sale_id'));
    }

    public function test_a_batch_moved_to_another_product_of_the_same_tenant_is_accepted(): void
    {
        $batch = $this->seedBatch($this->seedProduct($this->attackerStore, $this->attackerOwner), $this->attackerStore->id);
        $otherOwnProduct = $this->seedProduct($this->attackerStore, $this->attackerOwner);

        $response = $this->pushUpdate($this->attackerOwner, 'stock_batches', $batch, ['product_id' => $otherOwnProduct]);

        $response->assertStatus(200);
        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertSame($otherOwnProduct, DB::table('stock_batches')->where('id', $batch)->value('product_id'));
    }

    public function test_an_update_restating_the_same_parent_costs_no_extra_lookup(): void
    {
        $product = $this->seedProduct($this->attackerStore, $this->attackerOwner);
        $batch = $this->seedBatch($product, $this->attackerStore->id);
        $control = $this->seedBatch($product, $this->attackerStore->id);

        $withoutParent = $this->productLookups(fn () => $this->pushUpdate($this->attackerOwner, 'stock_batches', $control, ['cost_price' => 70]));
        $restatingParent = $this->productLookups(fn () => $this->pushUpdate($this->attackerOwner, 'stock_batches', $batch, ['product_id' => $product, 'cost_price' => 60]));

        $this->assertSame($withoutParent, $restatingParent);
        $this->assertSame(60.0, (float) DB::table('stock_batches')->where('id', $batch)->value('cost_price'));
    }

    private function productLookups(callable $push): int
    {
        DB::flushQueryLog();
        DB::enableQueryLog();
        $push()->assertStatus(200)->assertJsonPath('failed', []);
        $count = collect(DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'from "products"'))->count();
        DB::disableQueryLog();

        return $count;
    }

    public function test_a_super_admin_may_repoint_a_batch_across_tenants(): void
    {
        $admin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin', 'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'super_admin',
        ]);
        $victimProduct = $this->seedProduct($this->victimStore, $this->victimOwner);
        $batch = $this->seedBatch($this->seedProduct($this->attackerStore, $this->attackerOwner), $this->attackerStore->id);

        $response = $this->pushUpdate($admin, 'stock_batches', $batch, ['product_id' => $victimProduct]);

        $response->assertStatus(200);
        $this->assertSame($victimProduct, DB::table('stock_batches')->where('id', $batch)->value('product_id'));
    }

    public function test_zz_uppercase_key_bypass_update(): void
    {
        $victimProduct = $this->seedProduct($this->victimStore, $this->victimOwner);
        $batch = $this->seedBatch($this->seedProduct($this->attackerStore, $this->attackerOwner), $this->attackerStore->id);

        $response = $this->pushUpdate($this->attackerOwner, 'stock_batches', $batch, ['PRODUCT_ID' => $victimProduct, 'cost_price' => 1]);
        fwrite(STDERR, json_encode($response->json())."\n");
        fwrite(STDERR, "stored product_id=".DB::table('stock_batches')->where('id', $batch)->value('product_id')." victim=".$victimProduct."\n");

        $pull = $this->actingAs($this->victimOwner)->postJson('/api/v1/app/sync/pull', ['last_synced' => []]);
        $ids = collect($pull->json('changes.stock_batches') ?? [])->pluck('id')->all();
        fwrite(STDERR, "victim pull has batch: ".(in_array($batch, $ids, true) ? 'YES' : 'no')."\n");
        $this->assertTrue(true);
    }

    public function test_zz_uppercase_key_bypass_purchase_order_item(): void
    {
        $product = $this->seedProduct($this->attackerStore, $this->attackerOwner);
        $line = $this->seedPurchaseOrderItem($this->seedPurchaseOrder($this->attackerStore, $this->attackerOwner), $product);
        $victimOrder = $this->seedPurchaseOrder($this->victimStore, $this->victimOwner);
        $response = $this->pushUpdate($this->attackerOwner, 'purchase_order_items', $line, ['Purchase_Order_Id' => $victimOrder]);
        fwrite(STDERR, json_encode($response->json('failed'))."\n");
        fwrite(STDERR, "stored po=".DB::table('purchase_order_items')->where('id', $line)->value('purchase_order_id')." victim=".$victimOrder."\n");
        $this->assertTrue(true);
    }

    public function test_zz_uppercase_insert_batch(): void
    {
        $victimProduct = $this->seedProduct($this->victimStore, $this->victimOwner);
        $id = (string) Str::uuid();
        $response = $this->pushUpdate($this->attackerOwner, 'stock_batches', $id, ['PRODUCT_ID' => $victimProduct, 'batch_number' => 'X', 'cost_price' => 1], 'INSERT');
        fwrite(STDERR, "INSERT failed=".json_encode($response->json('failed'))." stored=".DB::table('stock_batches')->where('id', $id)->value('product_id')." victim=$victimProduct\n");
        $this->assertTrue(true);
    }

    public function test_zz_uppercase_store_id_moves_product(): void
    {
        $p = $this->seedProduct($this->attackerStore, $this->attackerOwner);
        $response = $this->pushUpdate($this->attackerOwner, 'products', $p, ['STORE_ID' => $this->victimStore->id, 'name' => 'X']);
        fwrite(STDERR, "PRODUCT failed=".json_encode($response->json('failed'))." stored=".DB::table('products')->where('id', $p)->value('store_id')." victim=".$this->victimStore->id."\n");
        $this->assertTrue(true);
    }
}
