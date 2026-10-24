<?php

namespace App\Services\Sync;

use App\Models\ActivityLog;
use App\Models\Product;
use App\Models\StockBatch;
use App\Models\StockMovement;
use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#quantityreconciliationservice */
class QuantityReconciliationService
{
    public const RECONCILIATION_MOVEMENT_TYPE = 'sync_reconciliation';

    public const RECONCILIATION_REASON = 'Automatic stock quantity reconciliation';

    public const RECONCILIATION_ACTION = 'STOCK_QUANTITY_AUTO_RECONCILED';

    /** @return array{0: int, 1: int, 2: array<int, array<string, mixed>>} */
    public function reconcile(Request $request, $currentUser, array $allowedStoreIds): array
    {
        $entries = $request->input('batches');
        $batches = StockBatch::whereIn('id', array_column($entries, 'id'))->get()->keyBy('id');
        $productStoreIds = Product::whereIn('id', $batches->pluck('product_id')->filter()->unique())
            ->pluck('store_id', 'id');

        $checked = 0;
        $reconciled = 0;
        $perStoreTotals = [];
        $movements = [];

        foreach ($entries as $entry) {
            $batch = $batches->get($entry['id']);
            if (! $batch) {
                continue;
            }

            $storeId = $productStoreIds->get($batch->product_id) ?? $batch->store_id;
            if (! $storeId || ! in_array($storeId, $allowedStoreIds, true)) {
                continue;
            }

            $checked++;

            $currentQuantity = (int) $batch->quantity;
            $targetQuantity = (int) $entry['quantity'];
            if ($currentQuantity === $targetQuantity) {
                continue;
            }

            $movement = $this->writeQuantityReconciliation($batch, $storeId, $currentQuantity, $targetQuantity, $currentUser);
            if (! $movement) {
                continue;
            }

            $movements[] = $movement;
            $reconciled++;
            $perStoreTotals[$storeId]['batches'] = ($perStoreTotals[$storeId]['batches'] ?? 0) + 1;
            $perStoreTotals[$storeId]['delta'] = ($perStoreTotals[$storeId]['delta'] ?? 0)
                + ($targetQuantity - $currentQuantity);
        }

        $this->logQuantityReconciliations($perStoreTotals, $currentUser, $request);

        return [$reconciled, $checked, $movements];
    }

    public function writeQuantityReconciliation(
        StockBatch $batch,
        string $storeId,
        int $currentQuantity,
        int $targetQuantity,
        $currentUser,
    ): ?array {
        return DB::transaction(function () use ($batch, $storeId, $currentQuantity, $targetQuantity, $currentUser) {
            $updated = DB::table('stock_batches')
                ->where('id', $batch->id)
                ->where('quantity', $currentQuantity)
                ->update(['quantity' => $targetQuantity, 'updated_at' => now()]);

            if ($updated === 0) {
                return null;
            }

            $movement = StockMovement::create([
                'stock_batch_id' => $batch->id,
                'product_id' => $batch->product_id,
                'store_id' => $storeId,
                'movement_type' => self::RECONCILIATION_MOVEMENT_TYPE,
                'quantity' => $targetQuantity - $currentQuantity,
                'reason' => self::RECONCILIATION_REASON,
                'performed_by' => $currentUser->id,
                'movement_date' => now(),
            ]);

            return [
                'id' => $movement->id,
                'stock_batch_id' => $movement->stock_batch_id,
                'product_id' => $movement->product_id,
                'store_id' => $movement->store_id,
                'movement_type' => $movement->movement_type,
                'quantity' => $movement->quantity,
                'reason' => $movement->reason,
                'performed_by' => $movement->performed_by,
                'movement_date' => $movement->movement_date->toJSON(),
                'created_at' => $movement->created_at->toJSON(),
                'updated_at' => $movement->updated_at->toJSON(),
            ];
        });
    }

    private function logQuantityReconciliations(array $perStoreTotals, $currentUser, Request $request): void
    {
        foreach ($perStoreTotals as $storeId => $totals) {
            $store = Store::where('id', $storeId)->first();
            if (! $store) {
                continue;
            }

            ActivityLog::create([
                'user_id' => $currentUser->id,
                'store_id' => $store->id,
                'action' => self::RECONCILIATION_ACTION,
                'description' => "Automatic stock quantity reconciliation for {$store->name} ({$store->id})",
                'properties' => [
                    'batches_reconciled' => $totals['batches'],
                    'total_quantity_delta' => $totals['delta'],
                    'device_id' => $request->header('X-Device-Id'),
                    'device_label' => $request->header('X-Device-Label'),
                    'app_version' => $request->header('X-App-Version'),
                ],
            ]);
        }
    }
}
