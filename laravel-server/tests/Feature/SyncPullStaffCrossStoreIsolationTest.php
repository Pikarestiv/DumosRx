<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-129: a staff account must never be able to pull a sibling store's data
 * by sending that store's id in X-Store-Id, even though both stores share
 * the same owner. Push was already correctly narrowed
 * (resolveAllowedOwnershipScope()/authorizeInsertTarget()); pull had no
 * equivalent narrowing in resolvePullTenantScope() — it only checked that
 * the requested store belonged to the caller's *owner*, not to the caller's
 * own assigned store.
 */
class SyncPullStaffCrossStoreIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $storeA;
    protected Store $storeB;
    protected User $staffOfA;

    protected function setUp(): void
    {
        parent::setUp();

        Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store A',
            'store_slug' => 'store-a',
            'device_id' => 'WEB-STORE-A',
        ]);

        $this->storeB = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Store B',
            'store_slug' => 'store-b',
            'device_id' => 'WEB-STORE-B',
        ]);

        $this->staffOfA = User::create([
            'first_name' => 'Staff', 'last_name' => 'OfA',
            'email' => 'staff-a@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $this->storeA->id,
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

        Schema::enableForeignKeyConstraints();
    }

    private function pull(User $as, ?string $storeIdHeader = null)
    {
        $request = $this->actingAs($as);
        if ($storeIdHeader) {
            $request = $request->withHeader('X-Store-Id', $storeIdHeader);
        }
        return $request->postJson('/api/v1/app/sync/pull', ['last_synced' => []]);
    }

    #[Test]
    public function a_staff_account_cannot_pull_a_sibling_stores_products_via_x_store_id(): void
    {
        DB::table('products')->insert([
            'id' => (string) Str::uuid(),
            'name' => 'Store B Secret Product',
            'store_id' => $this->storeB->id,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->pull($this->staffOfA, $this->storeB->id);

        $response->assertStatus(200);
        $productNames = collect($response->json('changes.products'))->pluck('name');
        $this->assertFalse($productNames->contains('Store B Secret Product'));
    }

    #[Test]
    public function a_staff_account_still_gets_their_own_stores_data_with_no_header(): void
    {
        DB::table('products')->insert([
            'id' => (string) Str::uuid(),
            'name' => 'Store A Product',
            'store_id' => $this->storeA->id,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->pull($this->staffOfA);

        $response->assertStatus(200);
        $productNames = collect($response->json('changes.products'))->pluck('name');
        $this->assertTrue($productNames->contains('Store A Product'));
    }

    #[Test]
    public function the_owner_can_still_pull_either_of_their_own_stores_via_x_store_id(): void
    {
        DB::table('products')->insert([
            'id' => (string) Str::uuid(),
            'name' => 'Store B Product',
            'store_id' => $this->storeB->id,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->pull($this->owner, $this->storeB->id);

        $response->assertStatus(200);
        $productNames = collect($response->json('changes.products'))->pluck('name');
        $this->assertTrue($productNames->contains('Store B Product'));
    }
}
