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
        $excluded = [
            'INSERT', 'UPDATE', 'DELETE', 'HARD_DELETE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PIN_CHANGED',
            // A-148: self-triggered from Settings > Data, already toasted -
            // a bell notification titled with the raw constant is the exact
            // confusing surface that feature exists to avoid.
            'STOCK_QUANTITY_AUTO_RECONCILED',
        ];
        foreach ($excluded as $action) {
            ActivityLog::create([
                'user_id' => $this->user->id,
                'action' => $action,
                'description' => "Action: {$action} on stores",
            ]);
        }

        $response = $this->actingAs($this->user)->getJson('/api/v1/alerts');

        $response->assertOk();
        $actions = collect($response->json())->pluck('title');
        foreach ($excluded as $action) {
            $this->assertFalse($actions->contains($action), "Expected {$action} to be excluded from notifications");
        }
    }

    public function test_meaningful_activity_still_appears_in_human_readable_title(): void
    {
        ActivityLog::create([
            'user_id' => $this->user->id,
            'action' => 'SALE_RETURN',
            'description' => 'Processed a sale return',
        ]);
        ActivityLog::create([
            'user_id' => $this->user->id,
            'action' => 'TILL_RELINK_CODE_ISSUED',
            'description' => 'Till re-link code issued',
        ]);
        ActivityLog::create([
            'user_id' => $this->user->id,
            'action' => 'RECEIVE_PO',
            'description' => 'Action: RECEIVE_PO on purchase_orders',
        ]);

        $response = $this->actingAs($this->user)->getJson('/api/v1/alerts');

        $response->assertOk();
        $titles = collect($response->json())->pluck('title');
        $this->assertTrue($titles->contains('Sale Return Processed'));
        $this->assertTrue($titles->contains('Till Relink Code Issued'));
        $this->assertTrue($titles->contains('Purchase Order Received'));

        $descriptions = collect($response->json())->pluck('description');
        $this->assertTrue($descriptions->contains('Goods received and recorded into inventory.'));
    }

    public function test_mark_all_as_read_updates_all_user_notifications(): void
    {
        \App\Models\Notification::create([
            'user_id' => $this->user->id,
            'title' => 'Trial 1',
            'message' => 'First message',
            'is_read' => false,
        ]);
        \App\Models\Notification::create([
            'user_id' => $this->user->id,
            'title' => 'Trial 2',
            'message' => 'Second message',
            'is_read' => false,
        ]);

        $this->assertSame(2, \App\Models\Notification::where('user_id', $this->user->id)->where('is_read', false)->count());

        $response = $this->actingAs($this->user)->postJson('/api/v1/alerts/read-all');
        $response->assertOk();

        $this->assertSame(0, \App\Models\Notification::where('user_id', $this->user->id)->where('is_read', false)->count());
    }
}
