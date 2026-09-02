/**
 * Base CRUD Helpers
 */

import { execute, query, generateId, logAction, getActiveStoreId, STORE_SCOPED_TABLES } from "./core";
import { queryClient } from "../query-client";
import type { SyncQueueItem } from "@/lib/types/sync";

// Invalidates exactly the queries that could be affected by a mutation on
// `table`, matched via each query's `meta.tables` (see lib/query-keys.ts),
// not queryKey prefix matching, since several queries (dashboard, BI,
// daily-close) legitimately depend on more than one table and a prefix
// match can only ever express one. A query with no `meta.tables` hasn't
// been migrated to the factory yet, so it falls back to always invalidating.
// That's the same broad behavior this replaced, just scoped down to the
// queries that haven't opted into precise tagging yet, so adopting the
// factory anywhere is strictly an improvement, never a regression.
function invalidateQueriesForTable(table: string) {
  if (typeof window === "undefined") return;
  queryClient.invalidateQueries({
    predicate: (q) => {
      const tables = q.meta?.tables as string[] | undefined;
      return !tables || tables.includes(table);
    },
  });
}

export async function insert(
  table: string,
  data: Record<string, unknown>,
  options?: { action?: string },
): Promise<string> {
  const id = (data.id as string) || generateId();
  const now = new Date().toISOString();

  const storeId = getActiveStoreId();
  const record: Record<string, unknown> = {
    ...data,
    id,
    created_at: data.created_at || now,
    updated_at: now,
    _version: 1,
    _synced: 0,
    // Auto-scope to the active store unless the caller already set one
    // explicitly (e.g. an owner creating a user/product for a store other
    // than the one they're currently viewing).
    ...(storeId && STORE_SCOPED_TABLES.includes(table) && data.store_id === undefined
      ? { store_id: storeId }
      : {}),
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
  // "feedback" holds background crash/error telemetry (see error-logger.ts),
  // not a user action; logging it here would surface every silent crash
  // report as a "Created feedback" entry in the Activity Log.
  if (table !== "feedback") {
    await logAction(options?.action || "INSERT", table, id, record);
  }

  invalidateQueriesForTable(table);

  return id;
}

export async function update(
  table: string,
  id: string,
  data: Record<string, unknown>,
  options?: { action?: string },
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
  await logAction(options?.action || "UPDATE", table, id, record);
  
  invalidateQueriesForTable(table);
}

export async function softDelete(table: string, id: string): Promise<void> {
  const now = new Date().toISOString();

  let updateQuery = `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0 WHERE id = ?`;
  let params: (string | number | null)[] = [now, id];

  if (table === "users") {
    const suffix = `_del_${Date.now()}`;
    updateQuery = `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0, email = email || ?, username = username || ? WHERE id = ?`;
    params = [now, suffix, suffix, id];
  }

  await execute(updateQuery, params);

  await addToSyncQueue(table, id, "DELETE", { id });
  await logAction("DELETE", table, id, { id });

  invalidateQueriesForTable(table);
}

export async function remove(
  table: string,
  id: string,
  options?: { action?: string },
): Promise<void> {
  // Fetched before the delete so the audit trail still has a record of what
  // was destroyed. This is a hard, unrecoverable delete (unlike softDelete),
  // so it's the one place where NOT capturing this would leave a real blind
  // spot in the audit log.
  const existing = await query<Record<string, unknown>>(
    `SELECT * FROM ${table} WHERE id = ?`,
    [id],
  );

  await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  // Also remove from sync queue if it was pending
  await execute(`DELETE FROM _sync_queue WHERE table_name = ? AND record_id = ?`, [table, id]);

  await logAction(options?.action || "HARD_DELETE", table, id, existing[0] || { id });

  invalidateQueriesForTable(table);
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

/**
 * `ignoreBackoff` lets an explicit, user-clicked "Sync Now" attempt the
 * whole queue immediately: a background auto-sync should respect each
 * item's exponential backoff (see recordSyncFailure), but a manual sync is
 * the user explicitly asking to retry right now, and should not silently
 * skip the entire queue (and still report "success") just because a prior
 * failure's backoff window hasn't elapsed yet.
 */
export async function getPendingSyncItems(ignoreBackoff = false) {
  if (ignoreBackoff) {
    return await query<SyncQueueItem>(
      "SELECT * FROM _sync_queue ORDER BY created_at ASC",
    );
  }
  const now = new Date().toISOString();
  return await query<SyncQueueItem>(
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
 *
 * `reportImmediately` is for failures that are already known to be permanent
 * (e.g. a payload that fails client-side validation before ever reaching the
 * server) rather than possibly-transient (a network blip, a momentary server
 * error). Those would otherwise wait out the same 5-retry threshold as a
 * transient failure even though retrying can never fix them, silently
 * delaying remote visibility by up to ~waiting through 5 backoff cycles.
 */
export async function recordSyncFailure(
  queueId: number,
  errorMessage: string,
  reportImmediately = false,
): Promise<void> {
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
  const shouldReport =
    (reportImmediately || nextRetryCount >= SYNC_FAILURE_REPORT_THRESHOLD) && !alreadyReported;

  // Preserve the "[REPORTED]" marker once it's set: writing the bare
  // errorMessage here unconditionally used to clobber it on every later
  // call, so `alreadyReported` flipped back to false every other retry and
  // logCrash() fired again and again instead of exactly once.
  const nextLastError =
    alreadyReported || shouldReport ? `[REPORTED] ${errorMessage}` : errorMessage;

  await execute(
    "UPDATE _sync_queue SET retry_count = ?, last_error = ?, next_retry_at = ? WHERE id = ?",
    [nextRetryCount, nextLastError, nextRetryAt, queueId],
  );

  if (shouldReport) {
    try {
      const { logCrash } = await import("../utils/error-logger");
      await logCrash(
        new Error(
          `Sync item stuck after ${nextRetryCount} attempts on ${item.table_name}/${item.record_id}: ${errorMessage}`,
        ),
        false,
        { area: "sync", table: item.table_name, recordId: item.record_id },
      );
    } catch (e) {
      console.error("Failed to report stuck sync item", e);
    }
  }
}
