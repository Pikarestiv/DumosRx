<?php

namespace Tests\Feature\Admin;

use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the "Global Products list/pagination always
 * empty" bug (superadmin panel, `docs/features/superadmin/products.md`).
 *
 * AdminController::products() used to nest the paginated result under a
 * `products` key: {"products": {"data": [...], "meta": {...}}, "metrics":
 * {...}, "categories": [...]}. The frontend's `AdminProductsResponse` type
 * (`web/lib/types/admin.ts`) extends `PaginatedResponse<T>`, which expects
 * `data`/`meta` as SIBLINGS of `metrics`/`categories` at the response
 * root — so `response.data` was always `undefined`, and the Global
 * Products table always rendered empty regardless of real seeded data.
 *
 * This test asserts the actual top-level JSON shape reaching the frontend,
 * with its own seeded fixture products (not dependent on the shared dev
 * DB's 3,041 real rows).
 */
class AdminProductsResponseShapeTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeStoreOwner(): User
    {
        return User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
    }

    public function test_products_endpoint_returns_data_and_meta_at_the_response_root()
    {
        $owner = $this->makeStoreOwner();
        Store::create([
            'user_id' => $owner->id,
            'name' => 'Fixture Pharmacy',
            'device_id' => 'TEST-'.uniqid(),
        ]);

        foreach (range(1, 3) as $i) {
            Product::create([
                'name' => "Fixture Product {$i}",
                'generic_name' => 'Fixture Generic',
                'selling_price' => 100 * $i,
                'user_id' => $owner->id,
            ]);
        }

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/products?page=1');

        $response->assertStatus(200);

        $json = $response->json();

        // The bug: these used to only exist nested under `products`.
        $this->assertArrayHasKey('data', $json, 'Expected `data` at the response root, matching PaginatedResponse<T> / AdminProductsResponse on the frontend.');
        $this->assertArrayHasKey('meta', $json, 'Expected `meta` at the response root.');
        $this->assertArrayNotHasKey('products', $json, 'The response should no longer nest the paginated result under a `products` key.');

        $this->assertIsArray($json['data']);
        $this->assertCount(3, $json['data']);

        $this->assertArrayHasKey('current_page', $json['meta']);
        $this->assertArrayHasKey('last_page', $json['meta']);
        $this->assertArrayHasKey('total', $json['meta']);
        $this->assertArrayHasKey('per_page', $json['meta']);
        $this->assertSame(3, $json['meta']['total']);

        // metrics/categories are siblings of data/meta, unaffected by the fix.
        $this->assertArrayHasKey('metrics', $json);
        $this->assertArrayHasKey('categories', $json);
        $this->assertContains('Fixture Generic', $json['categories']);

        $names = collect($json['data'])->pluck('name')->all();
        $this->assertContains('Fixture Product 1', $names);
    }

    public function test_products_endpoint_pagination_meta_reflects_page_size_across_multiple_pages()
    {
        $owner = $this->makeStoreOwner();

        foreach (range(1, 15) as $i) {
            Product::create([
                'name' => "Page Fixture {$i}",
                'generic_name' => 'Page Fixture Generic',
                'selling_price' => 50,
                'user_id' => $owner->id,
            ]);
        }

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/products?page=2');

        $response->assertStatus(200);
        $json = $response->json();

        $this->assertSame(2, $json['meta']['current_page']);
        $this->assertSame(15, $json['meta']['total']);
        $this->assertSame(2, $json['meta']['last_page']);
        $this->assertCount(5, $json['data']); // 15 total, 10 per page -> page 2 has 5
    }

    /**
     * Regression coverage for the "Stock Flag Rate" metric card missing its
     * `%` label. `AdminService::getProductMetrics()` used to return
     * `stockAlerts.rate` as a bare number while `mostStockedCategory.growth`
     * and `compliance.rate` were formatted as `"N%"` strings — the frontend
     * card rendered the raw number verbatim with no unit. Fixed by
     * formatting `stockAlerts.rate` the same way as its siblings.
     */
    public function test_stock_flag_rate_metric_is_formatted_as_a_percentage_string_like_its_siblings()
    {
        $owner = $this->makeStoreOwner();
        Product::create([
            'name' => 'Metric Fixture',
            'generic_name' => 'Metric Generic',
            'selling_price' => 10,
            'user_id' => $owner->id,
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/products?page=1');

        $response->assertStatus(200);
        $metrics = $response->json('metrics');

        $this->assertIsString($metrics['stockAlerts']['rate'], 'stockAlerts.rate should be a formatted string, matching mostStockedCategory.growth and compliance.rate.');
        $this->assertStringEndsWith('%', $metrics['stockAlerts']['rate']);
        $this->assertStringEndsWith('%', $metrics['mostStockedCategory']['growth']);
        $this->assertStringEndsWith('%', $metrics['compliance']['rate']);
    }

    /**
     * Regression coverage for the "PCN Compliance" card always claiming
     * "Verified" regardless of the real compliance rate. The backend
     * already computes a real `compliance.status` ('Verified' above 90%,
     * else 'Action Required') — this asserts it's actually present and
     * correct in the response so the frontend has something real to read
     * instead of a hardcoded label.
     */
    public function test_compliance_status_reflects_the_real_nafdac_compliant_rate()
    {
        $owner = $this->makeStoreOwner();

        // 1 of 4 products has a real nafdac_number -> 25% compliant, well
        // under the 90% threshold -> status should be 'Action Required',
        // not 'Verified'.
        Product::create(['name' => 'Compliant', 'nafdac_number' => 'NAFDAC-1', 'user_id' => $owner->id]);
        Product::create(['name' => 'Non-compliant A', 'user_id' => $owner->id]);
        Product::create(['name' => 'Non-compliant B', 'user_id' => $owner->id]);
        Product::create(['name' => 'Non-compliant C', 'user_id' => $owner->id]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/products?page=1');

        $response->assertStatus(200);
        $compliance = $response->json('metrics.compliance');

        $this->assertSame('25%', $compliance['rate']);
        $this->assertSame('Action Required', $compliance['status']);
    }
}
