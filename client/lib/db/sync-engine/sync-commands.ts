import { query, execute } from "../core";

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

  return results;
}

async function applyOne(command: SyncCommand): Promise<SyncCommandResult> {
  switch (command.action) {
    case "retry":
      return retryQueued(command);
    case "abandon":
      return abandonQueued(command);
    case "send_payload":
      return { id: command.id, status: "refused", result: "send_payload is not implemented yet" };
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
