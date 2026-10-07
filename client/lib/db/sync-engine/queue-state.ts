import { query, getActiveStoreId } from "../core";

/** Matches base-helpers.ts's SYNC_FAILURE_REPORT_THRESHOLD: an item at or
 *  past this has exhausted its retries and is not moving on its own. */
const STUCK_AFTER_ATTEMPTS = 5;

/** Bounds the request. The true count is sent separately, so the cap never
 *  understates the problem. */
const MAX_REPORTED_ITEMS = 50;

export interface QueueStateReport {
  queue_depth: number;
  stuck: Array<{
    table_name: string;
    record_id: string;
    attempts: number;
    reason: string;
  }>;
}

/**
 * What this device has sitting in `_sync_queue`. The server has never seen a
 * stuck row — that is what being stuck means — so without this "what is
 * stuck" can only be inferred from refusals the server happened to witness.
 *
 * Metadata only. `last_error` is sent so the server can canonicalise it to a
 * known slug; the server never stores the raw text, which embeds the failing
 * SQL and its bindings.
 */
export async function buildQueueStateReport(): Promise<QueueStateReport | null> {
  if (!getActiveStoreId()) {
    return null;
  }

  try {
    const depth = await query<{ count: number }>("SELECT COUNT(*) AS count FROM _sync_queue");

    const stuck = await query<{
      table_name: string;
      record_id: string;
      retry_count: number | null;
      last_error: string | null;
    }>(
      `SELECT table_name, record_id, retry_count, last_error
       FROM _sync_queue
       WHERE retry_count >= ?
       ORDER BY retry_count DESC
       LIMIT ?`,
      [STUCK_AFTER_ATTEMPTS, MAX_REPORTED_ITEMS],
    );

    return {
      queue_depth: Number(depth[0]?.count ?? 0),
      stuck: stuck.map((item) => ({
        table_name: item.table_name,
        record_id: item.record_id,
        attempts: Number(item.retry_count ?? 0),
        reason: (item.last_error ?? "").replace(/^\[REPORTED\]\s*/, "").slice(0, 200),
      })),
    };
  } catch (err) {
    // Reporting must never be able to fail a sync.
    console.warn("[Sync] Could not build queue state report", err);
    return null;
  }
}
