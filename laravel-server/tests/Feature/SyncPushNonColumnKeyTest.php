<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\DataProvider;

/** A-325: a payload key that is not a bare column name is refused. Rules: laravel-server/AGENTS.md, "A payload key that is not a bare column name is refused". */
class SyncPushNonColumnKeyTest extends SyncPushTwoTenantTestCase
{
    /** @return array<string, array{0: string}> */
    public static function miscasedOperations(): array
    {
        return ['update' => ['UPDATE'], 'resent insert' => ['INSERT']];
    }

    #[DataProvider('miscasedOperations')]
    public function test_a_miscased_parent_key_cannot_repoint_a_batch(string $operation): void
    {
        $victimProduct = $this->seedProduct($this->victimStore, $this->victimOwner);
        $batch = $this->seedBatch($this->seedProduct($this->attackerStore, $this->attackerOwner), $this->attackerStore->id);

        $response = $this->pushUpdate($this->attackerOwner, 'stock_batches', $batch, ['PRODUCT_ID' => $victimProduct], $operation);

        $this->assertRefusedAsForbidden($response, 'stock_batches', $batch);
        $this->assertNotSame($victimProduct, DB::table('stock_batches')->where('id', $batch)->value('product_id'));
    }

    public function test_a_miscased_parent_key_cannot_insert_a_batch_under_another_tenants_product(): void
    {
        $victimProduct = $this->seedProduct($this->victimStore, $this->victimOwner);
        $batch = (string) Str::uuid();

        $response = $this->pushUpdate($this->attackerOwner, 'stock_batches', $batch, [
            'PRODUCT_ID' => $victimProduct, 'batch_number' => 'B-X', 'quantity' => 999, 'cost_price' => 1,
        ], 'INSERT');

        $this->assertRefusedAsForbidden($response, 'stock_batches', $batch);
        $this->assertFalse(DB::table('stock_batches')->where('id', $batch)->exists());
    }

    public function test_a_miscased_store_key_cannot_move_a_product_into_another_tenants_store(): void
    {
        $product = $this->seedProduct($this->attackerStore, $this->attackerOwner);

        $response = $this->pushUpdate($this->attackerOwner, 'products', $product, ['STORE_ID' => $this->victimStore->id]);

        $this->assertRefusedAsForbidden($response, 'products', $product);
        $this->assertSame($this->attackerStore->id, DB::table('products')->where('id', $product)->value('store_id'));
    }

    public function test_a_table_qualified_parent_key_cannot_repoint_a_batch(): void
    {
        $victimProduct = $this->seedProduct($this->victimStore, $this->victimOwner);
        $batch = $this->seedBatch($this->seedProduct($this->attackerStore, $this->attackerOwner), $this->attackerStore->id);

        $response = $this->pushUpdate($this->attackerOwner, 'stock_batches', $batch, ['stock_batches.product_id' => $victimProduct]);

        $this->assertRefusedAsForbidden($response, 'stock_batches', $batch);
        $this->assertNotSame($victimProduct, DB::table('stock_batches')->where('id', $batch)->value('product_id'));
    }

    public function test_a_table_qualified_store_key_cannot_move_a_product_into_another_tenants_store(): void
    {
        $product = $this->seedProduct($this->attackerStore, $this->attackerOwner);

        $response = $this->pushUpdate($this->attackerOwner, 'products', $product, ['products.store_id' => $this->victimStore->id]);

        $this->assertRefusedAsForbidden($response, 'products', $product);
        $this->assertSame($this->attackerStore->id, DB::table('products')->where('id', $product)->value('store_id'));
    }

    public function test_a_scalar_payload_fails_only_its_own_change(): void
    {
        $batch = $this->seedBatch($this->seedProduct($this->attackerStore, $this->attackerOwner), $this->attackerStore->id);

        $response = $this->actingAs($this->attackerOwner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                ['id' => 1, 'table_name' => 'stock_batches', 'operation' => 'UPDATE', 'record_id' => 'malformed', 'payload' => 5],
                ['id' => 2, 'table_name' => 'stock_batches', 'operation' => 'UPDATE', 'record_id' => $batch,
                    'payload' => ['id' => $batch, 'cost_price' => 55, '_version' => 1, 'updated_at' => now()->toDateTimeString()]],
            ],
        ]);

        $response->assertStatus(200);
        $this->assertSame(['malformed'], array_column($response->json('failed') ?? [], 'record_id'));
        $this->assertSame(55.0, (float) DB::table('stock_batches')->where('id', $batch)->value('cost_price'));
    }
}
