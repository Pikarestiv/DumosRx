@extends('emails.layouts.master')

@section('content')
    <h2>Welcome to DumosRx, {{ $user->first_name }}!</h2>
    <p>We are thrilled to have you on board. Your pharmacy account (<strong>{{ $storeName }}</strong>) has been successfully created and your license key is active.</p>
    
    <div style="background-color: #f8fafc; padding: 20px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0;">
        <h3 style="margin-top: 0; color: #1e293b; font-size: 16px;">Your Login Details:</h3>
        <p style="margin-bottom: 5px;"><strong>Email:</strong> {{ $user->email }}</p>
        <p style="margin-bottom: 0;"><strong>Password:</strong> The password you created during signup.</p>
    </div>

    <p>With DumosRx, you can seamlessly manage your inventory, sales, and clinical records.</p>
    
    <div style="text-align: center;">
        <a href="{{ $loginUrl }}" class="button">Log In to Your Dashboard</a>
    </div>

    <p>If you have any questions or need assistance setting up your staff, our support team is always here to help.</p>

    <p>Best regards,<br><strong>The DumosRx Team</strong></p>
@endsection
