<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use App\Services\Admin\UnresolvedReferenceService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Production declares zero foreign keys (A-292), so a child row naming a
 * parent that does not exist is accepted and stranded there forever (A-294,
 * A-296). SQLite enforces the migrations' own FK constraints, which
 * production does not have, so every orphan here needs foreign key checks
 * off to insert at all — the honest simulation, not a workaround.
 *
 * `PRAGMA foreign_keys` is a documented SQLite no-op inside an open
 * transaction, and RefreshDatabase wraps every test in one, so
 * `withForeignKeysOff()` steps outside that transaction (commit, toggle,
 * insert, clean up, re-begin) rather than fighting it.
 */
class UnresolvedReferenceServiceTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $owner;

    private UnresolvedReferenceService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'User',
            'email' => 'unresolved-owner-'.Str::random(12).'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Unresolved Refs Store',
            'device_id' => 'WEB-UNRESOLVED-'.Str::random(8),
        ]);

        $this->service = app(UnresolvedReferenceService::class);
    }

    /**
     * Runs `$fn` with FK checks off and outside the test's own wrapping
     * transaction, then deletes everything `$fn` inserted (by table => ids)
     * — plus this test's own setUp() store/owner, which the commit below
     * also flushes past RefreshDatabase's rollback — before resuming that
     * transaction. Cleanup runs even if `$fn` throws (`$inserted` starts
     * empty rather than undefined), and it runs before beginTransaction(),
     * not after: deleting inside the re-begun transaction would itself be
     * rolled back at teardown, leaking the row into later test classes.
     */
    private function withForeignKeysOff(\Closure $fn): void
    {
        $connection = DB::connection();
        $connection->commit();
        DB::statement('PRAGMA foreign_keys = OFF');
        $inserted = [];

        try {
            $inserted = $fn();
        } finally {
            foreach ((array) $inserted as $table => $ids) {
                DB::table($table)->whereIn('id', (array) $ids)->delete();
            }
            DB::table('stores')->where('id', $this->store->id)->delete();
            DB::table('users')->where('id', $this->owner->id)->delete();
            DB::statement('PRAGMA foreign_keys = ON');
            $connection->beginTransaction();
        }
    }

    public function test_counts_a_product_whose_category_resolves_nowhere(): void
    {
        $this->withForeignKeysOff(function () {
            $id = (string) Str::uuid();
            DB::table('products')->insert([
                'id' => $id,
                'name' => 'Orphan Category Product',
                'store_id' => $this->store->id,
                'category_id' => (string) Str::uuid(),
                'selling_price' => 500,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->assertSame(1, $this->service->unresolvableCategoryCount($this->store->id));

            return ['products' => [$id]];
        });
    }

    public function test_ignores_a_product_whose_category_exists_even_if_trashed(): void
    {
        $categoryId = (string) Str::uuid();
        DB::table('categories')->insert([
            'id' => $categoryId,
            'name' => 'Trashed Category',
            'store_id' => $this->store->id,
            'deleted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('products')->insert([
            'id' => (string) Str::uuid(),
            'name' => 'Product With Trashed Category',
            'store_id' => $this->store->id,
            'category_id' => $categoryId,
            'selling_price' => 500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->assertSame(0, $this->service->unresolvableCategoryCount($this->store->id));
    }

    public function test_ignores_a_deleted_product_with_an_unresolvable_category(): void
    {
        $this->withForeignKeysOff(function () {
            $id = (string) Str::uuid();
            DB::table('products')->insert([
                'id' => $id,
                'name' => 'Deleted Orphan Category Product',
                'store_id' => $this->store->id,
                'category_id' => (string) Str::uuid(),
                'selling_price' => 500,
                'deleted_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->assertSame(0, $this->service->unresolvableCategoryCount($this->store->id));

            return ['products' => [$id]];
        });
    }

    public function test_counts_a_purchase_order_item_whose_order_resolves_nowhere(): void
    {
        $this->withForeignKeysOff(function () {
            $id = (string) Str::uuid();
            DB::table('purchase_order_items')->insert([
                'id' => $id,
                'purchase_order_id' => (string) Str::uuid(),
                'product_id' => (string) Str::uuid(),
                'quantity_ordered' => 10,
                'unit_cost' => 100,
                'total_cost' => 1000,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->assertSame(1, $this->service->orphanedPurchaseOrderItemsCount());

            return ['purchase_order_items' => [$id]];
        });
    }

    public function test_ignores_an_item_whose_order_exists_even_if_trashed(): void
    {
        $orderId = (string) Str::uuid();

        $this->withForeignKeysOff(function () use ($orderId) {
            DB::table('purchase_orders')->insert([
                'id' => $orderId,
                'order_number' => 'PO-'.substr($orderId, 0, 8),
                'supplier_id' => (string) Str::uuid(),
                'ordered_by' => (string) Str::uuid(),
                'deleted_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $itemId = (string) Str::uuid();
            DB::table('purchase_order_items')->insert([
                'id' => $itemId,
                'purchase_order_id' => $orderId,
                'product_id' => (string) Str::uuid(),
                'quantity_ordered' => 10,
                'unit_cost' => 100,
                'total_cost' => 1000,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->assertSame(0, $this->service->orphanedPurchaseOrderItemsCount());

            return ['purchase_order_items' => [$itemId], 'purchase_orders' => [$orderId]];
        });
    }
}
