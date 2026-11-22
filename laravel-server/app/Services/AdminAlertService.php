<?php

namespace App\Services;

use App\Mail\SuperAdminAlertMail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class AdminAlertService
{
    /**
     * @param  string  $title
     * @param  array<int, string>|string  $messageLines
     * @param  array<string, mixed>  $details
     */
    public static function send($title, $messageLines, array $details = []): void
    {
        $emails = config('dumos.admin_emails', []);

        $validEmails = array_values(array_filter(
            array_map('trim', $emails),
            fn ($email) => filter_var($email, FILTER_VALIDATE_EMAIL),
        ));

        if (empty($validEmails)) {
            return;
        }

        try {
            Mail::to($validEmails)->send(new SuperAdminAlertMail($title, $messageLines, $details));
        } catch (\Throwable $e) {
            self::sendIndividually($validEmails, $title, $messageLines, $details, $e);
        }
    }

    /**
     * @param  array<int, string>  $emails
     * @param  array<int, string>|string  $messageLines
     * @param  array<string, mixed>  $details
     */
    private static function sendIndividually(array $emails, string $title, array|string $messageLines, array $details, \Throwable $bulkFailure): void
    {
        Log::warning('Admin alert to all recipients failed, retrying one by one: '.$bulkFailure->getMessage());

        foreach ($emails as $email) {
            try {
                Mail::to($email)->send(new SuperAdminAlertMail($title, $messageLines, $details));
            } catch (\Throwable $e) {
                Log::error("Admin alert to {$email} failed: ".$e->getMessage());
            }
        }
    }
}
