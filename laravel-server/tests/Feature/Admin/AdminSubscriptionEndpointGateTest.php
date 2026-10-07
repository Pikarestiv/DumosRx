<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\Subscription;
use App\Models\SystemConfig;
use App\Models\User;
use App\Services\Admin\AdminRoleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Layer 1 of the spec's four. The nav item and the page guard are UX; this is
 * the control. See the Phase 3 spec, Part 4a.
 */
class AdminSubscriptionEndpointGateTest extends TestCase
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

    private function owner(): User
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Test',
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $owner->id,
            'name' => 'Store '.uniqid(),
            'device_id' => 'DESKTOP-'.strtoupper(uniqid()),
            'currency' => 'NGN',
        ]);

        return $owner;
    }

    private function customRole(string $name, array $permissions): string
    {
        $role = app(AdminRoleService::class)->createRole($name, $permissions, $this->makeAdmin('super_admin')->id);

        return is_array($role) ? ($role['slug'] ?? $role['name'] ?? '') : $role->slug;
    }

    public function test_only_super_admin_may_read_the_lifecycle_endpoints(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/subscriptions/lifecycle')->assertOk();

        foreach (['platform_admin', 'agent'] as $role) {
            $this->actingAs($this->makeAdmin($role))
                ->getJson('/api/v1/admin/subscriptions/lifecycle')->assertStatus(403);
            $this->actingAs($this->makeAdmin($role))
                ->getJson('/api/v1/admin/subscriptions/expiring')->assertStatus(403);
        }
    }

    /** The A-141 shape: a role-slug allow-list gets this wrong in both directions. */
    public function test_a_custom_platform_role_is_refused_too(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $slug = $this->customRole('Billing Watcher', ['view_platform_data']);

        $this->actingAs($this->makeAdmin($slug))
            ->getJson('/api/v1/admin/subscriptions/lifecycle')->assertStatus(403);
        $this->actingAs($this->makeAdmin($slug))
            ->getJson('/api/v1/admin/subscriptions/lapsed')->assertStatus(403);
    }

    public function test_an_unknown_bucket_is_rejected_rather_than_defaulted(): void
    {
        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/subscriptions/constructor')->assertStatus(422);
    }

    public function test_the_days_window_is_validated_against_an_allow_list(): void
    {
        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/subscriptions/expiring?days=999')->assertStatus(422);
    }

    public function test_every_known_bucket_resolves(): void
    {
        $admin = $this->makeAdmin('super_admin');

        foreach (['expiring', 'trials', 'lapsed', 'payments'] as $bucket) {
            $this->actingAs($admin)
                ->getJson("/api/v1/admin/subscriptions/{$bucket}")
                ->assertOk()
                ->assertJsonStructure(['data', 'meta' => ['current_page', 'last_page', 'total', 'per_page']]);
        }
    }

    public function test_each_bucket_paginates_at_fifty(): void
    {
        for ($i = 0; $i < 60; $i++) {
            Subscription::create([
                'user_id' => $this->owner()->id,
                'plan_name' => 'premium',
                'status' => 'active',
                'is_trial' => false,
                'start_date' => now()->subMonth(),
                'end_date' => now()->addDays(2),
                'license_key' => 'LIC-'.uniqid(),
            ]);
        }

        $response = $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/subscriptions/expiring?days=7');

        $response->assertOk();
        $this->assertSame(50, $response->json('meta.per_page'));
        $this->assertSame(60, $response->json('meta.total'));
    }

    /**
     * Layer 4's server half. The worklist renders these actions but does not
     * proxy or re-expose them, so their authorisation must be exactly what it
     * was before this phase. A hidden button is not a security control.
     */
    public function test_the_actions_the_worklist_offers_still_refuse_a_caller_without_the_permission(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $slug = $this->customRole('No Trials', ['view_platform_data']);
        $caller = $this->makeAdmin($slug);
        $owner = $this->owner();

        $this->actingAs($caller)
            ->postJson("/api/v1/admin/users/{$owner->id}/grant-trial", ['plan' => 'premium'])
            ->assertStatus(403);

        $this->actingAs($caller)
            ->postJson("/api/v1/admin/users/{$owner->id}/notify", ['title' => 'x', 'message' => 'y'])
            ->assertStatus(403);
    }
}
