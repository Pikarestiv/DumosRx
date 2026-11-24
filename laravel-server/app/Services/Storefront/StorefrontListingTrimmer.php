<?php

namespace App\Services\Storefront;

use App\Models\Notification;
use App\Models\Product;
use App\Models\Store;
use App\Support\SyncRowStamp;
use Illuminate\Support\Facades\DB;

/** The one-off popularity trim when the listing cap starts applying; see laravel-server/AGENTS.md, "Online listing cap". */
class StorefrontListingTrimmer
{
    public function __construct(private readonly StorefrontListingCap $cap) {}

    /** @return int how many products were taken off the storefront */
    public function trimToCap(Store $store): int
    {
        $cap = $this->cap->capFor($store);
        if ($cap === null || $this->cap->listedCount($store->id) <= $cap) {
            return 0;
        }

        $unlisted = $this->rankedListedIds($store)->slice($cap)->values();

        foreach ($unlisted->chunk(500) as $ids) {
            Product::whereIn('id', $ids->all())->toBase()->update(['show_online' => false, ...SyncRowStamp::for('products')]);
        }
        Product::markStorefrontsDirty([$store->id], []);

        Notification::create([
            'user_id' => $store->user_id,
            'title' => 'Some products were taken off your online store',
            'message' => "Your plan lists up to {$cap} products online, so {$store->name} kept its {$cap} best sellers from the last "
                .StorefrontCatalogService::BEST_SELLER_WINDOW_DAYS." days and {$unlisted->count()} products were taken off the storefront. "
                .'They are still in your inventory and on the till. Turn them back on from Products, or upgrade to Enterprise to list them all.',
            'type' => 'warning',
            'is_read' => false,
        ]);

        return $unlisted->count();
    }

    /** @return \Illuminate\Support\Collection<int, string> */
    private function rankedListedIds(Store $store): \Illuminate\Support\Collection
    {
        $cutoff = now()->utc()->subDays(StorefrontCatalogService::BEST_SELLER_WINDOW_DAYS);
        $sales = DB::table('sale_items')
            ->join('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->where('sales.store_id', $store->id)
            ->whereNotIn('sales.payment_status', StorefrontCatalogService::NOT_SOLD_PAYMENT_STATUSES)
            ->whereNull('sales.deleted_at')
            ->whereNull('sale_items.deleted_at')
            ->groupBy('sale_items.product_id')
            ->selectRaw('sale_items.product_id, SUM(CASE WHEN sales.transaction_date >= ? THEN sale_items.quantity ELSE 0 END) AS units, MAX(sales.transaction_date) AS last_sold_at', [$cutoff]);

        return Product::where('products.store_id', $store->id)
            ->where('products.show_online', true)
            ->leftJoinSub($sales, 'popularity', 'popularity.product_id', '=', 'products.id')
            ->orderByRaw('COALESCE(popularity.units, 0) DESC')
            ->orderByDesc('popularity.last_sold_at')
            ->orderBy('products.name')
            ->orderBy('products.id')
            ->pluck('products.id');
    }
}
