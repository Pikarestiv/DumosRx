<?php

namespace App\Services\Admin;

use App\Models\DeviceQueueReport;
use Illuminate\Support\Str;

/**
 * What each device says is sitting in its own `_sync_queue`. See the
 * stuck-data spec, Phase 3, for why this is reported rather than queried.
 */
class DeviceQueueReportService
{
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

        return DeviceQueueReport::updateOrCreate(
            ['store_id' => $storeId, 'device_id' => $deviceId],
            [
                'user_id' => $userId,
                'queue_depth' => max(0, (int) ($report['queue_depth'] ?? 0)),
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

        $devices = $reports->map(fn (DeviceQueueReport $report) => [
            'device_id' => $report->device_id,
            'queue_depth' => $report->queue_depth,
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

    private function canonicalReason(?string $reason): string
    {
        return $reason !== null && in_array($reason, self::KNOWN_REASONS, true)
            ? $reason
            : self::FALLBACK_REASON;
    }
}
