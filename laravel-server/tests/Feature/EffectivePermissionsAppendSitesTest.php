<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * effective_permissions costs ~4 queries per slug to resolve, so it is
 * appended per response rather than globally: every endpoint that serializes
 * a User (staff lists, the sync pull's users table) would otherwise pay for
 * it. Coverage for both halves of that rule.
 */
class EffectivePermissionsAppendSitesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RolesAndPermissionsSeeder::class);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function makeAdmin(): User
    {
        return User::create([
            'first_name' => 'Pat', 'last_name' => 'Admin',
            'email' => 'pat-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'platform_admin', 'is_active' => true,
        ]);
    }

    public function test_a_serialized_user_does_not_carry_effective_permissions_by_default()
    {
        $user = $this->makeAdmin();

        $this->assertArrayNotHasKey('effective_permissions', $user->toArray());
    }

    public function test_a_staff_collection_serialization_does_not_resolve_permissions_for_any_row()
    {
        $owner = User::create([
            'first_name' => 'Ola', 'last_name' => 'Owner',
            'email' => 'owner-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);
        $store = Store::create([
            'user_id' => $owner->id, 'name' => 'Staff Store',
            'device_id' => 'STAFF-'.uniqid(), 'status' => 'Active',
        ]);
        $staff = User::create([
            'first_name' => 'Sam', 'last_name' => 'Staff', 'store_id' => $store->id,
            'email' => 'staff-'.uniqid().'@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'cashier', 'is_active' => true,
        ]);

        foreach (User::whereIn('id', [$owner->id, $staff->id])->get()->toArray() as $row) {
            $this->assertArrayNotHasKey('effective_permissions', $row);
        }
    }

    public function test_login_still_returns_effective_permissions_for_the_admin_panel()
    {
        $admin = $this->makeAdmin();

        $response = $this->postJson('/api/v1/login', [
            'email' => $admin->email,
            'password' => 'password',
            'device_name' => 'web',
        ]);

        $response->assertOk();
        $this->assertIsArray($response->json('user.effective_permissions'));
        $this->assertContains('view_platform_data', $response->json('user.effective_permissions'));
    }

    public function test_the_token_refresh_response_still_returns_effective_permissions()
    {
        $admin = $this->makeAdmin();
        $token = $admin->createToken('web')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/refresh');

        $response->assertOk();
        $this->assertIsArray($response->json('user.effective_permissions'));
    }
}
