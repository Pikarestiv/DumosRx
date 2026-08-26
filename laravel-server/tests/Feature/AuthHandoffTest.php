<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class AuthHandoffTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
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

    public function test_create_mints_a_code_for_a_valid_token(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/auth/handoff', ['token' => $token]);

        $response->assertStatus(200);
        $response->assertJsonStructure(['code', 'expires_in']);
        $this->assertSame(60, $response->json('expires_in'));
    }

    public function test_create_rejects_a_garbage_token(): void
    {
        $response = $this->postJson('/api/v1/auth/handoff', ['token' => 'not-a-real-token']);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Invalid token.']);
    }

    public function test_create_requires_token_field(): void
    {
        $response = $this->postJson('/api/v1/auth/handoff', []);

        $response->assertStatus(422);
    }

    public function test_consume_exchanges_a_valid_code_for_the_token_and_user(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;
        $create = $this->postJson('/api/v1/auth/handoff', ['token' => $token]);
        $code = $create->json('code');

        $response = $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code]);

        $response->assertStatus(200);
        $response->assertJson([
            'token' => $token,
            'user' => ['id' => $this->user->id, 'email' => $this->user->email],
        ]);
    }

    public function test_consume_is_single_use(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;
        $create = $this->postJson('/api/v1/auth/handoff', ['token' => $token]);
        $code = $create->json('code');

        $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code])->assertStatus(200);
        $second = $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code]);

        $second->assertStatus(410);
        $second->assertJson(['error' => 'Code expired or already used.']);
    }

    public function test_consume_rejects_an_unknown_code(): void
    {
        $response = $this->postJson('/api/v1/auth/handoff/consume', ['code' => 'totally-made-up']);

        $response->assertStatus(410);
    }

    public function test_consume_rejects_a_code_whose_underlying_token_was_since_revoked(): void
    {
        $tokenResult = $this->user->createToken('test-revocable');
        $token = $tokenResult->plainTextToken;
        $create = $this->postJson('/api/v1/auth/handoff', ['token' => $token]);
        $code = $create->json('code');

        $tokenResult->accessToken->delete();

        $response = $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code]);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Token no longer valid.']);
        // Burned even though it failed — a retry with the same code is also rejected, not re-validated.
        $this->assertNull(Cache::get("auth_handoff:{$code}"));
    }

    public function test_consume_expires_after_the_ttl(): void
    {
        $token = $this->user->createToken('test')->plainTextToken;
        $create = $this->postJson('/api/v1/auth/handoff', ['token' => $token]);
        $code = $create->json('code');

        Cache::forget("auth_handoff:{$code}"); // simulate TTL elapsing without waiting 60s in the test

        $response = $this->postJson('/api/v1/auth/handoff/consume', ['code' => $code]);

        $response->assertStatus(410);
    }
}
