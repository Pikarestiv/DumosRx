<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Store;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DelegatedRouteAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'owner-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);

        $this->store = Store::create([
            'user_id' => $owner->id,
            'name' => 'Test Pharmacy',
            'device_id' => 'TEST-'.uniqid(),
            'status' => 'Active',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_lets_an_agent_view_the_stores_list_has_view_platform_data_by_default()
    {
        $agent = $this->actingAsRole('agent');

        $this->actingAs($agent)
            ->getJson('/api/v1/admin/stores')
            ->assertOk();
    }

    public function test_forbids_an_agent_from_suspending_a_store_lacks_manage_account_status_by_default()
    {
        $agent = $this->actingAsRole('agent');

        $this->actingAs($agent)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/suspend")
            ->assertForbidden();
    }

    public function test_lets_a_platform_admin_suspend_a_store_has_manage_account_status_by_default()
    {
        $platformAdmin = $this->actingAsRole('platform_admin');

        $this->actingAs($platformAdmin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/suspend")
            ->assertOk();
    }

    public function test_forbids_a_platform_admin_from_impersonating_with_the_permission_explicitly_revoked()
    {
        $platformAdmin = $this->actingAsRole('platform_admin');
        $permission = Permission::where('slug', 'impersonate_store')->first();
        $platformAdmin->permissions()->attach($permission->id, ['granted' => false]);

        $this->actingAs($platformAdmin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/impersonate")
            ->assertForbidden();
    }

    public function test_still_forbids_delete_user_for_a_platform_admin_granted_every_one_of_the_5_delegatable_permissions()
    {
        $target = User::create([
            'first_name' => 'Target', 'last_name' => 'User',
            'email' => 'target-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);
        $platformAdmin = $this->actingAsRole('platform_admin', User::DELEGATABLE_PERMISSIONS);

        $this->actingAs($platformAdmin)
            ->deleteJson("/api/v1/admin/users/{$target->id}")
            ->assertForbidden();
    }

    public function test_super_admin_can_still_do_everything_regardless_of_permission_role_or_permission_user_state()
    {
        $superAdmin = $this->actingAsRole('super_admin');

        $this->actingAs($superAdmin)
            ->getJson('/api/v1/admin/stores')
            ->assertOk();

        $this->actingAs($superAdmin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/suspend")
            ->assertOk();
    }

    private function actingAsRole(string $roleSlug, array $extraPermissionSlugs = []): User
    {
        $role = Role::where('slug', $roleSlug)->firstOrFail();
        $user = User::create([
            'first_name' => 'Test', 'last_name' => ucfirst($roleSlug),
            'email' => $roleSlug.'-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => $roleSlug, 'role_id' => $role->id, 'is_active' => true,
        ]);

        if ($extraPermissionSlugs) {
            $ids = Permission::whereIn('slug', $extraPermissionSlugs)->pluck('id');
            $user->permissions()->attach($ids->mapWithKeys(fn ($id) => [$id => ['granted' => true]]));
        }

        return $user;
    }
}
