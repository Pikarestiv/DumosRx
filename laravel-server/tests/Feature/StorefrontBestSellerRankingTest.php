<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Storefront\StorefrontCatalogService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class StorefrontBestSellerRankingTest extends TestCase
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
            'first_name' => 'Owner', 'last_name' => 'Ranked',
            'email' => 'ranked-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Ranked Store',
            'store_slug' => 'ranked-store', 'device_id' => 'WEB-RANKED',
            'online_store_enabled' => true,
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function product(string $name, array $attrs = []): Product
    {
        return Product::create(array_merge([
            'name' => $name,
            'selling_price' => 100,
            'is_active' => true,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
        ], $attrs));
    }

    private function stock(Product $product, float $quantity): void
    {
        StockBatch::create([
            'product_id' => $product->id,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'batch_number' => 'B-'.$product->id,
            'quantity' => $quantity,
            'cost_price' => 10,
            'expiry_date' => now()->addYear(),
        ]);
    }

    private function sell(Product $product, int $units, float $revenue, array $saleAttrs = []): Sale
    {
        $sale = Sale::create(array_merge([
            'cashier_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'subtotal' => $revenue,
            'total_amount' => $revenue,
            'amount_paid' => $revenue,
            'payment_method' => 'cash',
            'payment_status' => 'completed',
            'transaction_date' => now()->subDay(),
        ], $saleAttrs));

        SaleItem::create([
            'sale_id' => $sale->id,
            'product_id' => $product->id,
            'quantity' => $units,
            'unit_price' => $units > 0 ? $revenue / $units : 0,
            'total_price' => $revenue,
        ]);

        return $sale;
    }

    /**
     * @return array<int, string>
     */
    private function landingNames(): array
    {
        return app(StorefrontCatalogService::class)
            ->getLandingProducts($this->store->fresh())
            ->pluck('name')
            ->all();
    }

    public function test_products_are_ranked_by_an_even_blend_of_units_and_revenue(): void
    {
        $this->sell($this->product('Aspirin'), 10, 10000);
        $this->sell($this->product('Bandage'), 100, 2000);
        $this->sell($this->product('Cough Syrup'), 60, 7000);

        $this->assertSame(['Cough Syrup', 'Bandage', 'Aspirin'], $this->landingNames());
    }

    public function test_only_sales_inside_the_ranking_window_count(): void
    {
        $this->sell($this->product('Aardvark Balm'), 1000, 100000, [
            'transaction_date' => now()->subDays(StorefrontCatalogService::BEST_SELLER_WINDOW_DAYS + 1),
        ]);
        $this->sell($this->product('Zinc'), 1, 50);

        $this->assertSame(['Zinc', 'Aardvark Balm'], $this->landingNames());
    }

    public function test_refunded_failed_and_deleted_sales_are_not_counted(): void
    {
        $this->sell($this->product('Amoxil'), 500, 50000, ['payment_status' => 'refunded']);
        $this->sell($this->product('Benylin'), 500, 50000, ['payment_status' => 'failed']);
        $this->sell($this->product('Cetirizine'), 500, 50000)->delete();
        $deletedLine = $this->sell($this->product('Dettol'), 500, 50000);
        SaleItem::where('sale_id', $deletedLine->id)->first()->delete();
        $this->sell($this->product('Zinc'), 1, 50);

        $this->assertSame(['Zinc', 'Amoxil', 'Benylin', 'Cetirizine', 'Dettol'], $this->landingNames());
    }

    public function test_credit_sales_still_awaiting_payment_count_as_sold(): void
    {
        $this->product('Aspirin');
        $this->sell($this->product('Zinc'), 3, 300, ['payment_status' => 'partial']);
        $this->sell($this->product('Vitamin C'), 1, 100, ['payment_status' => 'pending']);

        $this->assertSame(['Zinc', 'Vitamin C', 'Aspirin'], $this->landingNames());
    }

    public function test_sales_rung_up_at_another_branch_are_ignored(): void
    {
        $sibling = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Ranked Branch',
            'store_slug' => 'ranked-branch', 'device_id' => 'WEB-RANKED-2',
        ]);
        $shared = $this->product('Aspirin', ['store_id' => null]);
        $this->sell($shared, 900, 90000, ['store_id' => $sibling->id]);
        $this->sell($this->product('Zinc'), 1, 50);

        $this->assertSame(['Zinc', 'Aspirin'], $this->landingNames());
    }

    public function test_an_out_of_stock_best_seller_ranks_after_every_in_stock_product(): void
    {
        $soldOut = $this->product('Zz Syrup');
        $this->stock($soldOut, 0);
        $this->sell($soldOut, 900, 90000);
        $this->sell($this->product('Amoxil'), 1, 100);
        $inStockSeller = $this->product('Ibuprofen');
        $this->sell($inStockSeller, 5, 500);
        $this->stock($inStockSeller, 7);
        $this->stock($this->product('Aspirin'), 3);

        $this->assertSame(['Ibuprofen', 'Aspirin', 'Zz Syrup', 'Amoxil'], $this->landingNames());
    }

    public function test_hidden_controlled_and_inactive_best_sellers_never_appear(): void
    {
        $this->sell($this->product('Hidden', ['show_online' => false]), 900, 90000);
        $this->sell($this->product('Tramadol', ['is_controlled' => true]), 900, 90000);
        $this->sell($this->product('Retired', ['is_active' => false]), 900, 90000);
        $this->product('Aspirin');

        $this->assertSame(['Aspirin'], $this->landingNames());
    }

    public function test_a_store_with_no_sales_lists_products_by_name(): void
    {
        $this->product('Zinc');
        $this->product('Aspirin');
        $this->product('Multivite');

        $this->assertSame(['Aspirin', 'Multivite', 'Zinc'], $this->landingNames());
    }

    public function test_equal_scores_fall_back_to_name_order(): void
    {
        $this->sell($this->product('Zinc'), 4, 400);
        $this->sell($this->product('Aspirin'), 4, 400);

        $this->assertSame(['Aspirin', 'Zinc'], $this->landingNames());
    }

    public function test_landing_products_stay_capped_with_the_best_seller_first(): void
    {
        for ($i = 0; $i < StorefrontCatalogService::MAX_STOREFRONT_PRODUCTS + 5; $i++) {
            $this->product(sprintf('Product %02d', $i));
        }
        $this->sell($this->product('Zz Best Seller'), 2, 200);

        $names = $this->landingNames();

        $this->assertCount(StorefrontCatalogService::MAX_STOREFRONT_PRODUCTS, $names);
        $this->assertSame('Zz Best Seller', $names[0]);
        $this->assertSame('Product 00', $names[1]);
    }

    public function test_the_show_endpoint_serves_best_sellers_first_in_the_unchanged_shape(): void
    {
        $this->product('Aspirin');
        $this->sell($this->product('Zinc'), 2, 200);

        $products = $this->getJson('/api/v1/storefront/ranked-store')->assertOk()->json('products');

        $this->assertSame(['Zinc', 'Aspirin'], array_column($products, 'name'));
        $this->assertSame([
            'id', 'name', 'generic_name', 'description', 'dosage_form', 'strength', 'pack_size',
            'unit_of_measure', 'selling_price', 'requires_prescription', 'stock_quantity', 'in_stock', 'category',
        ], array_keys($products[0]));
    }

    public function test_the_paginated_catalog_stays_in_name_order(): void
    {
        $this->product('Aspirin');
        $this->sell($this->product('Zinc'), 2, 200);

        $names = app(StorefrontCatalogService::class)
            ->paginateProducts($this->store->fresh())
            ->getCollection()
            ->pluck('name')
            ->all();

        $this->assertSame(['Aspirin', 'Zinc'], $names);
    }

    public function test_the_window_cutoff_is_measured_from_the_current_utc_time(): void
    {
        Carbon::setTestNow('2026-11-14 12:00:00');
        $this->sell($this->product('Aardvark Balm'), 900, 90000, [
            'transaction_date' => Carbon::parse('2026-11-14 12:00:00')->subDays(StorefrontCatalogService::BEST_SELLER_WINDOW_DAYS)->subMinute(),
        ]);
        $this->sell($this->product('Mint'), 900, 90000, [
            'transaction_date' => Carbon::parse('2026-11-14 12:00:00')->subDays(StorefrontCatalogService::BEST_SELLER_WINDOW_DAYS)->addMinute(),
        ]);
        $this->product('Zinc');

        $this->assertSame(['Mint', 'Aardvark Balm', 'Zinc'], $this->landingNames());
    }
}
