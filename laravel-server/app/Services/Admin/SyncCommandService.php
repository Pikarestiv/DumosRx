<?php

namespace App\Services\Admin;

use App\Models\ActivityLog;
use App\Models\SyncCommand;
use Illuminate\Support\Str;

/**
 * Operator intents a device acts on during its next sync. See the stuck-data
 * spec, Phase 4 — in particular why the vocabulary is closed and why
 * `abandon` is governed by an allowlist.
 */
class SyncCommandService
{
    /** A closed set. Nothing here may touch a business table's contents. */
    private const ACTIONS = ['retry', 'send_payload', 'abandon', 'send_device_report'];

    /**
     * Actions that act on the device as a whole rather than one queued row,
     * so table_name/record_id are meaningless for them. Kept explicit: a
     * future row-scoped action must not silently become device-wide.
     */
    private const DEVICE_WIDE_ACTIONS = ['send_device_report'];

    /**
     * Tables whose rows may be discarded, as an ALLOWLIST. A business record
     * exists only on the device that made it, so abandoning one permanently
     * loses revenue data or falsifies stock. A table added later therefore
     * defaults to "cannot abandon" rather than silently becoming
     * discardable.
     */
    private const ABANDONABLE_TABLES = ['feedback', 'audit_logs'];

    private const MAX_PENDING_PER_FETCH = 20;

    public function issue(
        string $storeId,
        ?string $deviceId,
        string $action,
        ?string $tableName,
        ?string $recordId,
        ?string $actorId
    ): SyncCommand {
        if (! in_array($action, self::ACTIONS, true)) {
            throw new \InvalidArgumentException("Unsupported sync command: {$action}");
        }

        if (in_array($action, self::DEVICE_WIDE_ACTIONS, true)) {
            $tableName = null;
            $recordId = null;
        }

        if ($action === 'abandon' && ! in_array((string) $tableName, self::ABANDONABLE_TABLES, true)) {
            throw new \InvalidArgumentException(
                "Rows in '{$tableName}' cannot be abandoned: the device holds the only copy, so discarding one would lose business data permanently. Escalate it instead."
            );
        }

        $command = SyncCommand::create([
            'store_id' => $storeId,
            'device_id' => $deviceId,
            'action' => $action,
            'table_name' => $tableName ? Str::limit($tableName, 64, '') : null,
            'record_id' => $recordId ? Str::limit($recordId, 64, '') : null,
            'issued_by' => $actorId,
            'status' => 'pending',
            'issued_at' => now(),
        ]);

        ActivityLog::create([
            'user_id' => $actorId,
            'action' => 'SYNC_COMMAND_ISSUED',
            'description' => "Issued '{$action}' for {$tableName}/{$recordId} on device {$deviceId}",
            'store_id' => $storeId,
            'properties' => [
                'command_id' => $command->id,
                'action' => $action,
                'device_id' => $deviceId,
            ],
        ]);

        return $command;
    }

    /**
     * Handed out once: a command marked `sent` is not offered again, so a
     * device that syncs twice before acting cannot apply it twice.
     *
     * @return array<int, array<string, mixed>>
     */
    public function pendingFor(string $storeId, string $deviceId): array
    {
        $candidates = SyncCommand::where('store_id', $storeId)
            ->where('device_id', $deviceId)
            ->where('status', 'pending')
            ->orderBy('issued_at')
            ->limit(self::MAX_PENDING_PER_FETCH)
            ->pluck('id');

        if ($candidates->isEmpty()) {
            return [];
        }

        // Claimed by the UPDATE, not by the SELECT: two concurrent pushes
        // from the same device would otherwise both read the same pending
        // set and both be handed the command.
        $claimed = SyncCommand::whereIn('id', $candidates)
            ->where('status', 'pending')
            ->update(['status' => 'sent']);

        if ($claimed === 0) {
            return [];
        }

        $commands = SyncCommand::whereIn('id', $candidates)->where('status', 'sent')->get();

        return $commands->map(fn (SyncCommand $c) => [
            'id' => $c->id,
            'action' => $c->action,
            'table_name' => $c->table_name,
            'record_id' => $c->record_id,
        ])->all();
    }

    /** @param  array<int, array<string, mixed>>  $outcomes */
    public function recordOutcome(string $storeId, string $deviceId, array $outcomes): void
    {
        foreach ($outcomes as $outcome) {
            if (! is_array($outcome) || empty($outcome['id'])) {
                continue;
            }

            // Scoped to the reporting device: a device must not be able to
            // close a command issued to a different one.
            SyncCommand::where('id', $outcome['id'])
                ->where('store_id', $storeId)
                ->where('device_id', $deviceId)
                ->update([
                    'status' => in_array($outcome['status'] ?? '', ['applied', 'failed', 'refused'], true)
                        ? $outcome['status']
                        : 'failed',
                    'result' => Str::limit(
                        is_scalar($outcome['result'] ?? null) ? (string) $outcome['result'] : '',
                        500,
                    ),
                    'acted_at' => now(),
                ]);
        }
    }

    public function forStore(string $storeId): array
    {
        return SyncCommand::where('store_id', $storeId)
            ->orderByDesc('issued_at')
            ->limit(50)
            ->get()
            ->map(fn (SyncCommand $c) => [
                'id' => $c->id,
                'device_id' => $c->device_id,
                'action' => $c->action,
                'table_name' => $c->table_name,
                'record_id' => $c->record_id,
                'status' => $c->status,
                'result' => $c->result,
                'issued_at' => $c->issued_at?->toIso8601String(),
                'acted_at' => $c->acted_at?->toIso8601String(),
            ])->all();
    }
}
