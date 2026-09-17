<?php

namespace Tests\Feature;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regression coverage for a real reported bug: the notification bell was
 * showing raw synced activity-log noise ("LOGIN", "Action: UPDATE on
 * stores") for regular users, not just genuinely notification-worthy
 * events. base-helpers.ts's insert()/update()/remove() log a generic
 * INSERT/UPDATE/DELETE/HARD_DELETE on every table write across the app when
 * no more specific action is given, and auth-context.tsx logs LOGIN/LOGOUT/
 * PIN_CHANGED on every session change - real signal for the full Activity
 * Log page, but context-free clutter in the notification bell.
 */
class NotificationControllerTest extends TestCase
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

    public function test_generic_crud_and_session_noise_is_excluded(): void
    {
        foreach (['INSERT', 'UPDATE', 'DELETE', 'HARD_DELETE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PIN_CHANGED'] as $action) {
            ActivityLog::create([
                'user_id' => $this->user->id,
                'action' => $action,
                'description' => "Action: {$action} on stores",
            ]);
        }

        $response = $this->actingAs($this->user)->getJson('/api/v1/alerts');

        $response->assertOk();
        $actions = collect($response->json())->pluck('title');
        foreach (['INSERT', 'UPDATE', 'DELETE', 'HARD_DELETE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PIN_CHANGED'] as $action) {
            $this->assertFalse($actions->contains($action), "Expected {$action} to be excluded from notifications");
        }
    }

    public function test_meaningful_activity_still_appears(): void
    {
        ActivityLog::create([
            'user_id' => $this->user->id,
            'action' => 'SALE_RETURN',
            'description' => 'Processed a sale return',
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/v1/alerts');

        $response->assertOk();
        $actions = collect($response->json())->pluck('title');
        $this->assertTrue($actions->contains('SALE_RETURN'));
    }
}
