<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminRoleControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $this->superAdmin = $this->makeUser('super_admin', Role::where('slug', 'super_admin')->value('id'));

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_lists_roles_via_the_api(): void
    {
        $this->actingAs($this->superAdmin)
            ->getJson('/api/v1/admin/roles')
            ->assertOk()
            ->assertJsonStructure(['roles']);
    }

    public function test_creates_a_custom_role_via_the_api(): void
    {
        $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/roles', ['name' => 'Support Lead', 'permissions' => ['view_platform_data']])
            ->assertCreated()
            ->assertJsonPath('role.slug', 'support_lead');
    }

    public function test_rejects_a_non_catalog_permission_on_create(): void
    {
        $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/roles', ['name' => 'Bad Role', 'permissions' => ['manage_platform']])
            ->assertStatus(422);
    }

    public function test_updates_a_roles_permissions_via_the_api(): void
    {
        $this->actingAs($this->superAdmin)
            ->putJson('/api/v1/admin/roles/agent/permissions', ['permissions' => ['view_platform_data']])
            ->assertOk();
    }

    public function test_deletes_an_unused_custom_role_via_the_api(): void
    {
        $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/roles', ['name' => 'Temp', 'permissions' => []]);

        $this->actingAs($this->superAdmin)
            ->deleteJson('/api/v1/admin/roles/temp')
            ->assertOk();
    }

    public function test_sets_a_user_permission_override_via_the_api(): void
    {
        $target = $this->makeUser('agent', Role::where('slug', 'agent')->value('id'));

        $this->actingAs($this->superAdmin)
            ->putJson("/api/v1/admin/users/{$target->id}/permission-overrides", [
                'overrides' => ['impersonate_store' => true],
            ])
            ->assertOk();

        $this->assertTrue($target->fresh()->hasPermission('impersonate_store'));
    }

    public function test_forbids_a_platform_admin_from_reaching_any_of_these_5_endpoints(): void
    {
        $platformAdmin = $this->makeUser('platform_admin', Role::where('slug', 'platform_admin')->value('id'));
        $agent = $this->makeUser('agent', Role::where('slug', 'agent')->value('id'));

        $this->actingAs($platformAdmin)
            ->getJson('/api/v1/admin/roles')
            ->assertForbidden();

        $this->actingAs($platformAdmin)
            ->postJson('/api/v1/admin/roles', ['name' => 'x', 'permissions' => []])
            ->assertForbidden();

        $this->actingAs($platformAdmin)
            ->putJson('/api/v1/admin/roles/agent/permissions', ['permissions' => ['view_platform_data']])
            ->assertForbidden();

        $this->actingAs($platformAdmin)
            ->deleteJson('/api/v1/admin/roles/agent')
            ->assertForbidden();

        $this->actingAs($platformAdmin)
            ->putJson("/api/v1/admin/users/{$agent->id}/permission-overrides", [
                'overrides' => ['impersonate_store' => true],
            ])
            ->assertForbidden();
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
