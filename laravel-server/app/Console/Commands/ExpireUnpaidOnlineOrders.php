<?php

namespace App\Console\Commands;

use App\Models\Notification;
use App\Models\OnlineOrder;
use App\Models\User;
use App\Services\Storefront\StorefrontOrderNotifier;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ExpireUnpaidOnlineOrders extends Command
{
    protected $signature = 'storefront:expire-unpaid-orders';

    protected $description = 'Cancel unpaid storefront orders that outlived their hold, releasing the stock they reserved.';

    public function handle(StorefrontOrderNotifier $notifier): int
    {
        $expired = 0;

        foreach ((array) config('dumos.storefront.unpaid_hold_minutes') as $method => $minutes) {
            if ((int) $minutes <= 0) {
                continue;
            }

            $ids = OnlineOrder::where('order_status', 'pending')
                ->where('payment_status', 'pending')
                ->where('payment_method', $method)
                ->whereNull('ready_at')
                ->where('created_at', '<', now()->subMinutes((int) $minutes))
                ->pluck('id');

            foreach ($ids as $id) {
                $order = $this->expire($id);

                if ($order) {
                    $expired++;
                    $this->tell($order, $notifier);
                }
            }
        }

        $this->info("Expired {$expired} unpaid order(s).");

        return self::SUCCESS;
    }

    private function expire(string $id): ?OnlineOrder
    {
        return DB::transaction(function () use ($id) {
            $order = OnlineOrder::where('id', $id)->lockForUpdate()->first();

            if (! $order || $order->order_status !== 'pending' || $order->ready_at !== null) {
                return null;
            }

            $order->update(['order_status' => 'cancelled', 'cancel_reason' => 'expired']);

            return $order;
        });
    }

    private function tell(OnlineOrder $order, StorefrontOrderNotifier $notifier): void
    {
        $store = $order->store;

        if (! $store) {
            return;
        }

        Notification::bulkCreateFor(User::where('store_id', $store->id)->orWhere('id', $store->user_id)->pluck('id'), [
            'title' => 'Online order expired',
            'message' => "Order #{$order->id} from {$order->customer_name} expired unpaid and was cancelled, so its stock is available again.",
            'type' => 'online_order',
        ]);

        $notifier->cancelled($order, $store);
    }
}
