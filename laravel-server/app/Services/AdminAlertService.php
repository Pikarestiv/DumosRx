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
        
        if (empty($emails)) {
            return;
        }

        foreach ($emails as $email) {
            $email = trim($email);
            if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
                Mail::to($email)->queue(new SuperAdminAlertMail($title, $messageLines));
            }
        }
    }
}
