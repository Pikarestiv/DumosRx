@extends('emails.layouts.master')

@section('content')
    <h2>Important Notification</h2>
    
    <div style="padding: 20px 0; font-size: 16px; line-height: 1.6;">
        {!! $messageText !!}
    </div>

    <p style="margin-top: 30px;">
        Best regards,<br>
        <strong>DumosRx Administration</strong>
    </p>
@endsection
