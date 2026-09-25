<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Coverage for GET /api/v1/app/sync/counts - a device's periodic check that
 * its local row counts actually match the server, independent of whatever
 * its own pull cursor thinks. Exists specifically because a pull cursor can
 * get stuck (see docs/KNOWN_BUGS.md) with no error anywhere to notice it
 * by; this endpoint is what a device compares itself against to catch that
 * automatically instead of relying on someone manually running SQL against
 * production, like the incident that led to this endpoint existing at all.
 */
class SyncCountsTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $store;
    protected User $otherOwner;
    protected Store $otherStore;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'counts-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Counts Test Store',
            'store_slug' => 'counts-test-store',
            'device_id' => 'WEB-COUNTS-TEST',
        ]);
        $this->owner->update(['store_id' => $this->store->id]);

        $this->otherOwner = User::create([
            'first_name' => 'Other', 'last_name' => 'Owner',
            'email' => 'counts-other-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->otherStore = Store::create([
            'user_id' => $this->otherOwner->id,
            'name' => 'Other Counts Store',
            'store_slug' => 'other-counts-store',
            'device_id' => 'WEB-OTHER-COUNTS-TEST',
        ]);
        $this->otherOwner->update(['store_id' => $this->otherStore->id]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function insertProduct(string $id, string $storeId, ?string $deletedAt = null): void
    {
        DB::table('products')->insert([
            'id' => $id,
            'store_id' => $storeId,
            'name' => "Product $id",
            'selling_price' => 100,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
            'deleted_at' => $deletedAt,
        ]);
    }

    public function test_counts_the_callers_own_store_products_excluding_soft_deleted()
    {
        $this->insertProduct('p1', $this->store->id);
        $this->insertProduct('p2', $this->store->id);
        $this->insertProduct('p3', $this->store->id, deletedAt: now()->toDateTimeString());

        $response = $this->actingAs($this->owner)->getJson('/api/v1/app/sync/counts');

        $response->assertStatus(200);
        $response->assertJsonPath('counts.products', 2);
    }

    public function test_does_not_leak_another_stores_counts()
    {
        $this->insertProduct('mine-1', $this->store->id);
        $this->insertProduct('theirs-1', $this->otherStore->id);
        $this->insertProduct('theirs-2', $this->otherStore->id);

        $response = $this->actingAs($this->owner)->getJson('/api/v1/app/sync/counts');

        $response->assertStatus(200);
        // Only this caller's own store's product is counted, not the other
        // store's two products - this is a tenant-isolation check, not just
        // a correctness one.
        $response->assertJsonPath('counts.products', 1);
    }

    public function test_scopes_to_the_store_requested_via_x_store_id_header_when_owned()
    {
        // A second store owned by the SAME user (multi-store account).
        $secondStore = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Second Store',
            'store_slug' => 'second-store',
            'device_id' => 'WEB-SECOND-STORE',
        ]);

        $this->insertProduct('primary-1', $this->store->id);
        $this->insertProduct('second-1', $secondStore->id);
        $this->insertProduct('second-2', $secondStore->id);

        $response = $this->actingAs($this->owner)
            ->withHeader('X-Store-Id', $secondStore->id)
            ->getJson('/api/v1/app/sync/counts');

        $response->assertStatus(200);
        $response->assertJsonPath('counts.products', 2);
    }

    public function test_returns_every_expected_table_key_even_when_all_zero()
    {
        $response = $this->actingAs($this->owner)->getJson('/api/v1/app/sync/counts');

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'success',
            'counts' => ['products', 'stock_batches', 'sales', 'customers', 'categories'],
        ]);
        $response->assertJson([
            'success' => true,
            'counts' => [
                'products' => 0,
                'stock_batches' => 0,
                'sales' => 0,
                'customers' => 0,
                'categories' => 0,
            ],
        ]);
    }
}
