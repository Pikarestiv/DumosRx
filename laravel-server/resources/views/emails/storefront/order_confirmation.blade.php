@extends('emails.layouts.master')

@section('content')
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #1e293b;">Thank you, {{ $order->customer_name }}</h2>
    <p>{{ $store->name }} has received your order <strong>{{ $order->code() }}</strong>. Keep this code if you need to ask about it.</p>

    @include('emails.storefront._order_summary')

    @if ($order->payment_method === 'transfer' && $storefront?->payment_instructions)
        <div style="background-color: #f8fafc; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0 0 6px 0;"><strong>How to pay</strong></p>
            <p style="margin: 0; white-space: pre-line;">{{ $storefront->payment_instructions }}</p>
        </div>
    @endif

    <p>The store will prepare your order. They have your phone number ({{ $order->customer_phone }}) and may contact you to confirm it.</p>
    @if ($store->phone || $storefront?->whatsapp)
        <p>Questions? Contact {{ $store->name }}@if ($store->phone) on {{ $store->phone }}@endif @if ($storefront?->whatsapp)(WhatsApp {{ $storefront->whatsapp }})@endif.</p>
    @endif
</div>
@endsection
