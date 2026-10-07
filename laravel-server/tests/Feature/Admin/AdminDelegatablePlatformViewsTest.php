<?php

namespace Tests\Feature\Admin;

use App\Models\Role;
use App\Models\User;
use App\Services\Admin\AdminRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The read-only platform surfaces were hardcoded to `role:super_admin`, so no
 * amount of role configuration could let an operator see them. They are now
 * permissions, which is what makes "restrict actions, not visibility"
 * expressible in the roles UI.
 *
 * What is deliberately NOT converted is just as important: anything that can
 * grant a permission (roles, permission overrides) stays super_admin-only,
 * because a delegated admin who can edit roles can promote themselves. See
 * the escalation test at the bottom.
 */
class AdminDelegatablePlatformViewsTest extends TestCase
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

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);
    }

    private function makeAdmin(string $role): User
    {
        return User::create([
            'first_name' => 'Platform', 'last_name' => 'Tester',
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'), 'role' => $role,
        ]);
    }

    private function roleWith(array $permissions): string
    {
        $role = app(AdminRoleService::class)
            ->createRole('Viewer '.uniqid(), $permissions, $this->makeAdmin('super_admin')->id);

        return is_array($role) ? ($role['slug'] ?? '') : $role->slug;
    }

    public static function delegatableViews(): array
    {
        return [
            'platform health' => ['/api/v1/admin/health', 'view_platform_health'],
            'platform errors' => ['/api/v1/admin/errors', 'view_platform_health'],
            'sync health' => ['/api/v1/admin/sync/health', 'view_platform_health'],
            'trends' => ['/api/v1/admin/trends', 'view_platform_revenue'],
            'revenue' => ['/api/v1/admin/marketing/revenue', 'view_platform_revenue'],
            'subscription lifecycle' => ['/api/v1/admin/subscriptions/lifecycle', 'view_subscriptions'],
        ];
    }

    /** @dataProvider delegatableViews */
    public function test_a_custom_role_holding_the_permission_may_read_it(string $path, string $permission): void
    {
        $slug = $this->roleWith([$permission]);

        $this->actingAs($this->makeAdmin($slug))->getJson($path)->assertOk();
    }

    /** @dataProvider delegatableViews */
    public function test_a_custom_role_without_it_is_still_refused(string $path, string $permission): void
    {
        $slug = $this->roleWith(['view_platform_data']);

        $this->actingAs($this->makeAdmin($slug))->getJson($path)->assertStatus(403);
    }

    /** @dataProvider delegatableViews */
    public function test_super_admin_keeps_access_without_holding_anything_explicitly(string $path): void
    {
        $this->actingAs($this->makeAdmin('super_admin'))->getJson($path)->assertOk();
    }

    /**
     * The escalation guard. A delegated admin who could edit roles or
     * permission overrides could grant themselves every permission above,
     * so these must remain unreachable by delegation no matter what role
     * configuration exists.
     */
    public function test_role_and_permission_editing_cannot_be_delegated(): void
    {
        $slug = $this->roleWith([
            'view_platform_health',
            'view_platform_revenue',
            'view_subscriptions',
            'view_platform_data',
        ]);
        $caller = $this->makeAdmin($slug);
        $victim = $this->makeAdmin('agent');

        $this->actingAs($caller)->getJson('/api/v1/admin/roles')->assertStatus(403);
        $this->actingAs($caller)
            ->postJson('/api/v1/admin/roles', ['name' => 'Escalated', 'permissions' => []])
            ->assertStatus(403);
        $this->actingAs($caller)
            ->getJson("/api/v1/admin/users/{$victim->id}/permissions")
            ->assertStatus(403);
        $this->actingAs($caller)
            ->putJson("/api/v1/admin/users/{$victim->id}/permission-overrides", ['permissions' => []])
            ->assertStatus(403);
    }

    /** Running migrations stays super_admin-only regardless of role config. */
    public function test_the_migration_runner_cannot_be_delegated(): void
    {
        $slug = $this->roleWith(['view_platform_health']);

        $this->actingAs($this->makeAdmin($slug))
            ->postJson('/api/v1/admin/maintenance/migrations/run')->assertStatus(403);
    }
}
