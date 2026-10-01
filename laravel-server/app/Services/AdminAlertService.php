<?php

namespace App\Services;

use Illuminate\Support\Facades\Mail;
use App\Mail\SuperAdminAlertMail;

class AdminAlertService
{
    /**
     * Send an alert to all configured super admins.
     *
     * @param string $title
     * @param array|string $messageLines
     * @return void
     */
    public static function send($title, $messageLines)
    {
        $emails = config('dumos.admin_emails', []);

        // One Mail::to() with every address is one SMTP round-trip
        // regardless of admin count, not N - the registration-latency
        // concern this call site exists inside (A-125) is N blocking
        // round-trips, not merely "an email gets sent".
        $validEmails = array_values(array_filter(
            array_map('trim', $emails),
            fn ($email) => filter_var($email, FILTER_VALIDATE_EMAIL),
        ));

        if (empty($validEmails)) {
            return;
        }

        Mail::to($validEmails)->send(new SuperAdminAlertMail($title, $messageLines));
    }
}
