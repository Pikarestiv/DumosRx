<?php

namespace App\Services\Sync;

use App\Models\StockMovement;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** A-265 stage 3: rules in laravel-server/AGENTS.md, "Oversell compensation backfill". */
class OversellCompensationService
{
    public const REFERENCE_TYPE = 'oversell';

    public function reason(string $run): string
    {
        return "Oversell compensation: sold units the ledger did not hold (stock:compensate-oversells {$run})";
    }

    public function revertReason(string $run): string
    {
        return "Reverts oversell compensation (stock:compensate-oversells {$run})";
    }

    /** @return Collection<int, object{batch_id: string, product_id: string, product: string, store_id: ?string, cost_price: mixed, inbound: mixed, outbound: mixed, deficit: int, last_arrival: ?string}> */
    public function deficits(?string $storeId): Collection
    {
        $inbound = 'SUM(CASE WHEN m.quantity > 0 THEN m.quantity ELSE 0 END)';

        return DB::table('stock_movements as m')
            ->join('stock_batches as b', 'b.id', '=', 'm.stock_batch_id')
            ->join('products as p', 'p.id', '=', 'b.product_id')
            ->when(Schema::hasColumn('stock_movements', 'deleted_at'), fn ($q) => $q->whereNull('m.deleted_at'))
            ->when(Schema::hasColumn('stock_batches', 'deleted_at'), fn ($q) => $q->whereNull('b.deleted_at'))
            ->whereNull('p.deleted_at')
            ->where('b.is_active', true)
            ->when($storeId, fn ($q) => $q->where('p.store_id', $storeId))
            ->groupBy('b.id', 'b.product_id', 'b.quantity', 'b.cost_price', 'p.name', 'p.store_id')
            ->havingRaw('SUM(m.quantity) < 0')
            ->havingRaw("b.quantity <= {$inbound}")
            ->orderBy('p.name')
            ->get([
                'b.id as batch_id', 'b.product_id', 'p.name as product', 'p.store_id', 'b.cost_price',
                DB::raw("{$inbound} as inbound"),
                DB::raw('SUM(CASE WHEN m.quantity < 0 THEN -m.quantity ELSE 0 END) as outbound'),
                DB::raw('-SUM(m.quantity) as deficit'),
                DB::raw('MAX(m.created_at) as last_arrival'),
            ])
            ->map(function ($row) {
                $row->deficit = (int) $row->deficit;

                return $row;
            });
    }

    /** Why a deficit is left alone, or null to write it; a recent arrival may still have its own compensation in flight. */
    public function skipReason(object $row, \DateTimeInterface $settledBefore): ?string
    {
        return match (true) {
            $row->store_id === null => 'its product has no store, so no device pulls the batch',
            $row->last_arrival !== null && $row->last_arrival > $settledBefore->format('Y-m-d H:i:s') => 'moved recently; its own compensation may still be unpushed',
            default => null,
        };
    }

    /** @return int rows written */
    public function compensate(Collection $deficits, string $run): int
    {
        $written = 0;
        foreach ($deficits as $row) {
            $performedBy = $this->lastOutboundActor($row->batch_id);
            if ($performedBy === null) {
                continue;
            }

            DB::transaction(fn () => StockMovement::create([
                'stock_batch_id' => $row->batch_id,
                'product_id' => $row->product_id,
                'store_id' => $row->store_id,
                'movement_type' => 'adjustment',
                'quantity' => $row->deficit,
                'unit_cost' => $row->cost_price ?? 0,
                'total_cost' => round((float) ($row->cost_price ?? 0) * $row->deficit, 2),
                'reference_type' => self::REFERENCE_TYPE,
                'reason' => $this->reason($run),
                'performed_by' => $performedBy,
                'movement_date' => now(),
            ]));
            $written++;
        }

        return $written;
    }

    /** @return Collection<int, StockMovement> */
    public function writtenBy(string $run): Collection
    {
        return StockMovement::where('reference_type', self::REFERENCE_TYPE)->where('reason', $this->reason($run))->get();
    }

    public function revert(string $run): int
    {
        if (StockMovement::where('reason', $this->revertReason($run))->exists()) {
            return 0;
        }

        $rows = $this->writtenBy($run);
        DB::transaction(function () use ($rows, $run) {
            foreach ($rows as $row) {
                StockMovement::create([
                    'stock_batch_id' => $row->stock_batch_id,
                    'product_id' => $row->product_id,
                    'store_id' => $row->store_id,
                    'movement_type' => 'adjustment',
                    'quantity' => -(int) $row->quantity,
                    'unit_cost' => $row->unit_cost,
                    'total_cost' => $row->total_cost,
                    'reference_id' => $row->id,
                    'reference_type' => self::REFERENCE_TYPE,
                    'reason' => $this->revertReason($run),
                    'performed_by' => $row->performed_by,
                    'movement_date' => now(),
                ]);
            }
        });

        return $rows->count();
    }

    /** The cashier whose sale took the batch below its log, as the client attributes its own compensation. */
    private function lastOutboundActor(string $batchId): ?string
    {
        return DB::table('stock_movements')
            ->where('stock_batch_id', $batchId)
            ->where('quantity', '<', 0)
            ->whereNotNull('performed_by')
            ->orderByDesc('movement_date')
            ->value('performed_by');
    }
}
