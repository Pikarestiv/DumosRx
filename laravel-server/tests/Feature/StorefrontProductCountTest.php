<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Storefront\StorefrontCatalogService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StorefrontProductCountTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['tiers' => ['free' => ['features' => ['store_url' => true]]]]);

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A', 'email' => 'count-owner@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A', 'store_slug' => 'store-a',
            'device_id' => 'WEB-A', 'online_store_enabled' => true,
        ]);
    }

    private function listed(array $attrs = []): Product
    {
        return Product::create(array_merge([
            'name' => 'Listed '.uniqid(), 'selling_price' => 100, 'is_active' => true,
            'show_online' => true, 'user_id' => $this->owner->id,
        ], $attrs));
    }

    public function test_product_count_is_the_full_online_catalogue_while_products_stay_capped(): void
    {
        $cap = StorefrontCatalogService::MAX_STOREFRONT_PRODUCTS;
        for ($i = 0; $i < $cap + 2; $i++) {
            $this->listed(['store_id' => $i % 2 ? $this->store->id : null]);
        }

        $otherBranch = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store B', 'store_slug' => 'store-b',
            'device_id' => 'WEB-B', 'online_store_enabled' => true,
        ]);
        $this->listed(['store_id' => $otherBranch->id]);
        $this->listed(['show_online' => false]);
        $this->listed(['is_active' => false]);
        $this->listed(['is_controlled' => true]);
        $stranger = User::create([
            'first_name' => 'Other', 'last_name' => 'Owner', 'email' => 'count-other@dumosrx.com',
            'password' => bcrypt('password'), 'role' => 'store_owner',
        ]);
        $this->listed(['user_id' => $stranger->id]);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertOk();
        $response->assertJsonCount($cap, 'products');
        $this->assertSame($cap + 2, $response->json('product_count'));
    }

    public function test_product_count_is_zero_for_a_store_with_nothing_listed(): void
    {
        $this->listed(['show_online' => false]);

        $response = $this->getJson('/api/v1/storefront/store-a');

        $response->assertOk();
        $response->assertJsonCount(0, 'products');
        $this->assertSame(0, $response->json('product_count'));
    }
}
