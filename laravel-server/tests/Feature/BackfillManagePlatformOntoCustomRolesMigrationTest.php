<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the 2026_10_02_000004 migration: a custom platform
 * role created before this fix landed has no manage_platform grant and is
 * locked out of every /admin route, since createRole() only started
 * attaching it going forward. The migration must backfill existing rows.
 */
class BackfillManagePlatformOntoCustomRolesMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_backfill_grants_manage_platform_to_a_pre_existing_custom_role_that_lacks_it(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $role = Role::create(['name' => 'Legacy Custom Role', 'slug' => 'legacy_custom_role', 'is_system' => false]);
        $managePlatform = Permission::where('slug', 'manage_platform')->firstOrFail();
        $role->permissions()->detach($managePlatform->id);

        $this->assertNotContains('manage_platform', $role->fresh('permissions')->permissions->pluck('slug')->all());

        (require database_path('migrations/2026_10_02_000004_backfill_manage_platform_onto_custom_roles.php'))->up();

        $this->assertContains('manage_platform', $role->fresh('permissions')->permissions->pluck('slug')->all());
    }

    public function test_backfill_does_not_grant_manage_platform_to_a_system_role_that_lacks_it(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $agent = Role::where('slug', 'agent')->firstOrFail();
        $managePlatform = Permission::where('slug', 'manage_platform')->firstOrFail();
        $agent->permissions()->detach($managePlatform->id);

        (require database_path('migrations/2026_10_02_000004_backfill_manage_platform_onto_custom_roles.php'))->up();

        $this->assertNotContains('manage_platform', $agent->fresh('permissions')->permissions->pluck('slug')->all());
    }

    public function test_down_detaches_manage_platform_only_from_custom_roles(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $role = Role::create(['name' => 'Legacy Custom Role', 'slug' => 'legacy_custom_role', 'is_system' => false]);
        $managePlatform = Permission::where('slug', 'manage_platform')->firstOrFail();
        $role->permissions()->syncWithoutDetaching($managePlatform->id);
        $agent = Role::where('slug', 'agent')->firstOrFail();

        (require database_path('migrations/2026_10_02_000004_backfill_manage_platform_onto_custom_roles.php'))->down();

        $this->assertNotContains('manage_platform', $role->fresh('permissions')->permissions->pluck('slug')->all());
        $this->assertContains('manage_platform', $agent->fresh('permissions')->permissions->pluck('slug')->all());
    }
}
