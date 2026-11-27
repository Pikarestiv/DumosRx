<?php

namespace App\Services\Storefront;

use App\Models\Notification;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Support\SyncRowStamp;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** The one-off popularity trim when the listing cap starts applying, and the relist after an upgrade; see laravel-server/AGENTS.md, "Online listing cap". */
class StorefrontListingTrimmer
{
    private const TRIMMED_TABLE = 'storefront_trimmed_listings';

    public function __construct(
        private readonly StorefrontListingCap $cap,
        private readonly StorefrontEntitlements $entitlements,
    ) {}

    /** @return int how many products were taken off the storefront */
    public function trimToCap(Store $store): int
    {
        $cap = $this->cap->capFor($store);
        if ($cap === null || $this->cap->listedCount($store->id) <= $cap) {
            return 0;
        }

        $unlisted = $this->rankedIds($store, listed: true)->slice($cap)->values();

        foreach ($unlisted->chunk(500) as $ids) {
            Product::whereIn('id', $ids->all())->toBase()->update(['show_online' => false, ...SyncRowStamp::for('products')]);
        }
        $plan = $this->planOf($store);
        if ($this->entitlements->relistsTrimmedOnUpgrade($plan)) {
            $this->remember($store, $unlisted);
        }
        Product::markStorefrontsDirty([$store->id], []);

        Notification::create([
            'user_id' => $store->user_id,
            'title' => 'Some products were taken off your online store',
            'message' => "Your plan lists up to {$cap} products online, so {$store->name} kept its {$cap} best sellers from the last "
                .StorefrontCatalogService::BEST_SELLER_WINDOW_DAYS." days and {$unlisted->count()} products were taken off the storefront. "
                .'They are still in your inventory and on the till. Turn them back on from Products, or upgrade to '
                .($plan === 'starter' ? 'Pro or Enterprise' : 'Enterprise').' to list them all.',
            'type' => 'warning',
            'is_read' => false,
        ]);

        return $unlisted->count();
    }

    /** @return int how many products a previous trim had taken off and are now listed again */
    public function relistTrimmed(Store $store): int
    {
        $remembered = DB::table(self::TRIMMED_TABLE)->where('store_id', $store->id)->pluck('product_id');
        if ($remembered->isEmpty() || ! $store->online_store_enabled || ! $this->entitlements->forStore($store)['storefront_enabled']) {
            return 0;
        }

        $cap = $this->cap->capFor($store);
        $slots = $cap === null ? $remembered->count() : $cap - $this->cap->listedCount($store->id);
        $relisted = $slots > 0 ? $this->rankedIds($store, listed: false, onlyRemembered: true)->take($slots)->values() : collect();

        foreach ($relisted->chunk(500) as $ids) {
            Product::whereIn('id', $ids->all())->toBase()->update(['show_online' => true, ...SyncRowStamp::for('products')]);
        }
        DB::table(self::TRIMMED_TABLE)->where('store_id', $store->id)
            ->whereIn('product_id', Product::where('store_id', $store->id)->where('show_online', true)->select('id'))
            ->delete();

        if ($relisted->isNotEmpty()) {
            Product::markStorefrontsDirty([$store->id], []);
            Notification::create([
                'user_id' => $store->user_id,
                'title' => 'Products are back on your online store',
                'message' => "Your new plan lists more products online, so {$relisted->count()} products taken off {$store->name}'s storefront earlier are listed again.",
                'type' => 'info',
                'is_read' => false,
            ]);
        }

        return $relisted->count();
    }

    /** @param  Collection<int, string>  $ids */
    private function remember(Store $store, Collection $ids): void
    {
        $now = now();
        foreach ($ids->chunk(500) as $chunk) {
            DB::table(self::TRIMMED_TABLE)->insertOrIgnore(
                $chunk->map(fn (string $id) => ['store_id' => $store->id, 'product_id' => $id, 'trimmed_at' => $now])->all(),
            );
        }
    }

    private function planOf(Store $store): string
    {
        $owner = User::find($store->user_id);

        return $owner ? $this->entitlements->effectivePlan($owner) : 'free';
    }

    /** @return Collection<int, string> */
    private function rankedIds(Store $store, bool $listed, bool $onlyRemembered = false): Collection
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
            ->where('products.show_online', $listed)
            ->when($onlyRemembered, fn ($query) => $query->whereIn('products.id', DB::table(self::TRIMMED_TABLE)->where('store_id', $store->id)->select('product_id')))
            ->leftJoinSub($sales, 'popularity', 'popularity.product_id', '=', 'products.id')
            ->orderByRaw('COALESCE(popularity.units, 0) DESC')
            ->orderByDesc('popularity.last_sold_at')
            ->orderBy('products.name')
            ->orderBy('products.id')
            ->pluck('products.id');
    }
}
