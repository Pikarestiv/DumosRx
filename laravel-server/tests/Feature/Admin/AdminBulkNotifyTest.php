<?php

namespace Tests\Feature\Admin;

use App\Mail\AdminNotification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Coverage for AdminService::bulkNotify(), whose per-user Notification::create()
 * loop was consolidated into a single Notification::bulkCreateFor() bulk insert.
 */
class AdminBulkNotifyTest extends TestCase
{
    use RefreshDatabase;

    protected User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->superAdmin = User::create([
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'email' => 'super@dumosrx.com',
            'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);
    }

    public function test_bulk_notify_creates_one_notification_per_matched_user()
    {
        Mail::fake();

        $storeOwner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);
        $agent = User::create([
            'first_name' => 'Agent', 'last_name' => 'Smith',
            'email' => 'agent@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'agent',
        ]);

        $response = $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/users/bulk-notify', [
            'title' => 'Platform Maintenance',
            'message' => 'We will be down for maintenance tonight.',
        ]);

        $response->assertStatus(200);
        // super_admin (the caller), storeOwner, and agent all match the
        // unfiltered query, so all three get notified.
        $this->assertSame(3, $response->json('count'));
        $this->assertDatabaseCount('notifications', 3);
        foreach ([$this->superAdmin, $storeOwner, $agent] as $recipient) {
            $this->assertDatabaseHas('notifications', [
                'user_id' => $recipient->id,
                'title' => 'Platform Maintenance',
                'type' => 'urgent',
                'is_read' => false,
            ]);
        }
        // AdminNotification implements ShouldQueue, so Mail::send() dispatches
        // it onto the queue rather than sending synchronously - MailFake
        // records that under "queued", not "sent".
        Mail::assertQueued(AdminNotification::class, 3);
    }

    public function test_bulk_notify_filters_by_role()
    {
        Mail::fake();

        $storeOwner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $response = $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/users/bulk-notify', [
            'title' => 'Store Owners Only',
            'message' => 'This message is only for store owners.',
            'filters' => ['role' => 'store_owner'],
        ]);

        $response->assertStatus(200);
        $this->assertSame(1, $response->json('count'));
        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseHas('notifications', ['user_id' => $storeOwner->id]);
    }

    public function test_bulk_notify_still_reports_success_when_an_individual_email_fails()
    {
        Mail::shouldReceive('to')->andThrow(new \Exception('SMTP down'));

        User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => 'owner@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $response = $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/users/bulk-notify', [
            'title' => 'Platform Maintenance',
            'message' => 'We will be down for maintenance tonight.',
        ]);

        // Notification rows are still created even though every email send
        // failed - the notification insert doesn't depend on Mail succeeding.
        $response->assertStatus(200);
        $this->assertSame(2, $response->json('count'));
        $this->assertDatabaseCount('notifications', 2);
    }
}
