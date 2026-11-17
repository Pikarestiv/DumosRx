<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GeneralApiTokenAbilitiesTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'first_name' => 'Test',
            'last_name' => 'User',
            'email' => 'user-'.uniqid().'@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
            'is_active' => true,
        ]);
    }

    public function test_a_refresh_only_admin_token_is_rejected_on_general_api_routes()
    {
        $token = $this->user->createToken('admin-refresh', ['refresh'])->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/user');

        $response->assertStatus(403);
        $response->assertJson(['message' => 'Invalid token ability.']);
    }

    public function test_a_wildcard_token_is_accepted_on_general_api_routes()
    {
        $token = $this->user->createToken('auth-token', ['*'])->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/user');

        $response->assertStatus(200);
        $response->assertJsonPath('email', $this->user->email);
    }

    public function test_a_narrow_ability_token_is_rejected_on_general_api_routes()
    {
        $token = $this->user->createToken('narrow-token', ['read:products'])->plainTextToken;

        $response = $this->withToken($token)->getJson('/api/v1/user');

        $response->assertStatus(403);
        $response->assertJson(['message' => 'Invalid token ability.']);
    }

    public function test_first_party_session_auth_without_bearer_token_is_accepted()
    {
        $response = $this->actingAs($this->user)->getJson('/api/v1/user');

        $response->assertStatus(200);
        $response->assertJsonPath('email', $this->user->email);
    }
}
