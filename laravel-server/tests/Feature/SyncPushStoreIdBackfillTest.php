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
}
