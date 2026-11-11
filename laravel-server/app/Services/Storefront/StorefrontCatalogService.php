<?php

namespace App\Services\Storefront;

use App\Models\Category;
use App\Models\Product;
use App\Models\Store;
use App\Models\Storefront;
use App\Models\User;
use App\Services\SubscriptionService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

class StorefrontCatalogService
{
    public const MAX_STOREFRONT_PRODUCTS = 50;
    public const PER_PAGE = 50;

    public function __construct(
        private readonly SubscriptionService $subscriptionService,
    ) {}

    public function storefrontEnabled(Store $store): bool
    {
        if (! $store->online_store_enabled) {
            return false;
        }

        $owner = User::find($store->user_id);
        if (! $owner) {
            return false;
        }

        return $this->subscriptionService->hasFeature($owner, 'store_url');
    }

    public function storeCurrency(Store $store): string
    {
        return strtoupper((string) ($store->currency ?: config('payment.currency', 'NGN')));
    }

    public function resolveStorefront(string $slug): ?Storefront
    {
        $storefront = Storefront::where('slug', $slug)->first();
        if ($storefront) {
            return $storefront;
        }

        $store = Store::where('store_slug', $slug)->first();
        if (! $store) {
            return null;
        }

        return Storefront::firstOrCreate(
            ['user_id' => $store->user_id],
            [
                'slug' => $store->store_slug,
                'name' => $store->name,
                'primary_store_id' => $store->id,
                'theme' => 'emerald',
                'is_active' => true,
            ]
        );
    }

    /**
     * @return Collection<int, Store>
     */
    public function getStorefrontBranches(Storefront $storefront): Collection
    {
        return Store::where('user_id', $storefront->user_id)
            ->where('online_store_enabled', true)
            ->get();
    }

    public function resolveBranch(
        Storefront $storefront,
        ?string $branchId = null,
        ?string $requestedSlug = null,
    ): ?Store {
        $branches = $this->getStorefrontBranches($storefront);
        if ($branches->isEmpty()) {
            return null;
        }

        if ($branchId) {
            $matched = $branches->firstWhere('id', $branchId);
            if ($matched) {
                return $matched;
            }
        }

        if ($requestedSlug) {
            $matched = $branches->firstWhere('store_slug', $requestedSlug);
            if ($matched) {
                return $matched;
            }
        }

        if ($storefront->primary_store_id) {
            $matched = $branches->firstWhere('id', $storefront->primary_store_id);
            if ($matched) {
                return $matched;
            }
        }

        return $branches->first();
    }

    /**
     * @return Builder<Product>
     */
    public function storeProducts(Store $store): Builder
    {
        return Product::where('user_id', $store->user_id)
            ->where(fn ($q) => $q->where('store_id', $store->id)->orWhereNull('store_id'))
            ->where('is_active', true)
            ->where('show_online', true)
            ->where('is_controlled', false);
    }

    /**
     * @return Collection<int, Product>
     */
    public function getLandingProducts(Store $store, int $limit = self::MAX_STOREFRONT_PRODUCTS): Collection
    {
        return $this->storeProducts($store)
            ->with('category')
            ->inStockFirstAt($store->id)
            ->orderBy('name')
            ->limit($limit)
            ->get();
    }

    /**
     * @return LengthAwarePaginator<int, Product>
     */
    public function paginateProducts(
        Store $store,
        ?string $search = null,
        ?string $categoryId = null,
        int $perPage = self::PER_PAGE,
    ): LengthAwarePaginator {
        $query = $this->storeProducts($store)->with('category');

        if ($search !== null && trim($search) !== '') {
            $term = '%'.trim($search).'%';
            $query->where(function (Builder $q) use ($term) {
                $q->where('name', 'LIKE', $term)
                    ->orWhere('generic_name', 'LIKE', $term)
                    ->orWhere('barcode', 'LIKE', $term);
            });
        }

        if ($categoryId !== null && trim($categoryId) !== '') {
            $query->where('category_id', $categoryId);
        }

        return $query->inStockFirstAt($store->id)
            ->orderBy('name')
            ->paginate(max(1, min(100, $perPage)));
    }

    /**
     * Categories with at least one public online product on this store.
     *
     * @return Collection<int, array{id: string, name: string, count: int}>
     */
    public function getStoreCategories(Store $store): Collection
    {
        $categoryIds = $this->storeProducts($store)
            ->whereNotNull('category_id')
            ->selectRaw('category_id, count(*) as product_count')
            ->groupBy('category_id')
            ->pluck('product_count', 'category_id');

        if ($categoryIds->isEmpty()) {
            return collect();
        }

        return Category::whereIn('id', $categoryIds->keys())
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (Category $cat) => [
                'id' => (string) $cat->id,
                'name' => (string) $cat->name,
                'count' => (int) ($categoryIds[$cat->id] ?? 0),
            ]);
    }

    /**
     * @return array<int, string>
     */
    public function getPublishedSlugs(): array
    {
        $candidateStores = Store::where('online_store_enabled', true)
            ->whereNotNull('store_slug')
            ->where('store_slug', '!=', '')
            ->get();

        $validUserIds = User::whereIn('id', $candidateStores->pluck('user_id')->unique())
            ->get()
            ->filter(fn (User $user) => $this->subscriptionService->hasFeature($user, 'store_url'))
            ->pluck('id')
            ->flip();

        $storeSlugs = $candidateStores
            ->filter(fn (Store $store) => ! $store->isSuspended() && isset($validUserIds[$store->user_id]))
            ->pluck('store_slug')
            ->values()
            ->all();

        $storefrontSlugs = Storefront::where('is_active', true)
            ->get()
            ->filter(function (Storefront $sf) use ($validUserIds) {
                if (! isset($validUserIds[$sf->user_id])) {
                    return false;
                }

                return Store::where('user_id', $sf->user_id)
                    ->where('online_store_enabled', true)
                    ->get()
                    ->contains(fn (Store $s) => ! $s->isSuspended());
            })
            ->pluck('slug')
            ->all();

        return array_values(array_unique(array_merge($storefrontSlugs, $storeSlugs)));
    }
}
