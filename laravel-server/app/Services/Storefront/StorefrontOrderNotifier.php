<?php

namespace App\Services\Storefront;

use App\Mail\OnlineOrderConfirmationMail;
use App\Mail\OnlineOrderPlacedMail;
use App\Models\OnlineOrder;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\User;
use Illuminate\Contracts\Mail\Mailable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class StorefrontOrderNotifier
{
    public function __construct(private readonly StorefrontCatalogService $catalogService) {}

    public function send(OnlineOrder $order, Store $store): void
    {
        $order->loadMissing('items.product');
        $storefront = Storefront::where('user_id', $store->user_id)->first();
        $currency = $this->catalogService->storeCurrency($store);

        $owners = collect([User::find($store->user_id)?->email, $store->email])
            ->filter()
            ->unique(fn (string $email) => strtolower($email));

        foreach ($owners as $email) {
            $this->deliver($email, new OnlineOrderPlacedMail($order, $store, $storefront, $currency));
        }

        if ($order->customer_email) {
            $this->deliver($order->customer_email, new OnlineOrderConfirmationMail($order, $store, $storefront, $currency));
        }
    }

    private function deliver(string $to, Mailable $mail): void
    {
        try {
            Mail::to($to)->send($mail);
        } catch (\Throwable $e) {
            Log::warning('Storefront order email could not be sent: '.$e->getMessage());
        }
    }
}
