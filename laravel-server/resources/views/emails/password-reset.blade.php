@extends('emails.layouts.master')

@section('content')
    <h2>Password Reset Request</h2>
    <p>Hello {{ $user->first_name }},</p>
    <p>We received a request to reset the password for your DumosRx account associated with <strong>{{ $user->email }}</strong>.</p>
    
    <p>Click the button below to securely reset your password. This link is valid for 60 minutes.</p>
    
    <div style="text-align: center;">
        <a href="{{ $resetUrl }}" class="button">Reset Password</a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
        If you did not request a password reset, no further action is required and your account remains secure.
    </p>

    <p>Best regards,<br><strong>DumosRx Security Team</strong></p>
    
    <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    <p style="font-size: 12px; color: #9ca3af; word-break: break-all;">
        If you're having trouble clicking the "Reset Password" button, copy and paste the URL below into your web browser:<br>
        <a href="{{ $resetUrl }}" style="color: #4f46e5;">{{ $resetUrl }}</a>
    </p>
@endsection
