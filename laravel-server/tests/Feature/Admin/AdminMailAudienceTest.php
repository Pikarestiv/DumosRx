<?php

namespace Tests\Feature\Admin;

use App\Mail\AdminCustomMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AdminMailAudienceTest extends TestCase
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
        $this->makeUser('legacy@shop.test', 'admin');
        $this->makeUser('platform@dumosrx.com', 'platform_admin');
        $this->makeUser('agent@dumosrx.com', 'agent');
        $this->makeUser('cashier@shop.test', 'cashier');
        $this->makeUser('cashier2@local.dumosrx.com', 'sales_staff');

        Mail::fake();
    }

    private function makeUser(string $email, string $role): User
    {
        return User::create([
            'first_name' => 'T', 'last_name' => $role,
            'email' => $email,
            'password' => bcrypt('password'),
            'role' => $role,
        ]);
    }

    private function send(array $payload)
    {
        return $this->actingAs($this->superAdmin)->postJson('/api/v1/admin/mail/send', array_merge([
            'subject' => 'Hello',
            'message' => 'Body',
        ], $payload));
    }

    /** @return array<int, string> */
    private function recipients(): array
    {
        return Mail::queued(AdminCustomMail::class)
            ->map(fn ($mail) => $mail->to[0]['address'])
            ->sort()->values()->all();
    }

    public function test_store_owners_audience_reaches_owners_and_legacy_admins_only(): void
    {
        $this->send(['target_type' => 'store_owners'])->assertOk();

        $this->assertSame(['legacy@shop.test', 'owner@shop.test'], $this->recipients());
    }

    public function test_platform_admins_audience_reaches_the_platform_team_only(): void
    {
        $this->send(['target_type' => 'platform_admins'])->assertOk();

        $this->assertSame(['agent@dumosrx.com', 'platform@dumosrx.com', 'super@dumosrx.com'], $this->recipients());
    }

    public function test_staff_audience_skips_placeholder_addresses(): void
    {
        $this->send(['target_type' => 'staff'])->assertOk();

        $this->assertSame(['cashier@shop.test'], $this->recipients());
    }

    public function test_all_audience_never_mails_placeholder_addresses(): void
    {
        $this->send(['target_type' => 'all'])->assertOk();

        $this->assertCount(6, $this->recipients());
        $this->assertNotContains('cashier2@local.dumosrx.com', $this->recipients());
    }

    public function test_specific_audience_reaches_only_the_chosen_users(): void
    {
        $owner = User::where('email', 'owner@shop.test')->first();

        $this->send(['target_type' => 'specific', 'user_ids' => [$owner->id]])->assertOk();

        $this->assertSame(['owner@shop.test'], $this->recipients());
    }

    public function test_unknown_audience_is_rejected(): void
    {
        $this->send(['target_type' => 'everybody'])->assertStatus(422);
        Mail::assertNothingQueued();
    }

    public function test_html_flag_is_carried_on_the_mailable_and_rendered_unescaped(): void
    {
        $this->send(['target_type' => 'store_owners', 'message' => '<p>Hi <strong>there</strong></p>', 'is_html' => true])->assertOk();

        Mail::assertQueued(AdminCustomMail::class, function (AdminCustomMail $mail) {
            $html = $mail->render();

            return str_contains($html, '<strong>there</strong>') && ! str_contains($html, '&lt;strong');
        });
    }

    public function test_html_mode_strips_scripts_and_event_handlers(): void
    {
        $html = (new AdminCustomMail('s', '<p onclick="x()">Hi</p><script>alert(1)</script><a href="javascript:evil()">l</a>', true))->render();

        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('onclick', $html);
        $this->assertStringNotContainsString('javascript:', $html);
        $this->assertStringContainsString('Hi', $html);
    }

    public function test_plain_text_mode_still_escapes_markup(): void
    {
        $html = (new AdminCustomMail('s', '<b>x</b>'))->render();

        $this->assertStringContainsString('&lt;b&gt;x&lt;/b&gt;', $html);
    }
}
