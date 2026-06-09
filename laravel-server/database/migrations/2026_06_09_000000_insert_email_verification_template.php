<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $content = <<<HTML
@extends('emails.layouts.master')

@section('content')
    <h2>Verify Your Email Address</h2>
    <p>Hello {{ \$user->first_name }},</p>
    <p>Thank you for registering on DumosRx. To ensure the security of your account and unlock full access to the platform, please verify your email address by clicking the button below.</p>
    
    <div style="text-align: center; margin: 30px 0;">
        <a href="{{ \$verificationUrl }}" class="button">Verify Email</a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
        If you did not create an account using this email address, please ignore this email.
    </p>

    <p>Best regards,<br><strong>DumosRx Security Team</strong></p>
    
    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">
        If you're having trouble clicking the "Verify Email" button, copy and paste the URL below into your web browser:<br>
        <a href="{{ \$verificationUrl }}" style="color: #4f46e5;">{{ \$verificationUrl }}</a>
    </p>
@endsection
HTML;

        DB::table('email_templates')->updateOrInsert(
            ['key' => 'email_verification'],
            [
                'name' => 'Email Verification',
                'subject' => 'Please Verify Your DumosRx Account',
                'content' => $content,
                'variables' => json_encode([
                    ['name' => '$user->first_name', 'description' => "User's first name"],
                    ['name' => '$verificationUrl', 'description' => 'The unique email verification link']
                ]),
                'created_at' => now(),
                'updated_at' => now()
            ]
        );
    }

    public function down(): void
    {
        DB::table('email_templates')->where('key', 'email_verification')->delete();
    }
};
