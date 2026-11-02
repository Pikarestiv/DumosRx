<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class StorefrontCatalogPaginationTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', [
            'tiers' => ['free' => ['features' => ['store_url' => true]]],
        ]);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'Test',
            'email' => 'catalog-test@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Catalog Pharmacy',
            'store_slug' => 'catalog-pharmacy',
            'device_id' => 'WEB-CATALOG',
            'online_store_enabled' => true,
            'currency' => 'NGN',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function createProduct(array $attrs = []): Product
    {
        return Product::create(array_merge([
            'id' => (string) Str::uuid(),
            'name' => 'Sample Drug',
            'selling_price' => 200,
            'is_active' => true,
            'show_online' => true,
            'is_controlled' => false,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
        ], $attrs));
    }

    private function addStock(Product $product, float $qty): void
    {
        StockBatch::create([
            'product_id' => $product->id,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'batch_number' => 'BATCH-'.$product->id,
            'quantity' => $qty,
            'cost_price' => 50,
            'expiry_date' => now()->addYear(),
        ]);
    }

    public function test_it_returns_paginated_products_capped_at_fifty_per_page(): void
    {
        for ($i = 1; $i <= 55; $i++) {
            $this->createProduct(['name' => 'Product '.str_pad((string) $i, 3, '0', STR_PAD_LEFT)]);
        }

        $response = $this->getJson('/api/v1/storefront/catalog-pharmacy/products');

        $response->assertOk();
        $response->assertJsonStructure([
            'data',
            'links' => ['first', 'last', 'prev', 'next'],
            'meta' => ['current_page', 'last_page', 'per_page', 'total'],
            'categories',
            'store' => ['id', 'name', 'currency'],
        ]);

        $this->assertCount(50, $response->json('data'));
        $this->assertSame(55, $response->json('meta.total'));
        $this->assertSame(2, $response->json('meta.last_page'));

        $page2 = $this->getJson('/api/v1/storefront/catalog-pharmacy/products?page=2');
        $page2->assertOk();
        $this->assertCount(5, $page2->json('data'));
    }

    public function test_it_filters_by_search_query_matching_name_generic_or_barcode(): void
    {
        $this->createProduct(['name' => 'Artemether Lumefantrine', 'generic_name' => 'Coartem']);
        $this->createProduct(['name' => 'Paracetamol Extra', 'barcode' => '890123456789']);
        $this->createProduct(['name' => 'Amoxicillin Trihydrate']);

        $resName = $this->getJson('/api/v1/storefront/catalog-pharmacy/products?q=Artemether');
        $resName->assertOk();
        $this->assertCount(1, $resName->json('data'));
        $this->assertSame('Artemether Lumefantrine', $resName->json('data.0.name'));

        $resGeneric = $this->getJson('/api/v1/storefront/catalog-pharmacy/products?q=Coartem');
        $resGeneric->assertOk();
        $this->assertCount(1, $resGeneric->json('data'));
        $this->assertSame('Artemether Lumefantrine', $resGeneric->json('data.0.name'));

        $resBarcode = $this->getJson('/api/v1/storefront/catalog-pharmacy/products?q=890123456789');
        $resBarcode->assertOk();
        $this->assertCount(1, $resBarcode->json('data'));
        $this->assertSame('Paracetamol Extra', $resBarcode->json('data.0.name'));
    }

    public function test_it_filters_by_category(): void
    {
        $cat1 = Category::create(['id' => (string) Str::uuid(), 'name' => 'Pain Relief']);
        $cat2 = Category::create(['id' => (string) Str::uuid(), 'name' => 'Antibiotics']);

        $this->createProduct(['name' => 'Paracetamol', 'category_id' => $cat1->id]);
        $this->createProduct(['name' => 'Ibuprofen', 'category_id' => $cat1->id]);
        $this->createProduct(['name' => 'Amoxicillin', 'category_id' => $cat2->id]);

        $res = $this->getJson("/api/v1/storefront/catalog-pharmacy/products?category={$cat1->id}");
        $res->assertOk();
        $this->assertCount(2, $res->json('data'));
        $names = collect($res->json('data'))->pluck('name')->all();
        $this->assertContains('Paracetamol', $names);
        $this->assertContains('Ibuprofen', $names);
        $this->assertNotContains('Amoxicillin', $names);

        $categories = $res->json('categories');
        $this->assertCount(2, $categories);
    }

    public function test_in_stock_products_sort_before_out_of_stock_in_paginated_results(): void
    {
        $outOfStock = $this->createProduct(['name' => 'Aspirin']);
        $inStock = $this->createProduct(['name' => 'Z-Zinc Supplement']);
        $this->addStock($inStock, 10);

        $res = $this->getJson('/api/v1/storefront/catalog-pharmacy/products');
        $res->assertOk();
        $this->assertSame(['Z-Zinc Supplement', 'Aspirin'], collect($res->json('data'))->pluck('name')->all());
    }

    public function test_controlled_products_are_never_included_in_paginated_results(): void
    {
        $this->createProduct(['name' => 'Safe Paracetamol']);
        $this->createProduct(['name' => 'Controlled Tramadol', 'is_controlled' => true]);

        $res = $this->getJson('/api/v1/storefront/catalog-pharmacy/products');
        $res->assertOk();
        $this->assertCount(1, $res->json('data'));
        $this->assertSame('Safe Paracetamol', $res->json('data.0.name'));
    }
}
