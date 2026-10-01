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
 * A-133: AdminUserService::getGlobalUsers() hand-built its response and
 * never included `effective_permissions`, even though it's already computed
 * by User::getEffectivePermissionsAttribute(). Without it, the per-admin
 * permission-override form (UserProfileDialog) could never tell "has this
 * permission" from "doesn't," defeating its own Inherited/Granted/Revoked
 * control.
 */
class AdminGlobalUsersEffectivePermissionsTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function the_global_users_list_reports_each_users_effective_permissions(): void
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

        $response = $this->actingAs($superAdmin)->getJson('/api/v1/admin/users');

        $response->assertStatus(200);

        $row = collect($response->json('data'))->firstWhere('id', $agent->id);
        $this->assertNotNull($row);
        $this->assertContains('impersonate_store', $row['effective_permissions']);
    }
}
