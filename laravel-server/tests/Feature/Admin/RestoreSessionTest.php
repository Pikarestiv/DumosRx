<?php

namespace Tests\Feature\Admin;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for the /admin/restore-session fix: the supplied
 * token must resolve to a real Sanctum token owned by a super_admin. Before
 * the fix, any string was accepted and set directly as the session cookie
 * (which doubles as the bearer token for every subsequent request via
 * AuthenticateFromCookie) — effectively letting an authenticated non-admin
 * pivot their session to any other valid token they happened to possess.
 */
class RestoreSessionTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $storeOwner;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->storeOwner = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\CheckPermission::class,
            \App\Http\Middleware\CheckSubscription::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_restore_session_accepts_a_real_super_admin_token()
    {
        $token = $this->admin->createToken('test-admin')->plainTextToken;

        // The caller is currently authenticated as the impersonated store
        // owner (that's the whole point of restore-session), while the
        // token being restored belongs to the admin.
        $response = $this->actingAs($this->storeOwner)
            ->postJson('/api/v1/admin/restore-session', ['token' => $token]);

        $response->assertStatus(200);
        $response->assertJson(['message' => 'Session restored']);
        $response->assertCookie('drx_admin_session');
    }

    public function test_restore_session_rejects_a_valid_token_belonging_to_a_non_admin()
    {
        $token = $this->storeOwner->createToken('test-owner')->plainTextToken;

        $response = $this->actingAs($this->storeOwner)
            ->postJson('/api/v1/admin/restore-session', ['token' => $token]);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Invalid restore token.']);
    }

    public function test_restore_session_rejects_an_arbitrary_garbage_string()
    {
        $response = $this->actingAs($this->storeOwner)
            ->postJson('/api/v1/admin/restore-session', ['token' => 'not-a-real-token-at-all']);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Invalid restore token.']);
    }

    public function test_restore_session_rejects_a_revoked_admin_token()
    {
        $tokenResult = $this->admin->createToken('test-admin-revoked');
        $token = $tokenResult->plainTextToken;
        $tokenResult->accessToken->delete();

        $response = $this->actingAs($this->storeOwner)
            ->postJson('/api/v1/admin/restore-session', ['token' => $token]);

        $response->assertStatus(403);
    }

    public function test_restore_session_requires_token_field()
    {
        $response = $this->actingAs($this->storeOwner)
            ->postJson('/api/v1/admin/restore-session', []);

        $response->assertStatus(422);
    }
}
