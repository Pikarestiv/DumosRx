<?php

namespace App\Services\Admin;

use App\Models\DeviceQueueReport;
use App\Services\Admin\Concerns\ResolvesDeviceLabels;
use App\Services\Sync\SyncFailureRecorder;
use Illuminate\Support\Str;

/**
 * What each device says is sitting in its own `_sync_queue`. See the
 * stuck-data spec, Phase 3, for why this is reported rather than queried.
 */
class DeviceQueueReportService
{
    use ResolvesDeviceLabels;

    /** Stored per device. The true count is kept separately, so the cap
     *  bounds the payload without ever understating the problem. */
    private const MAX_STORED_ITEMS = 50;

    private const KNOWN_REASONS = [
        'forbidden',
        'permission_denied',
        'unsupported_operation',
        'quantity_received_exceeds_ordered',
        'version_conflict',
        'stale_timestamp',
        'sync_disabled',
        'sync_throttled',
        'store_limit_exceeded',
        'schema_mismatch',
        'server_error',
    ];

    private const FALLBACK_REASON = 'server_error';

    /** Mirrors client/lib/db/sync-engine/delivery-age.ts. */
    private const DELIVERY_BUCKETS = ['under_1m', 'under_5m', 'under_1h', 'under_1d', 'over_1d'];

    public function record(string $storeId, string $deviceId, ?string $userId, array $report): DeviceQueueReport
    {
        $stuck = array_values(array_filter((array) ($report['stuck'] ?? []), 'is_array'));

        $items = array_map(fn (array $item) => [
            'table_name' => Str::limit((string) ($item['table_name'] ?? 'unknown'), 64, ''),
            'record_id' => Str::limit((string) ($item['record_id'] ?? ''), 64, ''),
            'attempts' => max(0, (int) ($item['attempts'] ?? 0)),
            // Never the raw driver error: it embeds the failing SQL and its
            // bindings. Same rule as SyncFailureRecorder.
            'reason' => $this->canonicalReason($item['reason'] ?? null),
        ], array_slice($stuck, 0, self::MAX_STORED_ITEMS));

        $depth = max(0, (int) ($report['queue_depth'] ?? 0));
        app(SyncFailureRecorder::class)->recordQueuePeak($storeId, $depth);

        return DeviceQueueReport::updateOrCreate(
            ['store_id' => $storeId, 'device_id' => $deviceId],
            [
                'user_id' => $userId,
                'queue_depth' => $depth,
                'oldest_queued_seconds' => $this->nonNegativeIntOrNull($report['oldest_queued_seconds'] ?? null),
                'delivered_ages' => $this->deliveredAges($report['delivered_ages'] ?? null),
                'stuck_count' => count($stuck),
                'stuck_items' => $items,
                'reported_at' => now(),
            ],
        );
    }

    public function forStore(string $storeId): array
    {
        $reports = DeviceQueueReport::where('store_id', $storeId)
            ->orderByDesc('stuck_count')
            ->limit(50)
            ->get();

        $labels = $this->deviceLabels($storeId, $reports->pluck('device_id')->all());

        $devices = $reports->map(fn (DeviceQueueReport $report) => [
            'device_id' => $report->device_id,
            'device_label' => $labels[$report->device_id] ?? null,
            'queue_depth' => $report->queue_depth,
            'oldest_queued_seconds' => $report->oldest_queued_seconds,
            'delivered_ages' => $report->delivered_ages,
            'stuck_count' => $report->stuck_count,
            'stuck_items' => $report->stuck_items ?? [],
            'truncated' => $report->stuck_count > count($report->stuck_items ?? []),
            'reported_at' => $report->reported_at?->toIso8601String(),
        ])->values()->all();

        return [
            // Never claim a store is clear on the strength of silence.
            'measured' => $devices !== [],
            'devices_with_stuck_items' => count(array_filter($devices, fn ($d) => $d['stuck_count'] > 0)),
            'devices' => $devices,
        ];
    }

    private function nonNegativeIntOrNull(mixed $value): ?int
    {
        return is_numeric($value) ? max(0, (int) $value) : null;
    }

    /**
     * Null when a bundle reports no ages at all, which must read as "not
     * reported" and never as "every edit arrived instantly".
     *
     * @return array<string, int>|null
     */
    private function deliveredAges(mixed $ages): ?array
    {
        if (! is_array($ages)) {
            return null;
        }

        $buckets = [];

        foreach (self::DELIVERY_BUCKETS as $bucket) {
            $buckets[$bucket] = max(0, (int) ($ages[$bucket] ?? 0));
        }

        return $buckets;
    }

    private function canonicalReason(?string $reason): string
    {
        return $reason !== null && in_array($reason, self::KNOWN_REASONS, true)
            ? $reason
            : self::FALLBACK_REASON;
    }
}
