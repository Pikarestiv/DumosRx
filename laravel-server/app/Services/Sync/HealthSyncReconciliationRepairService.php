<?php

namespace App\Services\Sync;

use App\Models\StockMovement;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class HealthSyncReconciliationRepairService
{
    public const INCIDENT_MOVEMENT_TYPE = 'sync_reconciliation';

    public const INCIDENT_THROUGH = '2026-10-10 10:00:00';

    public const REVERSAL_MOVEMENT_TYPE = 'sync_reconciliation_reversal';

    public const REVERSAL_REFERENCE_TYPE = 'stock_movement';

    public const LARGEST_SHOWN = 15;

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
        $incidentRows = $this->unreversedIncidentMovements($storeId);
        $logSums = $this->logSums($incidentRows->pluck('stock_batch_id')->unique());
        $storedQuantities = $this->storedQuantities($incidentRows->pluck('stock_batch_id')->unique());

        $perStore = [];
        $corrections = [];
        $skipped = [];
        $batches = 0;
        $movementsReversed = 0;
        $unitsRestored = 0;
        $clamped = 0;
        $drifted = 0;

        foreach ($incidentRows->groupBy('stock_batch_id') as $batchId => $rows) {
            $incidentDelta = (int) $rows->sum('quantity');
            $stored = (int) ($storedQuantities[$batchId] ?? 0);
            $logSum = (int) ($logSums[$batchId] ?? 0);
            $target = $logSum - $incidentDelta;
            $storeKey = (string) ($rows->first()->store_id ?? '');
            $productName = (string) ($rows->first()->product_name ?? 'unknown product');

            if ($apply) {
                $written = $this->writeBatchUnderLock((string) $batchId, $incidentDelta);

                if ($written === null) {
                    $skipped[] = [
                        'product' => $productName,
                        'store' => $storeKey,
                        'batch' => (string) $batchId,
                    ];

                    continue;
                }

                foreach ($rows as $row) {
                    $this->writeReversal($row);
                }

                $stored = $written['stored'];
                $logSum = $written['log_sum'];
                $target = $written['target'];
            }

            $batches++;
            $movementsReversed += $rows->count();
            $unitsRestored += -$incidentDelta;

            if ($target < 0) {
                $clamped++;
            }

            if ($stored !== $logSum) {
                $drifted++;
            }

            $perStore[$storeKey]['batches'] = ($perStore[$storeKey]['batches'] ?? 0) + 1;
            $perStore[$storeKey]['movements'] = ($perStore[$storeKey]['movements'] ?? 0) + $rows->count();
            $perStore[$storeKey]['units'] = ($perStore[$storeKey]['units'] ?? 0) + (-$incidentDelta);

            $corrections[] = [
                'product' => $productName,
                'store' => $storeKey,
                'units' => -$incidentDelta,
                'from' => $stored,
                'to' => max(0, $target),
            ];
        }

        usort($corrections, fn ($a, $b) => $b['units'] <=> $a['units']);

        return [
            'applied' => $apply,
            'batches' => $batches,
            'movements_reversed' => $movementsReversed,
            'units_restored' => $unitsRestored,
            'clamped' => $clamped,
            'drifted' => $drifted,
            'skipped' => count($skipped),
            'skipped_batches' => $skipped,
            'per_store' => $perStore,
            'largest' => array_slice($corrections, 0, self::LARGEST_SHOWN),
        ];
    }

    private function unreversedIncidentMovements(?string $storeId): Collection
    {
        return DB::table('stock_movements as m')
            ->leftJoin('stock_movements as r', function ($join) {
                $join->on('r.reference_id', '=', 'm.id')
                    ->where('r.movement_type', '=', self::REVERSAL_MOVEMENT_TYPE);
            })
            ->leftJoin('products as p', 'p.id', '=', 'm.product_id')
            ->where('m.movement_type', self::INCIDENT_MOVEMENT_TYPE)
            ->where('m.movement_date', '<=', self::INCIDENT_THROUGH)
            ->whereNotNull('m.stock_batch_id')
            ->whereNull('r.id')
            ->when($storeId, fn ($query) => $query->where('m.store_id', $storeId))
            ->select([
                'm.id',
                'm.stock_batch_id',
                'm.product_id',
                'm.store_id',
                'm.quantity',
                'm.performed_by',
                'p.name as product_name',
            ])
            ->get();
    }

    /** @return array<string, int> */
    private function logSums(Collection $batchIds): array
    {
        if ($batchIds->isEmpty()) {
            return [];
        }

        return DB::table('stock_movements')
            ->whereIn('stock_batch_id', $batchIds->all())
            ->groupBy('stock_batch_id')
            ->selectRaw('stock_batch_id, SUM(quantity) as total')
            ->pluck('total', 'stock_batch_id')
            ->map(fn ($total) => (int) $total)
            ->all();
    }

    /** @return array<string, int> */
    private function storedQuantities(Collection $batchIds): array
    {
        if ($batchIds->isEmpty()) {
            return [];
        }

        return DB::table('stock_batches')
            ->whereIn('id', $batchIds->all())
            ->pluck('quantity', 'id')
            ->map(fn ($quantity) => (int) $quantity)
            ->all();
    }

    private function writeReversal(object $row): void
    {
        StockMovement::create([
            'stock_batch_id' => $row->stock_batch_id,
            'product_id' => $row->product_id,
            'store_id' => $row->store_id,
            'movement_type' => self::REVERSAL_MOVEMENT_TYPE,
            'quantity' => -(int) $row->quantity,
            'reason' => $this->reversalReason((string) $row->id),
            'reference_id' => $row->id,
            'reference_type' => self::REVERSAL_REFERENCE_TYPE,
            'performed_by' => $row->performed_by,
            'movement_date' => now(),
        ]);
    }

    public function reversalReason(string $movementId): string
    {
        return 'A-214 repair: reverses Health Sync sync_reconciliation movement '.$movementId;
    }

    /** @return array{stored:int, log_sum:int, target:int}|null */
    private function writeBatchUnderLock(string $batchId, int $incidentDelta): ?array
    {
        $stored = DB::table('stock_batches')->where('id', $batchId)->lockForUpdate()->value('quantity');

        if ($stored === null) {
            return null;
        }

        $logSum = (int) DB::table('stock_movements')
            ->where('stock_batch_id', $batchId)
            ->lockForUpdate()
            ->sum('quantity');

        $target = $logSum - $incidentDelta;

        $updated = DB::table('stock_batches')
            ->where('id', $batchId)
            ->where('quantity', (int) $stored)
            ->update(['quantity' => max(0, $target), 'updated_at' => now()]);

        if ($updated === 0) {
            return null;
        }

        return ['stored' => (int) $stored, 'log_sum' => $logSum, 'target' => $target];
    }
}
