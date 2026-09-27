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
                    'limits' => ['stores' => -1],
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
}
