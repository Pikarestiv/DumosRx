<?php

namespace App\Services\Web;

use App\Models\UserDevice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Records that a user's device is still active, for the admin panel's
 * per-device sync visibility - never consulted for sync correctness or
 * authorization. See laravel-server/AGENTS.md, "Per-device sync visibility".
 */
class UserDeviceTracker
{
    /**
     * Called from SyncController's push()/pull()/counts(). Throttled to
     * roughly once a minute per (user, device) pair so this isn't a write
     * on every single sync call; a device with no X-Device-Id header (an
     * old client build) is silently skipped. $storeId must already be
     * ownership-verified by the caller (e.g. resolvePushStoreId()) - never
     * pass an unvalidated X-Store-Id header straight through, or this
     * becomes attributable to a store the device never actually synced.
     * Never allowed to fail the sync request it's called from.
     */
    public static function touch(Request $request, $user, ?string $storeId): void
    {
        $deviceId = $request->header('X-Device-Id');
        if (! $user || ! $deviceId) {
            return;
        }

        try {
            $existing = UserDevice::where('user_id', $user->id)
                ->where('device_id', $deviceId)
                ->first();

            if ($existing && $existing->last_synced_at && $existing->last_synced_at->gt(now()->subMinute())) {
                return;
            }

            UserDevice::updateOrCreate(
                ['user_id' => $user->id, 'device_id' => $deviceId],
                [
                    'store_id' => $storeId,
                    'device_label' => $request->header('X-Device-Label'),
                    'last_synced_at' => now(),
                ],
            );
        } catch (\Throwable $e) {
            Log::warning('UserDeviceTracker::touch failed', ['error' => $e->getMessage()]);
        }
    }
}
