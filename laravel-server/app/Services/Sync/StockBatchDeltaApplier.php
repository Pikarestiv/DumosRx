<?php

namespace App\Services\Sync;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#stockbatchdeltaapplier */
class StockBatchDeltaApplier
{
    public function __construct(private SyncWriteAuthorizer $authorizer) {}

    public function applyStockBatchDeltas(array $stockBatchDeltas, array &$failed, ?array $allowedStoreIds = null): void
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
                $affected = DB::update(
                    'UPDATE stock_batches SET quantity = CASE WHEN quantity + ? < 0 THEN 0 ELSE quantity + ? END WHERE id = ?',
                    [$delta, $delta, $stockBatchId],
                );

                if (! $affected) {
                    Log::warning("Sync push: stock_movements delta of {$delta} referenced unknown stock_batch_id {$stockBatchId}, no batch to apply it to.");
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
}
