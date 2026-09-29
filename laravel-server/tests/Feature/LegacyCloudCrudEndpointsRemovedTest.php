<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Regression coverage for A-19 (docs/FIXED_BUGS.md). The pre-offline-first
 * cloud CRUD endpoints under /api/v1/app (products, sales, customers,
 * suppliers, categories, stock-batches) let any staff token create and
 * mutate tenant data outside the sync engine's invariants — no audit trail,
 * no correlation id, no _version, and in SaleController::store's case a
 * direct write to stock_batches.quantity alongside a stock_movements row
 * whose delta every other device then applied. They had no callers left and
 * are gone; this pins that they stay gone.
 */
class LegacyCloudCrudEndpointsRemovedTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'WEB-A',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public static function removedWriteEndpoints(): array
    {
        return [
            'create sale' => ['/api/v1/app/sales'],
            'create product' => ['/api/v1/app/products'],
            'create customer' => ['/api/v1/app/customers'],
            'create supplier' => ['/api/v1/app/suppliers'],
            'create category' => ['/api/v1/app/categories'],
        ];
    }

    #[DataProvider('removedWriteEndpoints')]
    public function test_a_legacy_cloud_write_endpoint_no_longer_exists(string $path)
    {
        $this->actingAs($this->owner)
            ->postJson($path, ['name' => 'Anything', 'selling_price' => 100])
            ->assertStatus(404);
    }

    public static function removedReadEndpoints(): array
    {
        return [
            'list sales' => ['/api/v1/app/sales'],
            'daily sales' => ['/api/v1/app/sales/daily'],
            'top products' => ['/api/v1/app/sales/top-products'],
            'list products' => ['/api/v1/app/products'],
            'search products' => ['/api/v1/app/products/search?q=x'],
            'list customers' => ['/api/v1/app/customers'],
            'list suppliers' => ['/api/v1/app/suppliers'],
            'list categories' => ['/api/v1/app/categories'],
            'list stock batches' => ['/api/v1/app/stock-batches'],
            'low stock' => ['/api/v1/app/stock-batches/low-stock'],
            'expiring stock' => ['/api/v1/app/stock-batches/expiring'],
            'stock value' => ['/api/v1/app/stock-batches/value'],
        ];
    }

    #[DataProvider('removedReadEndpoints')]
    public function test_a_legacy_cloud_read_endpoint_no_longer_exists(string $path)
    {
        $this->actingAs($this->owner)->getJson($path)->assertStatus(404);
    }

    public function test_the_sync_and_online_order_routes_under_the_same_prefix_still_exist()
    {
        $paths = collect(Route::getRoutes())->map(fn ($r) => $r->uri())->all();

        $this->assertContains('api/v1/app/sync/push', $paths);
        $this->assertContains('api/v1/app/sync/pull', $paths);
        $this->assertContains('api/v1/app/online-orders', $paths);
    }

    public function test_no_controller_remains_that_writes_stock_batch_quantity_outside_the_sync_engine()
    {
        $dir = app_path('Http/Controllers/Api/App');
        $offenders = [];

        foreach (glob($dir . '/*.php') as $file) {
            $source = file_get_contents($file);
            if (preg_match('/\$batch->quantity\s*-=|\$batch->quantity\s*\+=/', $source)) {
                $offenders[] = basename($file);
            }
        }

        $this->assertSame([], $offenders);
    }
}
