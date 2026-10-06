<?php

namespace App\Services\Sync;

use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;

class SyncFailureRecorder
{
    public function recordPushOutcome(
        array $failed,
        array $changes,
        ?string $storeId,
        ?string $userId,
        int $accepted
    ): void {
        $this->recordFailures($failed, $changes, $storeId, $userId);
        $this->tally($storeId, $accepted, count($failed));
    }

    private function recordFailures(array $failed, array $changes, ?string $storeId, ?string $userId): void
    {
        if ($failed === []) {
            return;
        }

        $operations = [];
        foreach ($changes as $change) {
            $operations[$this->key($change)] = $change['operation'] ?? null;
        }

        $now = now();

        foreach ($failed as $entry) {
            SyncFailure::create([
                'store_id' => $storeId,
                'user_id' => $userId,
                'table_name' => $entry['table_name'] ?? 'unknown',
                'record_id' => $entry['record_id'] ?? null,
                'operation' => $operations[$this->key($entry)] ?? null,
                'reason' => $entry['reason'] ?? 'unknown',
                'created_at' => $now,
            ]);
        }
    }

    private function key(array $row): string
    {
        return ($row['table_name'] ?? '').'|'.($row['record_id'] ?? '');
    }

    private function tally(?string $storeId, int $accepted, int $refused): void
    {
        $row = SyncHealthDaily::firstOrCreate(
            ['store_id' => $storeId, 'date' => now()->startOfDay()],
            ['pushes' => 0, 'changes_accepted' => 0, 'changes_refused' => 0]
        );

        $row->increment('pushes');

        if ($accepted > 0) {
            $row->increment('changes_accepted', $accepted);
        }

        if ($refused > 0) {
            $row->increment('changes_refused', $refused);
        }
    }
}
