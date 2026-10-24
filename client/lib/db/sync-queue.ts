import { execute, query, awaitSettledTransactions } from "./core";
import { truncateForLog } from "../utils/error-truncation";
import type { SyncQueueItem } from "@/lib/types/sync";
import { recordAcceptedQueueAges } from "./sync-engine/delivery-age";

// The record's pending UPDATE, if it has exactly one and nothing else queued.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-base-helpers-ts-L428
interface CollapsibleQueueRow {
  id: number;
  payload: string;
  created_at: string | null;
  retry_count: number | null;
  next_retry_at: string | null;
}

async function collapsibleUpdate(
  table: string,
  recordId: string,
): Promise<CollapsibleQueueRow | null> {
  const queued = await query<CollapsibleQueueRow & { operation: string }>(
    `SELECT id, operation, payload, created_at, retry_count, next_retry_at
       FROM _sync_queue WHERE table_name = ? AND record_id = ?`,
    [table, recordId],
  );
  if (queued.length !== 1 || queued[0].operation !== "UPDATE") return null;
  return queued[0];
}

export async function addToSyncQueue(
  table: string,
  recordId: string,
  operation: "INSERT" | "UPDATE" | "DELETE",
  payload: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  const pending = operation === "UPDATE" ? await collapsibleUpdate(table, recordId) : null;
  let merged = payload;
  let createdAt = now;
  let retryCount: number = 0;
  let nextRetryAt: string | null = null;

  if (pending) {
    try {
      // Merged, not replaced: an update() payload carries only the fields
      // that edit changed, so replacing would drop the earlier ones.
      merged = { ...(JSON.parse(pending.payload) as Record<string, unknown>), ...payload };
      createdAt = pending.created_at ?? now;
      retryCount = pending.retry_count ?? 0;
      nextRetryAt = pending.next_retry_at;
      await execute(`DELETE FROM _sync_queue WHERE id = ?`, [pending.id]);
    } catch (e) {
      console.error("[Sync] Failed to collapse queued payload; queueing a new row", e);
      merged = payload;
      createdAt = now;
      retryCount = 0;
      nextRetryAt = null;
    }
  }

  await execute(
    `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at, retry_count, next_retry_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [table, recordId, operation, JSON.stringify(merged), createdAt, retryCount, nextRetryAt],
  );
}

// `ignoreBackoff` lets an explicit, user-clicked "Sync Now" attempt the whole queue immediately:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-base-helpers-ts-L495
export async function getPendingSyncItems(ignoreBackoff = false) {
  // See awaitSettledTransactions()'s doc comment:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L485
  await awaitSettledTransactions();

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

export async function markSynced(
  queueIds: number[],
  syncedRecords: { table_name: string; record_id: string }[] = [],
): Promise<void> {
  if (queueIds.length === 0) return;
  const placeholders = queueIds.map(() => "?").join(", ");

  await recordAcceptedQueueAges(queueIds);
  await execute(`DELETE FROM _sync_queue WHERE id IN (${placeholders})`, queueIds);

  // insert()/update() always set _synced = 0 at write time; nothing else ever flipped it back once the queue row above is deleted.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L513
  for (const { table_name, record_id } of syncedRecords) {
    try {
      await execute(`UPDATE ${table_name} SET _synced = 1 WHERE id = ?`, [record_id]);
    } catch (err) {
      console.warn(`[Sync] Failed to flag ${table_name}/${record_id} as synced:`, err);
    }
  }
}

// Flags a source row as settled after the server terminally rejected its push (version_conflict/stale_timestamp) and the queue row was dropped.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-base-helpers-ts-L547
export async function markConflictSettled(table: string, recordId: string): Promise<void> {
  try {
    await execute(`UPDATE ${table} SET _synced = 1 WHERE id = ?`, [recordId]);
  } catch (err) {
    console.warn(`[Sync] Failed to settle conflicted ${table}/${recordId}:`, err);
  }
}

const SYNC_FAILURE_REPORT_THRESHOLD = 5;
const SYNC_FAILURE_BASE_DELAY_MS = 30_000;
const SYNC_FAILURE_MAX_DELAY_MS = 60 * 60_000;

/** logCrash() writes its report into this table, so a stuck item on this
 * table must never be reported through logCrash() — see reportStuckCrashLog. */
const CRASH_LOG_TABLE = "feedback";

// Handles a stuck `feedback` item without writing another `feedback` row.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-base-helpers-L622
async function reportStuckCrashLog(
  queueId: number,
  recordId: string,
  summary: string,
  notify: boolean,
): Promise<void> {
  if (notify) {
    console.error(`[Sync] ${summary}`);

    try {
      const Sentry = await import("@sentry/nextjs");
      Sentry.captureException(new Error(summary), {
        tags: { area: "sync", table: CRASH_LOG_TABLE },
        extra: { recordId },
      });
    } catch (e) {
      console.error("Failed to report stuck crash-log item to Sentry", e);
    }
  }

  const rows = await query<{ type: string; fingerprint: string | null }>(
    `SELECT type, fingerprint FROM ${CRASH_LOG_TABLE} WHERE id = ?`,
    [recordId],
  );
  const row = rows[0];
  const isCrashReport = !row || (row.type === "bug" && !!row.fingerprint);
  if (!isCrashReport) return;

  await execute("DELETE FROM _sync_queue WHERE id = ?", [queueId]);
  await markConflictSettled(CRASH_LOG_TABLE, recordId);
}

// Records a sync failure with exponential backoff so a permanently-bad item stops being retried every cycle and blocking the rest of the queue.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-base-helpers-L667
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
  const alreadyReported = item.last_error?.startsWith("[REPORTED]") ?? false;
  const pastReportThreshold =
    reportImmediately || nextRetryCount >= SYNC_FAILURE_REPORT_THRESHOLD;
  const shouldReport = pastReportThreshold && !alreadyReported;
  const shouldDropStuckCrashLog = pastReportThreshold && item.table_name === CRASH_LOG_TABLE;

  // Preserve the "[REPORTED]" marker once it's set:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L603
  const boundedError = truncateForLog(errorMessage);
  const nextLastError =
    alreadyReported || shouldReport ? `[REPORTED] ${boundedError}` : boundedError;

  await execute(
    "UPDATE _sync_queue SET retry_count = ?, last_error = ?, next_retry_at = ? WHERE id = ?",
    [nextRetryCount, nextLastError, nextRetryAt, queueId],
  );

  if (shouldReport || shouldDropStuckCrashLog) {
    const summary = `Sync item stuck after ${nextRetryCount} attempts on ${item.table_name}/${item.record_id}: ${boundedError}`;
    try {
      const { logCrash, isExpectedSyncNoise } = await import("../utils/error-logger");

      // Checked before BOTH paths below.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-base-helpers-ts-L624
      if (isExpectedSyncNoise(errorMessage)) {
        return;
      }

      if (shouldDropStuckCrashLog) {
        await reportStuckCrashLog(queueId, item.record_id, summary, shouldReport);
        return;
      }

      await logCrash(new Error(summary), false, {
        area: "sync",
        table: item.table_name,
        recordId: item.record_id,
      });
    } catch (e) {
      console.error("Failed to report stuck sync item", e);
    }
  }
}
