<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the drx_admin_session cookie hardening
 * (2026-08-26 redesign) partially regressing: AuthenticatesSessions::
 * refresh() and AdminStoreController::impersonateStore()/restoreSession()
 * each hand-rolled their own SameSite=None, unscoped-ability cookie write,
 * silently reintroducing the credential shape the redesign eliminated. See
 * docs/KNOWN_BUGS.md / docs/FIXED_BUGS.md.
 */
class AdminSessionCookieTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;
    protected User $storeOwner;
    protected Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $this->superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->storeOwner = User::create([
            'first_name' => 'Owner', 'last_name' => 'A',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->store = Store::create([
            'user_id' => $this->storeOwner->id,
            'name' => 'Store A',
            'store_slug' => 'store-a',
            'device_id' => 'WEB-A',
        ]);
    }

    public function test_refresh_does_not_set_the_admin_session_cookie()
    {
        $token = $this->storeOwner->createToken('desktop')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/refresh');

        $response->assertStatus(200);
        foreach ($response->headers->getCookies() as $cookie) {
            $this->assertNotSame('drx_admin_session', $cookie->getName());
        }
    }

    public function test_login_with_web_device_name_sets_a_strict_samesite_cookie()
    {
        $response = $this->postJson('/api/v1/login', [
            'email' => 'owner@dumosrx.com',
            'password' => 'password',
            'device_name' => 'web',
        ]);

        $response->assertStatus(200);
        $cookie = $this->findCookie($response, 'drx_admin_session');
        $this->assertNotNull($cookie);
        $this->assertSame('strict', strtolower((string) $cookie->getSameSite()));
    }

    public function test_impersonate_store_does_not_set_the_admin_session_cookie()
    {
        $response = $this->actingAs($this->superAdmin)
            ->postJson("/api/v1/admin/stores/{$this->store->id}/impersonate");

        $response->assertStatus(200);
        $response->assertJsonStructure(['token', 'user']);
        foreach ($response->headers->getCookies() as $cookie) {
            $this->assertNotSame(
                'drx_admin_session',
                $cookie->getName(),
                'impersonateStore() must not set drx_admin_session — the frontend consumes the JSON body token only.'
            );
        }
    }

    public function test_restore_session_sets_a_strict_samesite_cookie_not_samesite_none()
    {
        $token = $this->superAdmin->createToken('admin-web')->plainTextToken;

        $response = $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/restore-session', ['token' => $token]);

        $response->assertStatus(200);
        $cookie = $this->findCookie($response, 'drx_admin_session');
        $this->assertNotNull($cookie);
        $this->assertSame('strict', strtolower((string) $cookie->getSameSite()));
    }

    private function findCookie($response, string $name)
    {
        foreach ($response->headers->getCookies() as $cookie) {
            if ($cookie->getName() === $name) {
                return $cookie;
            }
        }

        return null;
    }
}
