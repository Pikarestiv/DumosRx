<?php

namespace Tests\Feature\Admin;

use App\Mail\AdminCustomMail;
use App\Models\Broadcast;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Coverage for the compose-time helpers behind the "Also send by email"
 * toggle: the test-send endpoint (one AdminCustomMail to one typed address,
 * no Broadcast row, no real store owner) and the preview renderer.
 */
class BroadcastTestEmailTest extends TestCase
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

    protected function makeStoreOwner(string $email): User
    {
        $owner = User::create([
            'first_name' => 'Store', 'last_name' => 'Owner',
            'email' => $email,
            'password' => bcrypt('password'),
            'role' => 'store_owner',
        ]);

        Store::create([
            'user_id' => $owner->id,
            'name' => 'Owner Store',
            'store_slug' => 'owner-store-' . Str::random(8),
            'device_id' => 'WEB-' . Str::random(8),
        ]);

        return $owner;
    }

    protected function sendTest(array $overrides = [])
    {
        return $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/announcements/test-email', array_merge([
            'title' => 'Platform Maintenance',
            'message' => 'We will be down tonight.',
            'email' => 'admin@dumosrx.com',
        ], $overrides));
    }

    public function test_test_email_sends_exactly_one_mail_to_the_named_address()
    {
        Mail::fake();

        $this->sendTest()->assertStatus(200);

        Mail::assertQueued(AdminCustomMail::class, 1);
        Mail::assertQueued(AdminCustomMail::class, fn ($mail) => $mail->hasTo('admin@dumosrx.com')
            && $mail->subjectLine === 'Platform Maintenance');
    }

    public function test_test_email_never_reaches_a_real_store_owner()
    {
        Mail::fake();

        $owner = $this->makeStoreOwner('owner@pharmacy.com');

        $this->sendTest()->assertStatus(200);

        Mail::assertQueued(AdminCustomMail::class, 1);
        Mail::assertNotQueued(AdminCustomMail::class, fn ($mail) => $mail->hasTo($owner->email));
    }

    public function test_test_email_creates_no_broadcast_row()
    {
        Mail::fake();

        $this->sendTest()->assertStatus(200);

        $this->assertSame(0, Broadcast::count());
    }

    public function test_test_email_requires_authentication()
    {
        Mail::fake();

        $this->postJson('/api/v1/admin/announcements/test-email', [
            'title' => 'Platform Maintenance',
            'message' => 'We will be down tonight.',
            'email' => 'admin@dumosrx.com',
        ])->assertStatus(401);

        Mail::assertNothingQueued();
    }

    public function test_test_email_is_forbidden_for_a_non_platform_admin()
    {
        Mail::fake();

        $owner = $this->makeStoreOwner('owner@pharmacy.com');

        $this->actingAs($owner)->postJson('/api/v1/admin/announcements/test-email', [
            'title' => 'Platform Maintenance',
            'message' => 'We will be down tonight.',
            'email' => 'admin@dumosrx.com',
        ])->assertStatus(403);

        Mail::assertNothingQueued();
    }

    public function test_test_email_rejects_a_malformed_recipient_address()
    {
        Mail::fake();

        $this->sendTest(['email' => 'not-an-email'])->assertStatus(422);

        Mail::assertNothingQueued();
    }

    public function test_test_email_requires_a_title_and_message()
    {
        Mail::fake();

        $this->sendTest(['title' => ''])->assertStatus(422);
        $this->sendTest(['message' => ''])->assertStatus(422);

        Mail::assertNothingQueued();
    }

    public function test_preview_returns_the_rendered_mailable_html()
    {
        $response = $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/announcements/preview-email', [
            'title' => 'Platform Maintenance',
            'message' => 'We will be down tonight.',
        ])->assertStatus(200);

        $html = $response->json('data.html');

        $this->assertStringContainsString('DumosRx Update', $html);
        $this->assertStringContainsString('We will be down tonight.', $html);
        $this->assertSame('Platform Maintenance', $response->json('data.subject'));
    }

    public function test_preview_escapes_html_in_the_message_body()
    {
        $response = $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/announcements/preview-email', [
            'title' => 'Heads up',
            'message' => '<script>alert(1)</script>',
        ])->assertStatus(200);

        $this->assertStringNotContainsString('<script>alert(1)</script>', $response->json('data.html'));
    }

    public function test_preview_requires_authentication()
    {
        $this->postJson('/api/v1/admin/announcements/preview-email', [
            'title' => 'Heads up',
            'message' => 'Body',
        ])->assertStatus(401);
    }

    public function test_preview_creates_no_broadcast_row_and_sends_nothing()
    {
        Mail::fake();

        $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/announcements/preview-email', [
            'title' => 'Heads up',
            'message' => 'Body',
        ])->assertStatus(200);

        $this->assertSame(0, Broadcast::count());
        Mail::assertNothingQueued();
    }
}
