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

// Tracks the previous run's per-table gap (server - local) so a deficit
// that a resync genuinely can't fix - e.g. a row permanently stuck behind
// a UNIQUE-constraint collision pull.ts already gives up retrying after 5
// attempts (recordUniqueSkipAndCheckGiveUp) - doesn't turn this into an
// unbounded once-a-day forceFullResync() forever. A resync re-runs the
// exact same pull scoping that produced the gap in the first place, so if
// it didn't shrink, running it again won't either.
const LAST_DEFICIT_KEY = "dumos_sync_health_deficit_state";
const MAX_NON_IMPROVING_RESYNCS = 2;

interface DeficitState {
  gaps: Record<string, number>;
  nonImprovingCount: number;
}

function readDeficitState(): DeficitState | null {
  try {
    const raw = localStorage.getItem(LAST_DEFICIT_KEY);
    return raw ? (JSON.parse(raw) as DeficitState) : null;
  } catch {
    return null;
  }
}

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
 *
 * Backs off after MAX_NON_IMPROVING_RESYNCS consecutive checks whose gap
 * didn't shrink: a resync re-runs the exact same pull scoping that
 * produced the gap, so a deficit that survives one resync unchanged is a
 * genuinely unrecoverable row (e.g. a permanent UNIQUE-constraint
 * collision pull.ts already gave up retrying), not a stuck cursor - and
 * without this, that single bad row would trigger a full catalog re-
 * download every single day, forever, for no benefit. Still logs every
 * time either way, tagged givingUp so the two cases stay distinguishable
 * in Sentry.
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
    const gaps: Record<string, number> = {};
    for (const table of HEALTH_CHECK_TABLES) {
      const local = localCounts[table] ?? 0;
      const server = serverCounts[table] ?? 0;
      if (local < server) {
        deficits[table] = { local, server };
        gaps[table] = server - local;
      }
    }

    if (Object.keys(deficits).length === 0) {
      // Recovered (or never had a gap) - nothing to carry forward.
      localStorage.removeItem(LAST_DEFICIT_KEY);
      return;
    }

    const previous = readDeficitState();
    // "Improved" means at least one previously-gapped table's gap actually
    // shrank - not just that the SET of gapped tables changed, since a
    // table recovering while a different one develops a fresh gap is still
    // real progress worth another resync attempt.
    const improved =
      !previous ||
      Object.entries(previous.gaps).some(
        ([table, prevGap]) => (gaps[table] ?? 0) < prevGap,
      );
    const nonImprovingCount = improved ? 0 : (previous?.nonImprovingCount ?? 0) + 1;
    const givingUp = nonImprovingCount >= MAX_NON_IMPROVING_RESYNCS;

    localStorage.setItem(
      LAST_DEFICIT_KEY,
      JSON.stringify({ gaps, nonImprovingCount } satisfies DeficitState),
    );

    await logCrash(
      new Error(
        givingUp
          ? `Sync health check: this device has a persistent deficit a resync hasn't fixed after ${nonImprovingCount} attempts - likely a permanently unrecoverable row (see pull.ts's UNIQUE-collision give-up), not a stuck cursor: ${JSON.stringify(deficits)}`
          : `Sync health check found this device behind the server: ${JSON.stringify(deficits)}`,
      ),
      false,
      { area: "sync-health-check", deficits: JSON.stringify(deficits), givingUp: String(givingUp) },
    );

    if (!givingUp) {
      await forceFullResync();
    }
  } catch (error) {
    // Best-effort: a failed health check just means the timestamp above
    // wasn't stamped (already handled per-branch), so it naturally retries
    // next time this runs. Not worth its own crash report - it's usually
    // the same transient network failure sync() itself already handles.
    console.error("Sync health check failed:", error);
  }
}
