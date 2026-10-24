<?php

namespace App\Services\Sync;

use App\Models\Product;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * A-248: once a push is fully written, gives each store-less product it touched the one store its batches name.
 * Rules: laravel-server/AGENTS.md, "A store-less product is attributed by its stock".
 */
class StorelessProductAttributor
{
    /** @var array<string, list<string>> Product id to the client-sent stores committed changes named for its stock. */
    private array $candidates = [];

    /** @var array<string, list<string>> The same, for the change in progress. */
    private array $pending = [];

    /** @var list<string> */
    private array $attributed = [];

    public function afterWrite(string $table, Model $row, bool $storeIsTheClients): void
    {
        [$productId, $store] = match ($table) {
            'products' => [$row->getKey(), null],
            'stock_batches' => [$row->product_id, $row->store_id],
            'stock_movements' => [$row->product_id, $storeIsTheClients ? $row->store_id : null],
            default => [null, null],
        };

        if (!$productId) {
            return;
        }

        $this->pending[(string) $productId] ??= [];
        if ($store !== null) {
            $this->pending[(string) $productId][] = (string) $store;
        }
    }

    public function commitChange(): void
    {
        foreach ($this->pending as $productId => $stores) {
            $this->candidates[$productId] = [...($this->candidates[$productId] ?? []), ...$stores];
        }
        $this->pending = [];
    }

    public function discardChange(): void
    {
        $this->pending = [];
    }

    /** @param list<string>|null $allowedStoreIds null for a super admin, whose scope is every store. */
    public function attribute(?array $allowedStoreIds, CrossStoreReferenceGuard $guard, PushedRowRestamper $restamper, \DateTimeInterface $at): void
    {
        if ($this->candidates === []) {
            return;
        }

        $storeless = Product::withTrashed()->whereIn('id', array_keys($this->candidates))->whereNull('store_id')->get();

        foreach ($storeless as $product) {
            $evidence = array_values(array_unique([...$this->candidates[(string) $product->id], ...$this->batchStores((string) $product->id)]));
            if ($evidence === []) {
                continue;
            }
            if (count($evidence) !== 1 || ($allowedStoreIds !== null && !in_array($evidence[0], $allowedStoreIds, true))) {
                Log::info('Sync push: left a store-less product unattributed (A-248)', [
                    'product_id' => $product->id,
                    'reason' => count($evidence) !== 1 ? 'stock names more than one store' : 'stock names a store outside the session',
                ]);

                continue;
            }

            $this->stamp($product, $evidence[0], $guard, $restamper);
        }

        $this->restampBatches($at);
    }

    private function stamp(Product $product, string $storeId, CrossStoreReferenceGuard $guard, PushedRowRestamper $restamper): void
    {
        try {
            DB::transaction(function () use ($product, $storeId, $guard, $restamper) {
                $reOwned = $guard->apply('products', ['category_id' => $product->category_id], $storeId, (string) $product->id);
                $product->category_id = $reOwned['category_id'];
                $product->store_id = $storeId;
                $product->_version = (int) ($product->_version ?? 0) + 1;
                $product->save();
                $restamper->remember($product);
                $guard->commitChange($restamper);
                $restamper->commitChange();
            });
            $this->attributed[] = (string) $product->id;
        } catch (\Throwable $e) {
            $guard->discardChange();
            $restamper->discardChange();
            Log::warning('Sync push: could not attribute a store-less product (A-248)', ['product_id' => $product->id, 'error' => $e->getMessage()]);
        }
    }

    /** A batch is pulled through its product but filtered by its own stamp, so it must move with the product. */
    private function restampBatches(\DateTimeInterface $at): void
    {
        if ($this->attributed === [] || !Schema::hasColumn('stock_batches', '_synced_at')) {
            return;
        }

        foreach (array_chunk($this->attributed, 500) as $chunk) {
            try {
                DB::transaction(fn () => DB::table('stock_batches')->whereIn('product_id', $chunk)->update(['_synced_at' => $at]));
            } catch (\Throwable $e) {
                Log::warning('Sync push: could not restamp an attributed product\'s batches (A-248)', ['error' => $e->getMessage()]);
            }
        }
    }

    /** Batch stores are set by the client and never backfilled, unlike a movement's, so they are evidence. */
    private function batchStores(string $productId): array
    {
        return DB::table('stock_batches')->where('product_id', $productId)->whereNotNull('store_id')->distinct()->pluck('store_id')->all();
    }
}
