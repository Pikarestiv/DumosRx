<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Coverage for SyncController::pull()'s response-shaping logic: mapping
 * server column names back to the client's SQLite schema, and the
 * multi-tenant scoping match() block - neither had any dedicated test
 * coverage before this file (SyncEndpointTest.php and SyncSchemaDriftTest.php
 * both focus on push()/pull() plumbing, not pull()'s per-row field mapping or
 * its store-scoping matrix).
 */
class SyncPullMappingTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Pull Test Store',
            'store_slug' => 'pull-test-store',
            'device_id' => 'WEB-PULL-TEST',
        ]);

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function pull(User $as, array $lastSynced = [], ?string $storeIdHeader = null)
    {
        $request = $this->actingAs($as);
        if ($storeIdHeader) {
            $request = $request->withHeader('X-Store-Id', $storeIdHeader);
        }
        return $request->postJson('/api/v1/app/sync/pull', ['last_synced' => $lastSynced]);
    }

    public function test_pull_maps_purchase_order_fields_back_to_client_format()
    {
        $supplierId = (string) \Illuminate\Support\Str::uuid();
        DB::table('suppliers')->insert([
            'id' => $supplierId, 'user_id' => $this->owner->id, 'name' => 'Pull Supplier',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $poId = (string) \Illuminate\Support\Str::uuid();
        DB::table('purchase_orders')->insert([
            'id' => $poId,
            'ordered_by' => $this->owner->id,
            'supplier_id' => $supplierId,
            'store_id' => $this->store->id,
            'order_number' => 'PO-PULL-001',
            'status' => 'pending',
            'payment_status' => 'unpaid',
            'order_date' => now()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->pull($this->owner);

        $response->assertStatus(200);
        $rows = collect($response->json('changes.purchase_orders'));
        $row = $rows->firstWhere('id', $poId);
        $this->assertNotNull($row);
        $this->assertSame($supplierId, $row['vendor_id']);
        $this->assertSame($this->owner->id, $row['user_id']);
    }

    public function test_pull_maps_purchase_order_item_fields_back_to_client_format()
    {
        $supplierId = (string) \Illuminate\Support\Str::uuid();
        DB::table('suppliers')->insert([
            'id' => $supplierId, 'user_id' => $this->owner->id, 'name' => 'Pull Item Supplier',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $poId = (string) \Illuminate\Support\Str::uuid();
        DB::table('purchase_orders')->insert([
            'id' => $poId, 'ordered_by' => $this->owner->id, 'supplier_id' => $supplierId,
            'store_id' => $this->store->id, 'order_number' => 'PO-PULL-002', 'status' => 'pending',
            'payment_status' => 'unpaid', 'order_date' => now()->toDateString(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $productId = 'prod_pull_item_map';
        DB::table('products')->insert([
            'id' => $productId, 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'name' => 'Pull Mapped Product', '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $itemId = (string) \Illuminate\Support\Str::uuid();
        DB::table('purchase_order_items')->insert([
            'id' => $itemId,
            'purchase_order_id' => $poId,
            'product_id' => $productId,
            'quantity_ordered' => 30,
            'unit_cost' => 100,
            'total_cost' => 3000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->pull($this->owner);

        $response->assertStatus(200);
        $row = collect($response->json('changes.purchase_order_items'))->firstWhere('id', $itemId);
        $this->assertNotNull($row);
        $this->assertSame($poId, $row['po_id']);
        $this->assertEquals(3000, $row['subtotal']);
        $this->assertEquals(30, $row['bulk_quantity']);
        $this->assertEquals(1, $row['units_per_bulk']);
    }

    public function test_pull_maps_sales_cashier_id_back_to_user_id()
    {
        $saleId = (string) \Illuminate\Support\Str::uuid();
        DB::table('sales')->insert([
            'id' => $saleId,
            'cashier_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'total_amount' => 1000,
            'amount_paid' => 1000,
            'payment_method' => 'cash',
            'transaction_number' => 'TXN-PULL-001',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->pull($this->owner);

        $response->assertStatus(200);
        $row = collect($response->json('changes.sales'))->firstWhere('id', $saleId);
        $this->assertNotNull($row);
        $this->assertSame($this->owner->id, $row['user_id']);
    }

    public function test_pull_derives_username_and_name_for_a_user_missing_them()
    {
        $staff = User::create([
            'first_name' => 'Jane', 'last_name' => 'Doe',
            'email' => 'jane-pull@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->store->id,
        ]);
        // Simulate a legacy row with no username set.
        DB::table('users')->where('id', $staff->id)->update(['username' => null]);

        $response = $this->pull($this->owner);

        $response->assertStatus(200);
        $row = collect($response->json('changes.users'))->firstWhere('id', $staff->id);
        $this->assertNotNull($row);
        $this->assertSame('jane-pull@dumosrx.com', $row['username']);
        $this->assertSame('Jane Doe', $row['name']);
    }

    public function test_pull_scopes_products_to_staff_own_store_only()
    {
        $otherOwner = User::create([
            'first_name' => 'Other', 'last_name' => 'Owner',
            'email' => 'other-owner@dumosrx.com', 'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $otherStore = Store::create([
            'user_id' => $otherOwner->id, 'name' => 'Other Store',
            'store_slug' => 'other-store', 'device_id' => 'WEB-OTHER',
        ]);

        $staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'Member',
            'email' => 'staff-scope@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        DB::table('products')->insert([
            'id' => 'prod_own_store', 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'name' => 'Own Store Product', '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('products')->insert([
            'id' => 'prod_other_store', 'user_id' => $otherOwner->id, 'store_id' => $otherStore->id,
            'name' => 'Other Store Product', '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->pull($staff);

        $response->assertStatus(200);
        $ids = collect($response->json('changes.products'))->pluck('id');
        $this->assertTrue($ids->contains('prod_own_store'));
        $this->assertFalse($ids->contains('prod_other_store'));
    }

    public function test_pull_scopes_to_the_store_requested_via_x_store_id_header()
    {
        $secondStore = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Second Owned Store',
            'store_slug' => 'second-owned-store', 'device_id' => 'WEB-SECOND',
        ]);

        DB::table('products')->insert([
            'id' => 'prod_first_store', 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'name' => 'First Store Product', '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('products')->insert([
            'id' => 'prod_second_store', 'user_id' => $this->owner->id, 'store_id' => $secondStore->id,
            'name' => 'Second Store Product', '_version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $response = $this->pull($this->owner, [], $secondStore->id);

        $response->assertStatus(200);
        $ids = collect($response->json('changes.products'))->pluck('id');
        $this->assertTrue($ids->contains('prod_second_store'));
        $this->assertFalse($ids->contains('prod_first_store'));
    }

    public function test_pull_stores_list_returns_every_owned_store_regardless_of_x_store_id()
    {
        $secondStore = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Also Owned Store',
            'store_slug' => 'also-owned-store', 'device_id' => 'WEB-ALSO',
        ]);

        // Narrow to just the first store via the header...
        $response = $this->pull($this->owner, [], $this->store->id);

        $response->assertStatus(200);
        // ...but the 'stores' table itself must still list both, since it's
        // the store-switcher discovery list, not domain data scoped to the
        // currently-active store.
        $ids = collect($response->json('changes.stores'))->pluck('id');
        $this->assertTrue($ids->contains($this->store->id));
        $this->assertTrue($ids->contains($secondStore->id));
    }

    public function test_pull_marks_a_soft_deleted_row_with_deleted_flag()
    {
        $productId = 'prod_pull_soft_deleted';
        DB::table('products')->insert([
            'id' => $productId, 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'name' => 'Soft Deleted Product', '_version' => 1,
            'created_at' => now(), 'updated_at' => now(), 'deleted_at' => now(),
        ]);

        $response = $this->pull($this->owner);

        $response->assertStatus(200);
        $row = collect($response->json('changes.products'))->firstWhere('id', $productId);
        $this->assertNotNull($row);
        $this->assertSame(1, $row['_deleted']);
    }

    public function test_pull_computes_subscription_tier_and_license_token_for_an_active_plan()
    {
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]],
                'pro' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]],
            ],
        ]);

        \App\Models\Subscription::create([
            'user_id' => $this->owner->id,
            'plan_name' => 'pro',
            'start_date' => now()->subDay(),
            'end_date' => now()->addMonth(),
            'status' => 'active',
            'license_key' => 'LIC-PULL-TEST',
            'is_trial' => false,
        ]);

        $response = $this->pull($this->owner);

        $response->assertStatus(200);
        $row = collect($response->json('changes.stores'))->firstWhere('id', $this->store->id);
        $this->assertNotNull($row);
        $this->assertSame('pro', $row['subscription_tier']);
        $this->assertNotNull($row['license_token']);
        $token = json_decode($row['license_token'], true);
        $this->assertSame('pro', $token['tier']);
        $this->assertFalse($token['is_trial']);
    }

    public function test_pull_defaults_subscription_tier_to_free_without_an_active_subscription()
    {
        $response = $this->pull($this->owner);

        $response->assertStatus(200);
        $row = collect($response->json('changes.stores'))->firstWhere('id', $this->store->id);
        $this->assertNotNull($row);
        $this->assertSame('free', $row['subscription_tier']);
        $this->assertNull($row['license_token']);
    }

    public function test_pull_only_returns_rows_updated_after_the_last_synced_cursor()
    {
        DB::table('products')->insert([
            'id' => 'prod_pull_old', 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'name' => 'Old Unchanged Product', '_version' => 1,
            'created_at' => now()->subDays(5), 'updated_at' => now()->subDays(5),
        ]);
        DB::table('products')->insert([
            'id' => 'prod_pull_new', 'user_id' => $this->owner->id, 'store_id' => $this->store->id,
            'name' => 'Recently Changed Product', '_version' => 1,
            'created_at' => now()->subDays(5), 'updated_at' => now(),
        ]);

        $response = $this->pull($this->owner, ['products' => now()->subDay()->toIso8601String()]);

        $response->assertStatus(200);
        $ids = collect($response->json('changes.products'))->pluck('id');
        $this->assertTrue($ids->contains('prod_pull_new'));
        $this->assertFalse($ids->contains('prod_pull_old'));
    }
}
