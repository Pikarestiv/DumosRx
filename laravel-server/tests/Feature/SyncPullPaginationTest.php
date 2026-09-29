<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Covers SyncController::pull()'s scoping and paging cost (docs/KNOWN_BUGS.md
 * A-3): the six child tables must derive their tenant scope from a SQL
 * subquery rather than a PHP-materialised id list, and a table larger than
 * one page must be walked with a keyset cursor rather than OFFSET.
 */
class SyncPullPaginationTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        [$this->user, $this->store] = $this->makeTenant('primary');

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1],
                ],
            ],
        ]);
    }

    private function makeTenant(string $prefix): array
    {
        $user = User::create([
            'first_name' => ucfirst($prefix),
            'last_name' => 'Owner',
            'email' => "{$prefix}@dumosrx.com",
            'password' => bcrypt('password'),
            'role' => 'admin',
            'is_active' => true,
        ]);

        $store = Store::create([
            'user_id' => $user->id,
            'name' => "{$prefix} Store",
            'email' => "store-{$prefix}@dumosrx.com",
            'phone' => '1234567890',
            'address' => '123 Test St',
            'slug' => "store-{$prefix}",
            'device_id' => "WEB-{$prefix}",
        ]);

        $user->update(['store_id' => $store->id]);

        return [$user, $store];
    }

    /**
     * One row in every table whose pull scope is derived through a parent,
     * plus the parents themselves. Returns the generated child ids keyed by
     * table so a test can assert exactly which rows a tenant may see.
     */
    private function seedChildTableRows(Store $store, string $prefix): array
    {
        $now = now();
        $ids = [
            'sales' => "{$prefix}-sale",
            'sale_items' => "{$prefix}-sale-item",
            'sale_item_batches' => "{$prefix}-sale-item-batch",
            'returns' => "{$prefix}-return",
            'return_items' => "{$prefix}-return-item",
            'prescriptions' => "{$prefix}-prescription",
            'prescription_items' => "{$prefix}-prescription-item",
            'purchase_orders' => "{$prefix}-po",
            'purchase_order_items' => "{$prefix}-po-item",
            'products' => "{$prefix}-product",
            'stock_batches' => "{$prefix}-stock-batch",
        ];

        DB::table('products')->insert([
            'id' => $ids['products'],
            'store_id' => $store->id,
            'name' => "{$prefix} product",
            'selling_price' => 100,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('stock_batches')->insert([
            'id' => $ids['stock_batches'],
            'product_id' => $ids['products'],
            'batch_number' => "{$prefix}-B1",
            'quantity' => 5,
            'cost_price' => 50,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('sales')->insert([
            'id' => $ids['sales'],
            'store_id' => $store->id,
            'transaction_number' => "TXN-{$prefix}",
            'cashier_id' => $store->user_id,
            'total_amount' => 100,
            'amount_paid' => 100,
            'payment_method' => 'cash',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('sale_items')->insert([
            'id' => $ids['sale_items'],
            'sale_id' => $ids['sales'],
            'product_id' => $ids['products'],
            'stock_batch_id' => $ids['stock_batches'],
            'quantity' => 1,
            'unit_price' => 100,
            'total_price' => 100,
            'cost_price' => 50,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('sale_item_batches')->insert([
            'id' => $ids['sale_item_batches'],
            'sale_item_id' => $ids['sale_items'],
            'stock_batch_id' => $ids['stock_batches'],
            'quantity' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('returns')->insert([
            'id' => $ids['returns'],
            'store_id' => $store->id,
            'sale_id' => $ids['sales'],
            'user_id' => $store->user_id,
            'total_refunded' => 10,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('return_items')->insert([
            'id' => $ids['return_items'],
            'return_id' => $ids['returns'],
            'product_id' => $ids['products'],
            'quantity' => 1,
            'unit_price' => 100,
            'subtotal' => 100,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('prescriptions')->insert([
            'id' => $ids['prescriptions'],
            'store_id' => $store->id,
            'prescription_number' => "RX-{$prefix}",
            'prescription_date' => $now->toDateString(),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('prescription_items')->insert([
            'id' => $ids['prescription_items'],
            'prescription_id' => $ids['prescriptions'],
            'product_id' => $ids['products'],
            'quantity_prescribed' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('purchase_orders')->insert([
            'id' => $ids['purchase_orders'],
            'store_id' => $store->id,
            'order_number' => "PO-{$prefix}",
            'supplier_id' => null,
            'ordered_by' => $store->user_id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        DB::table('purchase_order_items')->insert([
            'id' => $ids['purchase_order_items'],
            'purchase_order_id' => $ids['purchase_orders'],
            'product_id' => $ids['products'],
            'quantity_ordered' => 1,
            'unit_cost' => 50,
            'total_cost' => 50,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $ids;
    }

    private function seedSales(Store $store, int $count, string $prefix = 'sale'): array
    {
        $now = now();
        $ids = [];
        $rows = [];
        for ($i = 0; $i < $count; $i++) {
            $id = sprintf('%s-%05d', $prefix, $i);
            $ids[] = $id;
            $rows[] = [
                'id' => $id,
                'store_id' => $store->id,
                'transaction_number' => "TXN-{$id}",
                'cashier_id' => $store->user_id,
                'total_amount' => 100,
                'amount_paid' => 100,
                'payment_method' => 'cash',
                'created_at' => $now,
                // Deliberately identical across every row: the keyset has to
                // fall back to the id tie-break for the whole walk, which is
                // the case a naive (updated_at only) cursor gets wrong.
                'updated_at' => $now,
            ];
        }
        foreach (array_chunk($rows, 100) as $chunk) {
            DB::table('sales')->insert($chunk);
        }

        return $ids;
    }

    private function queryFor(array $queries, string $table): ?array
    {
        foreach ($queries as $q) {
            if (str_contains($q['query'], 'from "' . $table . '"')) {
                return $q;
            }
        }

        return null;
    }

    public function test_child_table_pull_scope_uses_a_subquery_not_a_materialised_id_list()
    {
        $this->seedSales($this->store, 60);

        DB::enableQueryLog();
        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
        ]);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $response->assertStatus(200);

        $saleItems = $this->queryFor($queries, 'sale_items');
        $this->assertNotNull($saleItems, 'No sale_items query was executed by the pull.');
        $this->assertStringContainsString(
            'in (select "id" from "sales"',
            $saleItems['query'],
            'sale_items must derive its tenant scope from a SQL subquery, not a plucked id list.',
        );
        $this->assertLessThanOrEqual(
            5,
            count($saleItems['bindings']),
            'sale_items scope bindings must not grow with the number of sales the tenant owns.',
        );

        $saleItemBatches = $this->queryFor($queries, 'sale_item_batches');
        $this->assertNotNull($saleItemBatches);
        $this->assertStringContainsString(
            'in (select "id" from "sale_items" where "sale_id" in (select "id" from "sales"',
            $saleItemBatches['query'],
            'sale_item_batches must nest its subquery two levels deep instead of plucking twice.',
        );
        $this->assertLessThanOrEqual(5, count($saleItemBatches['bindings']));

        foreach (['return_items', 'prescription_items', 'purchase_order_items', 'stock_batches'] as $table) {
            $q = $this->queryFor($queries, $table);
            $this->assertNotNull($q, "No {$table} query was executed by the pull.");
            $this->assertStringContainsString('in (select "id" from', $q['query'], "{$table} must use a subquery scope.");
        }

        // Nothing in the whole pull may materialise a per-row id list.
        foreach ($queries as $q) {
            $this->assertLessThanOrEqual(
                20,
                count($q['bindings']),
                'A pull query inlined a materialised id list: ' . $q['query'],
            );
        }
    }

    public function test_subquery_scoping_does_not_leak_another_tenants_child_rows()
    {
        $mine = $this->seedChildTableRows($this->store, 'mine');

        [, $otherStore] = $this->makeTenant('other');
        $theirs = $this->seedChildTableRows($otherStore, 'theirs');

        $response = $this->actingAs($this->user)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
        ]);

        $response->assertStatus(200);

        foreach (['sale_items', 'sale_item_batches', 'return_items', 'prescription_items', 'purchase_order_items', 'stock_batches'] as $table) {
            $returned = collect($response->json("changes.{$table}"))->pluck('id')->all();
            $this->assertContains($mine[$table], $returned, "{$table} did not return this tenant's own row.");
            $this->assertNotContains($theirs[$table], $returned, "{$table} leaked another tenant's row.");
        }
    }

    public function test_pull_walks_a_multi_page_table_with_a_keyset_cursor()
    {
        $expected = $this->seedSales($this->store, 600);

        $first = $this->actingAs($this->user)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
        ]);
        $first->assertStatus(200);
        $firstPage = collect($first->json('changes.sales'));
        $this->assertCount(500, $firstPage);
        $this->assertTrue($first->json('has_more.sales'));

        $last = $firstPage->last();

        DB::enableQueryLog();
        $second = $this->actingAs($this->user)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
            'page_cursor' => [
                'sales' => ['updated_at' => $last['updated_at'], 'id' => $last['id']],
            ],
        ]);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $second->assertStatus(200);
        $secondPage = collect($second->json('changes.sales'));
        $this->assertCount(100, $secondPage);
        $this->assertFalse($second->json('has_more.sales'));

        $salesQuery = $this->queryFor($queries, 'sales');
        $this->assertNotNull($salesQuery);
        $this->assertStringNotContainsString(
            'offset',
            strtolower($salesQuery['query']),
            'A keyset-cursor page must not fall back to OFFSET paging.',
        );

        $walked = $firstPage->pluck('id')->merge($secondPage->pluck('id'));
        $this->assertCount(600, $walked->unique(), 'The keyset walk dropped or duplicated rows.');
        $this->assertEqualsCanonicalizing($expected, $walked->all());
    }

    public function test_legacy_page_offset_clients_still_page_correctly()
    {
        $expected = $this->seedSales($this->store, 600);

        $first = $this->actingAs($this->user)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
        ]);
        $firstPage = collect($first->json('changes.sales'));

        $second = $this->actingAs($this->user)->postJson('/api/v1/app/sync/pull', [
            'last_synced' => [],
            'page_offset' => ['sales' => 500],
        ]);
        $secondPage = collect($second->json('changes.sales'));

        $this->assertCount(100, $secondPage);
        $this->assertFalse($second->json('has_more.sales'));
        $this->assertEqualsCanonicalizing(
            $expected,
            $firstPage->pluck('id')->merge($secondPage->pluck('id'))->all(),
        );
    }
}
