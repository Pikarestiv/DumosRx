<?php

namespace App\Services\Sync;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#stockbatchdeltaapplier */
class StockBatchDeltaApplier
{
    private ?bool $movementsSoftDelete = null;

    public function __construct(private SyncWriteAuthorizer $authorizer) {}

    /** Every batch this push's movements touch, locked in id order before any movement row, held to commit (A-217). */
    public function lockMovementBatches(array $changes): void
    {
        $batchIds = [];
        $recordIds = [];
        foreach ($changes as $change) {
            if (($change['table_name'] ?? null) !== 'stock_movements') {
                continue;
            }
            $payload = is_array($change['payload'] ?? null) ? $change['payload'] : (json_decode((string) ($change['payload'] ?? ''), true) ?: []);
            if (is_string($payload['stock_batch_id'] ?? null)) {
                $batchIds[] = $payload['stock_batch_id'];
            }
            if (is_string($change['record_id'] ?? null)) {
                $recordIds[] = $change['record_id'];
            }
        }
        foreach (array_chunk(array_unique($recordIds), 500) as $chunk) {
            $batchIds = [...$batchIds, ...DB::table('stock_movements')->whereIn('id', $chunk)->whereNotNull('stock_batch_id')->pluck('stock_batch_id')->all()];
        }

        $batchIds = array_values(array_unique($batchIds));
        sort($batchIds);
        foreach (array_chunk($batchIds, 500) as $chunk) {
            DB::table('stock_batches')->whereIn('id', $chunk)->orderBy('id')->lockForUpdate()->pluck('id');
        }
    }

    /** @param array<string, float|int> $pushInbound each batch's positive movement quantity in this push */
    public function applyStockBatchDeltas(array $stockBatchDeltas, array &$failed, ?array $allowedStoreIds, array $pushInbound): void
    {
        foreach ($stockBatchDeltas as $stockBatchId => $delta) {
            if ($this->authorizer->isBatchOutsideScope($stockBatchId, $allowedStoreIds)) {
                Log::warning("Sync push: refused a stock_movements delta of {$delta} against stock_batch_id {$stockBatchId}, which belongs to a store the caller may not write to.");
                $failed[] = [
                    'id' => null,
                    'table_name' => 'stock_batches',
                    'record_id' => $stockBatchId,
                    'reason' => 'permission_denied',
                ];

                continue;
            }

            DB::beginTransaction();
            try {
                $quantity = $this->resolveQuantity((string) $stockBatchId, (float) $delta, (float) ($pushInbound[$stockBatchId] ?? 0));

                if ($quantity === null) {
                    Log::warning("Sync push: stock_movements delta of {$delta} referenced unknown stock_batch_id {$stockBatchId}, no batch to apply it to.");
                } else {
                    DB::table('stock_batches')->where('id', $stockBatchId)->update(['quantity' => $quantity]);
                }
                DB::commit();
            } catch (\Exception $e) {
                DB::rollBack();
                Log::error("Sync push: failed to apply stock_batch delta of {$delta} to {$stockBatchId}: ".$e->getMessage());
                $failed[] = [
                    'id' => null,
                    'table_name' => 'stock_batches',
                    'record_id' => $stockBatchId,
                    'reason' => $e->getMessage(),
                ];
            }
        }
    }

    /** A-217: the client's resolveBatchQuantity(), so both replicas compute MAX(0, Σlog) outside the A-148 carve-out. */
    private function resolveQuantity(string $stockBatchId, float $pushDelta, float $pushInbound): ?int
    {
        $batch = DB::table('stock_batches')->where('id', $stockBatchId)->lockForUpdate()->first(['quantity', 'product_id']);
        if ($batch === null) {
            return null;
        }
        $stored = $batch->quantity;
        $batch->store_id = DB::table('products')->where('id', $batch->product_id)->value('store_id');

        $log = DB::table('stock_movements')
            ->where('stock_batch_id', $stockBatchId)
            ->when($this->movementsSoftDelete ??= Schema::hasColumn('stock_movements', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))
            ->sharedLock()
            ->selectRaw(
                'COALESCE(SUM(quantity), 0) AS total, COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0) AS inbound,
                 COALESCE(SUM(CASE WHEN store_id IS NOT NULL AND store_id <> ? THEN 1 ELSE 0 END), 0) AS foreign_rows',
                [(string) ($batch->store_id ?? '')],
            )
            ->first();

        // A log holding another store's rows (accepted before A-287, or a mis-stamped product) is not this batch's to rebuild from.
        $mixedStores = $batch->store_id !== null && (int) $log->foreign_rows > 0;
        $carveOut = $mixedStores || (float) $stored > (float) $log->inbound - $pushInbound;

        return (int) max(0, $carveOut ? (float) $stored + $pushDelta : (float) $log->total);
    }
}
