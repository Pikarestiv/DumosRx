<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\Role;
use App\Models\Store;
use App\Models\User;
use Carbon\Carbon;
use Database\Seeders\RolesAndPermissionsSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class AdminStoreRelinkCodeTest extends TestCase
{
    use RefreshDatabase;

    protected User $owner;

    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-11-11 14:00:00');

        $this->seed(RolesAndPermissionsSeeder::class);

        $this->owner = User::create([
            'first_name' => 'Ada',
            'last_name' => 'Nest',
            'email' => 'ada@nestagidi.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
            'is_active' => true,
            'email_verified_at' => now(),
        ]);

        $this->store = Store::create([
            'user_id' => $this->owner->id,
            'name' => 'Nest Agidi Pharmacy',
            'store_slug' => 'nest-agidi',
            'device_id' => 'DRX-NESTAGIDI',
            'status' => 'Active',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    #[Test]
    public function super_admin_can_generate_a_till_relink_code(): void
    {
        $admin = $this->userWithRole('super_admin');

        $response = $this->actingAs($admin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/relink-code")
            ->assertOk();

        $code = $response->json('code');
        $expiresAt = $response->json('expires_at');

        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{8}$/', $code);
        $this->assertTrue(now()->addMinutes(15)->equalTo(Carbon::parse($expiresAt)));

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $admin->id,
            'store_id' => $this->store->id,
            'action' => 'TILL_RELINK_CODE_ISSUED_BY_ADMIN',
        ]);
    }

    #[Test]
    public function platform_admin_with_impersonate_store_permission_can_generate_a_code(): void
    {
        $admin = $this->userWithRole('platform_admin');

        $response = $this->actingAs($admin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/relink-code")
            ->assertOk();

        $this->assertMatchesRegularExpression('/^[A-HJ-NP-Z2-9]{8}$/', $response->json('code'));
    }

    #[Test]
    public function agent_without_impersonate_store_permission_is_forbidden(): void
    {
        $agent = $this->userWithRole('agent');

        $this->actingAs($agent)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/relink-code")
            ->assertForbidden();
    }

    #[Test]
    public function unauthenticated_call_is_unauthorized(): void
    {
        $this->postJson("/api/v1/admin/stores/{$this->store->id}/relink-code")
            ->assertUnauthorized();
    }

    #[Test]
    public function suspended_store_cannot_have_a_code_generated(): void
    {
        $this->store->update(['status' => 'Suspended']);
        $admin = $this->userWithRole('super_admin');

        $this->actingAs($admin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/relink-code")
            ->assertForbidden();
    }

    #[Test]
    public function code_generated_by_admin_can_be_consumed_at_till(): void
    {
        $admin = $this->userWithRole('super_admin');

        $issueRes = $this->actingAs($admin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/relink-code")
            ->assertOk();

        $code = $issueRes->json('code');

        $this->app['auth']->forgetGuards();

        $consumeRes = $this->withHeaders([
            'Authorization' => '',
            'X-Store-Id' => $this->store->id,
            'X-Device-Id' => 'DRX-RECOVERED-TILL',
            'X-Device-Label' => 'Dell POS Windows 11',
            'User-Agent' => 'DumosRxTauri/2.0.0',
        ])->postJson('/api/v1/app/relink-code/consume', [
            'code' => $code,
        ])->assertOk();

        $this->assertSame('Login successful', $consumeRes->json('message'));
        $this->assertSame($this->owner->id, $consumeRes->json('user.id'));
        $this->assertNotEmpty($consumeRes->json('token'));

        $this->assertDatabaseHas('activity_logs', [
            'user_id' => $this->owner->id,
            'store_id' => $this->store->id,
            'action' => 'TILL_RELINKED',
            'description' => 'Till re-linked with an admin-issued code on Dell POS Windows 11',
        ]);
    }

    private function userWithRole(string $roleSlug): User
    {
        $role = Role::where('slug', $roleSlug)->firstOrFail();

        return User::create([
            'first_name' => 'Admin',
            'last_name' => ucfirst($roleSlug),
            'email' => $roleSlug.'-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => $roleSlug,
            'role_id' => $role->id,
            'is_active' => true,
        ]);
    }
}

