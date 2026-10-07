<?php

namespace Tests\Feature\Admin;

use App\Models\Product;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\User;
use App\Services\Admin\AdminFleetMetricsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminFleetStockValueTest extends TestCase
{
    use RefreshDatabase;

    private function makeStore(string $currency): Store
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'name' => 'Store '.uniqid(),
            'user_id' => $owner->id,
            'device_id' => 'DESKTOP-'.strtoupper(uniqid()),
            'currency' => $currency,
        ]);
    }

    private function stockStore(Store $store, float $quantity, float $costPrice): StockBatch
    {
        $product = Product::create([
            'name' => 'Product '.uniqid(),
            'store_id' => $store->id,
        ]);

        return StockBatch::create([
            'product_id' => $product->id,
            'store_id' => $store->id,
            'batch_number' => 'BATCH-'.uniqid(),
            'quantity' => $quantity,
            'cost_price' => $costPrice,
        ]);
    }

    private function totals(): array
    {
        return app(AdminFleetMetricsService::class)->stockValueByCurrency();
    }

    public function test_it_totals_stock_value_per_store_currency(): void
    {
        $this->stockStore($this->makeStore('NGN'), 10, 100);
        $this->stockStore($this->makeStore('NGN'), 5, 200);
        $this->stockStore($this->makeStore('GHS'), 3, 50);

        $this->assertSame(['NGN' => 2000.0, 'GHS' => 150.0], $this->totals());
    }

    public function test_it_buckets_a_store_with_a_blank_currency_under_ngn(): void
    {
        $this->stockStore($this->makeStore(''), 4, 25);

        $this->assertSame(['NGN' => 100.0], $this->totals());
    }

    public function test_it_normalises_currency_case_across_stores(): void
    {
        $this->stockStore($this->makeStore('ngn'), 1, 100);
        $this->stockStore($this->makeStore('NGN'), 1, 100);

        $this->assertSame(['NGN' => 200.0], $this->totals());
    }

    public function test_it_excludes_soft_deleted_stock_batches(): void
    {
        $batch = $this->stockStore($this->makeStore('NGN'), 10, 100);

        DB::table('stock_batches')->where('id', $batch->id)->update(['deleted_at' => now()]);

        $this->assertSame([], $this->totals());
    }

    public function test_it_excludes_stock_belonging_to_a_soft_deleted_product(): void
    {
        $batch = $this->stockStore($this->makeStore('NGN'), 10, 100);

        Product::where('id', $batch->product_id)->delete();

        $this->assertSame([], $this->totals());
    }

    /**
     * Archiving a store soft-deletes it, leaving its products and stock
     * batches untouched. The fleet table excludes archived stores by default,
     * so counting their stock made the card disagree with the table directly
     * beneath it on the same page.
     */
    public function test_it_excludes_stock_held_by_an_archived_store(): void
    {
        $store = $this->makeStore('NGN');
        $this->stockStore($store, 10, 100);

        $store->delete();

        $this->assertSame([], $this->totals());
    }

    public function test_it_returns_an_empty_array_when_the_fleet_holds_no_stock(): void
    {
        $this->makeStore('NGN');

        $this->assertSame([], $this->totals());
    }

    private function makeAdmin(string $role): User
    {
        return User::create([
            'first_name' => 'Platform',
            'last_name' => ucfirst($role),
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    public function test_the_stores_endpoint_exposes_the_breakdown_to_a_super_admin(): void
    {
        $this->stockStore($this->makeStore('NGN'), 10, 100);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $response = $this->actingAs($this->makeAdmin('super_admin'))->getJson('/api/v1/admin/stores');

        $response->assertStatus(200);
        $this->assertEquals(['NGN' => 1000.0], $response->json('stock_value_by_currency'));
    }

    public function test_the_stores_endpoint_withholds_the_breakdown_from_a_non_super_admin(): void
    {
        $this->stockStore($this->makeStore('NGN'), 10, 100);
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $response = $this->actingAs($this->makeAdmin('platform_admin'))->getJson('/api/v1/admin/stores');

        $response->assertStatus(200);
        $this->assertNull($response->json('stock_value_by_currency'));
    }
}
