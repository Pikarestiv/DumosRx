<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for ActivityLogController::index() resolving the
 * tenant via the CALLER's own id (Store::where('user_id', $admin->id))
 * instead of ScopesToTenant::tenantOwnerId(). A store owner calling GET
 * /logs happened to work by coincidence (owner IS the tenant), but
 * 'manager'/'auditor' staff roles also hold the `view_reports` permission
 * this route requires, and a staff user never owns a Store row - so for
 * them the query silently fell through to "only my own actions" instead of
 * "the store's activity log (owner + all staff)" the endpoint's own doc
 * comment promises. Found while adding TenantScopingArchitectureTest.
 */
class ActivityLogTenantScopingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_staff_member_sees_the_full_store_log_not_just_their_own_actions(): void
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Store A',
            'store_slug' => 'store-a',
            'device_id' => 'WEB-A',
        ]);

        $manager = User::create([
            'first_name' => 'Manager', 'last_name' => 'A',
            'email' => 'manager@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'manager', 'store_id' => $store->id,
        ]);

        $otherStaff = User::create([
            'first_name' => 'Cashier', 'last_name' => 'A',
            'email' => 'cashier@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $store->id,
        ]);

        ActivityLog::create(['user_id' => $owner->id, 'action' => 'OWNER_ACTION', 'table_name' => 'products', 'record_id' => 'p1']);
        ActivityLog::create(['user_id' => $manager->id, 'action' => 'MANAGER_ACTION', 'table_name' => 'products', 'record_id' => 'p2']);
        ActivityLog::create(['user_id' => $otherStaff->id, 'action' => 'CASHIER_ACTION', 'table_name' => 'sales', 'record_id' => 's1']);

        $response = $this->actingAs($manager)->getJson('/api/v1/logs');

        $response->assertStatus(200);
        $actions = collect($response->json('data'))->pluck('action')->all();
        $this->assertContains('OWNER_ACTION', $actions);
        $this->assertContains('MANAGER_ACTION', $actions);
        $this->assertContains('CASHIER_ACTION', $actions);
    }

    public function test_excludes_another_stores_activity_log_entries(): void
    {
        $ownerA = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'ownerA@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        Store::create(['user_id' => $ownerA->id, 'name' => 'Store A', 'store_slug' => 'store-a', 'device_id' => 'WEB-A']);

        $ownerB = User::create([
            'first_name' => 'Owner', 'last_name' => 'B',
            'email' => 'ownerB@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        Store::create(['user_id' => $ownerB->id, 'name' => 'Store B', 'store_slug' => 'store-b', 'device_id' => 'WEB-B']);

        ActivityLog::create(['user_id' => $ownerA->id, 'action' => 'OWNER_A_ACTION', 'table_name' => 'products', 'record_id' => 'p1']);
        ActivityLog::create(['user_id' => $ownerB->id, 'action' => 'OWNER_B_ACTION', 'table_name' => 'products', 'record_id' => 'p2']);

        $response = $this->actingAs($ownerA)->getJson('/api/v1/logs');

        $response->assertStatus(200);
        $actions = collect($response->json('data'))->pluck('action')->all();
        $this->assertContains('OWNER_A_ACTION', $actions);
        $this->assertNotContains('OWNER_B_ACTION', $actions);
    }
}
