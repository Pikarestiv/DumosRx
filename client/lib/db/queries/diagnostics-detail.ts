import { query, getActiveStoreId } from "@/lib/db/core";
import { CRASH_REPORT_QUEUE_ROW_SQL } from "@/lib/db/crash-report-sync";
import { canonicaliseReason } from "@/lib/db/sync-engine/queue-state";
import { STORE_SCOPED_TABLES } from "@/lib/db/schema-migrations";

/**
 * The half of a device's state the server cannot see: stuck payloads, rows
 * that will be re-queued on the next boot, the crash log, the clock watermark
 * and which tables actually exist. Driven by the 2026-10-09 coverage audit
 * against past incidents — see docs/superpowers/specs and docs/FIXED_BUGS.md.
 *
 * Every query here is a SELECT.
 */
const STUCK_RETRY_THRESHOLD = 5;

export interface StuckRow {
  table_name: string;
  record_id: string;
  operation: string;
  retry_count: number;
  next_retry_at: string | null;
  created_at: string;
  reason: string;
  payload_store_id: string | null;
}

export interface CrashRow {
  area: string;
  message: string;
  occurrence_count: number;
  last_occurred_at: string | null;
  synced: boolean;
}

export interface OrphanCount {
  table_name: string;
  count: number;
}

export interface ClockState {
  watermark: string | null;
  deviceNow: string;
  watermarkAheadMs: number | null;
  tier: string | null;
  status: string | null;
  suspensionReason: string | null;
}

export interface DeltaHealth {
  total: number;
  maxAttempts: number;
  chronic: number;
  productMissing: number;
}

/** A-162/A-165/A-167: the one datum nobody had was the `store_id` INSIDE the
 * frozen payloads. `last_error` is deliberately reduced to a class — its first
 * 300 chars can be a driver error quoting a whole row. */
export async function stuckQueueRows(): Promise<StuckRow[]> {
  const rows = await query<{
    table_name: string;
    record_id: string;
    operation: string;
    retry_count: number | null;
    next_retry_at: string | null;
    created_at: string;
    last_error: string | null;
    payload: string | null;
  }>(
    `SELECT table_name, record_id, operation, retry_count, next_retry_at,
            created_at, last_error, payload
       FROM _sync_queue
      WHERE retry_count >= ?
      ORDER BY retry_count DESC, created_at ASC
      LIMIT 50`,
    [STUCK_RETRY_THRESHOLD],
  );

  return rows.map((row) => ({
    table_name: row.table_name,
    record_id: row.record_id,
    operation: row.operation,
    retry_count: Number(row.retry_count ?? 0),
    next_retry_at: row.next_retry_at,
    created_at: row.created_at,
    reason: canonicaliseReason(row.last_error),
    payload_store_id: readPayloadStoreId(row.payload),
  }));
}

/** Rows this device will silently re-queue on its next boot: `_synced = 0`
 * with no queue entry. The shape behind the "50 changes could not be saved"
 * loop and the markSynced regressions, invisible between boots. */
export async function orphanedUnsyncedRows(): Promise<OrphanCount[]> {
  const counts: OrphanCount[] = [];

  for (const table of STORE_SCOPED_TABLES) {
    const rows = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table} t
        WHERE t._synced = 0
          AND (t._deleted = 0 OR t._deleted IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM _sync_queue q
             WHERE q.table_name = ? AND q.record_id = t.id
          )`,
      [table],
    ).catch(() => [] as { count: number }[]);

    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) counts.push({ table_name: table, count });
  }

  return counts.sort((a, b) => b.count - a.count);
}

/** The on-device error log. `logCrash()` coalesces by fingerprint, so this is
 * what changes the moment a bug fires — the reproduce-then-inspect loop. */
export async function recentCrashes(): Promise<CrashRow[]> {
  const rows = await query<{
    fingerprint: string | null;
    content: string;
    occurrence_count: number | null;
    last_occurred_at: string | null;
    _synced: number | null;
  }>(
    `SELECT fingerprint, content, occurrence_count, last_occurred_at, _synced
       FROM feedback
      WHERE type = 'bug' AND fingerprint IS NOT NULL
        AND (_deleted = 0 OR _deleted IS NULL)
      ORDER BY last_occurred_at DESC
      LIMIT 20`,
  );

  return rows.map((row) => {
    const [area = "unknown", message = ""] = (row.fingerprint ?? "").split("|");
    return {
      area,
      message,
      occurrence_count: Number(row.occurrence_count ?? 1),
      last_occurred_at: row.last_occurred_at,
      synced: Number(row._synced ?? 0) === 1,
    };
  });
}

/** A-191: a watermark ahead of the device clock is the lockout, and nothing in
 * the view showed it. The licence token is deliberately never read here. */
export async function clockState(): Promise<ClockState> {
  const storeId = getActiveStoreId();
  const rows = storeId
    ? await query<{
        last_monotonic_time: string | null;
        subscription_tier: string | null;
        status: string | null;
        suspension_reason: string | null;
      }>(
        `SELECT last_monotonic_time, subscription_tier, status, suspension_reason
           FROM stores WHERE id = ?`,
        [storeId],
      )
    : [];

  const row = rows[0];
  const watermark = row?.last_monotonic_time ?? null;
  const parsed = watermark ? new Date(watermark).getTime() : NaN;

  return {
    watermark,
    deviceNow: new Date().toISOString(),
    watermarkAheadMs: Number.isNaN(parsed) ? null : parsed - Date.now(),
    tier: row?.subscription_tier ?? null,
    status: row?.status ?? null,
    suspensionReason: row?.suspension_reason ?? null,
  };
}

/** Replaces the capped `pendingDeltas.length`, which understated. The missing
 * product count is the A-176a fingerprint: a resync will not help those. */
export async function deltaHealth(): Promise<DeltaHealth> {
  const totals = await query<{
    total: number;
    max_attempts: number | null;
    chronic: number | null;
  }>(
    `SELECT COUNT(*) AS total, MAX(attempts) AS max_attempts,
            SUM(CASE WHEN attempts >= 10 THEN 1 ELSE 0 END) AS chronic
       FROM _pending_stock_deltas`,
  );

  const orphaned = await query<{ count: number }>(
    `SELECT COUNT(*) AS count
       FROM _pending_stock_deltas d
       JOIN stock_movements sm ON sm.id = d.movement_id
       LEFT JOIN products p ON p.id = sm.product_id
      WHERE p.id IS NULL OR p._deleted = 1`,
  ).catch(() => [] as { count: number }[]);

  return {
    total: Number(totals[0]?.total ?? 0),
    maxAttempts: Number(totals[0]?.max_attempts ?? 0),
    chronic: Number(totals[0]?.chronic ?? 0),
    productMissing: Number(orphaned[0]?.count ?? 0),
  };
}

/** A-188 asked for exactly this: which tables the schema expects and the
 * device does not have. */
export async function missingTables(): Promise<string[]> {
  const { SCHEMA_SQL } = await import("@/lib/db/schema");
  const expected = [...SCHEMA_SQL.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(
    (match) => match[1],
  );

  const present = new Set(
    (
      await query<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table'`,
      )
    ).map((row) => row.name),
  );

  return expected.filter((name) => !present.has(name));
}

/** The dashboard indicator excludes crash telemetry; this view did not, so the
 * two disagreed and a support person chased the difference. */
export async function crashTelemetryQueued(): Promise<number> {
  const rows = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM _sync_queue q WHERE ${CRASH_REPORT_QUEUE_ROW_SQL}`,
  );
  return Number(rows[0]?.count ?? 0);
}

function readPayloadStoreId(payload: string | null): string | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { store_id?: unknown };
    return typeof parsed.store_id === "string" ? parsed.store_id : null;
  } catch {
    return null;
  }
}
