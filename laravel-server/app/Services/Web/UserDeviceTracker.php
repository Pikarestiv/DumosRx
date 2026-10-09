<?php

namespace App\Services\Web;

use App\Models\User;
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
     *
     * Attributed to the staff member actually signed in at the till when the
     * client names one it can vouch for, not to the bearer - see
     * resolveActingUserId() and laravel-server/AGENTS.md, A-202.
     */
    public static function touch(Request $request, $user, ?string $storeId): void
    {
        $deviceId = $request->header('X-Device-Id');
        if (! $user || ! $deviceId) {
            return;
        }

        try {
            // Inside the try: this contract is that nothing here can fail the
            // sync request it is called from, and this now runs a query.
            $userId = self::resolveActingUserId($request, $storeId) ?? $user->id;

            $existing = UserDevice::where('user_id', $userId)
                ->where('device_id', $deviceId)
                ->first();

            if ($existing && $existing->last_synced_at && $existing->last_synced_at->gt(now()->subMinute())) {
                return;
            }

            UserDevice::updateOrCreate(
                ['user_id' => $userId, 'device_id' => $deviceId],
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

    /**
     * The locally signed-in user, or null to fall back to the bearer. A staff
     * PIN login never mints its own token, so this header is the only way the
     * server can learn who was at the till - and it is self-asserted, which
     * is why it is accepted only for a user who already belongs to the
     * store the caller has been verified to own. A device still running a
     * build that sends no header keeps the bearer attribution it has always
     * had, so this stays readable by every version in the field.
     */
    private static function resolveActingUserId(Request $request, ?string $storeId): ?string
    {
        $actingUserId = $request->header('X-Acting-User-Id');
        if (! $actingUserId || ! $storeId) {
            return null;
        }

        return User::where('id', $actingUserId)
            ->where('store_id', $storeId)
            ->value('id');
    }
}
