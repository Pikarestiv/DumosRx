@extends('emails.layouts.master')

@section('content')
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h2 style="color: #1e293b;">New online order {{ $order->code() }}</h2>
    <p>{{ $store->name }} just received an order from the online storefront.</p>

    <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0;">
        <p style="margin: 0 0 6px 0;"><strong>Customer:</strong> {{ $order->customer_name }}</p>
        <p style="margin: 0 0 6px 0;"><strong>Phone:</strong> {{ $order->customer_phone }}</p>
        @if ($order->customer_email)<p style="margin: 0 0 6px 0;"><strong>Email:</strong> {{ $order->customer_email }}</p>@endif
        @if ($order->customer_address)<p style="margin: 0;"><strong>Address:</strong> {{ $order->customer_address }}</p>@endif
    </div>

    @include('emails.storefront._order_summary')

    <p style="margin-top: 24px;">Open <strong>Online Orders</strong> in your DumosRx till to prepare it, then mark it fulfilled when the customer collects it. Contact the customer on the number above if you need to confirm anything.</p>
</div>
@endsection
