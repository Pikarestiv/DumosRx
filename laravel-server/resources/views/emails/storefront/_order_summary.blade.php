<table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    @foreach ($order->items as $item)
        <tr>
            <td style="padding: 6px 0; border-bottom: 1px solid #e5e7eb;">{{ $item->product->name ?? 'Item' }} &times; {{ $item->quantity }}</td>
            <td style="padding: 6px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">{{ $currency }} {{ number_format((float) $item->subtotal, 2) }}</td>
        </tr>
    @endforeach
    <tr>
        <td style="padding: 8px 0;"><strong>Total</strong></td>
        <td style="padding: 8px 0; text-align: right;"><strong>{{ $currency }} {{ number_format((float) $order->total_amount, 2) }}</strong></td>
    </tr>
</table>
<p style="margin: 0 0 6px 0;"><strong>Fulfilment:</strong> {{ $order->fulfilment_method === 'delivery' ? 'Delivery' : 'Pickup' }}</p>
<p style="margin: 0 0 6px 0;"><strong>Payment:</strong>
    @if ($order->payment_method === 'paystack') Paid online
    @elseif ($order->payment_method === 'transfer') Transfer / mobile money, not yet confirmed
    @else To be paid at handover @endif
</p>
