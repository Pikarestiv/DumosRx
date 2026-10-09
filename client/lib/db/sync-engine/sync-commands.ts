import { query, execute } from "../core";
import { sendDeviceReportOnRequest } from "./device-report-command";
import { markConflictSettled } from "../base-helpers";

export interface SyncCommand {
  id: string;
  action: string;
  table_name: string | null;
  record_id: string | null;
}

export interface SyncCommandResult {
  id: string;
  status: "applied" | "failed" | "refused";
  result: string;
}

/**
 * Tables whose queued rows this device will discard on request. An
 * ALLOWLIST, mirroring the server's: a business record exists only here, so
 * discarding one permanently loses revenue data or falsifies stock. The
 * server refuses these too — this is the second of two locks, not the only
 * one, because a client must never rely on a server check it cannot see.
 */
const ABANDONABLE_TABLES = ["feedback", "audit_logs"];

/**
 * Applies operator commands to `_sync_queue` and nothing else. The vocabulary
 * is a closed switch rather than a lookup: an unrecognised action is refused,
 * never dispatched.
 */
export async function applySyncCommands(commands: SyncCommand[]): Promise<SyncCommandResult[]> {
  const results: SyncCommandResult[] = [];

  for (const command of commands) {
    try {
      results.push(await applyOne(command));
    } catch (err) {
      results.push({
        id: command.id,
        status: "failed",
        result: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
      });
    }
  }

  await persistResults(results);

  return results;
}

/**
 * Outcomes are persisted rather than held in memory. A push run is usually a
 * single batch, so an in-memory buffer was discarded before it could ever be
 * sent — the operator saw the command stuck at "sent" forever, which is
 * precisely the issued-vs-applied ambiguity this feature exists to remove.
 * They survive a failed request and an app restart, and the server's
 * recordOutcome() is an idempotent update, so re-delivery is harmless.
 */
async function persistResults(results: SyncCommandResult[]): Promise<void> {
  for (const result of results) {
    try {
      await execute(
        `INSERT INTO _pending_command_results (command_id, status, result, recorded_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(command_id) DO UPDATE SET
           status = excluded.status,
           result = excluded.result,
           recorded_at = excluded.recorded_at`,
        [result.id, result.status, result.result, new Date().toISOString()],
      );
    } catch (err) {
      console.warn("[Sync] Could not persist a command result", err);
    }
  }
}

/** Read without clearing: they are cleared only once the server has them. */
export async function readPendingCommandResults(): Promise<SyncCommandResult[]> {
  try {
    const rows = await query<{ command_id: string; status: string; result: string | null }>(
      `SELECT command_id, status, result FROM _pending_command_results LIMIT 100`,
    );

    return rows.map((row) => ({
      id: row.command_id,
      status: row.status as SyncCommandResult["status"],
      result: row.result ?? "",
    }));
  } catch {
    return [];
  }
}

export async function clearCommandResults(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  try {
    const placeholders = ids.map(() => "?").join(",");
    await execute(`DELETE FROM _pending_command_results WHERE command_id IN (${placeholders})`, ids);
  } catch (err) {
    console.warn("[Sync] Could not clear delivered command results", err);
  }
}

async function applyOne(command: SyncCommand): Promise<SyncCommandResult> {
  switch (command.action) {
    case "retry":
      return retryQueued(command);
    case "abandon":
      return abandonQueued(command);
    case "send_payload":
      return { id: command.id, status: "refused", result: "send_payload is not implemented yet" };
    case "send_device_report": {
      const outcome = await sendDeviceReportOnRequest(command.id);
      return { id: command.id, ...outcome };
    }
    default:
      return { id: command.id, status: "refused", result: `unknown action: ${command.action}` };
  }
}

async function retryQueued(command: SyncCommand): Promise<SyncCommandResult> {
  const rows = await matchingQueueRows(command);

  if (rows.length === 0) {
    return { id: command.id, status: "refused", result: "no matching queue row" };
  }

  await execute(
    `UPDATE _sync_queue SET retry_count = 0, next_retry_at = NULL, last_error = NULL
     WHERE table_name = ? AND record_id = ?`,
    [command.table_name, command.record_id],
  );

  return { id: command.id, status: "applied", result: `requeued ${rows.length} row(s)` };
}

async function abandonQueued(command: SyncCommand): Promise<SyncCommandResult> {
  if (!command.table_name || !ABANDONABLE_TABLES.includes(command.table_name)) {
    return {
      id: command.id,
      status: "refused",
      result: `${command.table_name} holds business data and cannot be abandoned`,
    };
  }

  const rows = await matchingQueueRows(command);

  if (rows.length === 0) {
    return { id: command.id, status: "refused", result: "no matching queue row" };
  }

  await execute(`DELETE FROM _sync_queue WHERE table_name = ? AND record_id = ?`, [
    command.table_name,
    command.record_id,
  ]);

  // Dropping the queue row alone leaves the source row _synced = 0 with no
  // queue entry, which requeueOrphanedRows() treats as an orphan and
  // re-queues on the next boot. Every other drop path in the engine pairs
  // the delete with this for the same reason.
  await markConflictSettled(command.table_name, command.record_id!);

  return { id: command.id, status: "applied", result: `discarded ${rows.length} queued row(s)` };
}

async function matchingQueueRows(command: SyncCommand): Promise<Array<{ id: number }>> {
  if (!command.table_name || !command.record_id) {
    return [];
  }

  return query<{ id: number }>(
    `SELECT id FROM _sync_queue WHERE table_name = ? AND record_id = ?`,
    [command.table_name, command.record_id],
  );
}
