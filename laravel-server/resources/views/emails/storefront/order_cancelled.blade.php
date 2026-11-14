@extends('emails.layouts.master')

@section('content')
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #1e293b;">Your order was cancelled</h2>
    <p>
        Order <strong>{{ $order->code() }}</strong> at {{ $store->name }} was cancelled
        @if ($order->cancel_reason === 'expired') because it was not paid in time. If you still want these items, please place a new order. @else by the store. @endif
    </p>

    @include('emails.storefront._order_summary')

    @if ($order->payment_status === 'paid' || $order->payment_status === 'refunded')
        <p>You paid online, so the store will refund you. If you do not see it within a few days, contact them with your order code.</p>
    @endif

    @if ($store->phone || $storefront?->whatsapp)
        <p>Questions? Contact {{ $store->name }}@if ($store->phone) on {{ $store->phone }}@endif @if ($storefront?->whatsapp)(WhatsApp {{ $storefront->whatsapp }})@endif.</p>
    @endif
</div>
@endsection
