<?php

namespace Tests\Feature;

use App\Models\PermissionGroup;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionGroupPrivilegeEscalationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        \Illuminate\Support\Facades\Schema::disableForeignKeyConstraints();
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
        \App\Models\SystemConfig::setVal('subscription_plans', [
            'tiers' => [
                'free' => [
                    'features' => ['cloud_sync' => true],
                    'limits' => ['stores' => -1, 'staff' => -1],
                ],
            ],
        ]);
        $this->withoutMiddleware();
        \Illuminate\Support\Facades\Schema::enableForeignKeyConstraints();
    }

    private function makeStore(): Store
    {
        $owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'PG',
            'email' => 'owner-pgesc-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        return Store::create([
            'user_id' => $owner->id,
            'name' => 'Store PG Escalation',
            'email' => 'store-pgesc-' . uniqid() . '@dumosrx.com',
            'phone' => '1234567890',
            'address' => '123 Test St',
            'store_slug' => 'store-pgesc-' . uniqid(),
            'device_id' => 'WEB-PGESC-' . uniqid(),
        ]);
    }

    public function test_a_non_admin_cannot_push_a_permission_groups_edit_granting_a_permission_they_do_not_hold(): void
    {
        $store = $this->makeStore();
        $ownGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Sales Staff', 'based_on_role' => 'sales_staff',
            'is_default' => true, 'permissions' => ['process_sales'],
        ]);
        $targetGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Manager', 'based_on_role' => 'manager',
            'is_default' => true, 'permissions' => ['process_sales'],
        ]);
        $cashier = User::create([
            'first_name' => 'Cashier', 'last_name' => 'PG',
            'email' => 'cashier-pgesc-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $store->id, 'permission_group_id' => $ownGroup->id,
        ]);

        $response = $this->actingAs($cashier)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'permission_groups',
                'operation' => 'UPDATE',
                'record_id' => $targetGroup->id,
                'payload' => [
                    'id' => $targetGroup->id,
                    'permissions' => ['process_sales', 'manage_staff', 'factory_reset'],
                    '_synced' => 0,
                ],
            ]],
        ]);

        $response->assertStatus(200);
        $this->assertNotEmpty($response->json('failed'));
        $this->assertEquals(['process_sales'], $targetGroup->fresh()->permissions);
    }

    /**
     * Documents PRE-EXISTING protection, not something this test file's
     * production changes add: permission_group_id was never added to
     * USER_SYNC_SELF_ALLOWED_FIELDS (a positive allow-list), so a self-edit
     * already can't set it - sanitizeUserSyncPayload's isSelf branch strips
     * anything not on that list. Kept as regression coverage against a
     * future accidental addition to that list, not proof of new behavior.
     * (permission_group_id is deliberately NOT added to
     * USER_SYNC_FORBIDDEN_FIELDS, unlike role_id - see the next test for
     * why: that list strips unconditionally, including for a manage_staff
     * caller legitimately editing ANOTHER user's row, which would break
     * the staff form's own Group assignment feature.)
     */
    public function test_a_user_cannot_self_assign_permission_group_id_via_their_own_sync_push(): void
    {
        $store = $this->makeStore();
        $group = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Sales Staff', 'based_on_role' => 'sales_staff',
            'is_default' => true, 'permissions' => ['process_sales'],
        ]);
        $adminGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Admin', 'based_on_role' => 'admin',
            'is_default' => true, 'permissions' => ['process_sales', 'manage_staff', 'factory_reset'],
        ]);
        $cashier = User::create([
            'first_name' => 'Cashier', 'last_name' => 'PG2',
            'email' => 'cashier-pgesc2-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $store->id, 'permission_group_id' => $group->id,
        ]);

        $this->actingAs($cashier)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'users',
                'operation' => 'UPDATE',
                'record_id' => $cashier->id,
                'payload' => ['id' => $cashier->id, 'permission_group_id' => $adminGroup->id, '_synced' => 0],
            ]],
        ])->assertStatus(200);

        $this->assertEquals($group->id, $cashier->fresh()->permission_group_id);
    }

    public function test_an_owner_can_still_assign_another_staff_members_permission_group_via_sync(): void
    {
        $store = $this->makeStore();
        $owner = User::where('id', $store->user_id)->first();
        $salesGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Sales Staff', 'based_on_role' => 'sales_staff',
            'is_default' => true, 'permissions' => ['process_sales'],
        ]);
        $managerGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Manager', 'based_on_role' => 'manager',
            'is_default' => true, 'permissions' => ['process_sales', 'manage_staff'],
        ]);
        $cashier = User::create([
            'first_name' => 'Cashier', 'last_name' => 'PG3',
            'email' => 'cashier-pgesc3-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $store->id, 'permission_group_id' => $salesGroup->id,
        ]);

        $this->actingAs($owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'users',
                'operation' => 'UPDATE',
                'record_id' => $cashier->id,
                'payload' => [
                    'id' => $cashier->id, 'role' => 'manager',
                    'permission_group_id' => $managerGroup->id, '_synced' => 0,
                ],
            ]],
        ])->assertStatus(200);

        $this->assertEquals($managerGroup->id, $cashier->fresh()->permission_group_id);
    }

    /**
     * Final review, Important I2: renaming a default group and flipping
     * is_default to false was previously accepted from any authenticated
     * store member, regardless of privilege - the sanitizer only ever
     * inspected the `permissions` key.
     */
    public function test_renaming_or_flipping_is_default_on_a_default_group_is_rejected(): void
    {
        $store = $this->makeStore();
        $managerRoleGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Manager', 'based_on_role' => 'manager',
            'is_default' => true, 'permissions' => ['process_sales', 'manage_staff', 'manage_roles_permissions'],
        ]);
        $manager = User::create([
            'first_name' => 'Manager', 'last_name' => 'PG4',
            'email' => 'manager-pgesc4-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'manager', 'store_id' => $store->id, 'permission_group_id' => $managerRoleGroup->id,
        ]);

        $response = $this->actingAs($manager)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'permission_groups',
                'operation' => 'UPDATE',
                'record_id' => $managerRoleGroup->id,
                'payload' => [
                    'id' => $managerRoleGroup->id,
                    'name' => 'PWNED',
                    'is_default' => false,
                    '_synced' => 0,
                ],
            ]],
        ]);

        $response->assertStatus(200);
        $fresh = $managerRoleGroup->fresh();
        $this->assertEquals('Manager', $fresh->name);
        $this->assertTrue((bool) $fresh->is_default);
    }

    public function test_deleting_a_default_group_is_rejected_even_with_no_staff_assigned(): void
    {
        $store = $this->makeStore();
        $owner = User::where('id', $store->user_id)->first();
        $defaultGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Auditor', 'based_on_role' => 'auditor',
            'is_default' => true, 'permissions' => ['view_reports'],
        ]);

        $response = $this->actingAs($owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'permission_groups',
                'operation' => 'DELETE',
                'record_id' => $defaultGroup->id,
                'payload' => ['id' => $defaultGroup->id],
            ]],
        ]);

        $response->assertStatus(200);
        $this->assertNotEmpty($response->json('failed'));
        $this->assertDatabaseHas('permission_groups', ['id' => $defaultGroup->id]);
    }

    public function test_deleting_a_custom_group_with_assigned_staff_is_rejected_server_side(): void
    {
        $store = $this->makeStore();
        $owner = User::where('id', $store->user_id)->first();
        $customGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Supervisor', 'based_on_role' => 'manager',
            'is_default' => false, 'permissions' => ['process_sales'],
        ]);
        User::create([
            'first_name' => 'Staff', 'last_name' => 'PG5',
            'email' => 'staff-pgesc5-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'manager', 'store_id' => $store->id, 'permission_group_id' => $customGroup->id,
        ]);

        $response = $this->actingAs($owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'permission_groups',
                'operation' => 'DELETE',
                'record_id' => $customGroup->id,
                'payload' => ['id' => $customGroup->id],
            ]],
        ]);

        $response->assertStatus(200);
        $this->assertNotEmpty($response->json('failed'));
        $this->assertDatabaseHas('permission_groups', ['id' => $customGroup->id]);
    }

    public function test_deleting_an_unassigned_custom_group_by_a_privileged_actor_succeeds(): void
    {
        $store = $this->makeStore();
        $owner = User::where('id', $store->user_id)->first();
        $customGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Supervisor', 'based_on_role' => 'manager',
            'is_default' => false, 'permissions' => ['process_sales'],
        ]);

        $this->actingAs($owner)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'permission_groups',
                'operation' => 'DELETE',
                'record_id' => $customGroup->id,
                'payload' => ['id' => $customGroup->id],
            ]],
        ])->assertStatus(200);

        // PermissionGroup has no SoftDeletes trait (matches Feedback/other
        // non-trashed models in this app) - push()'s generic DELETE branch
        // hard-deletes it, same as every other model shaped this way.
        $this->assertDatabaseMissing('permission_groups', ['id' => $customGroup->id]);
    }

    /**
     * A staff member holding EVERY permission they're trying to grant
     * (so the escalation check alone wouldn't catch them) must still be
     * rejected if they don't hold manage_roles_permissions itself - that
     * permission is what gates touching the matrix at all, same as the
     * client-side matrix UI gates on it (useHasPermission("manage_roles_permissions")).
     */
    public function test_editing_permissions_requires_manage_roles_permissions_even_within_ones_own_held_set(): void
    {
        $store = $this->makeStore();
        $ownGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Sales Staff', 'based_on_role' => 'sales_staff',
            'is_default' => true, 'permissions' => ['process_sales'],
        ]);
        $targetGroup = PermissionGroup::create([
            'store_id' => $store->id, 'name' => 'Sales Staff Copy', 'based_on_role' => 'sales_staff',
            'is_default' => false, 'permissions' => ['process_sales'],
        ]);
        $cashier = User::create([
            'first_name' => 'Cashier', 'last_name' => 'PG6',
            'email' => 'cashier-pgesc6-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $store->id, 'permission_group_id' => $ownGroup->id,
        ]);

        $response = $this->actingAs($cashier)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'permission_groups',
                'operation' => 'UPDATE',
                'record_id' => $targetGroup->id,
                'payload' => [
                    'id' => $targetGroup->id,
                    // Not escalating - "process_sales" is exactly what the
                    // cashier's own group already grants.
                    'permissions' => ['process_sales'],
                    '_synced' => 0,
                ],
            ]],
        ]);

        $response->assertStatus(200);
        $this->assertNotEmpty($response->json('failed'));
    }

    /**
     * Legitimate first-time seeding (ensurePermissionGroupsSeeded,
     * client core.ts) fires from ANY authenticated user's login, not
     * just an owner's - a fresh device's first user could be a cashier.
     * That must keep working even though a cashier holds neither
     * manage_roles_permissions nor most of the permissions a higher-tier
     * default group (e.g. Admin) legitimately contains.
     */
    public function test_first_time_default_group_seeding_by_a_low_privilege_user_is_still_allowed(): void
    {
        $store = $this->makeStore();
        $cashier = User::create([
            'first_name' => 'Cashier', 'last_name' => 'PG7',
            'email' => 'cashier-pgesc7-' . uniqid() . '@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'sales_staff', 'store_id' => $store->id,
        ]);
        // A fresh device's first user could be a cashier - a low-privilege
        // user's very first sync must still succeed and leave the store
        // with its default groups, not get blocked for lacking
        // manage_roles_permissions on a group it never even asked to edit.
        // Server-side seeding (PermissionGroupSeeder, final review I4) now
        // runs before any change in the push is processed, so by the time
        // this cashier's own push is evaluated the store's 5 default groups
        // already exist with deterministic ids - the same ids this
        // cashier's own client would derive locally, collapsing rather than
        // conflicting.
        $expectedAdminId = \App\Services\PermissionGroupSeeder::deterministicDefaultGroupId($store->id, 'admin');

        $response = $this->actingAs($cashier)->postJson('/api/v1/app/sync/push', [
            'setup' => true,
            'changes' => [[
                'table_name' => 'permission_groups',
                'operation' => 'UPDATE',
                'record_id' => $expectedAdminId,
                'payload' => [
                    'id' => $expectedAdminId,
                    '_synced' => 0,
                ],
            ]],
        ]);

        $response->assertStatus(200);
        $this->assertDatabaseHas('permission_groups', ['id' => $expectedAdminId, 'name' => 'Admin', 'store_id' => $store->id]);
    }
}
