<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** A-325: an UPDATE may not repoint a child row at a parent outside the session's scope. Rules: laravel-server/AGENTS.md, "A child UPDATE's new parent must be in scope". */
class SyncPushChildParentRepointTest extends SyncPushTwoTenantTestCase
{
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

    public function test_a_sale_item_batch_repointed_at_another_tenants_sale_line_is_refused(): void
    {
        $product = $this->seedProduct($this->attackerStore, $this->attackerOwner);
        $ownLine = $this->seedSaleItem($this->seedSale($this->attackerStore, $this->attackerOwner), $product);
        $victimLine = $this->seedSaleItem($this->seedSale($this->victimStore, $this->victimOwner), $this->seedProduct($this->victimStore, $this->victimOwner));
        $allocation = (string) Str::uuid();
        DB::table('sale_item_batches')->insert([
            'id' => $allocation, 'sale_item_id' => $ownLine, 'stock_batch_id' => $this->seedBatch($product, $this->attackerStore->id),
            'quantity' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->pushUpdate($this->attackerOwner, 'sale_item_batches', $allocation, ['sale_item_id' => $victimLine]);

        $this->assertRefusedAsForbidden($response, 'sale_item_batches', $allocation);
        $this->assertSame($ownLine, DB::table('sale_item_batches')->where('id', $allocation)->value('sale_item_id'));
    }

    public function test_a_sale_line_inserted_under_another_tenants_voided_sale_is_refused(): void
    {
        $victimVoidedSale = $this->seedSale($this->victimStore, $this->victimOwner, true);
        $line = (string) Str::uuid();

        $response = $this->pushUpdate($this->attackerOwner, 'sale_items', $line, [
            'sale_id' => $victimVoidedSale, 'product_id' => $this->seedProduct($this->attackerStore, $this->attackerOwner),
            'quantity' => 1, 'unit_price' => 100, 'total_price' => 100, 'cost_price' => 50,
            'store_id' => $this->attackerStore->id, 'created_at' => now()->toDateTimeString(),
        ], 'INSERT');

        $this->assertRefusedAsForbidden($response, 'sale_items', $line);
        $this->assertFalse(DB::table('sale_items')->where('id', $line)->exists());
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
}
