<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** A purchase order closed short ("closed", added 2026-11-19) syncs like any other status. */
class SyncPushPurchaseOrderClosedTest extends TestCase
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

    public function test_a_closed_short_order_and_its_reduced_total_are_accepted()
    {
        DB::table('purchase_orders')->where('id', 'po-1')->update(['status' => 'partially_received']);

        $response = $this->actingAs($this->owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'id' => 1,
                'table_name' => 'purchase_orders',
                'operation' => 'UPDATE',
                'record_id' => 'po-1',
                'payload' => ['id' => 'po-1', 'status' => 'closed', 'total_amount' => 40000, 'payment_status' => 'unpaid', '_version' => 1],
            ]],
        ])->assertStatus(200);

        $this->assertSame([], $response->json('failed') ?? []);
        $this->assertSame('closed', DB::table('purchase_orders')->where('id', 'po-1')->value('status'));
        $this->assertEquals(40000, DB::table('purchase_orders')->where('id', 'po-1')->value('total_amount'));
    }
}
