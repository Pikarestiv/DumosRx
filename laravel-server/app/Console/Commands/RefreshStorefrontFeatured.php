<?php

namespace App\Console\Commands;

use App\Models\Product;
use App\Models\Store;
use App\Models\SystemConfig;
use App\Services\Storefront\StorefrontCatalogService;
use Illuminate\Console\Command;

class RefreshStorefrontFeatured extends Command
{
    public const SNAPSHOT_KEY = 'storefront_featured_snapshot';

    protected $signature = 'storefront:refresh-featured';

    protected $description = 'Mark dirty only the published storefronts whose best-seller featured products changed since the last refresh.';

    public function handle(StorefrontCatalogService $catalog): int
    {
        $previous = (array) SystemConfig::getVal(self::SNAPSHOT_KEY, []);
        $current = [];

        foreach ($this->publishedStores($catalog) as $store) {
            $current[$store->id] = sha1(implode(',', $catalog->featuredProductIds($store)));
        }

        $changed = array_keys(array_diff_assoc($current, $previous));

        Product::markStorefrontsDirty($changed, []);
        SystemConfig::setVal(
            self::SNAPSHOT_KEY,
            $current,
            'Hash of each published store\'s featured product ids at the last storefront:refresh-featured run.',
        );

        $this->info('Featured products changed on '.count($changed).' of '.count($current).' published storefront(s).');

        return self::SUCCESS;
    }

    /**
     * @return iterable<Store>
     */
    private function publishedStores(StorefrontCatalogService $catalog): iterable
    {
        return Store::where('online_store_enabled', true)
            ->whereNotNull('store_slug')
            ->where('store_slug', '!=', '')
            ->get()
            ->filter(fn (Store $store) => ! $store->isSuspended() && $catalog->storefrontEnabled($store));
    }
}
