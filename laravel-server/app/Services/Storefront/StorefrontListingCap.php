<?php

namespace App\Services\Storefront;

use App\Models\Product;
use App\Models\Store;
use App\Support\SyncRowStamp;
use Illuminate\Database\Eloquent\Model;

/** The per-store online listing cap (max_online_products); see laravel-server/AGENTS.md, "Online listing cap". */
class StorefrontListingCap
{
    public const OVER_CAP_MESSAGE = 'Your Pro plan lists up to :cap products online. Turn another product off or upgrade to Enterprise.';

    /** @var array<string, int|null> */
    private array $caps = [];

    public function __construct(private readonly StorefrontEntitlements $entitlements) {}

    public function capFor(Store $store): ?int
    {
        if (! $store->online_store_enabled) {
            return null;
        }

        $entitlements = $this->entitlements->forStore($store);

        return $entitlements['storefront_enabled'] ? $entitlements['max_online_products'] : null;
    }

    public function listedCount(string $storeId): int
    {
        return Product::where('store_id', $storeId)->where('show_online', true)->count();
    }

    /** Forces show_online off on a product about to be listed past its store's cap; true when it did. */
    public function withholdsListing(string $table, Model $model): bool
    {
        if ($table !== 'products' || ! $model->getAttribute('show_online') || ! $model->getAttribute('store_id')) {
            return false;
        }

        if ($model->exists && $model->getOriginal('show_online')) {
            return false;
        }

        $storeId = (string) $model->getAttribute('store_id');
        if (! array_key_exists($storeId, $this->caps)) {
            $store = Store::find($storeId);
            $this->caps[$storeId] = $store ? $this->capFor($store) : null;
        }

        if ($this->caps[$storeId] === null || $this->listedCount($storeId) < $this->caps[$storeId]) {
            return false;
        }

        $model->setAttribute('show_online', false);

        return true;
    }

    /** Moves a withheld row past the version the push reports, so the till pulls show_online back off. */
    public function stampWithheld(Model $model): void
    {
        $query = Product::withTrashed()->whereKey($model->getKey());
        $query->toBase()->update(SyncRowStamp::for('products'));
        $model->setAttribute('_version', $query->value('_version'));
    }
}
