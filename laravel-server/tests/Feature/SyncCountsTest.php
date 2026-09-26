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

    /**
     * Regression test for a real bug caught in review before it ever
     * shipped: stock_batches was counted by stock_batches.store_id alone,
     * but SyncController::pull() (the thing this endpoint is supposed to
     * verify against) scopes stock_batches via
     * whereIn('product_id', Product::whereIn('store_id', ...)->pluck('id')) -
     * and Product uses SoftDeletes, so a batch belonging to a deleted
     * product is something pull() can NEVER deliver. Counting it anyway
     * meant any store that has ever deleted a product with stock (a
     * completely routine action) would show a permanent, unfixable
     * "deficit" - the health check this endpoint feeds would trigger a
     * full resync every single day, forever, for a gap that isn't real.
     */
    public function test_stock_batches_count_excludes_batches_of_a_soft_deleted_product()
    {
        $this->insertProduct('live-product', $this->store->id);
        $this->insertProduct('deleted-product', $this->store->id, deletedAt: now()->toDateTimeString());

        DB::table('stock_batches')->insert([
            [
                'id' => 'batch-live',
                'product_id' => 'live-product',
                'store_id' => $this->store->id,
                'batch_number' => 'B-1',
                'quantity' => 10,
                'cost_price' => 5,
                '_version' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'id' => 'batch-orphaned',
                'product_id' => 'deleted-product',
                'store_id' => $this->store->id,
                'batch_number' => 'B-2',
                'quantity' => 5,
                'cost_price' => 5,
                '_version' => 1,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        $response = $this->actingAs($this->owner)->getJson('/api/v1/app/sync/counts');

        $response->assertStatus(200);
        // Only the live product's batch counts - the orphaned one (its
        // product is soft-deleted) is exactly what pull() can never send,
        // so it must never be counted as a "missing" row either.
        $response->assertJsonPath('counts.stock_batches', 1);
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
