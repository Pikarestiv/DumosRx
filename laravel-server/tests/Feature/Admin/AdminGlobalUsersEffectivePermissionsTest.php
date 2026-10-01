<?php

namespace Tests\Feature\Admin;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-133: the per-admin permission-override form (UserProfileDialog) could
 * never tell "has this permission" from "doesn't," defeating its own
 * Inherited/Granted/Revoked control, because nothing exposed a user's
 * effective_permissions. The first fix folded it into every row of the
 * paginated GET /admin/users list, which reintroduced the N+1
 * `getEffectivePermissionsAttribute()` had already been scoped away from
 * (see b7a39eea) — caught in code review before merge. The fix landed here
 * instead: a dedicated single-user endpoint, fetched on demand only when
 * the override form actually opens for one user.
 */
class AdminGlobalUsersEffectivePermissionsTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function a_single_users_effective_permissions_endpoint_reports_a_granted_override(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $agent = User::create([
            'first_name' => 'Agent', 'last_name' => 'User',
            'email' => 'agent@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'agent',
            'role_id' => Role::where('slug', 'agent')->value('id'),
        ]);

        $permission = Permission::where('slug', 'impersonate_store')->firstOrFail();
        \Illuminate\Support\Facades\DB::table('permission_user')->insert([
            'user_id' => $agent->id,
            'permission_id' => $permission->id,
            'granted' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $response = $this->actingAs($superAdmin)->getJson("/api/v1/admin/users/{$agent->id}/permissions");

        $response->assertStatus(200);
        $this->assertContains('impersonate_store', $response->json('effective_permissions'));
    }

    #[Test]
    public function the_global_users_list_does_not_carry_effective_permissions_per_row(): void
    {
        $this->seed(RolesAndPermissionsSeeder::class);

        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        User::create([
            'first_name' => 'Agent', 'last_name' => 'User',
            'email' => 'agent@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'agent',
            'role_id' => Role::where('slug', 'agent')->value('id'),
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $response = $this->actingAs($superAdmin)->getJson('/api/v1/admin/users');

        $response->assertStatus(200);
        $row = collect($response->json('data'))->first();
        $this->assertArrayNotHasKey('effective_permissions', $row);
    }
}
