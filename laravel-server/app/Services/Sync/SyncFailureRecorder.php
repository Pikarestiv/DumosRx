<?php

namespace App\Services\Sync;

use App\Models\SyncFailure;
use App\Models\SyncHealthDaily;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class SyncFailureRecorder
{
    /** The reasons push() emits structurally. Anything else is an exception
     * message: see canonicalReason(). */
    private const KNOWN_REASONS = [
        'forbidden',
        'permission_denied',
        'unsupported_operation',
        'quantity_received_exceeds_ordered',
        'version_conflict',
        'stale_timestamp',
        // Whole-request outcomes (PG-18). These never reach the per-change
        // loop, so without them a store that syncs nothing contributes
        // nothing and the platform success rate reads 100%.
        'sync_disabled',
        'sync_throttled',
        'store_limit_exceeded',
        'server_error',
    ];

    /** Routine multi-device outcomes, not failures. Kept out of the success
     * rate's denominator — see laravel-server/AGENTS.md. */
    private const CONFLICT_REASONS = ['version_conflict', 'stale_timestamp'];

    private const FALLBACK_REASON = 'server_error';

    private const INSERT_CHUNK = 500;

    public function recordPushOutcome(
        array $failed,
        array $changes,
        ?string $storeId,
        ?string $userId,
        int $accepted
    ): void {
        $reasons = array_map(fn ($entry) => $this->canonicalReason($entry['reason'] ?? null), $failed);
        $conflicted = count(array_intersect($reasons, self::CONFLICT_REASONS));

        try {
            $this->recordFailures($failed, $changes, $storeId, $userId);
        } catch (\Throwable $e) {
            Log::warning('Sync failure rows not recorded: '.$e->getMessage());
        }

        $this->tally($storeId, $accepted, count($failed) - $conflicted, $conflicted);
    }

    /**
     * A raw exception message is unbounded, embeds the failing SQL and its
     * bindings (customer names, phones, amounts), and would make
     * failures_by_reason a cardinality bomb. Only the controller's own stable
     * slugs are stored; anything else is canonicalised and the detail is left
     * in the log.
     */
    /**
     * A push rejected before the per-change loop — the plan gate refusing, or
     * the request dying outright. The whole attempt is one refusal: there are
     * no per-change outcomes to record, but the attempt itself must still
     * count or the store looks silent rather than broken (PG-18).
     */
    public function recordRejectedPush(
        ?string $storeId,
        ?string $userId,
        string $reason,
        int $changeCount
    ): void {
        if (! $storeId) {
            return;
        }

        try {
            $this->recordFailures(
                [['record_id' => null, 'reason' => $reason]],
                [],
                $storeId,
                $userId,
            );
        } catch (\Throwable $e) {
            Log::warning('Rejected-push failure row not recorded: '.$e->getMessage());
        }

        $this->tally($storeId, 0, max(1, $changeCount), 0);
    }

    private function canonicalReason(?string $reason): string
    {
        if ($reason !== null && in_array($reason, self::KNOWN_REASONS, true)) {
            return $reason;
        }

        if ($reason !== null && $reason !== '') {
            Log::warning('Sync push refusal with an unmapped reason: '.Str::limit($reason, 500));
        }

        return self::FALLBACK_REASON;
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
        $rows = [];

        foreach ($failed as $entry) {
            $rows[] = [
                'id' => (string) Str::uuid(),
                'store_id' => $storeId,
                'user_id' => $userId,
                'table_name' => Str::limit((string) ($entry['table_name'] ?? 'unknown'), 180, ''),
                'record_id' => $entry['record_id'] ?? null,
                'operation' => $operations[$this->key($entry)] ?? null,
                'reason' => $this->canonicalReason($entry['reason'] ?? null),
                'created_at' => $now,
            ];
        }

        foreach (array_chunk($rows, self::INSERT_CHUNK) as $chunk) {
            SyncFailure::insert($chunk);
        }
    }

    private function key(array $row): string
    {
        return ($row['table_name'] ?? '').'|'.($row['record_id'] ?? '');
    }

    private function tally(?string $storeId, int $accepted, int $refused, int $conflicted): void
    {
        try {
            $row = SyncHealthDaily::firstOrCreate(
                ['store_id' => $storeId, 'date' => now()->startOfDay()],
                ['pushes' => 0, 'changes_accepted' => 0, 'changes_refused' => 0, 'changes_conflicted' => 0]
            );

            $row->increment('pushes');

            if ($accepted > 0) {
                $row->increment('changes_accepted', $accepted);
            }

            if ($refused > 0) {
                $row->increment('changes_refused', $refused);
            }

            if ($conflicted > 0) {
                $row->increment('changes_conflicted', $conflicted);
            }
        } catch (\Throwable $e) {
            Log::warning('Sync health tally not recorded: '.$e->getMessage());
        }
    }
}
