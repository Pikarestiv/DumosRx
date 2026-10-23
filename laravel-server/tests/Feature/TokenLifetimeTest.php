<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class TokenLifetimeTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $owner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-23 12:00:00');

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $this->superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'lifetime-super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);
        $this->owner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'lifetime-owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner', 'is_active' => true,
        ]);
        $this->store = Store::create([
            'user_id' => $this->owner->id, 'name' => 'Store A',
            'store_slug' => 'lifetime-a', 'device_id' => 'LIFETIME-A',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function assertExpiresInDays(string $name, int $days, ?User $user = null): void
    {
        $token = PersonalAccessToken::where('name', $name)
            ->when($user, fn ($q) => $q->where('tokenable_id', $user->id))
            ->latest('id')->firstOrFail();

        $this->assertNotNull($token->expires_at, "{$name} must carry expires_at");
        $this->assertTrue(now()->addDays($days)->equalTo($token->expires_at), "{$name} should expire in {$days} days, got {$token->expires_at}");
    }

    public function test_sanctum_no_longer_caps_every_token_at_a_global_expiration()
    {
        $this->assertNull(config('sanctum.expiration'));
    }

    public function test_till_login_mints_a_180_day_token()
    {
        $this->postJson('/api/v1/login', [
            'email' => 'lifetime-owner@dumosrx.com', 'password' => 'password', 'device_name' => 'Client App',
        ])->assertOk();

        $this->assertExpiresInDays('Client App', 180);
    }

    public function test_web_login_mints_30_day_access_and_refresh_tokens()
    {
        $this->postJson('/api/v1/login', [
            'email' => 'lifetime-owner@dumosrx.com', 'password' => 'password', 'device_name' => 'web',
        ])->assertOk();

        $this->assertExpiresInDays('web', 30);
        $this->assertExpiresInDays('admin-refresh', 30);
    }

    public function test_super_admin_login_on_any_device_name_is_an_admin_token()
    {
        $this->postJson('/api/v1/login', [
            'email' => 'lifetime-super@dumosrx.com', 'password' => 'password', 'device_name' => 'Client App',
        ])->assertOk();

        $this->assertExpiresInDays('Client App', 30);
    }

    public function test_registration_mints_a_till_token()
    {
        $this->postJson('/api/v1/register', [
            'first_name' => 'New', 'last_name' => 'Owner', 'email' => 'lifetime-new@dumosrx.com',
            'password' => 'password123', 'store_name' => 'Lifetime Pharmacy',
        ])->assertStatus(201);

        $this->assertExpiresInDays('Client App', 180);
    }

    public function test_refresh_picks_the_lifetime_by_role()
    {
        $tillToken = $this->owner->createToken('Client App')->plainTextToken;
        $this->withToken($tillToken)->postJson('/api/v1/refresh')->assertOk();
        $this->assertExpiresInDays('web', 180, $this->owner);

        $this->app['auth']->forgetGuards();

        $adminToken = $this->superAdmin->createToken('web')->plainTextToken;
        $this->withToken($adminToken)->postJson('/api/v1/refresh')->assertOk();
        $this->assertExpiresInDays('web', 30, $this->superAdmin);
    }

    public function test_admin_session_refresh_mints_30_day_tokens_and_still_rotates()
    {
        $login = $this->postJson('/api/v1/login', [
            'email' => 'lifetime-super@dumosrx.com', 'password' => 'password', 'device_name' => 'web',
        ])->assertOk();
        $cookie = collect($login->headers->getCookies())->first(fn ($c) => $c->getName() === 'drx_admin_session');

        Carbon::setTestNow(now()->addDay());
        $this->withUnencryptedCookie('drx_admin_session', $cookie->getValue())
            ->withCredentials()
            ->postJson('/api/v1/admin/session/refresh')->assertOk();

        $this->assertExpiresInDays('web', 30);
        $this->assertExpiresInDays('admin-refresh', 30);
        $this->assertDatabaseHas('personal_access_tokens', ['name' => 'admin-refresh-rotated']);
    }

    public function test_impersonation_token_lives_30_days()
    {
        $this->actingAs($this->superAdmin, 'sanctum')
            ->postJson("/api/v1/admin/stores/{$this->store->id}/impersonate")->assertOk();

        $this->assertExpiresInDays('Impersonation Token', 30);
    }

    public function test_restore_session_refresh_token_lives_30_days()
    {
        $adminToken = $this->superAdmin->createToken('web')->plainTextToken;

        $this->actingAs($this->superAdmin, 'sanctum')
            ->postJson('/api/v1/admin/restore-session', ['token' => $adminToken])->assertOk();

        $this->assertExpiresInDays('admin-refresh', 30);
    }

    public function test_an_expired_token_is_rejected_and_a_live_old_till_token_is_not()
    {
        $expired = $this->owner->createToken('Client App', ['*'], now()->subMinute())->plainTextToken;
        $this->withToken($expired)->getJson('/api/v1/user')->assertUnauthorized();

        $this->app['auth']->forgetGuards();

        $live = $this->owner->createToken('Client App', ['*'], now()->addDays(180));
        $live->accessToken->forceFill(['created_at' => now()->subDays(100)])->save();
        $this->withToken($live->plainTextToken)->getJson('/api/v1/user')->assertOk();
    }
}
