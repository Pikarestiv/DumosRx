import { query, getActiveStoreId } from "../core";

/** Matches base-helpers.ts's SYNC_FAILURE_REPORT_THRESHOLD: an item at or
 *  past this has exhausted its retries and is not moving on its own. */
const STUCK_AFTER_ATTEMPTS = 5;

/** Bounds the request. The true count is sent separately, so the cap never
 *  understates the problem. */
const MAX_REPORTED_ITEMS = 50;

/** Mirrors the server's canonical list. Sending the raw driver error would
 *  put customer names and amounts in transit and in any request log. */
const KNOWN_REASONS = [
  "forbidden",
  "permission_denied",
  "unsupported_operation",
  "quantity_received_exceeds_ordered",
  "version_conflict",
  "stale_timestamp",
  "sync_disabled",
  "sync_throttled",
  "store_limit_exceeded",
  "schema_mismatch",
];

function canonicaliseReason(raw: string | null): string {
  const text = (raw ?? "").replace(/^\[REPORTED\]\s*/, "").trim();

  if (KNOWN_REASONS.includes(text)) {
    return text;
  }

  // A driver error embeds the failing SQL and its bindings, so nothing of it
  // is sent — only the fact that it was not a recognised refusal.
  return /^SQLSTATE|duplicate entry|constraint/i.test(text) ? "server_error" : "other";
}

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
 * Metadata only, and the reason is canonicalised HERE rather than sent raw.
 * The server canonicalises on storage too, but a raw driver error embeds the
 * failing SQL and its bindings — customer names, amounts — and would still
 * be in transit and in any future request log.
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
        reason: canonicaliseReason(item.last_error),
      })),
    };
  } catch (err) {
    // Reporting must never be able to fail a sync.
    console.warn("[Sync] Could not build queue state report", err);
    return null;
  }
}
