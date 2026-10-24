<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SyncPushStorelessProductTenantTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);
        $this->withoutMiddleware();
    }

    private function tenant(string $name): array
    {
        $owner = User::create([
            'first_name' => $name, 'last_name' => 'Owner', 'email' => "{$name}@dumosrx.com",
            'password' => bcrypt('password'), 'role' => 'admin',
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => "{$name} Store", 'email' => "{$name}-store@dumosrx.com",
            'phone' => '3333333333', 'address' => '3 St', 'slug' => "{$name}-store", 'device_id' => "WEB-{$name}",
        ]);
        $owner->update(['store_id' => $store->id]);

        return [$owner, $store];
    }

    private function seedStorelessProduct(string $id, string $authorId): void
    {
        Schema::disableForeignKeyConstraints();
        DB::table('products')->insert([
            'id' => $id, 'name' => 'Legacy Syrup', 'selling_price' => 500, 'store_id' => null,
            'user_id' => $authorId, '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        Schema::enableForeignKeyConstraints();
    }

    private function pushBatch(User $as, Store $store, string $productId)
    {
        return $this->actingAs($as)->withHeaders(['X-Store-Id' => $store->id])->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [['table_name' => 'stock_batches', 'operation' => 'INSERT', 'record_id' => "{$productId}-batch",
                'payload' => ['id' => "{$productId}-batch", 'product_id' => $productId, 'store_id' => $store->id,
                    'batch_number' => 'B-1', 'quantity' => 5, 'cost_price' => 50, '_version' => 1]]],
        ]);
    }

    public function test_another_tenants_store_less_product_is_not_claimed_by_stock_naming_it()
    {
        [$attacker, $attackerStore] = $this->tenant('attacker');
        [$victim] = $this->tenant('victim');
        $this->seedStorelessProduct('victim-legacy', $victim->id);

        $this->pushBatch($attacker, $attackerStore, 'victim-legacy')->assertStatus(200);

        $product = DB::table('products')->where('id', 'victim-legacy')->first();
        $this->assertNull($product->store_id);
        $this->assertSame(1, (int) $product->_version);
    }

    public function test_the_tenants_own_store_less_product_is_still_attributed_by_its_stock()
    {
        [$owner, $store] = $this->tenant('own');
        $this->seedStorelessProduct('own-legacy', $owner->id);

        $this->pushBatch($owner, $store, 'own-legacy')->assertStatus(200);

        $this->assertSame($store->id, DB::table('products')->where('id', 'own-legacy')->value('store_id'));
    }
}
