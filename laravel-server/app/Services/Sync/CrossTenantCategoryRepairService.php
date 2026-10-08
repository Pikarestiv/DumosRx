<?php

namespace App\Services\Sync;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

class CrossTenantCategoryRepairService
{
    private const UPDATE_CHUNK = 500;

    private int $productsRepointed = 0;

    private int $categoriesCreated = 0;

    private int $categoriesRevived = 0;

    private int $unownedProductsSkipped = 0;

    /** @var array<string, array{products:int, categories:array<int,string>}> */
    private array $perStore = [];

    /** @return array<string, mixed> */
    public function preview(?string $storeId = null): array
    {
        return $this->run($storeId, false);
    }

    /** @return array<string, mixed> */
    public function apply(?string $storeId = null): array
    {
        return DB::transaction(fn () => $this->run($storeId, true));
    }

    /** @return array<string, mixed> */
    private function run(?string $storeId, bool $apply): array
    {
        $this->productsRepointed = 0;
        $this->categoriesCreated = 0;
        $this->categoriesRevived = 0;
        $this->unownedProductsSkipped = 0;
        $this->perStore = [];

        $rows = $this->misalignedRows($storeId);

        $this->unownedProductsSkipped = $rows
            ->filter(fn ($row) => $row->product_store === null)
            ->count();

        $groups = $rows
            ->filter(fn ($row) => $row->product_store !== null)
            ->groupBy(fn ($row) => $row->product_store.'|'.$this->normalizeName($row->category_name));

        foreach ($groups as $group) {
            $first = $group->first();
            $targetId = $this->resolveOwnedCategoryId(
                $first->product_store,
                $first->category_name,
                $first->source_is_active,
                $apply,
            );

            $productIds = $group->pluck('product_id')->all();
            $this->recordStore($first->product_store, count($productIds), $first->category_name);
            $this->productsRepointed += count($productIds);

            if (! $apply || $targetId === null) {
                continue;
            }

            foreach (array_chunk($productIds, self::UPDATE_CHUNK) as $chunk) {
                Product::whereIn('id', $chunk)->update(['category_id' => $targetId]);
            }
        }

        return [
            'applied' => $apply,
            'products_repointed' => $this->productsRepointed,
            'categories_created' => $this->categoriesCreated,
            'categories_revived' => $this->categoriesRevived,
            'unowned_products_skipped' => $this->unownedProductsSkipped,
            'per_store' => $this->perStore,
        ];
    }

    private function misalignedRows(?string $storeId): \Illuminate\Support\Collection
    {
        return DB::table('products as p')
            ->join('categories as c', 'c.id', '=', 'p.category_id')
            ->whereNull('p.deleted_at')
            ->whereNull('c.deleted_at')
            ->where(function ($query) {
                $query->whereNull('c.store_id')
                    ->orWhereColumn('c.store_id', '!=', 'p.store_id');
            })
            ->when($storeId, fn ($query) => $query->where('p.store_id', $storeId))
            ->select([
                'p.id as product_id',
                'p.store_id as product_store',
                'c.name as category_name',
                'c.is_active as source_is_active',
            ])
            ->get();
    }

    private function resolveOwnedCategoryId(
        string $storeId,
        string $name,
        mixed $sourceIsActive,
        bool $apply,
    ): ?string {
        $live = $this->ownedCategoryQuery($storeId, $name)->whereNull('deleted_at')->first();

        if ($live !== null) {
            return $live->id;
        }

        // The (store_id, name) unique index counts soft-deleted rows, so
        // inserting beside one would abort the whole repair transaction.
        $trashed = $this->ownedCategoryQuery($storeId, $name)->whereNotNull('deleted_at')->first();

        if ($trashed !== null) {
            $this->categoriesRevived++;

            if (! $apply) {
                return null;
            }

            $trashed->deleted_at = null;
            $trashed->save();

            return $trashed->id;
        }

        $this->categoriesCreated++;

        if (! $apply) {
            return null;
        }

        // store_id is absent from Category::$fillable, so it cannot be set by
        // mass assignment and is assigned directly here.
        $category = new Category();
        $category->name = $name;
        $category->store_id = $storeId;
        $category->is_active = $sourceIsActive === null ? true : (bool) $sourceIsActive;
        $category->save();

        return $category->id;
    }

    private function ownedCategoryQuery(string $storeId, string $name): \Illuminate\Database\Eloquent\Builder
    {
        return Category::query()
            ->where('store_id', $storeId)
            ->whereRaw('LOWER(name) = ?', [$this->normalizeName($name)]);
    }

    private function recordStore(string $storeId, int $products, string $categoryName): void
    {
        if (! isset($this->perStore[$storeId])) {
            $this->perStore[$storeId] = ['products' => 0, 'categories' => []];
        }

        $this->perStore[$storeId]['products'] += $products;
        $this->perStore[$storeId]['categories'][] = $categoryName;
    }

    private function normalizeName(string $name): string
    {
        return mb_strtolower(trim($name));
    }
}
