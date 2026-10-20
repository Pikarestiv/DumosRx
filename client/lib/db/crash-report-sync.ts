import { query } from "@/lib/db/core";

// Automatic crash reports (error-logger.ts's logCrash/flushPendingCrashes) are written into the same `feedback` table as user-submitted feedba…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-crash-report-sync-L3
export const CRASH_REPORT_TABLE = "feedback";

// Matched against `_sync_queue q`.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-crash-report-sync-ts-L7
export const CRASH_REPORT_QUEUE_ROW_SQL = `(
  q.table_name = '${CRASH_REPORT_TABLE}'
  AND EXISTS (
    SELECT 1 FROM ${CRASH_REPORT_TABLE} f
    WHERE f.id = q.record_id AND f.type = 'bug' AND f.fingerprint IS NOT NULL
  )
)`;

// Whether the pending `feedback` queue holds anything a user deliberately submitted, as opposed to crash telemetry alone.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-crash-report-sync-ts-L21
export async function hasPendingNonCrashFeedback(): Promise<boolean> {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM _sync_queue q
     WHERE q.table_name = ? AND NOT ${CRASH_REPORT_QUEUE_ROW_SQL}`,
    [CRASH_REPORT_TABLE],
  );
  return (result[0]?.count || 0) > 0;
}
