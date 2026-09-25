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

    /**
     * The Strict/HttpOnly fix above was necessary but not sufficient: an
     * independent review pass caught that the cookie's VALUE was still the
     * raw general-ability token passed in the request body, not a
     * `refresh`-ability-scoped one — so a cookie built from it would fail
     * refreshAdminSession()'s `$refreshToken->can('refresh')` gate and get
     * the session cleared on the very next reload, defeating the whole
     * point of "restoring" a session. Exercises the actual cookie value
     * end-to-end against the real refresh endpoint, not just its
     * attributes.
     */
    public function test_restore_session_cookie_value_actually_satisfies_refresh_admin_session()
    {
        $accessToken = $this->superAdmin->createToken('admin-web')->plainTextToken;

        $restoreResponse = $this->actingAs($this->superAdmin)
            ->postJson('/api/v1/admin/restore-session', ['token' => $accessToken]);
        $restoreResponse->assertStatus(200);

        $cookie = $this->findCookie($restoreResponse, 'drx_admin_session');
        $this->assertNotNull($cookie);

        // withUnencryptedCookie (not withCookie): this cookie is excepted
        // from EncryptCookies server-side (bootstrap/app.php), so a test
        // that encrypted it here would send a value the server never
        // decrypts, defeating the round trip. withCredentials() is also
        // required - Laravel's test client sends NO cookies at all on a
        // postJson()/json() call otherwise (prepareCookiesForJsonRequest()
        // returns [] unless this is set), independent of anything this fix
        // touches.
        $refreshResponse = $this->withUnencryptedCookie('drx_admin_session', $cookie->getValue())
            ->withCredentials()
            ->postJson('/api/v1/admin/session/refresh');

        $refreshResponse->assertStatus(200);
        $refreshResponse->assertJsonStructure(['token', 'user']);
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
