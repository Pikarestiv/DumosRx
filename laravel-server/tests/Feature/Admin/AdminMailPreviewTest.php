<?php

namespace Tests\Feature\Admin;

use App\Mail\AdminCustomMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AdminMailPreviewTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware([
            \App\Http\Middleware\CheckAccountStatus::class,
            \App\Http\Middleware\EnsureEmailIsVerified::class,
            \Illuminate\Routing\Middleware\ThrottleRequests::class,
        ]);

        $this->superAdmin = $this->makeUser('super@dumosrx.com', 'super_admin');
        $this->makeUser('owner@shop.test', 'store_owner');
        Mail::fake();
    }

    private function makeUser(string $email, string $role): User
    {
        return User::create([
            'first_name' => 'T', 'last_name' => $role, 'email' => $email,
            'password' => bcrypt('password'), 'role' => $role,
        ]);
    }

    public function test_preview_renders_html_unescaped_and_sanitised_inside_the_real_template(): void
    {
        $response = $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/mail/preview', [
            'subject' => 'News',
            'message' => '<p>Hi <strong>there</strong></p><script>alert(1)</script>',
            'is_html' => true,
        ])->assertOk();

        $html = $response->json('data.html');
        $this->assertSame('News', $response->json('data.subject'));
        $this->assertStringContainsString('<strong>there</strong>', $html);
        $this->assertStringContainsString('DumosRx Update', $html);
        $this->assertStringNotContainsString('<script', $html);
    }

    public function test_preview_escapes_markup_in_plain_text_mode(): void
    {
        $html = $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/mail/preview', [
            'subject' => 'News', 'message' => '<b>x</b>',
        ])->assertOk()->json('data.html');

        $this->assertStringContainsString('&lt;b&gt;x&lt;/b&gt;', $html);
    }

    public function test_preview_sends_nothing(): void
    {
        $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/mail/preview', ['subject' => 's', 'message' => 'm'])->assertOk();

        Mail::assertNothingQueued();
        Mail::assertNothingSent();
    }

    public function test_test_send_reaches_only_the_named_address_with_the_html_flag(): void
    {
        $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/mail/test', [
            'subject' => 'News', 'message' => '<p>Hi</p>', 'is_html' => true, 'email' => 'me@dumosrx.com',
        ])->assertOk();

        Mail::assertQueued(AdminCustomMail::class, 1);
        Mail::assertQueued(AdminCustomMail::class, fn (AdminCustomMail $mail) => $mail->hasTo('me@dumosrx.com') && $mail->isHtml);
        Mail::assertNotQueued(AdminCustomMail::class, fn (AdminCustomMail $mail) => $mail->hasTo('owner@shop.test'));
    }

    public function test_test_send_rejects_a_malformed_address(): void
    {
        $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/mail/test', [
            'subject' => 's', 'message' => 'm', 'email' => 'not-an-email',
        ])->assertStatus(422);

        Mail::assertNothingQueued();
    }

    public function test_preview_and_test_require_a_subject_and_message(): void
    {
        $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/mail/preview', ['message' => 'm'])->assertStatus(422);
        $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/mail/test', ['subject' => 's', 'email' => 'a@b.co'])->assertStatus(422);
    }

    public function test_guests_and_non_super_admins_cannot_preview_or_test(): void
    {
        $payload = ['subject' => 's', 'message' => 'm', 'email' => 'a@b.co'];

        foreach (['preview', 'test'] as $path) {
            $this->postJson("/api/v1/admin/mail/{$path}", $payload)->assertUnauthorized();
        }

        $agent = $this->makeUser('agent@dumosrx.com', 'agent');
        foreach (['preview', 'test'] as $path) {
            $this->actingAs($agent)->postJson("/api/v1/admin/mail/{$path}", $payload)->assertForbidden();
        }

        Mail::assertNothingQueued();
    }
}
