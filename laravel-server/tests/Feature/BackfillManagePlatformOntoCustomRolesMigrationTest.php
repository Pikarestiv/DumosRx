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

    public function test_backfill_does_not_touch_built_in_system_roles(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);
        $agent = Role::where('slug', 'agent')->firstOrFail();
        $before = $agent->permissions->pluck('slug')->sort()->values()->all();

        (require database_path('migrations/2026_10_02_000004_backfill_manage_platform_onto_custom_roles.php'))->up();

        $after = $agent->fresh('permissions')->permissions->pluck('slug')->sort()->values()->all();
        $this->assertSame($before, $after);
    }
}
