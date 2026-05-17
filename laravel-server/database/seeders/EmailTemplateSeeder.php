<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\EmailTemplate;

class EmailTemplateSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $templates = [
            [
                'key' => 'welcome',
                'name' => 'Welcome Email',
                'subject' => 'Welcome to DumosRx!',
                'content' => <<<HTML
@extends('emails.layouts.master')

@section('content')
    <h2>Welcome to DumosRx, {{ \$user->first_name }}!</h2>
    <p>We are thrilled to have you on board. Your pharmacy account (<strong>{{ \$storeName }}</strong>) has been successfully created and your license key is active.</p>
    
    <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
        <h3 style="margin-top: 0; color: #1e293b; font-size: 16px;">Your Login Details:</h3>
        <p style="margin-bottom: 5px;"><strong>Email:</strong> {{ \$user->email }}</p>
        <p style="margin-bottom: 0;"><strong>Password:</strong> The password you created during signup.</p>
    </div>

    <p>With DumosRx, you can seamlessly manage your inventory, sales, and clinical records.</p>
    
    <div style="text-align: center;">
        <a href="{{ \$loginUrl }}" class="button">Log In to Your Dashboard</a>
    </div>

    <p>If you have any questions or need assistance setting up your staff, our support team is always here to help.</p>

    <p>Best regards,<br><strong>The DumosRx Team</strong></p>
@endsection
HTML
                ,
                'variables' => [
                    ['name' => '$user->first_name', 'description' => "Owner's first name"],
                    ['name' => '$user->email', 'description' => "Owner's email address"],
                    ['name' => '$storeName', 'description' => 'The registered pharmacy name'],
                    ['name' => '$loginUrl', 'description' => 'The direct web login URL']
                ]
            ],
            [
                'key' => 'password_reset',
                'name' => 'Password Reset',
                'subject' => 'DumosRx Password Reset',
                'content' => <<<HTML
@extends('emails.layouts.master')

@section('content')
    <h2>Password Reset Request</h2>
    <p>Hello {{ \$user->first_name }},</p>
    <p>We received a request to reset the password for your DumosRx account associated with <strong>{{ \$user->email }}</strong>.</p>
    
    <p>Click the button below to securely reset your password. This link is valid for 60 minutes.</p>
    
    <div style="text-align: center;">
        <a href="{{ \$resetUrl }}" class="button">Reset Password</a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
        If you did not request a password reset, no further action is required and your account remains secure.
    </p>

    <p>Best regards,<br><strong>DumosRx Security Team</strong></p>
    
    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">
        If you're having trouble clicking the "Reset Password" button, copy and paste the URL below into your web browser:<br>
        <a href="{{ \$resetUrl }}" style="color: #4f46e5;">{{ \$resetUrl }}</a>
    </p>
@endsection
HTML
                ,
                'variables' => [
                    ['name' => '$user->first_name', 'description' => "User's first name"],
                    ['name' => '$user->email', 'description' => "User's email address"],
                    ['name' => '$resetUrl', 'description' => 'The unique password reset link']
                ]
            ],
            [
                'key' => 'notification',
                'name' => 'Administrative Notification',
                'subject' => 'DumosRx Platform Notification',
                'content' => <<<HTML
@extends('emails.layouts.master')

@section('content')
    <h2>Important Notification</h2>
    
    <div style="padding: 20px 0; font-size: 16px; line-height: 1.6;">
        {!! \$messageText !!}
    </div>

    <p style="margin-top: 30px;">
        Best regards,<br>
        <strong>DumosRx Administration</strong>
    </p>
@endsection
HTML
                ,
                'variables' => [
                    ['name' => '$messageText', 'description' => 'The custom HTML administrative notification body text']
                ]
            ]
        ];

        foreach ($templates as $t) {
            EmailTemplate::updateOrCreate(
                ['key' => $t['key']],
                [
                    'name' => $t['name'],
                    'subject' => $t['subject'],
                    'content' => $t['content'],
                    'variables' => $t['variables']
                ]
            );
        }
    }
}
