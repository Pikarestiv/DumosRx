<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the "staff/cashier users show 'Platform Admin' as
 * their store" bug (two surfaces: Platform Users list and Activity Log),
 * plus the "Roles filter doesn't actually filter" bug.
 *
 * Root cause: AdminService::getGlobalUsers() and ::getActivityLogs() both
 * resolved a user's store via User::store() (a hasOne(Store::class) with
 * the default inferred foreign key, i.e. "the store this user OWNS" —
 * stores.user_id = users.id), never via the user's own users.store_id
 * column ("the store this user is STAFF AT"). For any staff-tier user
 * (sales_staff, specialist, etc.), store() is always null, so both call
 * sites fell through to a 'Platform Admin' fallback meant only for users
 * with genuinely no store affiliation at all.
 *
 * Fix: added User::employerStore() (belongsTo(Store::class, 'store_id'))
 * and a getDisplayStoreAttribute() accessor that prefers the owned store,
 * then falls back to the employer store, then null — used by both
 * AdminService call sites.
 */
class AdminUsersStoreResolutionTest extends TestCase
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

    private function makeStoreOwner(string $storeName): array
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => uniqid(),
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $store = Store::create([
            'user_id' => $owner->id,
            'name' => $storeName,
            'device_id' => 'TEST-'.uniqid(),
        ]);

        return [$owner, $store];
    }

    /** @test */
    public function global_users_list_shows_a_staff_users_real_employer_store_not_platform_admin()
    {
        [$owner, $store] = $this->makeStoreOwner('Pikarestiv Stores');

        $cashier = User::create([
            'first_name' => 'Pika Store1',
            'last_name' => 'Cashier2',
            'email' => 'cashier-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $store->id,
        ]);

        // Sanity: the cashier owns no store of their own (the bug's root
        // cause is that store() is null here despite a real store_id).
        $this->assertNull($cashier->fresh()->store);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users');

        $response->assertStatus(200);

        $row = collect($response->json('data'))->firstWhere('id', $cashier->id);
        $this->assertNotNull($row);
        $this->assertSame('Pikarestiv Stores', $row['store']);
        $this->assertNotSame('Platform Admin', $row['store']);
    }

    /** @test */
    public function global_users_list_still_shows_a_real_store_owners_owned_store()
    {
        [$owner, $store] = $this->makeStoreOwner('Owner Store');

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users');

        $response->assertStatus(200);

        $row = collect($response->json('data'))->firstWhere('id', $owner->id);
        $this->assertNotNull($row);
        $this->assertSame('Owner Store', $row['store']);
    }

    /** @test */
    public function global_users_list_still_falls_back_to_platform_admin_for_a_user_with_no_store_at_all()
    {
        // The super_admin fixture itself owns no store and has no store_id.
        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users');

        $response->assertStatus(200);

        $row = collect($response->json('data'))->firstWhere('id', $this->superAdmin->id);
        $this->assertNotNull($row);
        $this->assertSame('Platform Admin', $row['store']);
    }

    /** @test */
    public function activity_log_shows_a_staff_users_real_employer_store_not_platform()
    {
        [$owner, $store] = $this->makeStoreOwner('Pikarestiv Stores');

        $cashier = User::create([
            'first_name' => 'Pika Store 1',
            'last_name' => 'Cashier 1',
            'email' => 'cashier-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $store->id,
        ]);

        \App\Models\ActivityLog::create([
            'user_id' => $cashier->id,
            'action' => 'LOGIN',
            'description' => 'Cashier logged in',
        ]);

        $response = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/activity-logs');

        $response->assertStatus(200);

        $row = collect($response->json('data'))->firstWhere('user.id', $cashier->id);
        $this->assertNotNull($row);
        $this->assertNotNull($row['store']);
        $this->assertSame('Pikarestiv Stores', $row['store']['name']);
    }

    /** @test */
    public function roles_filter_narrows_the_global_users_list_to_the_requested_role()
    {
        [$owner, $store] = $this->makeStoreOwner('Filter Store');

        User::create([
            'first_name' => 'Cashier',
            'last_name' => 'One',
            'email' => 'cashier-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'sales_staff',
            'store_id' => $store->id,
        ]);

        // Unfiltered: super admin + owner + cashier = 3 users.
        $unfiltered = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users');
        $unfiltered->assertStatus(200);
        $this->assertCount(3, $unfiltered->json('data'));

        // Filtered to store_owner: only the owner.
        $filtered = $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/users?role=store_owner');
        $filtered->assertStatus(200);
        $rows = $filtered->json('data');
        $this->assertCount(1, $rows);
        $this->assertSame('store_owner', $rows[0]['role_slug']);
        $this->assertSame($owner->id, $rows[0]['id']);
    }
}
