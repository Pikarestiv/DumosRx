import { query, isTauri, isWriterTab, getActiveStoreId } from "../core";
import { apiClient } from "@/lib/api/client";
import { logCrash } from "@/lib/utils/error-logger";
import { isImpersonatedSession } from "@/lib/utils/impersonation";
import { forceFullResync } from "./index";
import { healStockIntegrity } from "./stock-auto-heal";
import { isIntervalElapsed } from "@/lib/utils/elapsed";
import {
  STORAGE_KEYS,
  getLastSyncTime,
  hasStoredLastSyncTime,
  getAuthToken,
} from "@/lib/storage-keys";

// Same tables SyncController::counts() reports on server-side - see that endpoint's own doc comment for why this list is scoped to inventory+s…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-health-check-ts-L15
const HEALTH_CHECK_TABLES = ["products", "stock_batches", "sales", "customers", "categories"] as const;

const LAST_CHECK_KEY = STORAGE_KEYS.lastSyncHealthCheck;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Tracks the previous run's per-table gap (server - local) so a deficit that a resync genuinely can't fix - e.g.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-health-check-ts-L23
const LAST_DEFICIT_KEY = STORAGE_KEYS.syncHealthDeficitState;
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

// Periodic (once per CHECK_INTERVAL_MS per device) verification that this device's local row counts actually match the server's, independent o…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-health-check-L59
export async function checkSyncHealth(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isImpersonatedSession()) return;
  if (!isTauri() && !isWriterTab()) return;
  if (!navigator.onLine) return;

  const token = getAuthToken();
  if (!token) return;

  // A device that has never completed a sync round at all (last_sync_time unset - see sync-engine/index.ts, only stamped after a full push+pull…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-health-check-ts-L70
  if (!getLastSyncTime() && !hasStoredLastSyncTime()) return;

  if (!isIntervalElapsed(localStorage.getItem(LAST_CHECK_KEY), CHECK_INTERVAL_MS)) {
    return;
  }

  const storeId = getActiveStoreId();
  if (!storeId) return;

  try {
    const response = await apiClient.getSyncCounts();
    if (!response.success) return;

    // Only stamped on a successful fetch - a failed attempt (offline, server error) should retry on the next app open, not sit dormant for the res…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-health-check-ts-L89
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

    await healStockIntegrity();

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
    // "Improved" means at least one previously-gapped table's gap actually shrank - not just that the SET of gapped tables changed, since a table…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-health-check-ts-L117
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
      {
        area: "sync-health-check",
        deficits: JSON.stringify(deficits),
        givingUp: String(givingUp),
        informational: !givingUp,
      },
    );

    if (!givingUp) {
      await forceFullResync();
    }
  } catch (error) {
    // Best-effort: a failed health check just means the timestamp above wasn't stamped (already handled per-branch), so it naturally retries next…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-health-check-ts-L153
    console.error("Sync health check failed:", error);
  }
}
