<?php

namespace Tests\Feature\Admin;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /admin/stores/registered-by-me - the scoped store list that gives
 * platform_admin/agent a way to see the stores they onboarded. The full
 * fleet list stays role:super_admin (platform-wide revenue); this one is
 * gated on create_accounts, the same permission that lets them register a
 * store in the first place.
 */
class AdminRegisteredStoresScopeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(\Database\Seeders\RolesAndPermissionsSeeder::class);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function user(string $role): User
    {
        return User::create([
            'first_name' => ucfirst($role),
            'last_name' => 'Tester',
            'email' => $role.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    private function storeRegisteredBy(?User $registrar, string $storeName): Store
    {
        $owner = User::create([
            'first_name' => 'Owner',
            'last_name' => 'Of'.$storeName,
            'email' => 'owner-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
            'registered_by_id' => $registrar?->id,
        ]);

        return Store::create([
            'name' => $storeName,
            'user_id' => $owner->id,
            'status' => 'Active',
            'device_id' => 'DEVICE-'.strtoupper(uniqid()),
        ]);
    }

    public function test_an_agent_sees_only_the_stores_they_registered(): void
    {
        $agent = $this->user('agent');
        $otherAgent = $this->user('agent');

        $this->storeRegisteredBy($agent, 'Mine Pharmacy');
        $this->storeRegisteredBy($otherAgent, 'Someone Elses Pharmacy');
        $this->storeRegisteredBy(null, 'Self Serve Pharmacy');

        $response = $this->actingAs($agent)->getJson('/api/v1/admin/stores/registered-by-me');

        $response->assertOk();
        $names = collect($response->json('data'))->pluck('name')->all();
        $this->assertSame(['Mine Pharmacy'], $names);
        $this->assertSame(1, $response->json('meta.total'));
    }

    public function test_the_scoped_list_does_not_expose_platform_revenue(): void
    {
        $agent = $this->user('agent');
        $this->storeRegisteredBy($agent, 'Mine Pharmacy');

        $response = $this->actingAs($agent)->getJson('/api/v1/admin/stores/registered-by-me');

        $response->assertOk();
        $this->assertArrayNotHasKey('revenue', $response->json('data.0'));
    }

    public function test_a_store_owner_cannot_reach_the_scoped_list(): void
    {
        $owner = $this->user('store_owner');

        $this->actingAs($owner)
            ->getJson('/api/v1/admin/stores/registered-by-me')
            ->assertStatus(403);
    }

    public function test_a_super_admin_may_also_call_it_and_sees_their_own_registrations(): void
    {
        $superAdmin = $this->user('super_admin');
        $this->storeRegisteredBy($superAdmin, 'Super Registered');
        $this->storeRegisteredBy(null, 'Self Serve Pharmacy');

        $response = $this->actingAs($superAdmin)->getJson('/api/v1/admin/stores/registered-by-me');

        $response->assertOk();
        $this->assertSame(
            ['Super Registered'],
            collect($response->json('data'))->pluck('name')->all(),
        );
    }

    public function test_the_full_fleet_list_is_still_super_admin_only(): void
    {
        $this->actingAs($this->user('agent'))
            ->getJson('/api/v1/admin/stores')
            ->assertStatus(403);
    }
}
