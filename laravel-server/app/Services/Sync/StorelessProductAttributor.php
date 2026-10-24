<?php

namespace App\Services\Sync;

use App\Models\Product;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * A-248: once a push is fully written, gives each store-less product it touched the one store its stock names.
 * Rules: laravel-server/AGENTS.md, "A store-less product is attributed by its stock".
 */
class StorelessProductAttributor
{
    /** @var array<string, list<string>> Product id to the client-sent stores this push named for its stock. */
    private array $candidates = [];

    /** @var array<string, true> Products this push created: the only ones the active store may fall back to. */
    private array $inserted = [];

    /** @var list<string> */
    private array $attributed = [];

    public function afterWrite(string $table, Model $row, bool $storeIsTheClients, bool $isInsert): void
    {
        if ($table === 'products' && $isInsert) {
            $this->inserted[(string) $row->getKey()] = true;
        }

        [$productId, $store] = match ($table) {
            'products' => [$row->getKey(), null],
            'stock_batches' => [$row->product_id, $row->store_id],
            'stock_movements' => [$row->product_id, $storeIsTheClients ? $row->store_id : null],
            default => [null, null],
        };

        if (!$productId) {
            return;
        }

        $this->candidates[(string) $productId] ??= [];
        if ($store !== null) {
            $this->candidates[(string) $productId][] = (string) $store;
        }
    }

    /**
     * @param  list<string>|null  $allowedStoreIds  null for a super admin, who is never attributed for.
     * @param  string|null  $activeStoreId  the fallback for a product this push created with no stock evidence, as before A-248.
     */
    public function attribute(?array $allowedStoreIds, ?string $activeStoreId, PushedRowRestamper $restamper, \DateTimeInterface $at): void
    {
        if ($allowedStoreIds === null) {
            return;
        }

        foreach ($this->candidates as $productId => $pushedStores) {
            $product = Product::withTrashed()->find($productId);
            if ($product === null || $product->store_id !== null) {
                continue;
            }

            $evidence = array_values(array_unique([...$pushedStores, ...$this->batchStores($productId)]));
            if ($evidence === [] && $activeStoreId !== null && isset($this->inserted[$productId])) {
                $evidence = [$activeStoreId];
            }
            if ($evidence === []) {
                continue;
            }
            if (count($evidence) !== 1 || !in_array($evidence[0], $allowedStoreIds, true)) {
                Log::info('Sync push: left a store-less product unattributed, its stock names more than one store (A-248)', ['product_id' => $productId]);

                continue;
            }

            $product->store_id = $evidence[0];
            $product->_version = (int) ($product->_version ?? 0) + 1;
            $product->save();
            $restamper->remember($product);
            $restamper->commitChange();
            $this->attributed[] = $productId;
        }

        $this->restampBatches($at);
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
