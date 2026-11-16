<?php

namespace App\Mail;

use App\Models\OnlineOrder;
use App\Models\Store;
use App\Models\Storefront;
use Illuminate\Mail\Mailable;

class OnlineOrderPlacedMail extends Mailable
{
    public function __construct(
        public readonly OnlineOrder $order,
        public readonly Store $store,
        public readonly ?Storefront $storefront,
        public readonly string $currency,
    ) {}

    public function build(): static
    {
        return $this->subject("New online order {$this->order->code()} for {$this->store->name}")->view('emails.storefront.order_placed');
    }
}
