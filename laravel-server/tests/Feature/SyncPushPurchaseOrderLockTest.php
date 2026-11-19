<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** The advisory draft lock: a till editing a purchase order fences other tills' line edits until its lock goes stale. */
class SyncPushPurchaseOrderLockTest extends TestCase
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

    protected function lockBy(?string $deviceId, $at = null): void
    {
        DB::table('purchase_orders')->where('id', 'po-1')->update([
            'editing_device_id' => $deviceId,
            'editing_user_id' => $deviceId ? $this->owner->id : null,
            'updated_at' => $at ?? now(),
        ]);
    }

    protected function pushFrom(?string $deviceId, array $changes)
    {
        $headers = $deviceId ? ['X-Device-Id' => $deviceId] : [];

        return $this->actingAs($this->owner)->withHeaders($headers)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => $changes,
        ]);
    }

    protected function lineEdit(int $quantity): array
    {
        return [[
            'id' => 1,
            'table_name' => 'purchase_order_items',
            'operation' => 'UPDATE',
            'record_id' => 'poi-1',
            'payload' => ['id' => 'poi-1', 'bulk_quantity' => $quantity, 'units_per_bulk' => 10, 'unit_cost' => 100, '_version' => 1],
        ]];
    }

    protected function failedReasons($response): array
    {
        return collect($response->json('failed') ?? [])->pluck('reason')->all();
    }

    public function test_another_till_cannot_edit_a_line_while_the_lock_is_fresh()
    {
        $this->lockBy('DRX-HOLDER');

        $response = $this->pushFrom('DRX-OTHER', $this->lineEdit(7))->assertStatus(200);

        $this->assertSame(['draft_locked'], $this->failedReasons($response));
        $this->assertEquals(1000, DB::table('purchase_order_items')->where('id', 'poi-1')->value('quantity_ordered'));
    }

    public function test_the_till_holding_the_lock_edits_freely()
    {
        $this->lockBy('DRX-HOLDER');

        $response = $this->pushFrom('DRX-HOLDER', $this->lineEdit(7))->assertStatus(200);

        $this->assertSame([], $this->failedReasons($response));
        $this->assertEquals(70, DB::table('purchase_order_items')->where('id', 'poi-1')->value('quantity_ordered'));
    }

    public function test_a_stale_lock_no_longer_fences_anyone()
    {
        $this->lockBy('DRX-HOLDER', now()->subMinutes(11));

        $response = $this->pushFrom('DRX-OTHER', $this->lineEdit(7))->assertStatus(200);

        $this->assertSame([], $this->failedReasons($response));
    }

    public function test_an_order_nobody_has_locked_stays_open_to_older_tills_that_send_no_device_id()
    {
        $this->lockBy(null);

        $response = $this->pushFrom(null, $this->lineEdit(7))->assertStatus(200);

        $this->assertSame([], $this->failedReasons($response));
        $this->assertEquals(70, DB::table('purchase_order_items')->where('id', 'poi-1')->value('quantity_ordered'));
    }

    public function test_a_receipt_from_another_till_is_never_fenced()
    {
        $this->lockBy('DRX-HOLDER');

        $response = $this->pushFrom('DRX-OTHER', [[
            'id' => 1,
            'table_name' => 'purchase_order_items',
            'operation' => 'UPDATE',
            'record_id' => 'poi-1',
            'payload' => ['id' => 'poi-1', 'quantity_received' => 50, 'bulk_quantity' => 100, 'units_per_bulk' => 10, '_version' => 1],
        ]])->assertStatus(200);

        $this->assertSame([], $this->failedReasons($response));
        $this->assertEquals(500, DB::table('purchase_order_items')->where('id', 'poi-1')->value('quantity_received'));
    }

    public function test_another_till_cannot_add_a_line_to_a_locked_order()
    {
        $this->lockBy('DRX-HOLDER');

        $response = $this->pushFrom('DRX-OTHER', [[
            'id' => 1,
            'table_name' => 'purchase_order_items',
            'operation' => 'INSERT',
            'record_id' => 'poi-2',
            'payload' => ['id' => 'poi-2', 'po_id' => 'po-1', 'product_id' => 'prod-1', 'bulk_quantity' => 1, 'units_per_bulk' => 10, 'quantity_received' => 0, 'unit_cost' => 100, 'subtotal' => 100, '_version' => 1],
        ]])->assertStatus(200);

        $this->assertSame(['draft_locked'], $this->failedReasons($response));
        $this->assertDatabaseMissing('purchase_order_items', ['id' => 'poi-2']);
    }

    public function test_a_takeover_in_the_same_push_lets_that_tills_line_edits_through()
    {
        $this->lockBy('DRX-HOLDER', now()->subMinutes(11));

        $response = $this->pushFrom('DRX-OTHER', array_merge([[
            'id' => 2,
            'table_name' => 'purchase_orders',
            'operation' => 'UPDATE',
            'record_id' => 'po-1',
            'payload' => ['id' => 'po-1', 'editing_device_id' => 'DRX-OTHER', 'editing_user_id' => $this->owner->id, '_version' => 1],
        ]], $this->lineEdit(7)))->assertStatus(200);

        $this->assertSame([], $this->failedReasons($response));
        $this->assertSame('DRX-OTHER', DB::table('purchase_orders')->where('id', 'po-1')->value('editing_device_id'));
    }

    public function test_a_pulled_lock_names_the_till_by_its_nickname_over_what_the_till_sent()
    {
        $this->lockBy('DRX-HOLDER');
        DB::table('purchase_orders')->where('id', 'po-1')->update(['editing_device_label' => 'Chrome on Windows']);
        DB::table('device_nicknames')->insert([
            'id' => (string) \Illuminate\Support\Str::uuid(),
            'store_id' => $this->store->id,
            'device_id' => 'DRX-HOLDER',
            'nickname' => 'Counter 2',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $row = app(\App\Services\Sync\PullRowMapper::class)
            ->mapPullRowForClient(\App\Models\PurchaseOrder::find('po-1'), 'purchase_orders');

        $this->assertSame('Counter 2', $row['editing_device_label']);
    }
}
