<?php

namespace App\Services\Admin;

use App\Models\UserDevice;

/**
 * Read side of per-device sync visibility - see `App\Services\Web\UserDeviceTracker`
 * for the write side, and laravel-server/AGENTS.md's "Per-device sync
 * visibility" for the full picture. Split out of AdminUserService to avoid
 * widening that file's own file-size-rule violation any further.
 */
class AdminUserDeviceService
{
    /**
     * One row (the most recently synced device) per user id, batched into a
     * single query rather than one per row of a paginated staff/users list -
     * the same N+1 concern AdminUserService::getEffectivePermissions() notes
     * for a different field.
     */
    public function latestDevicePerUser($userIds)
    {
        return UserDevice::whereIn('user_id', $userIds)
            ->orderByDesc('last_synced_at')
            ->get()
            ->unique('user_id')
            ->keyBy('user_id');
    }

    /**
     * Every device a user has ever synced from, most recent first - backs
     * the Store Staff list's "view sync history" drill-down.
     */
    public function getUserDevices(string $id): array
    {
        return UserDevice::where('user_id', $id)
            ->orderByDesc('last_synced_at')
            ->get()
            ->map(fn ($device) => [
                'deviceId' => $device->device_id,
                'deviceLabel' => $device->device_label ?: $device->device_id,
                'storeId' => $device->store_id,
                'lastSyncedAt' => $device->last_synced_at?->diffForHumans(),
                'lastSyncedAtIso' => $device->last_synced_at?->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}
