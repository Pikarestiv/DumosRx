@extends('emails.layouts.master')

@section('content')
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h2 style="color: #1e293b;">Security Alert: New Device Login</h2>
    </div>

    <p>Hi {{ $user->first_name }},</p>

    <p>We noticed a new login to your DumosRx account from a device we haven't seen before.</p>

    <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Device/Browser:</strong> {{ $deviceInfo }}</p>
        <p style="margin: 0 0 10px 0;"><strong>IP Address:</strong> {{ $ipAddress }}</p>
        <p style="margin: 0;"><strong>Time:</strong> {{ $time }}</p>
    </div>

    <p>If this was you, no further action is required.</p>
    
    <p><strong>If this wasn't you</strong>, please change your password immediately and review your active sessions in the DumosRx settings panel to log out of any unrecognized devices.</p>

    <p style="margin-top: 30px;">
        Best regards,<br>
        The DumosRx Security Team
    </p>
</div>
@endsection
