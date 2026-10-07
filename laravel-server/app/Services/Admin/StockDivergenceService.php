<?php

namespace App\Services\Admin;

use App\Models\DeviceStockReport;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

/**
 * Compares what each device believes about a store's stock against what the
 * server derives from stock_movements. See the stuck-data spec, Phase 1, for
 * why this is a two-integer fingerprint rather than a per-batch upload.
 */
class StockDivergenceService
{
    /** A device and the server agreeing to within this is not a divergence. */
    private const EPSILON = 0.0005;

    /**
     * @param  array{batch_count: int, quantity_sum: float|int}  $fingerprint
     */
    public function record(string $storeId, string $deviceId, ?string $userId, array $fingerprint): DeviceStockReport
    {
        $server = $this->serverFingerprint($storeId);

        return DeviceStockReport::updateOrCreate(
            ['store_id' => $storeId, 'device_id' => $deviceId],
            [
                'user_id' => $userId,
                'device_batch_count' => max(0, (int) ($fingerprint['batch_count'] ?? 0)),
                'device_quantity_sum' => (float) ($fingerprint['quantity_sum'] ?? 0),
                'server_batch_count' => $server['batch_count'],
                'server_quantity_sum' => $server['quantity_sum'],
                // Snapshotted, not recomputed on read: a historical row must
                // not change meaning once written.
                'reported_at' => now(),
            ],
        );
    }

    public function forStore(string $storeId): array
    {
        $reports = DeviceStockReport::where('store_id', $storeId)
            ->orderByDesc('reported_at')
            ->limit(50)
            ->get();

        $devices = $reports->map(function (DeviceStockReport $report) {
            $quantityDelta = round((float) $report->device_quantity_sum - (float) $report->server_quantity_sum, 3);
            $batchDelta = $report->device_batch_count - $report->server_batch_count;

            return [
                'device_id' => $report->device_id,
                'device_batch_count' => $report->device_batch_count,
                'device_quantity_sum' => (float) $report->device_quantity_sum,
                'server_batch_count' => $report->server_batch_count,
                'server_quantity_sum' => (float) $report->server_quantity_sum,
                'quantity_delta' => $quantityDelta,
                'batch_delta' => $batchDelta,
                'diverged' => abs($quantityDelta) > self::EPSILON || $batchDelta !== 0,
                'reported_at' => $report->reported_at?->toIso8601String(),
            ];
        })->values()->all();

        return [
            // A store nobody has reported for has not been measured; saying
            // "no divergence" would be a claim nobody has earned.
            'measured' => $devices !== [],
            'diverged_devices' => count(array_filter($devices, fn (array $d) => $d['diverged'])),
            'devices' => $devices,
        ];
    }

    /** @return array{batch_count: int, quantity_sum: float} */
    private function serverFingerprint(string $storeId): array
    {
        $row = DB::table('stock_batches')
            ->whereIn('product_id', Product::withTrashed()->select('id')->where('store_id', $storeId))
            ->whereNull('deleted_at')
            ->selectRaw('COUNT(*) as batch_count, COALESCE(SUM(quantity), 0) as quantity_sum')
            ->first();

        return [
            'batch_count' => (int) ($row->batch_count ?? 0),
            'quantity_sum' => (float) ($row->quantity_sum ?? 0),
        ];
    }
}
