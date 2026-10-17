<?php

namespace App\Services\Admin;

use App\Models\DeviceStockReport;
use App\Models\Product;
use App\Services\Admin\Concerns\ResolvesDeviceLabels;
use Illuminate\Support\Facades\DB;

/**
 * Compares what each device believes about a store's stock against what the
 * server derives from stock_movements. See the stuck-data spec, Phase 1, for
 * why this is a small fingerprint rather than a per-batch upload, and
 * laravel-server/AGENTS.md for the value sum's nullability and scope.
 */
class StockDivergenceService
{
    use ResolvesDeviceLabels;

    /** A device and the server agreeing to within this is not a divergence. */
    private const EPSILON = 0.0005;

    /**
     * Past this age a snapshot describes a device that has stopped reporting,
     * not a device that disagrees. See laravel-server/AGENTS.md, "Absence of a
     * measurement is not a disagreement".
     */
    private const STALE_AFTER_HOURS = 48;

    /**
     * @param  array{batch_count: int, quantity_sum: float|int, value_sum?: float|int}  $fingerprint
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
                'device_value_sum' => isset($fingerprint['value_sum'])
                    ? (float) $fingerprint['value_sum']
                    : null,
                'server_batch_count' => $server['batch_count'],
                'server_quantity_sum' => $server['quantity_sum'],
                'server_value_sum' => $server['value_sum'],
                // Snapshotted, not recomputed on read: a historical row must
                // not change meaning once written.
                'reported_at' => now(),
            ],
        );
    }

    /** Drops one device's snapshot; it returns when that device next reports. */
    public function forget(string $storeId, string $deviceId): int
    {
        return DeviceStockReport::where('store_id', $storeId)
            ->where('device_id', $deviceId)
            ->delete();
    }

    public function forStore(string $storeId): array
    {
        $reports = DeviceStockReport::where('store_id', $storeId)
            ->orderByDesc('reported_at')
            ->limit(50)
            ->get();

        $deviceIds = $reports->pluck('device_id')->all();
        $labels = $this->deviceLabels($storeId, $deviceIds);
        $nicknames = $this->deviceNicknames($storeId, $deviceIds);

        $devices = $reports->map(function (DeviceStockReport $report) use ($labels, $nicknames) {
            $quantityDelta = round((float) $report->device_quantity_sum - (float) $report->server_quantity_sum, 3);
            $batchDelta = $report->device_batch_count - $report->server_batch_count;
            $deviceValue = $report->device_value_sum === null ? null : (float) $report->device_value_sum;
            $serverValue = $report->server_value_sum === null ? null : (float) $report->server_value_sum;

            $hasLocalCopy = $report->device_batch_count > 0 || $report->server_batch_count === 0;
            $isStale = $report->reported_at === null
                || $report->reported_at->lt(now()->subHours(self::STALE_AFTER_HOURS));
            $disagrees = abs($quantityDelta) > self::EPSILON || $batchDelta !== 0;

            return [
                'device_id' => $report->device_id,
                'device_label' => $labels[$report->device_id] ?? null,
                'device_nickname' => $nicknames[$report->device_id] ?? null,
                'device_batch_count' => $report->device_batch_count,
                'device_quantity_sum' => (float) $report->device_quantity_sum,
                'server_batch_count' => $report->server_batch_count,
                'server_quantity_sum' => (float) $report->server_quantity_sum,
                'device_value_sum' => $deviceValue,
                'server_value_sum' => $serverValue,
                'quantity_delta' => $quantityDelta,
                'batch_delta' => $batchDelta,
                'value_delta' => $deviceValue === null || $serverValue === null
                    ? null
                    : round($deviceValue - $serverValue, 2),
                'has_local_copy' => $hasLocalCopy,
                'stale' => $isStale,
                'diverged' => $disagrees && $hasLocalCopy && ! $isStale,
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

    /** @return array{batch_count: int, quantity_sum: float, value_sum: float} */
    private function serverFingerprint(string $storeId): array
    {
        $row = DB::table('stock_batches')
            ->whereIn('product_id', Product::withTrashed()->select('id')->where('store_id', $storeId))
            ->whereNull('deleted_at')
            ->selectRaw(
                'COUNT(*) as batch_count,'
                .' COALESCE(SUM(quantity), 0) as quantity_sum,'
                .' COALESCE(SUM(quantity * COALESCE(cost_price, 0)), 0) as value_sum'
            )
            ->first();

        return [
            'batch_count' => (int) ($row->batch_count ?? 0),
            'quantity_sum' => (float) ($row->quantity_sum ?? 0),
            'value_sum' => (float) ($row->value_sum ?? 0),
        ];
    }
}
