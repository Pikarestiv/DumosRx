import { execute, query } from "./core";
import { STORAGE_KEYS } from "@/lib/storage-keys";
import { isIntervalElapsed } from "@/lib/utils/elapsed";

export const AUDIT_LOG_LOCAL_RETENTION_DAYS = 730;

const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const LAST_PRUNE_KEY = STORAGE_KEYS.lastAuditLogPrune;

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
  return isIntervalElapsed(
    localStorage.getItem(LAST_PRUNE_KEY),
    PRUNE_INTERVAL_MS,
    now.getTime(),
  );
}

/**
 * An upper bound on real time, for deriving the cutoff. `_sync_state`'s
 * `last_synced_at` is the server's own `server_timestamp`, so it can never run
 * ahead of real time however wrong this device's clock is; taking the lower of
 * the two means a clock reading years ahead cannot push the cutoff past the
 * retention window and delete the whole local trail. A device that has never
 * synced has nothing to bound with and also nothing to prune — the prune only
 * touches rows already `_synced = 1`.
 *
 * Lagging by the time since the last sync is the whole cost, against a 730-day
 * window.
 */
async function boundedNow(wallNow: Date): Promise<Date> {
  const rows = await query<{ newest: string | null }>(
    "SELECT MAX(last_synced_at) AS newest FROM _sync_state",
  );
  const serverAt = rows[0]?.newest ? Date.parse(rows[0].newest) : Number.NaN;
  if (!Number.isFinite(serverAt)) return wallNow;

  return new Date(Math.min(wallNow.getTime(), serverAt));
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

  const cutoff = cutoffIso(retentionDays, await boundedNow(now));

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
