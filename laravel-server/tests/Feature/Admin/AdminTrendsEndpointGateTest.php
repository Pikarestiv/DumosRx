<?php

namespace Tests\Feature\Admin;

use App\Models\Role;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\AdminRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminTrendsEndpointGateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        SystemConfig::setVal('subscription_plans', ['grace_period_days' => 3]);

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

    /**
     * The gate is `permission:view_platform_revenue`. A Platform Admin is a
     * partner and holds it by default since 2026-10-07; an Agent is a
     * recruited installer and does not.
     */
    public function test_trends_follows_the_view_platform_revenue_permission(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        foreach (['super_admin', 'platform_admin'] as $role) {
            $this->actingAs($this->makeAdmin($role))
                ->getJson('/api/v1/admin/trends')->assertOk();
        }

        $this->actingAs($this->makeAdmin('agent'))
            ->getJson('/api/v1/admin/trends')->assertStatus(403);
    }

    /** The A-141 shape, with the group gate proven cleared first. */
    public function test_a_custom_platform_role_is_refused(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $role = app(AdminRoleService::class)
            ->createRole('Trend Watcher', ['view_platform_data'], $this->makeAdmin('super_admin')->id);
        $slug = is_array($role) ? ($role['slug'] ?? '') : $role->slug;

        $this->assertContains(
            'manage_platform',
            Role::where('slug', $slug)->firstOrFail()->permissions->pluck('slug')->all(),
            'the gate under test is only exercised if the caller clears the admin group gate first'
        );

        $this->actingAs($this->makeAdmin($slug))
            ->getJson('/api/v1/admin/trends')->assertStatus(403);
    }

    public function test_an_unsupported_window_is_rejected_rather_than_defaulted(): void
    {
        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/trends?window=all-time')->assertStatus(422);
    }

    public function test_every_supported_window_resolves(): void
    {
        $admin = $this->makeAdmin('super_admin');

        foreach (['30d', '6m', '12m'] as $window) {
            $this->actingAs($admin)
                ->getJson("/api/v1/admin/trends?window={$window}")
                ->assertOk()
                ->assertJsonStructure([
                    'window',
                    'granularity',
                    'cash_collected' => ['currencies', 'points'],
                    'new_paid_subscriptions' => ['points'],
                    'trial_starts' => ['points'],
                    'store_signups' => ['points'],
                    'churn' => ['points'],
                ]);
        }
    }
}
