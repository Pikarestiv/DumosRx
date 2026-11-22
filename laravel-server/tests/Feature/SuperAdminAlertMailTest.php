<?php

namespace Tests\Feature;

use App\Mail\SuperAdminAlertMail;
use App\Services\AdminAlertService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class SuperAdminAlertMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_legacy_two_arg_alerts_include_environment_timestamps_host_kv_table_and_admin_link(): void
    {
        config([
            'app.env' => 'production',
            'app.url' => 'https://api.dumosrx.com',
            'app.frontend_url' => 'https://dumosrx.com',
        ]);

        $mail = new SuperAdminAlertMail(
            'Payment Successful: Pro Plan',
            [
                'A successful payment has been processed.',
                'User: Ada Okafor (ada@example.com)',
                'Amount: NGN 25,000.00',
                'Provider: paystack',
                '',
                '- Monthly billing active',
            ],
        );

        $html = $mail->render();

        $this->assertStringContainsString('MILESTONE', $html);
        $this->assertStringContainsString('PRODUCTION', $html);
        $this->assertStringContainsString('api.dumosrx.com', $html);
        $this->assertStringContainsString('WAT', $html);
        $this->assertStringContainsString('UTC', $html);
        $this->assertStringContainsString('Ada Okafor (ada@example.com)', $html);
        $this->assertStringContainsString('Monthly billing active', $html);
        $this->assertStringContainsString('https://dumosrx.com/admin', $html);
        $this->assertStringContainsString('Open Admin Portal', $html);
    }

    public function test_rich_details_render_metrics_sections_custom_action_and_subject(): void
    {
        config(['app.env' => 'staging', 'app.frontend_url' => 'https://dumosrx.com']);

        $mail = new SuperAdminAlertMail(
            'Daily Platform Summary (2026-11-21)',
            ['Daily briefing across live non-demo stores.'],
            [
                'subject' => 'DumosRx Daily Brief (21 Nov)',
                'severity' => 'summary',
                'badge' => 'Daily Platform Brief',
                'meta' => ['Report Window' => 'Sat, 21 Nov 2026 (WAT)'],
                'metrics' => [
                    ['label' => 'Stores Synced', 'value' => '18', 'hint' => '24 live stores'],
                    ['label' => 'PWA Tills', 'value' => '31', 'hint' => '29 PWA · 2 desktop'],
                ],
                'sections' => [
                    [
                        'heading' => 'PWA & Client Activity',
                        'rows' => ['Active App Builds' => 'v2.4.0 (abc1234): 19'],
                        'items' => ['Top Store: Grace Pharmacy — 14 sales (NGN 125,400.00)'],
                    ],
                ],
                'action' => [
                    'label' => 'Open Operations & Health',
                    'url' => 'https://dumosrx.com/admin/operations',
                ],
            ],
        );

        $built = $mail->build();
        $html = $mail->render();

        $this->assertSame('DumosRx Daily Brief (21 Nov)', $built->subject);
        $this->assertStringContainsString('STAGING', $html);
        $this->assertStringContainsString('Daily Platform Brief', $html);
        $this->assertStringContainsString('Sat, 21 Nov 2026 (WAT)', $html);
        $this->assertStringContainsString('Stores Synced', $html);
        $this->assertStringContainsString('PWA Tills', $html);
        $this->assertStringContainsString('PWA &amp; Client Activity', $html);
        $this->assertStringContainsString('Grace Pharmacy', $html);
        $this->assertStringContainsString('https://dumosrx.com/admin/operations', $html);
    }

    public function test_support_endpoint_escapes_html_and_attaches_communications_link(): void
    {
        config([
            'dumos.admin_emails' => ['ops@dumosrx.com'],
            'app.frontend_url' => 'https://dumosrx.com',
        ]);
        Mail::fake();

        $response = $this->withoutMiddleware()->postJson('/api/v1/support', [
            'name' => 'Chidi',
            'email' => 'chidi@example.com',
            'subject' => 'Receipt printer check',
            'message' => "Line one\n<script>alert(1)</script>",
        ]);

        $response->assertOk();

        Mail::assertSent(SuperAdminAlertMail::class, function (SuperAdminAlertMail $mail) {
            $html = $mail->render();

            return str_contains($html, 'Support Request')
                && str_contains($html, 'https://dumosrx.com/admin/communications')
                && str_contains($html, '&lt;script&gt;alert(1)&lt;/script&gt;')
                && ! str_contains($html, '<script>alert(1)</script>');
        });
    }

    public function test_admin_alert_service_forwards_details_to_mail(): void
    {
        config(['dumos.admin_emails' => ['ops@dumosrx.com']]);
        Mail::fake();

        AdminAlertService::send(
            'Nightly database backup failed',
            ['Connection timed out.'],
            ['severity' => 'critical', 'badge' => 'Backup Failed'],
        );

        Mail::assertSent(SuperAdminAlertMail::class, function (SuperAdminAlertMail $mail) {
            $html = $mail->render();

            return $mail->details['badge'] === 'Backup Failed'
                && str_contains($html, 'Backup Failed')
                && str_contains($html, '#b91c1c');
        });
    }
}
