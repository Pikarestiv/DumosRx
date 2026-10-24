<?php

namespace App\Services\Sync;

use App\Models\Store;
use Illuminate\Http\Request;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#syncgate */
class SyncGate
{
    public function __construct(private SyncOwnershipResolver $ownership) {}

    public function isStoresOnlySetupOverridePull(Request $request, $lastSyncedMap): bool
    {
        return $request->boolean('setup')
            && is_array($lastSyncedMap)
            && array_keys($lastSyncedMap) === ['stores']
            && ($lastSyncedMap['stores'] ?? null) === '';
    }

    private const SYNC_RUN_MAX_MINUTES = 10;

    private function syncRunId(Request $request): ?string
    {
        $runId = trim((string) $request->header('X-Sync-Run-Id', ''));
        if ($runId === '' || strlen($runId) > 64 || ! preg_match('/^[A-Za-z0-9._:-]+$/', $runId)) {
            return null;
        }

        return $runId;
    }

    public function validateSync(Request $request, $isPush = true)
    {
        $user = $request->user();
        if ($user && ! $user->hasRole('super_admin')) {
            $subscriptionService = app(\App\Services\SubscriptionService::class);
            $owner = $subscriptionService->getSubscriptionOwner($user);

            $sub = $owner->subscriptions()->where('status', 'active')->where('end_date', '>', now())->latest()->first();
            $plan = $sub ? strtolower($sub->plan_name) : 'free';

            $systemConfig = \App\Models\SystemConfig::getVal('subscription_plans', []);
            $canSync = $systemConfig['tiers'][$plan]['features']['cloud_sync'] ?? false;

            $syncedStoreId = $this->ownership->resolvePushStoreId($request, $user);
            $store = $syncedStoreId ? Store::where('id', $syncedStoreId)->first() : null;

            $isManual = $request->boolean('manual');
            $isSetup = $isPush
                ? ($request->boolean('setup') && ! ($store && $store->last_sync_at))
                : ((empty($request->input('last_synced', [])) && ! ($store && $store->last_sync_at))
                    || $this->isStoresOnlySetupOverridePull($request, $request->input('last_synced', [])));

            if (! $isSetup) {
                if (! $canSync) {
                    return [
                        'valid' => false,
                        'message' => 'Cloud sync is disabled on your current plan. Please upgrade to a premium plan to backup your data.',
                        'code' => 'SYNC_DISABLED',
                        'status' => 403,
                    ];
                }

                $syncIntervalMinutes = $systemConfig['tiers'][$plan]['limits']['sync_interval'] ?? 0;

                if ($syncIntervalMinutes > 0) {
                    $runId = $this->syncRunId($request);
                    $isSameRun = $runId !== null
                        && $store
                        && $store->last_sync_run_id === $runId
                        && $store->last_sync_run_started_at
                        && abs((int) $store->last_sync_run_started_at->diffInMinutes(now())) < self::SYNC_RUN_MAX_MINUTES;

                    if (! $isManual && ! $isSameRun && $store && $store->last_sync_at) {
                        $minutesSinceLastSync = abs((int) $store->last_sync_at->diffInMinutes(now()));
                        if ($minutesSinceLastSync < $syncIntervalMinutes) {
                            if (! $isPush && $minutesSinceLastSync === 0) {
                            } else {
                                $intervalText = $syncIntervalMinutes >= 60
                                    ? floor($syncIntervalMinutes / 60).' hours'
                                    : $syncIntervalMinutes.' minutes';

                                return [
                                    'valid' => false,
                                    'message' => "Sync limit reached. Your current plan synchronizes once every {$intervalText}. Last sync: ".$store->last_sync_at->diffForHumans().'. Please upgrade your plan for faster sync.',
                                    'code' => 'SYNC_THROTTLED',
                                    'status' => 429,
                                ];
                            }
                        }
                    }

                    if ($runId !== null && ! $isSameRun && $store) {
                        $store->forceFill([
                            'last_sync_run_id' => $runId,
                            'last_sync_run_started_at' => now(),
                        ])->save();
                    }
                }
            }

            $subscriptionService->enforceStaffLimits($owner);

            if ($store) {
                \App\Services\PermissionGroupSeeder::ensureSeeded($store);
            }

            $storeLimit = \App\Models\SystemConfig::getVal('subscription_plans')['tiers'][$plan]['limits']['stores'] ?? 0;
            if ($storeLimit !== -1) {
                $allowedStoreIds = Store::where('user_id', $owner->id)->orderBy('created_at', 'asc')->limit($storeLimit)->pluck('id')->toArray();

                $requestedStoreId = $request->header('X-Store-Id') ?? $request->input('store_id');
                $syncStoreId = null;
                if ($requestedStoreId && Store::where('id', $requestedStoreId)->where('user_id', $owner->id)->exists()) {
                    $syncStoreId = $requestedStoreId;
                }
                if (! $syncStoreId) {
                    $syncStoreId = $user->store_id ?? Store::where('user_id', $user->id)->value('id');
                }

                if ($syncStoreId && ! in_array($syncStoreId, $allowedStoreIds)) {
                    return [
                        'valid' => false,
                        'message' => 'Sync rejected. Your '.ucfirst($plan)." plan limits you to {$storeLimit} store(s). This store exceeds your limit and has been temporarily paused from cloud syncing.",
                        'code' => 'STORE_LIMIT_EXCEEDED',
                        'status' => 403,
                    ];
                }
            }
        }

        return ['valid' => true];
    }
}
