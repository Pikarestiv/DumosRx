<?php

namespace Tests\Feature;

use App\Models\Coupon;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the remaining "apiResource registered a route
 * whose controller method didn't exist" fixes (Staff, Store, Sale — 500
 * before the fix), plus CouponController::update(), which was fully
 * implemented but had no route wired to it at all.
 */
class CrudFixesTest extends TestCase
{
    use RefreshDatabase;

    protected User $ownerA;
    protected Store $storeA;
    protected User $ownerB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->ownerA = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'ownerA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->storeA = Store::create([
            'user_id' => $this->ownerA->id, 'name' => 'Store A',
            'store_slug' => 'store-a', 'device_id' => 'WEB-A',
        ]);

        $this->ownerB = User::create([
            'first_name' => 'Owner', 'last_name' => 'B',
            'email' => 'ownerB@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    // ---- Staff ----

    public function test_staff_show_returns_own_store_staff_member()
    {
        $staff = User::create([
            'first_name' => 'Staff', 'last_name' => 'A',
            'email' => 'staffA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $this->storeA->id,
        ]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/staff/{$staff->id}");

        $response->assertStatus(200);
    }

    public function test_staff_show_404s_for_a_staff_member_outside_callers_scope()
    {
        $foreignStaff = User::create([
            'first_name' => 'Staff', 'last_name' => 'B',
            'email' => 'staffB@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'user_id' => null,
        ]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/staff/{$foreignStaff->id}");

        $response->assertStatus(404);
    }

    // ---- Stores ----

    public function test_store_show_returns_the_callers_own_store()
    {
        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/stores/{$this->storeA->id}");

        $response->assertStatus(200);
        $response->assertJson(['id' => $this->storeA->id]);
    }

    public function test_store_show_404s_for_another_owners_store()
    {
        $storeB = Store::create([
            'user_id' => $this->ownerB->id, 'name' => 'Store B',
            'store_slug' => 'store-b', 'device_id' => 'WEB-B',
        ]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/stores/{$storeB->id}");

        $response->assertStatus(404);
    }

    // ---- Sales ----

    public function test_sale_index_no_longer_errors_on_missing_cashier_relation()
    {
        Sale::create([
            'transaction_number' => 'INV-001', 'cashier_id' => $this->ownerA->id,
            'subtotal' => 100, 'total_amount' => 100, 'amount_paid' => 100, 'payment_method' => 'cash',
            'transaction_date' => now(),
        ]);

        $response = $this->actingAs($this->ownerA)->getJson('/api/v1/app/sales');

        $response->assertStatus(200);
    }

    public function test_sale_show_returns_a_sale_scoped_to_caller()
    {
        $sale = Sale::create([
            'transaction_number' => 'INV-002', 'cashier_id' => $this->ownerA->id,
            'subtotal' => 100, 'total_amount' => 100, 'amount_paid' => 100, 'payment_method' => 'cash',
            'transaction_date' => now(),
        ]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/app/sales/{$sale->id}");

        $response->assertStatus(200);
    }

    public function test_sale_show_404s_for_another_stores_sale()
    {
        $foreignSale = Sale::create([
            'transaction_number' => 'INV-003', 'cashier_id' => $this->ownerB->id,
            'subtotal' => 100, 'total_amount' => 100, 'amount_paid' => 100, 'payment_method' => 'cash',
            'transaction_date' => now(),
        ]);

        $response = $this->actingAs($this->ownerA)->getJson("/api/v1/app/sales/{$foreignSale->id}");

        $response->assertStatus(404);
    }

    public function test_sales_daily_and_top_products_routes_are_not_swallowed_by_the_sale_wildcard()
    {
        $this->actingAs($this->ownerA)->getJson('/api/v1/app/sales/daily')->assertStatus(200);
        $this->actingAs($this->ownerA)->getJson('/api/v1/app/sales/top-products')->assertStatus(200);
    }

    // ---- Coupons ----

    public function test_coupon_update_route_is_wired_up()
    {
        $coupon = Coupon::create([
            'code' => 'SAVE10', 'type' => 'discount_percent', 'value' => 10,
            'created_by' => $this->ownerA->id,
        ]);

        $response = $this->actingAs($this->ownerA)->putJson("/api/v1/admin/coupons/{$coupon->id}", [
            'code' => 'SAVE20', 'type' => 'discount_percent', 'value' => 20,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('coupons', ['id' => $coupon->id, 'code' => 'SAVE20', 'value' => 20]);
    }
}
