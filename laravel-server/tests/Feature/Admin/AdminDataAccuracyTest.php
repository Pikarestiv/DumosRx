<?php

namespace Tests\Feature\Admin;

use App\Models\Product;
use App\Models\Sale;
use App\Models\StockBatch;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for two AdminService bugs found via a Sentry crash
 * report and a "store fleet revenue looks wrong" report:
 *
 * 1. getGlobalProducts() called avg('selling_price') against the
 *    stock_batches query builder, but selling_price was dropped from
 *    stock_batches back when the schema moved to one canonical price per
 *    product (kept on products). This crashed with SQLSTATE[42S22].
 *
 * 2. getStores() summed store revenue filtered to
 *    payment_status = 'completed' only, while every other revenue figure
 *    in the app (the platform-wide total, and a store owner's own
 *    dashboard) sums every sale with no status filter — silently
 *    undercounting stores with pending or partial-payment (POS credit)
 *    sales.
 *
 * Both are asserted here against a real SQLite-backed request/response
 * cycle (not a mocked query), since the wrong-column and wrong-filter bugs
 * only show up against actual data.
 */
class AdminDataAccuracyTest extends TestCase
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

    private function makeSale(User $cashier, float $totalAmount, string $paymentStatus, ?string $storeId = null): Sale
    {
        $sale = Sale::create([
            'transaction_number' => 'TXN-'.uniqid(),
            'cashier_id' => $cashier->id,
            'subtotal' => $totalAmount,
            'total_amount' => $totalAmount,
            'payment_method' => 'cash',
            'payment_status' => $paymentStatus,
            'amount_paid' => $totalAmount,
        ]);

        // store_id isn't in Sale's $fillable (it's populated by the sync
        // engine via a raw insert, not Eloquent create — see
        // SyncController::push), so it's set directly here to simulate
        // both a synced sale (store_id present) and a pre-migration one
        // (left null).
        if ($storeId !== null) {
            $sale->forceFill(['store_id' => $storeId])->save();
        }

        return $sale;
    }

    public function test_store_fleet_revenue_includes_pending_and_partial_sales()
    {
        $owner = $this->makeStoreOwner();
        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Test Pharmacy',
            'device_id' => 'TEST-'.uniqid(),
        ]);

        // cashier_id is the store owner themself, matching how a
        // single-owner store's sales are attributed (see
        // DashboardService::getSummary's $cashierIds handling).
        $this->makeSale($owner, 10000, 'completed');
        $this->makeSale($owner, 5000, 'pending');
        $this->makeSale($owner, 3000, 'partial');
        $this->makeSale($owner, 2000, 'refunded');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores');

        $response->assertStatus(200);

        $storeRow = collect($response->json('data'))->firstWhere('id', $store->id);
        $this->assertNotNull($storeRow, 'Expected the seeded store to appear in the fleet list.');

        // 10000 + 5000 + 3000 + 2000 = 20000, i.e. every sale counts,
        // regardless of payment_status — matching the platform-wide total
        // and the store owner's own dashboard, neither of which filter by
        // payment_status either.
        $this->assertSame('₦20,000', $storeRow['revenue']);
    }

    public function test_store_fleet_revenue_does_not_leak_across_stores()
    {
        $ownerA = $this->makeStoreOwner();
        $storeA = Store::create([
            'user_id' => $ownerA->id,
            'name' => 'Store A',
            'device_id' => 'TEST-'.uniqid(),
        ]);
        $this->makeSale($ownerA, 7000, 'completed');

        $ownerB = $this->makeStoreOwner();
        Store::create([
            'user_id' => $ownerB->id,
            'name' => 'Store B',
            'device_id' => 'TEST-'.uniqid(),
        ]);
        $this->makeSale($ownerB, 99000, 'completed');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores');

        $storeARow = collect($response->json('data'))->firstWhere('id', $storeA->id);
        $this->assertSame('₦7,000', $storeARow['revenue']);
    }

    public function test_store_fleet_revenue_includes_staff_sales_via_legacy_cashier_fallback()
    {
        $owner = $this->makeStoreOwner();
        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Legacy Data Pharmacy',
            'device_id' => 'TEST-'.uniqid(),
        ]);

        $staff = User::create([
            'first_name' => 'Staff',
            'last_name' => 'Member',
            'email' => 'staff-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $store->id,
        ]);

        // No $storeId passed — simulates a sale synced before the
        // store_id column existed, only attributable via cashier_id.
        $this->makeSale($staff, 4500, 'completed');
        $this->makeSale($owner, 1500, 'completed');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores');

        $storeRow = collect($response->json('data'))->firstWhere('id', $store->id);
        $this->assertSame('₦6,000', $storeRow['revenue']);
    }

    public function test_store_fleet_revenue_prefers_sales_store_id_when_present()
    {
        $ownerA = $this->makeStoreOwner();
        $storeA = Store::create([
            'user_id' => $ownerA->id,
            'name' => 'Store A',
            'device_id' => 'TEST-'.uniqid(),
        ]);

        $ownerB = $this->makeStoreOwner();
        $storeB = Store::create([
            'user_id' => $ownerB->id,
            'name' => 'Store B',
            'device_id' => 'TEST-'.uniqid(),
        ]);

        // Cashier is store B's owner, but the sale is explicitly tagged to
        // store A (e.g. a staff account shared across a chain, or a device
        // mixup) — the explicit store_id must win over the cashier guess.
        $this->makeSale($ownerB, 8800, 'completed', storeId: $storeA->id);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/stores');

        $storeARow = collect($response->json('data'))->firstWhere('id', $storeA->id);
        $storeBRow = collect($response->json('data'))->firstWhere('id', $storeB->id);

        $this->assertSame('₦8,800', $storeARow['revenue']);
        $this->assertSame('₦0', $storeBRow['revenue']);
    }

    public function test_global_products_avg_price_reads_the_products_own_selling_price()
    {
        $owner = $this->makeStoreOwner();
        $product = Product::create([
            'name' => 'Paracetamol 500mg',
            'generic_name' => 'Paracetamol',
            'selling_price' => 750.50,
            'user_id' => $owner->id,
        ]);

        StockBatch::create([
            'product_id' => $product->id,
            'batch_number' => 'B-'.uniqid(),
            'quantity' => 40,
            'cost_price' => 400,
            'user_id' => $owner->id,
        ]);

        // Before the fix, this request 500'd with SQLSTATE[42S22]:
        // Unknown column 'selling_price' in 'field list' — getGlobalProducts
        // averaged that column against stock_batches, which doesn't have it.
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/products');

        $response->assertStatus(200);

        $productRow = collect($response->json('data'))->firstWhere('id', $product->id);
        $this->assertNotNull($productRow);
        $this->assertSame('₦750.50', $productRow['avgPrice']);
    }

    public function test_global_products_endpoint_does_not_crash_when_a_product_has_no_stock_batches()
    {
        $owner = $this->makeStoreOwner();
        Product::create([
            'name' => 'Vitamin C 1000mg',
            'selling_price' => 1200,
            'user_id' => $owner->id,
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/products');

        $response->assertStatus(200);
    }
}
