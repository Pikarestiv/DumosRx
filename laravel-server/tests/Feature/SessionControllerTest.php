<?php

namespace Tests\Feature;

use App\Models\Store;
use App\Models\User;
use App\Models\UserDevice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class SessionControllerTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->user = User::create([
            'first_name' => 'Store',
            'last_name' => 'Owner',
            'email' => 'owner@example.com',
            'password' => Hash::make('password123'),
            'role' => 'store_owner',
            'is_active' => 1,
            'email_verified_at' => now(),
        ]);

        $this->store = Store::create([
            'user_id' => $this->user->id,
            'name' => 'Test Store',
            'store_type' => 'pharmacy',
            'device_id' => 'DRX-TEST-STORE-DEVICE',
        ]);
    }

    public function test_login_stores_provided_device_id_on_token(): void
    {
        $response = $this->withHeaders([
            'X-Device-Id' => 'DRX-TEST-LOGIN-1',
            'X-Device-Label' => 'Chrome on macOS',
        ])->postJson('/api/v1/login', [
            'email' => 'owner@example.com',
            'password' => 'password123',
            'device_name' => 'Client App',
        ]);

        $response->assertStatus(200);

        $token = PersonalAccessToken::where('tokenable_id', $this->user->id)->first();
        $this->assertNotNull($token);
        $this->assertEquals('DRX-TEST-LOGIN-1', $token->device_id);
    }

    public function test_login_generates_device_id_when_none_provided(): void
    {
        $response = $this->postJson('/api/v1/login', [
            'email' => 'owner@example.com',
            'password' => 'password123',
            'device_name' => 'web',
        ]);

        $response->assertStatus(200);

        $token = PersonalAccessToken::where('tokenable_id', $this->user->id)->first();
        $this->assertNotNull($token);
        $this->assertStringStartsWith('DRX-WEB-', $token->device_id);
    }

    public function test_sessions_index_returns_device_id(): void
    {
        $tokenResult = $this->user->createToken('Client App');
        $token = $tokenResult->accessToken;
        $token->device_id = 'DRX-KNOWN-TILL-9';
        $token->save();

        $response = $this->withHeader('Authorization', 'Bearer '.$tokenResult->plainTextToken)
            ->getJson('/api/v1/sessions');

        $response->assertStatus(200)
            ->assertJsonFragment([
                'id' => $token->id,
                'name' => 'Client App',
                'device_id' => 'DRX-KNOWN-TILL-9',
                'is_current' => true,
            ]);
    }

    public function test_sessions_index_falls_back_to_user_devices_when_token_device_id_is_null(): void
    {
        UserDevice::create([
            'user_id' => $this->user->id,
            'device_id' => 'DRX-USER-DEVICE-1',
            'device_label' => 'Chrome on Windows',
            'store_id' => $this->store->id,
            'last_synced_at' => now(),
        ]);

        $tokenResult = $this->user->createToken('Client App');
        $token = $tokenResult->accessToken;
        $token->device_id = null;
        $token->save();

        $response = $this->withHeader('Authorization', 'Bearer '.$tokenResult->plainTextToken)
            ->getJson('/api/v1/sessions');

        $response->assertStatus(200)
            ->assertJsonFragment([
                'id' => $token->id,
                'device_id' => 'DRX-USER-DEVICE-1',
            ]);
    }

    public function test_revoke_other_session_and_revoke_all(): void
    {
        $currentToken = $this->user->createToken('Client App');
        $otherToken1 = $this->user->createToken('Client App');
        $otherToken2 = $this->user->createToken('Client App');

        $authHeader = ['Authorization' => 'Bearer '.$currentToken->plainTextToken];

        $deleteResponse = $this->withHeaders($authHeader)
            ->deleteJson('/api/v1/sessions/'.$otherToken1->accessToken->id);
        $deleteResponse->assertStatus(200);

        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $otherToken1->accessToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $otherToken2->accessToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $currentToken->accessToken->id]);

        $revokeAllResponse = $this->withHeaders($authHeader)
            ->postJson('/api/v1/sessions/revoke-all');
        $revokeAllResponse->assertStatus(200);

        $this->assertDatabaseMissing('personal_access_tokens', ['id' => $otherToken2->accessToken->id]);
        $this->assertDatabaseHas('personal_access_tokens', ['id' => $currentToken->accessToken->id]);
    }
}
