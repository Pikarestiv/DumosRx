<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * A-302. A device holding two stores used to repoint one store's whole
 * catalogue at the other store's same-named categories (A-301, fixed
 * client-side) — 2,138 and 2,500 products measured on production. The server
 * accepted every one of those pushes, because nothing checked that a
 * product's category belongs to the product's store. Every bundle shipped
 * before that fix still does it, so the server is what protects the data
 * independently of client rollout.
 *
 * The reference is remapped onto the pushing store's own same-named category
 * rather than dropped: the id is wrong but the NAME is the user's intent, and
 * dropping it would store a permanent NULL no device will ever push again.
 */
class SyncPushCrossStoreCategoryTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;
    protected Store $storeA;
    protected Store $storeB;
    protected Category $categoryA;
    protected Category $categoryB;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();

        $this->owner = User::create([
            'first_name' => 'Cross',
            'last_name' => 'Owner',
            'email' => 'cross-owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'admin',
        ]);
        $this->storeA = $this->makeStore('A', 'cross-a');
        $this->storeB = $this->makeStore('B', 'cross-b');
        $this->owner->update(['store_id' => $this->storeA->id]);

        $this->categoryA = $this->makeCategory($this->storeA->id, 'drugs');
        $this->categoryB = $this->makeCategory($this->storeB->id, 'drugs');

        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['cloud_sync' => true], 'limits' => ['stores' => -1]]],
        ]);

        $this->withoutMiddleware();

        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function makeStore(string $tag, string $slug): Store
    {
        return Store::create([
            'user_id' => $this->owner->id,
            'name' => "Cross Store {$tag}",
            'email' => "{$slug}@dumosrx.com",
            'phone' => '400000000'.strlen($slug),
            'address' => "{$tag} Cross St",
            'slug' => $slug,
            'device_id' => 'WEB-'.strtoupper($slug),
        ]);
    }

    private function makeCategory(string $storeId, string $name): Category
    {
        $category = new Category();
        $category->name = $name;
        $category->store_id = $storeId;
        $category->is_active = true;
        $category->save();

        return $category;
    }

    private function push(array $change, ?string $storeId = null)
    {
        return $this->actingAs($this->owner)
            ->withHeaders($storeId ? ['X-Store-Id' => $storeId] : [])
            ->postJson('/api/v1/app/sync/push', ['setup' => true, 'changes' => [$change]]);
    }

    private function insertProduct(string $id, string $storeId, ?string $categoryId): void
    {
        DB::table('products')->insert([
            'id' => $id,
            'store_id' => $storeId,
            'user_id' => $this->owner->id,
            'name' => 'Panadol',
            'category_id' => $categoryId,
            'selling_price' => 500,
            '_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_an_inserted_product_naming_another_stores_category_is_remapped_to_its_own()
    {
        $response = $this->push([
            'table_name' => 'products',
            'operation' => 'INSERT',
            'record_id' => 'prod-insert-1',
            'payload' => [
                'id' => 'prod-insert-1', 'store_id' => $this->storeA->id,
                'name' => 'Panadol',
                'category_id' => $this->categoryB->id,
                'selling_price' => 500,
            ],
        ], $this->storeA->id);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $this->assertSame(
            $this->categoryA->id,
            DB::table('products')->where('id', 'prod-insert-1')->value('category_id'),
        );

        $this->assertDatabaseHas('sync_failures', [
            'table_name' => 'products',
            'record_id' => 'prod-insert-1',
            'reason' => 'cross_store_reference',
        ]);
    }

    public function test_an_updated_product_naming_another_stores_category_is_remapped_to_its_own()
    {
        $this->insertProduct('prod-update-1', $this->storeA->id, $this->categoryA->id);

        $response = $this->push([
            'table_name' => 'products',
            'operation' => 'UPDATE',
            'record_id' => 'prod-update-1',
            'payload' => [
                'id' => 'prod-update-1',
                'category_id' => $this->categoryB->id,
                '_version' => 1,
            ],
        ], $this->storeA->id);

        $response->assertStatus(200);
        $response->assertJsonCount(0, 'failed');

        $this->assertSame(
            $this->categoryA->id,
            DB::table('products')->where('id', 'prod-update-1')->value('category_id'),
        );
    }

    public function test_a_store_without_the_name_gets_its_own_category_created()
    {
        $perfume = $this->makeCategory($this->storeB->id, 'perfume');

        $this->push([
            'table_name' => 'products',
            'operation' => 'INSERT',
            'record_id' => 'prod-insert-2',
            'payload' => [
                'id' => 'prod-insert-2', 'store_id' => $this->storeA->id,
                'name' => 'Cologne',
                'category_id' => $perfume->id,
                'selling_price' => 900,
            ],
        ], $this->storeA->id)->assertStatus(200);

        $remapped = DB::table('products')->where('id', 'prod-insert-2')->value('category_id');
        $this->assertNotSame($perfume->id, $remapped);
        $this->assertSame($this->storeA->id, DB::table('categories')->where('id', $remapped)->value('store_id'));
        $this->assertSame('perfume', DB::table('categories')->where('id', $remapped)->value('name'));
    }

    public function test_a_category_created_in_the_same_batch_is_left_alone()
    {
        $response = $this->actingAs($this->owner)
            ->withHeaders(['X-Store-Id' => $this->storeA->id])
            ->postJson('/api/v1/app/sync/push', [
                'setup' => true,
                'changes' => [
                    [
                        'table_name' => 'categories',
                        'operation' => 'INSERT',
                        'record_id' => 'cat-same-batch',
                        'payload' => ['id' => 'cat-same-batch', 'name' => 'syrups', 'is_active' => 1],
                    ],
                    [
                        'table_name' => 'products',
                        'operation' => 'INSERT',
                        'record_id' => 'prod-same-batch',
                        'payload' => [
                            'id' => 'prod-same-batch', 'store_id' => $this->storeA->id,
                            'name' => 'Benylin',
                            'category_id' => 'cat-same-batch',
                            'selling_price' => 700,
                        ],
                    ],
                ],
            ]);

        $response->assertStatus(200);
        $this->assertSame(
            'cat-same-batch',
            DB::table('products')->where('id', 'prod-same-batch')->value('category_id'),
        );
        $this->assertDatabaseMissing('sync_failures', ['record_id' => 'prod-same-batch']);
    }

    public function test_a_category_that_exists_nowhere_is_left_untouched()
    {
        $this->push([
            'table_name' => 'products',
            'operation' => 'INSERT',
            'record_id' => 'prod-dangling',
            'payload' => [
                'id' => 'prod-dangling', 'store_id' => $this->storeA->id,
                'name' => 'Mystery',
                'category_id' => 'category-that-never-synced',
                'selling_price' => 100,
            ],
        ], $this->storeA->id)->assertStatus(200);

        // A-294's case, deliberately preserved: an unresolvable reference can
        // be legitimate offline ordering (a child pushed before its parent),
        // so the guard must not rewrite it. Asserted on the guard's own
        // record rather than on the stored row, because SQLite enforces the
        // products.category_id foreign key that production does not declare
        // at all (A-292) — so whether the row lands differs by environment,
        // and that is not what this case is about.
        $this->assertDatabaseMissing('sync_failures', [
            'record_id' => 'prod-dangling',
            'reason' => 'cross_store_reference',
        ]);
    }

    public function test_a_category_with_no_store_of_its_own_is_left_untouched()
    {
        $legacy = new Category();
        $legacy->name = 'analgesics';
        $legacy->is_active = true;
        $legacy->save();

        $this->push([
            'table_name' => 'products',
            'operation' => 'INSERT',
            'record_id' => 'prod-legacy',
            'payload' => [
                'id' => 'prod-legacy', 'store_id' => $this->storeA->id,
                'name' => 'Aspirin',
                'category_id' => $legacy->id,
                'selling_price' => 300,
            ],
        ], $this->storeA->id)->assertStatus(200);

        $this->assertSame(
            $legacy->id,
            DB::table('products')->where('id', 'prod-legacy')->value('category_id'),
        );
    }

    public function test_a_product_naming_another_tenants_category_is_still_re_owned_as_before()
    {
        $stranger = User::create([
            'first_name' => 'Other', 'last_name' => 'Tenant', 'email' => 'cross-stranger@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'admin',
        ]);
        $foreignStore = Store::create([
            'user_id' => $stranger->id, 'name' => 'Foreign', 'email' => 'cross-foreign@dumosrx.com',
            'phone' => '4999999999', 'address' => 'F St', 'slug' => 'cross-foreign', 'device_id' => 'WEB-CROSS-FOREIGN',
        ]);
        $foreignDrugs = $this->makeCategory($foreignStore->id, 'drugs');

        $this->push([
            'table_name' => 'products',
            'operation' => 'INSERT',
            'record_id' => 'prod-foreign-cat',
            'payload' => ['id' => 'prod-foreign-cat', 'store_id' => $this->storeA->id, 'name' => 'Panadol', 'category_id' => $foreignDrugs->id, 'selling_price' => 500],
        ], $this->storeA->id)->assertStatus(200);

        $this->assertSame($this->categoryA->id, DB::table('products')->where('id', 'prod-foreign-cat')->value('category_id'));
    }
}
