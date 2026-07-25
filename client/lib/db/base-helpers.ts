/**
 * Base CRUD Helpers
 */

import { execute, query, generateId, logAction } from "./core";
import { queryClient } from "../query-client";

export async function insert(table: string, data: Record<string, unknown>): Promise<string> {
  const id = (data.id as string) || generateId();
  const now = new Date().toISOString();

  const record: Record<string, unknown> = {
    ...data,
    id,
    created_at: data.created_at || now,
    updated_at: now,
    _version: 1,
    _synced: 0,
  };

  const columns = Object.keys(record);
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((col) => record[col]) as (
    | string
    | number
    | null
    | Uint8Array
  )[];

  await execute(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );

  await addToSyncQueue(table, id, "INSERT", record);
  await logAction("INSERT", table, id, record);

  if (typeof window !== "undefined") {
    queryClient.invalidateQueries({ queryKey: ['localData'] });
    queryClient.invalidateQueries({ queryKey: [table] });
  }

  return id;
}

export async function update(
  table: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  const current = await query<{ _version: number }>(
    `SELECT _version FROM ${table} WHERE id = ?`,
    [id],
  );
  const version = current[0]?._version || 0;

  const record = {
    ...data,
    updated_at: now,
    _version: version + 1,
    _synced: 0,
  };

  const setClause = Object.keys(record)
    .map((col) => `${col} = ?`)
    .join(", ");
  const values = [...Object.values(record), id] as (
    | string
    | number
    | null
    | Uint8Array
  )[];

  await execute(`UPDATE ${table} SET ${setClause} WHERE id = ?`, values);

  await addToSyncQueue(table, id, "UPDATE", record);
  await logAction("UPDATE", table, id, record);
  
  if (typeof window !== "undefined") {
    queryClient.invalidateQueries({ queryKey: ['localData'] });
    queryClient.invalidateQueries({ queryKey: [table] });
  }
}

export async function softDelete(table: string, id: string): Promise<void> {
  const now = new Date().toISOString();

  let updateQuery = `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0 WHERE id = ?`;
  
  if (table === "users") {
    const suffix = `_del_${Date.now()}`;
    updateQuery = `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0, email = email || '${suffix}', username = username || '${suffix}' WHERE id = ?`;
  }

  await execute(updateQuery, [now, id]);

  await addToSyncQueue(table, id, "DELETE", { id });
  await logAction("DELETE", table, id, { id });

  if (typeof window !== "undefined") {
    queryClient.invalidateQueries({ queryKey: ['localData'] });
    queryClient.invalidateQueries({ queryKey: [table] });
  }
}

export async function remove(table: string, id: string): Promise<void> {
  await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  // Also remove from sync queue if it was pending
  await execute(`DELETE FROM _sync_queue WHERE table_name = ? AND record_id = ?`, [table, id]);

  if (typeof window !== "undefined") {
    queryClient.invalidateQueries({ queryKey: ['localData'] });
    queryClient.invalidateQueries({ queryKey: [table] });
  }
}

async function addToSyncQueue(
  table: string,
  recordId: string,
  operation: "INSERT" | "UPDATE" | "DELETE",
  payload: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [table, recordId, operation, JSON.stringify(payload), now],
  );
}

export async function getPendingSyncItems() {
  const now = new Date().toISOString();
  return await query<any>(
    "SELECT * FROM _sync_queue WHERE next_retry_at IS NULL OR next_retry_at <= ? ORDER BY created_at ASC",
    [now],
  );
}

export async function markSynced(queueIds: number[]): Promise<void> {
  if (queueIds.length === 0) return;
  const placeholders = queueIds.map(() => "?").join(", ");
  await execute(`DELETE FROM _sync_queue WHERE id IN (${placeholders})`, queueIds);
}

const SYNC_FAILURE_REPORT_THRESHOLD = 5;
const SYNC_FAILURE_BASE_DELAY_MS = 30_000;
const SYNC_FAILURE_MAX_DELAY_MS = 60 * 60_000;

/**
 * Records a sync failure with exponential backoff so a permanently-bad item
 * stops being retried every cycle and blocking the rest of the queue. Once
 * retry_count crosses the report threshold, logs to superadmins exactly once
 * (via the feedback table) instead of on every subsequent retry.
 */
export async function recordSyncFailure(queueId: number, errorMessage: string): Promise<void> {
  const rows = await query<{ retry_count: number; last_error: string | null; table_name: string; record_id: string }>(
    "SELECT retry_count, last_error, table_name, record_id FROM _sync_queue WHERE id = ?",
    [queueId],
  );
  const item = rows[0];
  if (!item) return;

  const nextRetryCount = (item.retry_count || 0) + 1;
  const delay = Math.min(SYNC_FAILURE_BASE_DELAY_MS * 2 ** (nextRetryCount - 1), SYNC_FAILURE_MAX_DELAY_MS);
  const nextRetryAt = new Date(Date.now() + delay).toISOString();
  const alreadyReported = item.last_error?.startsWith("[REPORTED]");

  await execute(
    "UPDATE _sync_queue SET retry_count = ?, last_error = ?, next_retry_at = ? WHERE id = ?",
    [nextRetryCount, errorMessage, nextRetryAt, queueId],
  );

  if (nextRetryCount >= SYNC_FAILURE_REPORT_THRESHOLD && !alreadyReported) {
    try {
      const { logCrash } = await import("../utils/error-logger");
      await logCrash(
        new Error(
          `Sync item stuck after ${nextRetryCount} attempts on ${item.table_name}/${item.record_id}: ${errorMessage}`,
        ),
        false,
      );
      await execute("UPDATE _sync_queue SET last_error = ? WHERE id = ?", [
        `[REPORTED] ${errorMessage}`,
        queueId,
      ]);
    } catch (e) {
      console.error("Failed to report stuck sync item", e);
    }
  }
}
