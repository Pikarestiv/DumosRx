<?php

namespace App\Services\Sync;

use App\Models\UserDevice;

/**
 * Answers "which OTHER devices in this store are behind?" for a till that is
 * about to take a stock count. Rationale and the threshold's justification:
 * laravel-server/AGENTS.md, "Peer sync freshness".
 */
class PeerSyncFreshnessService
{
    public const STALE_AFTER_MINUTES = 60;

    public function stalePeers(string $storeId, ?string $callingDeviceId): array
    {
        $cutoff = now()->subMinutes(self::STALE_AFTER_MINUTES);

        return UserDevice::query()
            ->where('store_id', $storeId)
            ->when($callingDeviceId, fn ($query) => $query->where('device_id', '!=', $callingDeviceId))
            ->get()
            ->groupBy('device_id')
            ->map(fn ($rows) => $rows->sortByDesc('last_synced_at')->first())
            ->filter(fn ($device) => !$device->last_synced_at || $device->last_synced_at->lt($cutoff))
            ->map(fn ($device) => [
                'device_id' => $device->device_id,
                'device_label' => $device->device_label,
                'last_synced_at' => $device->last_synced_at?->toIso8601String(),
                'minutes_behind' => $device->last_synced_at
                    ? (int) $device->last_synced_at->diffInMinutes(now())
                    : null,
            ])
            ->values()
            ->all();
    }
}
