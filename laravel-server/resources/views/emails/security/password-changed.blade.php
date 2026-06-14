@extends('emails.layouts.master')

@section('content')
    <h2 class="title">Password Changed Successfully</h2>
    
    <p>Hi {{ $user->first_name ?? 'there' }},</p>
    
    <p>We are writing to confirm that the password for your DumosRx account ({{ $user->email }}) was successfully changed on {{ now()->format('F j, Y, \a\t g:i A') }}.</p>
    
    <p>If you made this change, you don't need to do anything else. You can log in with your new password.</p>
    
    <div style="text-align: center; margin-top: 30px;">
        <a href="{{ config('app.frontend_url') }}/login" class="button">Log In to Your Dashboard</a>
    </div>

    <p style="margin-top: 30px;"><strong>Didn't make this change?</strong></p>
    <p>If you didn't change your password, please secure your account immediately. Contact our support team as soon as possible.</p>
    
    <p>Best regards,<br><strong>The DumosRx Team</strong></p>
@endsection
