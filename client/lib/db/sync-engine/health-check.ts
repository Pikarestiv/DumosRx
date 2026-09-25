import { query, isTauri, isWriterTab, getActiveStoreId } from "../core";
import { apiClient } from "@/lib/api/client";
import { logCrash } from "@/lib/utils/error-logger";
import { isImpersonatedSession } from "@/lib/utils/impersonation";
import { forceFullResync } from "./index";

// Same tables SyncController::counts() reports on server-side - see that
// endpoint's own doc comment for why this list is scoped to
// inventory+sales rather than every synced table.
const HEALTH_CHECK_TABLES = ["products", "stock_batches", "sales", "customers", "categories"] as const;

const LAST_CHECK_KEY = "dumos_last_sync_health_check";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function getLocalCounts(storeId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of HEALTH_CHECK_TABLES) {
    const rows = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM ${table} WHERE (_deleted = 0 OR _deleted IS NULL) AND store_id = ?`,
      [storeId],
    );
    counts[table] = rows[0]?.count ?? 0;
  }
  return counts;
}

/**
 * Periodic (once per CHECK_INTERVAL_MS per device) verification that this
 * device's local row counts actually match the server's, independent of
 * whatever its own pull cursor believes. Exists because a pull cursor can
 * get stuck - advance past content it never actually applied, e.g. after a
 * crash mid-round - and every SUBSEQUENT delta pull then "succeeds" while
 * silently never re-offering the missed rows, with nothing anywhere to
 * notice it by (see docs/KNOWN_BUGS.md, and the production incident that
 * led to this file existing at all: caught only by manually running SQL
 * against the server to compare against what the device was showing).
 *
 * Only ever checks LOCAL < SERVER (this device missing rows the server
 * has) - LOCAL > SERVER is normal and expected (records created on this
 * device that haven't pushed yet) and must never trigger a resync over.
 * A real deficit triggers forceFullResync() silently in the background and
 * logs the specifics to Sentry (area: sync-health-check) either way, so a
 * future occurrence is a searchable signal instead of something only found
 * by hand.
 */
export async function checkSyncHealth(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isImpersonatedSession()) return;
  if (!isTauri() && !isWriterTab()) return;
  if (!navigator.onLine) return;

  const token = localStorage.getItem("auth_token");
  if (!token) return;

  // A device that has never completed a sync round at all (last_sync_time
  // unset - see sync-engine/index.ts, only stamped after a full push+pull
  // round finishes) isn't exhibiting a stuck cursor, it just hasn't caught
  // up yet - normal for a brand-new device or one still mid-first-sync on
  // a slow connection, not a deficit to alarm on or resync over. Its own
  // ordinary sync() calls already handle catching it up.
  if (!localStorage.getItem("last_sync_time")) return;

  const lastCheckedStr = localStorage.getItem(LAST_CHECK_KEY);
  const lastChecked = lastCheckedStr ? parseInt(lastCheckedStr, 10) : 0;
  if (Date.now() - lastChecked < CHECK_INTERVAL_MS) return;

  const storeId = getActiveStoreId();
  if (!storeId) return;

  try {
    const response = await apiClient.getSyncCounts();
    if (!response.success) return;

    // Only stamped on a successful fetch - a failed attempt (offline,
    // server error) should retry on the next app open, not sit dormant
    // for the rest of the interval just because this one try failed.
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

    const serverCounts = response.counts;
    const localCounts = await getLocalCounts(storeId);

    const deficits: Record<string, { local: number; server: number }> = {};
    for (const table of HEALTH_CHECK_TABLES) {
      const local = localCounts[table] ?? 0;
      const server = serverCounts[table] ?? 0;
      if (local < server) {
        deficits[table] = { local, server };
      }
    }

    if (Object.keys(deficits).length === 0) return;

    await logCrash(
      new Error(
        `Sync health check found this device behind the server: ${JSON.stringify(deficits)}`,
      ),
      false,
      { area: "sync-health-check", deficits: JSON.stringify(deficits) },
    );

    await forceFullResync();
  } catch (error) {
    // Best-effort: a failed health check just means the timestamp above
    // wasn't stamped (already handled per-branch), so it naturally retries
    // next time this runs. Not worth its own crash report - it's usually
    // the same transient network failure sync() itself already handles.
    console.error("Sync health check failed:", error);
  }
}
