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

    /** Held from a movement's insert to the push's commit, so the recompute below reads a log no other push is mid-way through. */
    public function lockBatch(?string $stockBatchId): void
    {
        if ($stockBatchId) {
            DB::table('stock_batches')->where('id', $stockBatchId)->lockForUpdate()->value('id');
        }
    }

    /** @param array<string, float|int> $pushInbound each batch's positive movement quantity in this push */
    public function applyStockBatchDeltas(array $stockBatchDeltas, array &$failed, ?array $allowedStoreIds = null, array $pushInbound = []): void
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
                $quantity = $this->resolveQuantity((string) $stockBatchId, (float) $delta, (float) ($pushInbound[$stockBatchId] ?? max(0, $delta)));

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
        $stored = DB::table('stock_batches')->where('id', $stockBatchId)->lockForUpdate()->value('quantity');
        if ($stored === null) {
            return null;
        }

        $log = DB::table('stock_movements')
            ->where('stock_batch_id', $stockBatchId)
            ->when($this->movementsSoftDelete ??= Schema::hasColumn('stock_movements', 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))
            ->sharedLock()
            ->selectRaw('COALESCE(SUM(quantity), 0) AS total, COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0) AS inbound')
            ->first();

        $carveOut = (float) $stored > (float) $log->inbound - $pushInbound;

        return (int) max(0, $carveOut ? (float) $stored + $pushDelta : (float) $log->total);
    }
}
