<?php

namespace Tests\Feature;

use App\Mail\SuperAdminAlertMail;
use App\Services\AdminAlertService;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * A-125: looping Mail::to($email)->send(...) per admin address turned every
 * alert into N blocking SMTP round-trips. One Mail::to([...addresses])->send()
 * call is a single round-trip regardless of admin count.
 */
class AdminAlertServiceTest extends TestCase
{
    public function test_sends_one_email_to_all_configured_admins_instead_of_one_per_admin(): void
    {
        config(['dumos.admin_emails' => ['one@dumosrx.com', ' two@dumosrx.com ']]);
        Mail::fake();

        AdminAlertService::send('Test Alert', ['A line.']);

        Mail::assertSentCount(1);
        Mail::assertSent(SuperAdminAlertMail::class, function ($mail) {
            return $mail->hasTo('one@dumosrx.com') && $mail->hasTo('two@dumosrx.com');
        });
    }

    public function test_drops_invalid_addresses_without_dropping_the_valid_ones(): void
    {
        config(['dumos.admin_emails' => ['not-an-email', 'valid@dumosrx.com']]);
        Mail::fake();

        AdminAlertService::send('Test Alert', ['A line.']);

        Mail::assertSentCount(1);
        Mail::assertSent(SuperAdminAlertMail::class, function ($mail) {
            return $mail->hasTo('valid@dumosrx.com');
        });
    }

    public function test_sends_nothing_when_no_admin_emails_are_configured(): void
    {
        config(['dumos.admin_emails' => []]);
        Mail::fake();

        AdminAlertService::send('Test Alert', ['A line.']);

        Mail::assertNothingSent();
    }
}
