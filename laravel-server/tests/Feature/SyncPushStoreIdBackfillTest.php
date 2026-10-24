<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regression coverage for A-164: the two loyalty-config tables were absent
 * from SyncController::normalizePushPayload()'s store_id backfill list, so a
 * client INSERT that omitted store_id was stored with store_id NULL and then
 * stayed invisible to pull()'s store scoping forever — plus the correction
 * that followed, gating that backfill to genuine INSERTs so an UPDATE pushed
 * under a different active store can no longer reassign a row's store
 * ownership. See docs/FIXED_BUGS.md.
 */
class SyncPushStoreIdBackfillTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Loyalty',
            'last_name' => 'Owner',
            'email' => 'loyalty-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Loyalty Store',
            'email' => 'loyalty-store@dumosrx.com',
            'phone' => '3333333333',
            'address' => '3 Loyalty St',
            'slug' => 'loyalty-store',
            'device_id' => 'WEB-LOYALTY',
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

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function push(string $table, string $recordId, array $payload, string $operation = 'INSERT', array $headers = [])
    {
        return $this->actingAs($this->owner)->withHeaders($headers)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [
                [
                    'table_name' => $table,
                    'operation' => $operation,
                    'record_id' => $recordId,
                    'payload' => $payload,
                ],
            ],
        ]);
    }

    private function createSecondStore(): Store
    {
        return Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Second Loyalty Store',
            'email' => 'loyalty-store-2@dumosrx.com',
            'phone' => '3333333334',
            'address' => '4 Loyalty St',
            'slug' => 'loyalty-store-2',
            'device_id' => 'WEB-LOYALTY-2',
        ]);
    }

    private function seedTier(string $tierId, string $storeId): void
    {
        DB::table('loyalty_tiers')->insert([
            'id' => $tierId,
            'store_id' => $storeId,
            'user_id' => $this->owner->id,
            'name' => 'Bronze',
            'min_spend' => 0,
            'points_multiplier' => 1,
            'color' => 'bg-gray-400',
            'sort_order' => 0,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_loyalty_tier_insert_without_store_id_is_backfilled_from_the_callers_store()
    {
        $tierId = 'loyalty-tier-no-store-1';

        $response = $this->push('loyalty_tiers', $tierId, [
            'id' => $tierId,
            'name' => 'Bronze',
            'min_spend' => 0,
            'points_multiplier' => 1,
            'color' => 'bg-gray-400',
            'sort_order' => 0,
            '_version' => 1,
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $this->assertSame(
            $this->store->id,
            DB::table('loyalty_tiers')->where('id', $tierId)->value('store_id'),
            'a pushed loyalty tier with no store_id must be scoped to the pusher\'s store, not left NULL'
        );
    }

    public function test_loyalty_redemption_option_insert_without_store_id_is_backfilled_from_the_callers_store()
    {
        $optionId = 'loyalty-redemption-no-store-1';

        $response = $this->push('loyalty_redemption_options', $optionId, [
            'id' => $optionId,
            'label' => '5% off',
            'points_cost' => 100,
            'discount_value' => 5,
            'icon_key' => 'tag',
            'is_active' => true,
            'sort_order' => 0,
            '_version' => 1,
        ]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $this->assertSame(
            $this->store->id,
            DB::table('loyalty_redemption_options')->where('id', $optionId)->value('store_id'),
            'a pushed redemption option with no store_id must be scoped to the pusher\'s store, not left NULL'
        );
    }

    public function test_loyalty_tier_insert_naming_another_stores_id_is_still_refused()
    {
        $otherOwner = User::create([
            'first_name' => 'Other',
            'last_name' => 'Owner',
            'email' => 'other-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $otherStore = Store::create([
            'user_id' => $otherOwner->id,
            'name' => 'Other Store',
            'email' => 'other-store@dumosrx.com',
            'phone' => '4444444444',
            'address' => '4 Other St',
            'slug' => 'other-store',
            'device_id' => 'WEB-OTHER',
        ]);
        $otherOwner->update(['store_id' => $otherStore->id]);

        $tierId = 'loyalty-tier-cross-tenant-1';

        $response = $this->push('loyalty_tiers', $tierId, [
            'id' => $tierId,
            'store_id' => $otherStore->id,
            'name' => 'Planted',
            '_version' => 1,
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('failed.0.reason', 'permission_denied');
        $this->assertDatabaseMissing('loyalty_tiers', ['id' => $tierId]);
    }

    public function test_loyalty_tier_update_omitting_store_id_keeps_its_original_store()
    {
        $secondStore = $this->createSecondStore();
        $tierId = 'loyalty-tier-update-keeps-store';
        $this->seedTier($tierId, $this->store->id);

        $response = $this->push('loyalty_tiers', $tierId, [
            'id' => $tierId,
            'name' => 'Bronze Renamed',
            '_version' => 1,
        ], 'UPDATE', ['X-Store-Id' => $secondStore->id]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $row = DB::table('loyalty_tiers')->where('id', $tierId)->first();
        $this->assertSame('Bronze Renamed', $row->name);
        $this->assertSame(
            $this->store->id,
            $row->store_id,
            'an UPDATE whose payload omits store_id must never reassign the row to the push\'s active store'
        );
    }

    public function test_loyalty_tier_insert_overridden_to_update_keeps_its_original_store()
    {
        $secondStore = $this->createSecondStore();
        $tierId = 'loyalty-tier-insert-override-keeps-store';
        $this->seedTier($tierId, $this->store->id);

        $response = $this->push('loyalty_tiers', $tierId, [
            'id' => $tierId,
            'name' => 'Bronze Requeued',
            '_version' => 1,
        ], 'INSERT', ['X-Store-Id' => $secondStore->id]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $this->assertSame(
            $this->store->id,
            DB::table('loyalty_tiers')->where('id', $tierId)->value('store_id'),
            'a re-queued INSERT that push() rewrites into an UPDATE must not carry its backfilled store_id onto the existing row'
        );
    }

    public function test_loyalty_tier_update_naming_another_stores_id_is_still_refused()
    {
        $otherOwner = User::create([
            'first_name' => 'Foreign',
            'last_name' => 'Owner',
            'email' => 'foreign-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $foreignStore = Store::create([
            'user_id' => $otherOwner->id,
            'name' => 'Foreign Store',
            'email' => 'foreign-store@dumosrx.com',
            'phone' => '5555555555',
            'address' => '5 Foreign St',
            'slug' => 'foreign-store',
            'device_id' => 'WEB-FOREIGN',
        ]);
        $otherOwner->update(['store_id' => $foreignStore->id]);

        $tierId = 'loyalty-tier-update-cross-tenant';
        $this->seedTier($tierId, $this->store->id);

        $response = $this->push('loyalty_tiers', $tierId, [
            'id' => $tierId,
            'store_id' => $foreignStore->id,
            'name' => 'Hijacked',
            '_version' => 1,
        ], 'UPDATE');

        $response->assertStatus(200);
        $response->assertJsonPath('failed.0.reason', 'permission_denied');

        $row = DB::table('loyalty_tiers')->where('id', $tierId)->first();
        $this->assertSame($this->store->id, $row->store_id);
        $this->assertSame('Bronze', $row->name);
    }

    /** A-248: an owner may write every store they own, but an update must not move an existing row between them. */
    public function test_an_update_naming_the_owners_other_store_keeps_the_rows_store_and_applies_the_rest()
    {
        $second = $this->createSecondStore();
        $tierId = 'loyalty-tier-a248-update';
        $this->seedTier($tierId, $this->store->id);

        $response = $this->push('loyalty_tiers', $tierId, [
            'id' => $tierId,
            'store_id' => $second->id,
            'name' => 'Silver',
            '_version' => 1,
        ], 'UPDATE', ['X-Store-Id' => $second->id]);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');
        $row = DB::table('loyalty_tiers')->where('id', $tierId)->first();
        $this->assertSame($this->store->id, $row->store_id);
        $this->assertSame('Silver', $row->name);
    }

    public function test_a_resent_insert_naming_the_owners_other_store_keeps_the_rows_store()
    {
        $second = $this->createSecondStore();
        $tierId = 'loyalty-tier-a248-resent';
        $this->seedTier($tierId, $this->store->id);

        $this->push('loyalty_tiers', $tierId, [
            'id' => $tierId,
            'store_id' => $second->id,
            'name' => 'Bronze',
            '_version' => 1,
        ], 'INSERT', ['X-Store-Id' => $second->id])->assertStatus(200);

        $this->assertSame($this->store->id, DB::table('loyalty_tiers')->where('id', $tierId)->value('store_id'));
    }

    public function test_a_legacy_row_with_no_store_can_still_be_claimed_by_an_update()
    {
        $tierId = 'loyalty-tier-a248-legacy';
        $this->seedTier($tierId, $this->store->id);
        DB::table('loyalty_tiers')->where('id', $tierId)->update(['store_id' => null]);

        $this->push('loyalty_tiers', $tierId, [
            'id' => $tierId,
            'store_id' => $this->store->id,
            'name' => 'Bronze',
            '_version' => 1,
        ], 'UPDATE')->assertStatus(200);

        $this->assertSame($this->store->id, DB::table('loyalty_tiers')->where('id', $tierId)->value('store_id'));
    }

    private function seedProduct(string $id, ?string $storeId): void
    {
        DB::table('products')->insert([
            'id' => $id, 'store_id' => $storeId, 'user_id' => $this->owner->id,
            'name' => 'swibetic card', 'selling_price' => 500, '_version' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_the_incident_shape_a_product_edited_under_the_other_store_stays_in_its_own()
    {
        $second = $this->createSecondStore();
        $this->seedProduct('product-a248', $this->store->id);

        $this->push('products', 'product-a248', [
            'id' => 'product-a248', 'store_id' => $second->id, 'selling_price' => 650, '_version' => 1,
        ], 'UPDATE', ['X-Store-Id' => $second->id])->assertJsonCount(0, 'failed');

        $row = DB::table('products')->where('id', 'product-a248')->first();
        $this->assertSame($this->store->id, $row->store_id);
        $this->assertEquals(650, $row->selling_price);
    }

    public function test_a_soft_delete_sent_as_an_update_does_not_move_the_row_either()
    {
        $second = $this->createSecondStore();
        $this->seedProduct('product-a248-deleted', $this->store->id);

        $this->push('products', 'product-a248-deleted', [
            'id' => 'product-a248-deleted', 'store_id' => $second->id, '_deleted' => 1, '_version' => 1,
        ], 'UPDATE', ['X-Store-Id' => $second->id])->assertStatus(200);

        $row = DB::table('products')->where('id', 'product-a248-deleted')->first();
        $this->assertSame($this->store->id, $row->store_id);
        $this->assertNotNull($row->deleted_at);
    }

    public function test_a_two_store_owners_claim_on_a_store_less_row_is_ignored_as_a_guess()
    {
        $second = $this->createSecondStore();
        $this->seedProduct('product-a248-legacy', null);

        $this->push('products', 'product-a248-legacy', [
            'id' => 'product-a248-legacy', 'store_id' => $second->id, 'selling_price' => 700, '_version' => 1,
        ], 'UPDATE', ['X-Store-Id' => $second->id])->assertJsonCount(0, 'failed');

        $row = DB::table('products')->where('id', 'product-a248-legacy')->first();
        $this->assertNull($row->store_id);
        $this->assertEquals(700, $row->selling_price);
    }

    public function test_editing_a_staff_member_under_the_other_store_does_not_move_them_but_a_reassignment_does()
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $second = $this->createSecondStore();
        $staff = User::create([
            'first_name' => 'Kept', 'last_name' => 'Staff', 'email' => 'kept-staff@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'sales_staff', 'store_id' => $this->store->id,
        ]);

        $edit = $this->push('users', $staff->id, [
            'id' => $staff->id, 'phone' => '08011112222',
        ], 'UPDATE', ['X-Store-Id' => $second->id]);
        $edit->assertJsonCount(0, 'failed');
        $this->assertSame($this->store->id, DB::table('users')->where('id', $staff->id)->value('store_id'));

        $move = $this->push('users', $staff->id, [
            'id' => $staff->id, 'store_id' => $second->id,
        ], 'UPDATE', ['X-Store-Id' => $second->id]);
        $move->assertJsonCount(0, 'failed');
        $this->assertSame($second->id, DB::table('users')->where('id', $staff->id)->value('store_id'));
    }

    private function seedStorelessBatch(string $batchId, string $productId): void
    {
        $this->seedProduct($productId, $this->store->id);
        DB::table('stock_batches')->insert([
            'id' => $batchId, 'product_id' => $productId, 'store_id' => null, 'batch_number' => 'B-'.$batchId,
            'quantity' => 10, 'cost_price' => 50, '_version' => 3, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_a_two_store_owners_delete_claim_on_a_store_less_row_is_ignored()
    {
        $second = $this->createSecondStore();
        $this->seedProduct('product-a248-delete', null);

        $this->push('products', 'product-a248-delete', ['id' => 'product-a248-delete', 'store_id' => $second->id], 'DELETE', ['X-Store-Id' => $second->id])
            ->assertJsonCount(0, 'failed');

        $row = DB::table('products')->where('id', 'product-a248-delete')->first();
        $this->assertNull($row->store_id);
        $this->assertNotNull($row->deleted_at);
    }

    public function test_an_owners_own_resent_user_insert_never_stamps_them_with_a_store()
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        $second = $this->createSecondStore();
        DB::table('users')->where('id', $this->owner->id)->update(['store_id' => null]);

        $this->push('users', $this->owner->id, [
            'id' => $this->owner->id, 'first_name' => 'Renamed', 'store_id' => $second->id,
        ], 'INSERT', ['X-Store-Id' => $second->id])->assertStatus(200);

        $this->assertNull(DB::table('users')->where('id', $this->owner->id)->value('store_id'));
    }

    public function test_a_single_store_sessions_claim_naming_another_tenants_store_is_ignored()
    {
        $foreignOwner = User::create([
            'first_name' => 'Far', 'last_name' => 'Away', 'email' => 'far-away@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'admin',
        ]);
        $foreignStore = Store::create([
            'user_id' => $foreignOwner->id, 'name' => 'Far Store', 'email' => 'far-store@dumosrx.com',
            'phone' => '6666666666', 'address' => '6 Far St', 'slug' => 'far-store', 'device_id' => 'WEB-FAR',
        ]);
        $this->seedStorelessBatch('batch-foreign-claim', 'product-foreign-claim');

        $this->push('stock_batches', 'batch-foreign-claim', [
            'id' => 'batch-foreign-claim', 'store_id' => $foreignStore->id, 'cost_price' => 60, '_version' => 3,
        ], 'UPDATE')->assertStatus(200);

        $this->assertNull(DB::table('stock_batches')->where('id', 'batch-foreign-claim')->value('store_id'));
    }

    public function test_a_dropped_claim_does_not_turn_a_quantity_only_batch_update_into_a_version_conflict()
    {
        $second = $this->createSecondStore();
        $this->seedStorelessBatch('batch-qty-claim', 'product-qty-claim');

        $this->push('stock_batches', 'batch-qty-claim', [
            'id' => 'batch-qty-claim', 'store_id' => $second->id, 'quantity' => 7, '_version' => 1,
        ], 'UPDATE', ['X-Store-Id' => $second->id])->assertJsonCount(0, 'failed');
    }

    public function test_a_two_store_owners_store_less_product_with_no_stock_is_not_guessed()
    {
        $second = $this->createSecondStore();

        $this->push('products', 'product-a248-new-legacy', [
            'id' => 'product-a248-new-legacy', 'name' => 'Legacy Syrup', 'selling_price' => 500,
        ], 'INSERT', ['X-Store-Id' => $second->id])->assertJsonCount(0, 'failed');

        $this->assertNull(DB::table('products')->where('id', 'product-a248-new-legacy')->value('store_id'));
    }

    public function test_a_store_less_product_is_attributed_when_its_stock_arrives_in_a_later_push()
    {
        $second = $this->createSecondStore();
        $this->push('products', 'product-later-stock', [
            'id' => 'product-later-stock', 'name' => 'Legacy Syrup', 'selling_price' => 500,
        ], 'INSERT', ['X-Store-Id' => $second->id])->assertJsonCount(0, 'failed');

        $this->push('stock_batches', 'product-later-stock-batch', [
            'id' => 'product-later-stock-batch', 'product_id' => 'product-later-stock', 'store_id' => $this->store->id,
            'batch_number' => 'B-1', 'quantity' => 5, 'cost_price' => 50, '_version' => 1,
        ], 'INSERT', ['X-Store-Id' => $second->id])->assertStatus(200);

        $this->assertSame($this->store->id, DB::table('products')->where('id', 'product-later-stock')->value('store_id'));
    }

    public function test_an_attributed_product_naming_the_other_stores_category_is_re_owned()
    {
        $second = $this->createSecondStore();
        $ownDrugs = new \App\Models\Category;
        $ownDrugs->name = 'drugs';
        $ownDrugs->store_id = $this->store->id;
        $ownDrugs->is_active = true;
        $ownDrugs->save();
        $otherDrugs = new \App\Models\Category;
        $otherDrugs->name = 'drugs';
        $otherDrugs->store_id = $second->id;
        $otherDrugs->is_active = true;
        $otherDrugs->save();

        $this->actingAs($this->owner)->withHeaders(['X-Store-Id' => $second->id])->postJson('/api/v1/app/sync/push', ['setup' => true, 'changes' => [
            ['table_name' => 'products', 'operation' => 'INSERT', 'record_id' => 'product-cat-reown',
                'payload' => ['id' => 'product-cat-reown', 'name' => 'Legacy Syrup', 'selling_price' => 500, 'category_id' => $otherDrugs->id]],
            ['table_name' => 'stock_batches', 'operation' => 'INSERT', 'record_id' => 'product-cat-reown-batch',
                'payload' => ['id' => 'product-cat-reown-batch', 'product_id' => 'product-cat-reown', 'store_id' => $this->store->id,
                    'batch_number' => 'B-1', 'quantity' => 5, 'cost_price' => 50, '_version' => 1]],
        ]])->assertStatus(200);

        $row = DB::table('products')->where('id', 'product-cat-reown')->first();
        $this->assertSame($this->store->id, $row->store_id);
        $this->assertSame($ownDrugs->id, $row->category_id);
    }

    public function test_the_stock_overrules_the_active_store_for_a_store_less_product()
    {
        $second = $this->createSecondStore();

        $this->pushStorelessProductWithStock('product-ingest-overrule', $this->store->id, null, $second->id)->assertStatus(200);

        $this->assertSame($this->store->id, DB::table('products')->where('id', 'product-ingest-overrule')->value('store_id'));
    }

    public function test_a_single_store_owners_store_less_product_insert_is_still_backfilled()
    {
        $this->push('products', 'product-a248-single', [
            'id' => 'product-a248-single', 'name' => 'Single Syrup', 'selling_price' => 500,
        ], 'INSERT')->assertJsonCount(0, 'failed');

        $this->assertSame($this->store->id, DB::table('products')->where('id', 'product-a248-single')->value('store_id'));
    }

    private function pushStorelessProductWithStock(string $productId, string $batchStoreId, ?string $movementStoreId, string $activeStoreId)
    {
        $changes = [
            ['table_name' => 'products', 'operation' => 'INSERT', 'record_id' => $productId,
                'payload' => ['id' => $productId, 'name' => 'Legacy Syrup', 'selling_price' => 500]],
            ['table_name' => 'stock_batches', 'operation' => 'INSERT', 'record_id' => $productId.'-batch',
                'payload' => ['id' => $productId.'-batch', 'product_id' => $productId, 'store_id' => $batchStoreId,
                    'batch_number' => 'B-1', 'quantity' => 5, 'cost_price' => 50, '_version' => 1]],
        ];
        if ($movementStoreId !== null) {
            $changes[] = ['table_name' => 'stock_movements', 'operation' => 'INSERT', 'record_id' => $productId.'-move',
                'payload' => ['id' => $productId.'-move', 'stock_batch_id' => $productId.'-batch', 'product_id' => $productId,
                    'store_id' => $movementStoreId, 'quantity' => -1, 'movement_type' => 'sale', 'performed_by' => $this->owner->id]];
        }

        return $this->actingAs($this->owner)->withHeaders(['X-Store-Id' => $activeStoreId])
            ->postJson('/api/v1/app/sync/push', ['setup' => true, 'changes' => $changes]);
    }

    public function test_a_store_less_product_is_attributed_at_ingest_from_the_stock_pushed_with_it()
    {
        $second = $this->createSecondStore();

        $this->pushStorelessProductWithStock('product-ingest', $this->store->id, $this->store->id, $second->id)->assertStatus(200);

        $this->assertSame($this->store->id, DB::table('products')->where('id', 'product-ingest')->value('store_id'));
        $this->assertNotNull(DB::table('stock_batches')->where('id', 'product-ingest-batch')->value('_synced_at'));
    }

    public function test_a_store_less_product_whose_stock_disagrees_stays_unattributed()
    {
        $second = $this->createSecondStore();

        $this->pushStorelessProductWithStock('product-ingest-split', $this->store->id, $second->id, $second->id)->assertStatus(200);

        $this->assertNull(DB::table('products')->where('id', 'product-ingest-split')->value('store_id'));
    }
}
