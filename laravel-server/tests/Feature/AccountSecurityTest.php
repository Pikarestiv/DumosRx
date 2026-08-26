<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccountSecurityTest extends TestCase
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
            'password' => bcrypt('correct-password'),
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

    public function test_reset_data_rejects_wrong_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/dashboard/reset', [
            'type' => 'all',
            'password' => 'totally-wrong',
        ]);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Invalid Password']);
    }

    public function test_reset_data_requires_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/dashboard/reset', [
            'type' => 'all',
        ]);

        $response->assertStatus(422);
    }

    public function test_reset_data_succeeds_with_correct_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/dashboard/reset', [
            'type' => 'sales',
            'password' => 'correct-password',
        ]);

        $response->assertStatus(200);
    }

    public function test_reset_data_rejects_invalid_type(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/dashboard/reset', [
            'type' => 'bogus_type',
            'password' => 'correct-password',
        ]);

        $response->assertStatus(422);
    }

    public function test_request_deletion_rejects_wrong_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/profile/request-deletion', [
            'reason' => 'Closing the business',
            'password' => 'totally-wrong',
        ]);

        $response->assertStatus(403);
        $response->assertJson(['error' => 'Invalid Password']);
        $this->assertNull($this->user->fresh()->deletion_requested_at);
    }

    public function test_request_deletion_requires_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/profile/request-deletion', [
            'reason' => 'Closing the business',
        ]);

        $response->assertStatus(422);
    }

    public function test_request_deletion_succeeds_with_correct_password(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/v1/profile/request-deletion', [
            'reason' => 'Closing the business',
            'password' => 'correct-password',
        ]);

        $response->assertStatus(200);
        $this->assertNotNull($this->user->fresh()->deletion_requested_at);
    }
}
