<?php

namespace App\Services\Sync;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Design notes: docs/SYNC_SERVER_RATIONALE.md#pushrowwriter */
class PushRowWriter
{
    public function stampSyncedAt($model, array &$hasSyncedAtCache, $now): void
    {
        $table = $model->getTable();
        if (! isset($hasSyncedAtCache[$table])) {
            $hasSyncedAtCache[$table] = \Illuminate\Support\Facades\Schema::hasColumn($table, '_synced_at');
        }
        if ($hasSyncedAtCache[$table]) {
            $model->_synced_at = $now;
        }
    }

    public function reviveConflictTarget($conflict, string $tableName, array $payload, array &$hasSyncedAtCache, $now): void
    {
        $conflict->restore();

        $authoredColumns = match ($tableName) {
            'categories' => ['name', 'description', 'parent_id', 'is_active'],
            default => [],
        };

        $conflict->forceFill(array_intersect_key($payload, array_flip($authoredColumns)));
        $conflict->_version = (int) ($conflict->_version ?? 1) + 1;
        $this->stampSyncedAt($conflict, $hasSyncedAtCache, $now);
        $conflict->save();
    }

    public function reopenPullWindow($model, array &$hasSyncedAtCache, $now): void
    {
        $table = $model->getTable();
        if (! isset($hasSyncedAtCache[$table])) {
            $hasSyncedAtCache[$table] = \Illuminate\Support\Facades\Schema::hasColumn($table, '_synced_at');
        }
        if ($hasSyncedAtCache[$table]) {
            DB::table($table)
                ->where($model->getKeyName(), $model->getKey())
                ->update(['_synced_at' => $now]);
        }
    }

    public function applyNotNullColumnDefaults(Request $request, string $tableName, $model): void
    {
        if ($tableName === 'suppliers') {
            if (empty($model->payment_terms) || $model->payment_terms === 'null') {
                $model->payment_terms = 30;
            }
        }
        if ($tableName === 'products') {
            if (empty($model->pack_size) || $model->pack_size === 'null') {
                $model->pack_size = 1;
            }
            if (empty($model->unit_of_measure) || $model->unit_of_measure === 'null') {
                $model->unit_of_measure = 'piece';
            }
        }
        if ($tableName === 'stock_batches') {
            if ($model->cost_price === null || $model->cost_price === 'null') {
                $model->cost_price = 0;
            }
        }
        if ($tableName === 'stores') {
            if (empty($model->device_id)) {
                $model->device_id = $request->header('X-Device-Id') ?? ('web-client-'.$model->id);
            }
        }
    }
}
