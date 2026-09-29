<?php

namespace Tests\Feature;

use App\Models\Coupon;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the remaining "apiResource registered a route
 * whose controller method didn't exist" fixes (Staff, Store — 500 before
 * the fix), plus CouponController::update(), which was fully implemented
 * but had no route wired to it at all. The Sale cases that lived here went
 * with the /app/sales routes themselves (A-19, docs/FIXED_BUGS.md).
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

    // ---- Coupons ----

    public function test_coupon_update_route_is_wired_up()
    {
        // Coupon routes are role:super_admin, so the actor has to be one.
        // This test used to run as a store_owner and pass purely because the
        // route had nothing but the group's manage_platform check on it.
        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $coupon = Coupon::create([
            'code' => 'SAVE10', 'type' => 'discount_percent', 'value' => 10,
            'created_by' => $superAdmin->id,
        ]);

        $response = $this->actingAs($superAdmin)->putJson("/api/v1/admin/coupons/{$coupon->id}", [
            'code' => 'SAVE20', 'type' => 'discount_percent', 'value' => 20,
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('coupons', ['id' => $coupon->id, 'code' => 'SAVE20', 'value' => 20]);
    }

    public function test_coupon_update_is_refused_for_a_non_super_admin_platform_role()
    {
        // The actual point of the route:super_admin gate - an agent holds
        // manage_platform and would otherwise be able to mint/rewrite coupons.
        $agent = User::create([
            'first_name' => 'Field', 'last_name' => 'Agent',
            'email' => 'agent@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'agent',
        ]);

        $coupon = Coupon::create([
            'code' => 'SAVE10', 'type' => 'discount_percent', 'value' => 10,
            'created_by' => $agent->id,
        ]);

        $this->actingAs($agent)
            ->putJson("/api/v1/admin/coupons/{$coupon->id}", [
                'code' => 'SAVE20', 'type' => 'discount_percent', 'value' => 20,
            ])
            ->assertStatus(403);

        $this->assertDatabaseHas('coupons', ['id' => $coupon->id, 'code' => 'SAVE10']);
    }
}
