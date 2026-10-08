<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Services\Sync\CrossTenantCategoryRepairService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers the repair for products whose category_id points at a category
 * owned by a different store. The pull scopes categories with
 * whereIn('store_id', $storeIds) (SyncController), so such a product can
 * never resolve a category name on any device — it renders "Uncategorized"
 * forever regardless of resyncs. See docs/KNOWN_BUGS.md.
 */
class CrossTenantCategoryRepairTest extends TestCase
{
    use RefreshDatabase;

    private Store $storeA;

    private Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        $ownerA = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'ownerA@dumosrx.test', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $ownerB = User::create([
            'first_name' => 'Owner', 'last_name' => 'B',
            'email' => 'ownerB@dumosrx.test', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $ownerA->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'WEB-A',
        ]);
        $this->storeB = Store::create([
            'user_id' => $ownerB->id, 'name' => 'Store B',
            'store_slug' => 'store-b', 'device_id' => 'WEB-B',
        ]);
    }

    private function category(string $name, ?string $storeId): Category
    {
        $category = new Category();
        $category->name = $name;
        $category->store_id = $storeId;
        $category->is_active = true;
        $category->save();

        return $category;
    }

    private function product(string $name, ?string $storeId, ?string $categoryId): Product
    {
        $product = new Product();
        $product->name = $name;
        $product->store_id = $storeId;
        $product->category_id = $categoryId;
        $product->selling_price = 100;
        $product->save();

        return $product;
    }

    public function test_repoints_product_onto_a_newly_created_category_in_its_own_store(): void
    {
        $foreign = $this->category('drugs', $this->storeB->id);
        $product = $this->product('PARACETAMOL', $this->storeA->id, $foreign->id);

        $result = app(CrossTenantCategoryRepairService::class)->apply();

        $this->assertSame(1, $result['products_repointed']);
        $this->assertSame(1, $result['categories_created']);

        $product->refresh();
        $this->assertNotSame($foreign->id, $product->category_id);

        $owned = Category::find($product->category_id);
        $this->assertSame('drugs', $owned->name);
        $this->assertSame($this->storeA->id, $owned->store_id);
    }

    public function test_reuses_an_existing_same_named_category_in_the_products_own_store(): void
    {
        $foreign = $this->category('Toiletries', $this->storeB->id);
        $owned = $this->category('toiletries', $this->storeA->id);
        $product = $this->product('SOAP BAR', $this->storeA->id, $foreign->id);

        $result = app(CrossTenantCategoryRepairService::class)->apply();

        $this->assertSame(0, $result['categories_created']);
        $this->assertSame($owned->id, $product->refresh()->category_id);
    }

    public function test_never_modifies_or_deletes_the_other_stores_category(): void
    {
        $foreign = $this->category('drugs', $this->storeB->id);
        $foreignProduct = $this->product('THEIR ITEM', $this->storeB->id, $foreign->id);
        $this->product('OUR ITEM', $this->storeA->id, $foreign->id);

        app(CrossTenantCategoryRepairService::class)->apply();

        $foreign->refresh();
        $this->assertSame($this->storeB->id, $foreign->store_id);
        $this->assertSame('drugs', $foreign->name);
        $this->assertNull($foreign->deleted_at);
        $this->assertSame($foreign->id, $foreignProduct->refresh()->category_id);
    }

    public function test_dry_run_reports_without_writing_anything(): void
    {
        $foreign = $this->category('perfume', $this->storeB->id);
        $product = $this->product('OUD', $this->storeA->id, $foreign->id);
        $categoriesBefore = Category::count();

        $result = app(CrossTenantCategoryRepairService::class)->preview();

        $this->assertFalse($result['applied']);
        $this->assertSame(1, $result['products_repointed']);
        $this->assertSame(1, $result['categories_created']);
        $this->assertSame($categoriesBefore, Category::count());
        $this->assertSame($foreign->id, $product->refresh()->category_id);
    }

    public function test_leaves_correctly_scoped_products_untouched(): void
    {
        $owned = $this->category('drinks', $this->storeA->id);
        $product = $this->product('MALT', $this->storeA->id, $owned->id);

        $result = app(CrossTenantCategoryRepairService::class)->apply();

        $this->assertSame(0, $result['products_repointed']);
        $this->assertSame($owned->id, $product->refresh()->category_id);
    }

    public function test_skips_products_that_have_no_store_id(): void
    {
        $orphanCategory = $this->category('legacy', null);
        $product = $this->product('LEGACY ITEM', null, $orphanCategory->id);

        $result = app(CrossTenantCategoryRepairService::class)->apply();

        $this->assertSame(1, $result['unowned_products_skipped']);
        $this->assertSame(0, $result['products_repointed']);
        $this->assertSame($orphanCategory->id, $product->refresh()->category_id);
    }

    public function test_repoints_a_category_owned_by_nobody_onto_the_products_own_store(): void
    {
        $unowned = $this->category('provision', null);
        $product = $this->product('RICE', $this->storeA->id, $unowned->id);

        app(CrossTenantCategoryRepairService::class)->apply();

        $owned = Category::find($product->refresh()->category_id);
        $this->assertSame($this->storeA->id, $owned->store_id);
        $this->assertSame('provision', $owned->name);
    }

    public function test_bumps_updated_at_so_clients_repull_the_corrected_rows(): void
    {
        $foreign = $this->category('sweet', $this->storeB->id);
        $product = $this->product('CANDY', $this->storeA->id, $foreign->id);

        Product::where('id', $product->id)->update(['updated_at' => '2020-01-01 00:00:00']);
        $before = Product::find($product->id)->updated_at;

        app(CrossTenantCategoryRepairService::class)->apply();

        $this->assertTrue(Product::find($product->id)->updated_at->greaterThan($before));
    }

    public function test_revives_a_soft_deleted_owned_category_instead_of_colliding_with_the_unique_index(): void
    {
        $foreign = $this->category('drugs', $this->storeB->id);
        $trashed = $this->category('drugs', $this->storeA->id);
        $trashed->deleted_at = '2026-01-01 00:00:00';
        $trashed->save();

        $product = $this->product('PARACETAMOL', $this->storeA->id, $foreign->id);

        $result = app(CrossTenantCategoryRepairService::class)->apply();

        $this->assertSame(0, $result['categories_created']);
        $this->assertSame(1, $result['categories_revived']);
        $this->assertSame($trashed->id, $product->refresh()->category_id);
        $this->assertNull(Category::find($trashed->id)->deleted_at);
        $this->assertSame(
            1,
            Category::where('store_id', $this->storeA->id)->where('name', 'drugs')->count(),
        );
    }

    public function test_store_option_limits_the_repair_to_one_store(): void
    {
        $foreignB = $this->category('drugs', $this->storeB->id);
        $foreignA = $this->category('cosmetics', $this->storeA->id);
        $productA = $this->product('A ITEM', $this->storeA->id, $foreignB->id);
        $productB = $this->product('B ITEM', $this->storeB->id, $foreignA->id);

        $result = app(CrossTenantCategoryRepairService::class)->apply($this->storeA->id);

        $this->assertSame(1, $result['products_repointed']);
        $this->assertNotSame($foreignB->id, $productA->refresh()->category_id);
        $this->assertSame($foreignA->id, $productB->refresh()->category_id);
    }
}
