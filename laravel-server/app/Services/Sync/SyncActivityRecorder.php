<?php

namespace App\Services\Sync;

use App\Models\Store;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#syncactivityrecorder */
class SyncActivityRecorder
{
    public function __construct(private SyncOwnershipResolver $ownership) {}

    public function recordStockFingerprint(Request $request, $user, ?string $storeId): void
    {
        $fingerprint = $request->input('stock_fingerprint');
        $deviceId = $request->header('X-Device-Id');

        if (! $storeId || ! $deviceId || ! is_array($fingerprint)) {
            return;
        }

        try {
            app(\App\Services\Admin\StockDivergenceService::class)
                ->record($storeId, $deviceId, $user?->id, $fingerprint);
        } catch (\Throwable $e) {
            Log::warning('Failed to record stock fingerprint', ['error' => $e->getMessage()]);
        }
    }

    public function recordTableFingerprint(Request $request, $user, ?string $storeId): void
    {
        $fingerprint = $request->input('table_fingerprint');
        $deviceId = $request->header('X-Device-Id');

        if (! $storeId || ! $deviceId || ! is_array($fingerprint)) {
            return;
        }

        try {
            app(\App\Services\Admin\TableAgreementService::class)
                ->record($storeId, $deviceId, $user?->id, $fingerprint);
        } catch (\Throwable $e) {
            Log::warning('Failed to record table fingerprint', ['error' => $e->getMessage()]);
        }
    }

    public function recordQueueState(Request $request, $user, ?string $storeId): void
    {
        $report = $request->input('queue_state');
        $deviceId = $request->header('X-Device-Id');

        if (! $storeId || ! $deviceId || ! is_array($report)) {
            return;
        }

        try {
            app(\App\Services\Admin\DeviceQueueReportService::class)
                ->record($storeId, $deviceId, $user?->id, $report);
        } catch (\Throwable $e) {
            Log::warning('Failed to record device queue state', ['error' => $e->getMessage()]);
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function exchangeSyncCommands(Request $request, ?string $storeId): array
    {
        $deviceId = $request->header('X-Device-Id');

        if (! $storeId || ! $deviceId) {
            return [];
        }

        try {
            $service = app(\App\Services\Admin\SyncCommandService::class);
            $outcomes = $request->input('sync_command_results');

            if (is_array($outcomes)) {
                $service->recordOutcome($storeId, $deviceId, $outcomes);
            }

            return $service->pendingFor($storeId, $deviceId);
        } catch (\Throwable $e) {
            Log::warning('Sync command exchange failed', ['error' => $e->getMessage()]);

            return [];
        }
    }

    public function recordRejectedPush(Request $request, ?string $code): void
    {
        try {
            $user = $request->user();
            $storeId = $user ? $this->ownership->resolvePushStoreId($request, $user) : null;

            app(\App\Services\Sync\SyncFailureRecorder::class)->recordRejectedPush(
                $storeId,
                $user?->id,
                match ($code) {
                    'SYNC_DISABLED' => 'sync_disabled',
                    'SYNC_THROTTLED' => 'sync_throttled',
                    'STORE_LIMIT_EXCEEDED' => 'store_limit_exceeded',
                    default => 'server_error',
                },
                count((array) $request->input('changes', [])),
            );
        } catch (\Throwable $e) {
            Log::warning('Could not record a rejected push: '.$e->getMessage());
        }
    }

    public function touchStoreLastSyncAt(Request $request): ?Store
    {
        if ($request->user()) {
            $user = $request->user();
            $storeId = $this->ownership->resolvePushStoreId($request, $user);
            $store = $storeId ? Store::where('id', $storeId)->first() : null;

            if ($store) {
                $isFirstSync = is_null($store->last_sync_at);
                $store->last_sync_at = now();
                $store->save();

                return $isFirstSync ? $store : null;
            }
        }

        return null;
    }

    public function sendFirstSyncAlert(?Store $store, $user): void
    {
        if (! $store || ! $user) {
            return;
        }

        try {
            \App\Services\AdminAlertService::send(
                'First-Time Sync Completed: '.$store->name,
                [
                    'A user has just successfully completed their first local sync with the DumosRx Cloud.',
                    "Store: {$store->name}",
                    "User: {$user->first_name} {$user->last_name} ({$user->email})",
                ]
            );
        } catch (\Exception $e) {
            Log::error('Failed to send super admin alert for sync: '.$e->getMessage());
        }
    }
}
