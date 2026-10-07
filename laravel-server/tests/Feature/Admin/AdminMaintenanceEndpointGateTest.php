<?php

namespace Tests\Feature\Admin;

use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Layer 1 of the spec's four. The nav item and the page guard are UX; this is
 * the control, and this is the most consequential action in the panel.
 */
class AdminMaintenanceEndpointGateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeAdmin(string $role): User
    {
        return User::create([
            'first_name' => 'Platform',
            'last_name' => 'Tester',
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    public function test_only_super_admin_may_read_the_migration_status(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/maintenance/migrations')->assertOk();

        foreach (['platform_admin', 'agent'] as $role) {
            $this->actingAs($this->makeAdmin($role))
                ->getJson('/api/v1/admin/maintenance/migrations')->assertStatus(403);
            $this->actingAs($this->makeAdmin($role))
                ->postJson('/api/v1/admin/maintenance/migrations/run')->assertStatus(403);
            $this->actingAs($this->makeAdmin($role))
                ->postJson('/api/v1/admin/maintenance/roles/sync')->assertStatus(403);
        }
    }

    /**
     * The A-141 shape. createRole() grants `manage_platform` itself, so this
     * role clears the outer admin group gate — the assertion makes that
     * explicit, so the 403 below is known to be `role:super_admin` answering
     * rather than the group gate short-circuiting.
     */
    public function test_a_custom_platform_role_is_refused(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $role = app(AdminRoleService::class)
            ->createRole('Ops Watcher', ['view_platform_data'], $this->makeAdmin('super_admin')->id);
        $slug = is_array($role) ? ($role['slug'] ?? '') : $role->slug;

        $this->assertContains(
            'manage_platform',
            Role::where('slug', $slug)->firstOrFail()->permissions->pluck('slug')->all(),
            'the gate under test is only exercised if the caller clears the admin group gate first'
        );

        $this->actingAs($this->makeAdmin($slug))
            ->getJson('/api/v1/admin/maintenance/migrations')->assertStatus(403);
        $this->actingAs($this->makeAdmin($slug))
            ->postJson('/api/v1/admin/maintenance/migrations/run')->assertStatus(403);
        $this->actingAs($this->makeAdmin($slug))
            ->postJson('/api/v1/admin/maintenance/roles/sync')->assertStatus(403);
    }

    public function test_the_status_payload_carries_what_the_panel_needs(): void
    {
        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/maintenance/migrations')
            ->assertOk()
            ->assertJsonStructure(['status', 'pending', 'pending_count', 'last_batch', 'error']);
    }

    /** The secret-in-a-query-string path this phase replaces (A-174). */
    public function test_the_retired_migrate_db_route_no_longer_exists(): void
    {
        $this->get('/migrate-db?key=anything')->assertNotFound();
    }
}
