import { query, execute } from "../core";

/**
 * Local-only ledger of terminal push conflicts, so a dropped change leaves a
 * durable trace instead of only a transient toast. See client/AGENTS.md,
 * "The terminal-conflict ledger (A-26)", for why it exists and what reads it.
 */

// Only tables whose dropped change leaves real-world state unaccounted for
// are logged, so the ledger stays small and every row has a reader. Extend
// this alongside a surface that actually reads the new table's rows.
export const CONFLICT_LOGGED_TABLES = new Set(["purchase_order_items"]);

export interface RecordedConflict {
  id: number;
  table_name: string;
  record_id: string;
  reason: string;
  fields: string | null;
  detected_at: string;
}

/** Payload keys, minus the sync engine's own bookkeeping fields, so a reader
 * can tell which of a record's columns the dropped change would have set. */
export function conflictFieldList(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload) return null;
  const fields = Object.keys(payload)
    .filter((key) => !key.startsWith("_"))
    .sort();
  return fields.length > 0 ? fields.join(",") : null;
}

export function conflictTouchedField(
  conflict: Pick<RecordedConflict, "fields">,
  field: string,
): boolean {
  if (!conflict.fields) return true;
  return conflict.fields.split(",").includes(field);
}

export async function recordTerminalConflict(conflict: {
  table_name: string;
  record_id: string;
  reason: string;
  fields: string | null;
}): Promise<void> {
  if (!CONFLICT_LOGGED_TABLES.has(conflict.table_name)) return;
  await execute(
    `INSERT INTO _sync_conflicts (table_name, record_id, reason, fields, detected_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      conflict.table_name,
      conflict.record_id,
      conflict.reason,
      conflict.fields,
      new Date().toISOString(),
    ],
  );
}

/** A later change to the same record reaching the server means whatever the
 * dropped one carried has been superseded by something the store did since,
 * so the outstanding signal is settled rather than left on screen forever. */
export async function resolveConflictsForRecords(
  records: { table_name: string; record_id: string }[],
): Promise<void> {
  const logged = records.filter((r) => CONFLICT_LOGGED_TABLES.has(r.table_name));
  if (logged.length === 0) return;

  const now = new Date().toISOString();
  for (const record of logged) {
    await execute(
      `UPDATE _sync_conflicts SET resolved_at = ?
       WHERE table_name = ? AND record_id = ? AND resolved_at IS NULL`,
      [now, record.table_name, record.record_id],
    );
  }
}

/** Dismissal from the UI: the store has seen the warning and acted on it. */
export async function resolveConflictsById(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  await execute(
    `UPDATE _sync_conflicts SET resolved_at = ? WHERE id IN (${placeholders})`,
    [new Date().toISOString(), ...ids],
  );
}

export async function getUnresolvedConflicts(
  tableName: string,
  recordIds: string[],
): Promise<RecordedConflict[]> {
  if (recordIds.length === 0) return [];
  const placeholders = recordIds.map(() => "?").join(", ");
  return query<RecordedConflict>(
    `SELECT id, table_name, record_id, reason, fields, detected_at
     FROM _sync_conflicts
     WHERE table_name = ? AND resolved_at IS NULL AND record_id IN (${placeholders})
     ORDER BY detected_at ASC`,
    [tableName, ...recordIds],
  );
}
