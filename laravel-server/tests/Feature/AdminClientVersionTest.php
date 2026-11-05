<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AdminClientVersionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Http::fake([
            'app.dumosrx.com/version.json' => Http::response([
                'app_version' => '0.0.41',
                'build_sha' => 'a19fa29fca740203bf1887888bccffcd9da5fd6e',
                'built_at' => '2026-11-05T21:45:00.000Z',
            ], 200),
        ]);
    }

    private function superAdmin(): User
    {
        $role = Role::firstOrCreate(['slug' => 'super_admin'], ['name' => 'Super Admin']);

        return User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super-admin-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }

    public function test_guest_cannot_access_admin_client_version(): void
    {
        $this->getJson('/api/v1/admin/client/version')->assertStatus(401);
    }

    public function test_super_admin_receives_probed_version_manifest(): void
    {
        $admin = $this->superAdmin();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/client/version');

        $response->assertStatus(200);
        $this->assertSame('0.0.41', $response->json('app_version'));
        $this->assertSame('a19fa29f', $response->json('build_sha'));
        $this->assertSame('2026-11-05T21:45:00.000Z', $response->json('built_at'));
    }

    public function test_manifest_is_cached_and_can_be_refreshed(): void
    {
        $admin = $this->superAdmin();

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/client/version')->assertStatus(200);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/client/version')->assertStatus(200);

        Http::assertSentCount(1);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/client/version?refresh=1')->assertStatus(200);

        Http::assertSentCount(2);
    }
}
