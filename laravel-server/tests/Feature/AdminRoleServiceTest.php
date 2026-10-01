<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminRoleService;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class AdminRoleServiceTest extends TestCase
{
    use RefreshDatabase;

    private AdminRoleService $service;
    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $this->service = app(AdminRoleService::class);
        $this->actor = $this->makeUser('super_admin', Role::where('slug', 'super_admin')->value('id'));
    }

    public function test_lists_platform_roles_with_only_catalog_permissions_and_a_user_count(): void
    {
        $agentRole = Role::where('slug', 'agent')->first();
        $this->makeUser('agent', $agentRole->id);
        $this->makeUser('agent', $agentRole->id);

        $roles = $this->service->listRoles();
        $platformAdmin = collect($roles)->firstWhere('slug', 'platform_admin');
        $agent = collect($roles)->firstWhere('slug', 'agent');

        $this->assertContains('manage_account_status', $platformAdmin['permissions']->all());
        $this->assertNotContains('manage_platform', $platformAdmin['permissions']->all());
        $this->assertSame(2, $agent['user_count']);
    }

    public function test_never_lists_super_admin_in_the_matrix_since_its_checkboxes_have_no_runtime_effect(): void
    {
        $slugs = collect($this->service->listRoles())->pluck('slug')->all();

        $this->assertNotContains('super_admin', $slugs);
        $this->assertContains('platform_admin', $slugs);
        $this->assertContains('agent', $slugs);
    }

    public function test_refuses_to_edit_super_admins_permission_role_rows_at_all(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->updateRolePermissions('super_admin', ['view_platform_data'], $this->actor->id);
    }

    public function test_rejects_a_role_name_whose_derived_slug_would_be_empty(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->createRole('!!! ???', ['view_platform_data'], $this->actor->id);
    }

    public function test_does_not_rewrite_an_existing_overrides_created_at_when_it_changes(): void
    {
        $target = $this->makeUser('platform_admin', Role::where('slug', 'platform_admin')->value('id'));
        $this->service->setUserPermissionOverride($target->id, 'impersonate_store', true, $this->actor->id);

        $permissionId = \App\Models\Permission::where('slug', 'impersonate_store')->value('id');
        \Illuminate\Support\Facades\DB::table('permission_user')
            ->where('user_id', $target->id)->where('permission_id', $permissionId)
            ->update(['created_at' => '2026-01-01 00:00:00']);

        $this->service->setUserPermissionOverride($target->id, 'impersonate_store', false, $this->actor->id);

        $row = \Illuminate\Support\Facades\DB::table('permission_user')
            ->where('user_id', $target->id)->where('permission_id', $permissionId)->first();

        $this->assertStringStartsWith('2026-01-01 00:00:00', (string) $row->created_at);
        $this->assertSame(0, (int) $row->granted);
    }

    public function test_updates_a_roles_permissions_without_touching_its_non_catalog_permissions(): void
    {
        $role = $this->service->updateRolePermissions('agent', ['view_platform_data'], $this->actor->id);
        $slugs = $role->permissions->pluck('slug')->all();

        $this->assertContains('view_platform_data', $slugs);
        $this->assertContains('manage_platform', $slugs);
        $this->assertContains('create_accounts', $slugs);
        $this->assertNotContains('send_notifications', $slugs);
    }

    public function test_rejects_a_permission_outside_the_5_slug_catalog(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->updateRolePermissions('agent', ['manage_platform'], $this->actor->id);
    }

    public function test_logs_a_role_permissions_updated_activity_entry_with_a_before_after_diff(): void
    {
        $this->service->updateRolePermissions('agent', ['view_platform_data'], $this->actor->id);

        $log = ActivityLog::where('action', 'ROLE_PERMISSIONS_UPDATED')->latest('id')->first();

        $this->assertNotNull($log);
        $this->assertSame(['view_platform_data'], $log->properties['after']);
    }

    public function test_creates_a_custom_role_scoped_to_the_catalog(): void
    {
        $role = $this->service->createRole('Support Lead', ['view_platform_data', 'send_notifications'], $this->actor->id);

        $this->assertFalse($role->is_system);
        $this->assertSame('support_lead', $role->slug);
        $this->assertEqualsCanonicalizing(['view_platform_data', 'send_notifications'], $role->permissions->pluck('slug')->all());
    }

    public function test_refuses_to_delete_a_system_role(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->deleteRole('platform_admin', $this->actor->id);
    }

    public function test_refuses_to_delete_a_custom_role_that_still_has_an_assigned_user(): void
    {
        $role = $this->service->createRole('Billing Agent', ['view_platform_data'], $this->actor->id);
        $this->makeUser('billing_agent', $role->id);

        $this->expectException(ValidationException::class);

        $this->service->deleteRole('billing_agent', $this->actor->id);
    }

    public function test_refuses_to_delete_a_custom_role_held_only_via_the_legacy_role_string_column(): void
    {
        $this->service->createRole('Legacy Holdout', ['view_platform_data'], $this->actor->id);
        $this->makeUser('legacy_holdout');

        $this->expectException(ValidationException::class);

        $this->service->deleteRole('legacy_holdout', $this->actor->id);
    }

    public function test_rejects_updating_permissions_on_a_store_level_role(): void
    {
        $this->expectException(ValidationException::class);

        $this->service->updateRolePermissions('admin', ['view_platform_data'], $this->actor->id);
    }

    public function test_deletes_a_custom_role_once_no_user_holds_it(): void
    {
        $this->service->createRole('Temp Role', ['view_platform_data'], $this->actor->id);
        $this->service->deleteRole('temp_role', $this->actor->id);

        $this->assertFalse(Role::where('slug', 'temp_role')->exists());
    }

    public function test_grants_revokes_and_clears_a_per_user_permission_override(): void
    {
        $agentRole = Role::where('slug', 'agent')->first();
        $user = $this->makeUser('agent', $agentRole->id);

        $this->service->setUserPermissionOverride($user->id, 'impersonate_store', true, $this->actor->id);
        $this->assertTrue($user->fresh()->hasPermission('impersonate_store'));

        $this->service->setUserPermissionOverride($user->id, 'view_platform_data', false, $this->actor->id);
        $this->assertFalse($user->fresh()->hasPermission('view_platform_data'));

        $this->service->setUserPermissionOverride($user->id, 'view_platform_data', null, $this->actor->id);
        $this->assertTrue($user->fresh()->hasPermission('view_platform_data'));
    }

    public function test_writes_an_activity_log_row_for_every_role_permission_mutation(): void
    {
        $this->service->createRole('Logged Role', ['view_platform_data'], $this->actor->id);
        $this->assertTrue(ActivityLog::where('action', 'PLATFORM_ROLE_CREATED')->exists());

        $this->service->deleteRole('logged_role', $this->actor->id);
        $this->assertTrue(ActivityLog::where('action', 'PLATFORM_ROLE_DELETED')->exists());

        $user = $this->makeUser('agent', Role::where('slug', 'agent')->value('id'));
        $this->service->setUserPermissionOverride($user->id, 'impersonate_store', true, $this->actor->id);
        $this->assertTrue(ActivityLog::where('action', 'USER_PERMISSION_OVERRIDE_SET')->exists());
    }

    private function makeUser(string $role, ?string $roleId = null): User
    {
        $user = User::create([
            'first_name' => 'Test',
            'last_name' => ucfirst($role),
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
            'is_active' => true,
        ]);

        if ($roleId !== null) {
            $user->role_id = $roleId;
            $user->save();
        }

        return $user;
    }
}
