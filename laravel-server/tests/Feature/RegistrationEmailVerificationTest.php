<?php

namespace Tests\Feature;

use App\Models\SystemConfig;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class RegistrationEmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        SystemConfig::setVal('require_email_verification', true);

        $this->withoutMiddleware([
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'first_name' => 'New',
            'last_name' => 'User',
            'email' => 'new-user@dumosrx.com',
            'password' => 'password123',
        ], $overrides);
    }

    public function test_registration_without_a_store_name_is_not_auto_marked_verified(): void
    {
        $this->postJson('/api/v1/register', $this->payload())
            ->assertStatus(201);

        $this->assertNull(User::where('email', 'new-user@dumosrx.com')->first()->email_verified_at);
        $this->assertDatabaseHas('email_verification_tokens', ['email' => 'new-user@dumosrx.com']);
    }

    public function test_registration_with_a_store_name_is_not_auto_marked_verified_either(): void
    {
        $this->postJson('/api/v1/register', $this->payload([
            'email' => 'store-owner@dumosrx.com',
            'store_name' => 'Main Branch',
        ]))->assertStatus(201);

        $this->assertNull(User::where('email', 'store-owner@dumosrx.com')->first()->email_verified_at);
    }

    public function test_registration_is_auto_verified_when_the_platform_does_not_require_verification(): void
    {
        SystemConfig::setVal('require_email_verification', false);

        $this->postJson('/api/v1/register', $this->payload())
            ->assertStatus(201);

        $this->assertNotNull(User::where('email', 'new-user@dumosrx.com')->first()->email_verified_at);
    }

    public function test_an_expired_verification_token_is_rejected(): void
    {
        $user = User::create([
            'first_name' => 'Pending',
            'last_name' => 'User',
            'email' => 'pending@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        DB::table('email_verification_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make('expired-token'),
            'created_at' => now()->subDays(8),
        ]);

        $this->postJson('/api/v1/verify-email', [
            'token' => 'expired-token',
            'email' => $user->email,
        ])->assertStatus(400);

        $this->assertNull($user->fresh()->email_verified_at);
    }

    public function test_a_fresh_verification_token_still_verifies(): void
    {
        $user = User::create([
            'first_name' => 'Pending',
            'last_name' => 'User',
            'email' => 'fresh@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        DB::table('email_verification_tokens')->insert([
            'email' => $user->email,
            'token' => Hash::make('fresh-token'),
            'created_at' => now()->subHour(),
        ]);

        $this->postJson('/api/v1/verify-email', [
            'token' => 'fresh-token',
            'email' => $user->email,
        ])->assertStatus(200);

        $this->assertNotNull($user->fresh()->email_verified_at);
    }
}
