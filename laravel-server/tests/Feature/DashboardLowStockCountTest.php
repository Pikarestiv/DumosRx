<?php

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardLowStockCountTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Main Branch',
            'store_type' => 'pharmacy',
            'device_id' => 'test-device-'.uniqid(),
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function seedCatalog(): void
    {
        Product::create([
            'name' => 'Never Reordered',
            'selling_price' => 100,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'reorder_level' => 0,
            'is_active' => true,
        ]);

        Product::create([
            'name' => 'Genuinely Low',
            'selling_price' => 200,
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'reorder_level' => 10,
            'is_active' => true,
        ]);
    }

    private function fetch(string $path): \Illuminate\Testing\TestResponse
    {
        $token = $this->owner->createToken('test')->plainTextToken;

        return $this->withHeader('Authorization', "Bearer {$token}")->getJson($path);
    }

    public function test_summary_low_stock_excludes_products_with_no_reorder_level_set(): void
    {
        $this->seedCatalog();

        $response = $this->fetch('/api/v1/dashboard/summary');

        $response->assertStatus(200);
        $response->assertJsonPath('stores.0.low_stock_alerts', 1);
    }

    public function test_stats_low_stock_excludes_products_with_no_reorder_level_set(): void
    {
        $this->seedCatalog();

        $response = $this->fetch('/api/v1/dashboard/stats');

        $response->assertStatus(200);
        $response->assertJsonPath('stores.0.low_stock_alerts', 1);
    }

    public function test_widget_snapshot_low_stock_excludes_products_with_no_reorder_level_set(): void
    {
        $this->seedCatalog();

        $response = $this->fetch('/api/v1/dashboard/widget-snapshot');

        $response->assertStatus(200);
        $response->assertJsonPath('fleet.low_stock_alerts', 1);
        $response->assertJsonPath('stores.0.low_stock_alerts', 1);
    }
}
