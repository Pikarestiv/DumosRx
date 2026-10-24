<?php

namespace App\Services\Sync;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#pushconflictresolver */
class PushConflictResolver
{
    public function isQuantityOnlyStockBatchUpdate(string $tableName, array $payload): bool
    {
        if ($tableName !== 'stock_batches') {
            return false;
        }

        $meaningfulPayload = $payload;
        foreach (['id', '_version', '_deleted', '_synced', '_synced_at', 'created_at', 'updated_at', 'quantity', 'user_id', 'store_id'] as $ignoredField) {
            unset($meaningfulPayload[$ignoredField]);
        }

        return count($meaningfulPayload) === 0;
    }

    /**
     * @param  class-string<Model>  $modelClass
     */
    public function findAuditLogByClientId(string $modelClass, $recordId, $currentStoreId, bool $lock = false): ?Model
    {
        if ($currentStoreId === null || $currentStoreId === '') {
            return null;
        }

        $query = $modelClass::where('properties->client_id', $recordId)
            ->where('store_id', $currentStoreId);

        if ($lock) {
            $query->lockForUpdate();
        }

        return $query->orderBy('id')->first();
    }

    public function resolveUpdateConflict(string $tableName, $model, array $payload, bool $isCommutativeTable, $recordId, bool $isResentInsert = false): array
    {
        $payloadVersion = isset($payload['_version']) ? (int) $payload['_version'] : null;
        $modelVersion = isset($model->_version) ? (int) $model->_version : null;

        if ($payloadVersion !== null && $modelVersion !== null) {
            if ($isCommutativeTable) {
                return [false, null, $modelVersion];
            }

            if ($payloadVersion === $modelVersion) {
                return [false, null, $isResentInsert ? $modelVersion : $modelVersion + 1];
            }

            if (! $isResentInsert) {
                Log::info("Sync push: version conflict for {$tableName} {$recordId} (payload version {$payloadVersion}, server version {$modelVersion})");
            }

            return [true, 'version_conflict', null];
        }

        // Not dead code: payloads without _version still reach it (docs/SYNC_SERVER_RATIONALE.md).
        if (! $isCommutativeTable && $model->updated_at && isset($payload['updated_at'])) {
            $modelUpdatedAt = \Carbon\Carbon::parse($model->updated_at);
            $payloadUpdatedAt = \Carbon\Carbon::parse($payload['updated_at']);
            if ($payloadUpdatedAt->lt($modelUpdatedAt)) {
                Log::info("Sync push: Ignored older update (timestamp fallback) for {$tableName} {$recordId}");

                return [true, 'stale_timestamp', null];
            }
        }

        return [false, null, null];
    }

    public function findDuplicateInsertConflict(string $modelClass, string $tableName, array $payload, $recordId)
    {
        if ($tableName === 'users') {
            $conflict = $modelClass::where(function ($q) use ($payload) {
                if (! empty($payload['email'])) {
                    $q->where('email', $payload['email']);
                }
            })
                ->orWhere(function ($q) use ($payload) {
                    $q->where('username', $payload['username'] ?? null)
                        ->where('store_id', $payload['store_id'] ?? null);
                })
                ->first();
            if ($conflict) {
                Log::warning('Sync push skipped user insert due to duplicate email/username: '.($payload['email'] ?? $payload['username'] ?? $recordId));
            }

            return $conflict;
        }

        if (($tableName === 'categories' || $tableName === 'suppliers') && ! empty($payload['name'])) {
            $payloadStoreId = $payload['store_id'] ?? null;
            $conflict = $modelClass::where('name', $payload['name'])
                ->when(
                    $tableName === 'categories',
                    fn ($q) => $q->withTrashed(),
                )
                ->when(
                    $payloadStoreId === null,
                    fn ($q) => $q->whereNull('store_id'),
                    fn ($q) => $q->where('store_id', $payloadStoreId),
                )
                ->first();
            if ($conflict) {
                $label = $tableName === 'categories' ? 'category' : 'supplier';
                Log::warning("Sync push skipped {$label} insert due to duplicate name: {$payload['name']}");
            }

            return $conflict;
        }

        return null;
    }
}
