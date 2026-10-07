<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminActivityFeedEndpointTest extends TestCase
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

    public function test_an_operator_with_view_platform_data_may_read_the_feed(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->actingAs($this->makeAdmin('platform_admin'))
            ->getJson('/api/v1/admin/activity-feed')
            ->assertOk()
            ->assertJsonStructure(['events', 'available_types', 'next_cursor']);
    }

    /** The money gate, asserted at the HTTP boundary rather than only in the service. */
    public function test_a_platform_admin_is_refused_the_payment_type_over_http(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->actingAs($this->makeAdmin('platform_admin'))
            ->getJson('/api/v1/admin/activity-feed?type=payment')
            ->assertStatus(422);

        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/activity-feed?type=payment')
            ->assertOk();
    }

    public function test_available_types_differ_by_role(): void
    {
        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $asPlatformAdmin = $this->actingAs($this->makeAdmin('platform_admin'))
            ->getJson('/api/v1/admin/activity-feed')->json('available_types');
        $asSuperAdmin = $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/activity-feed')->json('available_types');

        $this->assertNotContains('payment', $asPlatformAdmin);
        $this->assertContains('payment', $asSuperAdmin);
    }

    public function test_an_unknown_type_is_rejected(): void
    {
        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/activity-feed?type=volcano')
            ->assertStatus(422);
    }

    public function test_an_oversized_limit_is_rejected(): void
    {
        $this->actingAs($this->makeAdmin('super_admin'))
            ->getJson('/api/v1/admin/activity-feed?limit=5000')
            ->assertStatus(422);
    }
}
