<?php

namespace Tests\Feature\Admin;

use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * A-130: a forced password reset's audit row must never carry the plaintext
 * temporary password — it was previously appended to `description`, leaving
 * a live credential readable by anyone with activity-log or DB access.
 */
class AdminForcePasswordResetAuditTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function forcing_a_password_reset_never_logs_the_plaintext_password(): void
    {
        Mail::fake();

        $superAdmin = User::create([
            'first_name' => 'Super', 'last_name' => 'Admin',
            'email' => 'super@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'super_admin',
        ]);

        $target = User::create([
            'first_name' => 'Target', 'last_name' => 'User',
            'email' => 'target@dumosrx.com', 'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $response = $this->actingAs($superAdmin)
            ->postJson("/api/v1/admin/users/{$target->id}/reset-password");

        $response->assertStatus(200);
        $tempPassword = $response->json('temp_password');
        $this->assertNotEmpty($tempPassword);

        $log = ActivityLog::where('action', 'PASSWORD_RESET_FORCE')->firstOrFail();

        $this->assertStringNotContainsString($tempPassword, $log->description);
        $this->assertStringContainsString($target->email, $log->description);
    }
}
