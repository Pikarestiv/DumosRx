import { execute, query } from "./core";

export const AUDIT_LOG_LOCAL_RETENTION_DAYS = 730;

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_PRUNE_KEY = "dumos_last_audit_log_prune";

export interface AuditLogPruneOptions {
  retentionDays?: number;
  now?: Date;
  force?: boolean;
}

function cutoffIso(retentionDays: number, now: Date): string {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

function isPruneDue(now: Date): boolean {
  if (typeof localStorage === "undefined") return true;
  const last = localStorage.getItem(LAST_PRUNE_KEY);
  if (!last) return true;
  const lastAt = Date.parse(last);
  if (Number.isNaN(lastAt)) return true;
  return now.getTime() - lastAt >= PRUNE_INTERVAL_MS;
}

function markPruned(now: Date): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LAST_PRUNE_KEY, now.toISOString());
}

/**
 * Drops `audit_logs` rows this device has already pushed and that are older
 * than the local retention window. The server keeps the full trail, so this
 * is a local storage bound, not a data deletion: the rows are gone from this
 * device's IndexedDB blob only.
 *
 * Runs at most once a day and deliberately uses raw `execute()` rather than
 * `softDelete()`, so nothing lands in `_sync_queue` and no other device ever
 * sees a delete for these rows.
 */
export async function pruneSyncedAuditLogs(
  options: AuditLogPruneOptions = {},
): Promise<number> {
  const now = options.now ?? new Date();
  const retentionDays = options.retentionDays ?? AUDIT_LOG_LOCAL_RETENTION_DAYS;

  if (!options.force && !isPruneDue(now)) return 0;

  const cutoff = cutoffIso(retentionDays, now);

  const doomed = await query<{ id: string }>(
    `SELECT al.id FROM audit_logs al
     WHERE al._synced = 1
       AND al.created_at IS NOT NULL
       AND al.created_at < ?
       AND NOT EXISTS (
         SELECT 1 FROM _sync_queue sq
         WHERE sq.table_name = 'audit_logs' AND sq.record_id = al.id
       )`,
    [cutoff],
  );

  markPruned(now);

  if (doomed.length === 0) return 0;

  const ids = doomed.map((r) => r.id);
  const CHUNK = 400;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    await execute(
      `DELETE FROM audit_logs WHERE id IN (${chunk.map(() => "?").join(",")})`,
      chunk,
    );
  }

  return ids.length;
}

export function __resetAuditLogPruneScheduleForTesting(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LAST_PRUNE_KEY);
}
