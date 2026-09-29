import { query } from "@/lib/db/core";

/**
 * Automatic crash reports (error-logger.ts's logCrash/flushPendingCrashes)
 * are written into the same `feedback` table as user-submitted feedback, and
 * are queued for sync like any other row. They are background telemetry
 * though, so they are deliberately invisible to the two places that speak to
 * the user about pending work: the "X changes unsynced" count and the
 * instant-sync trigger. See docs/SYNC_CRASH_REPORT_POLICY.md.
 *
 * Both of those checks live here so they can never drift apart, and so they
 * keep matching reportStuckCrashLog()'s definition of a crash report in
 * base-helpers.ts: type 'bug' with a non-null fingerprint. User-submitted
 * feedback never carries a fingerprint, including a user-typed bug report.
 */
export const CRASH_REPORT_TABLE = "feedback";

/**
 * Matched against `_sync_queue q`. Resolved against the live `feedback` row
 * rather than the queue row's JSON payload because an UPDATE's payload holds
 * only the changed columns (a coalesced crash repeat sends content and
 * occurrence_count, never type/fingerprint) and a DELETE's holds only the id.
 */
export const CRASH_REPORT_QUEUE_ROW_SQL = `(
  q.table_name = '${CRASH_REPORT_TABLE}'
  AND EXISTS (
    SELECT 1 FROM ${CRASH_REPORT_TABLE} f
    WHERE f.id = q.record_id AND f.type = 'bug' AND f.fingerprint IS NOT NULL
  )
)`;

/**
 * Whether the pending `feedback` queue holds anything a user deliberately
 * submitted, as opposed to crash telemetry alone. A crash-only batch must not
 * earn a sync round of its own; user-submitted feedback must.
 */
export async function hasPendingNonCrashFeedback(): Promise<boolean> {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM _sync_queue q
     WHERE q.table_name = ? AND NOT ${CRASH_REPORT_QUEUE_ROW_SQL}`,
    [CRASH_REPORT_TABLE],
  );
  return (result[0]?.count || 0) > 0;
}
