import { pushChanges } from "./push";
import { pullChanges } from "./pull";
import { stampPullWindowUnlessRewinding } from "./pull-window";
import { SyncResult, PullResponse } from "./types";
import {
  recordSyncOutcome,
  READ_ONLY_TAB_MESSAGE,
  SYNC_IN_PROGRESS_ERROR,
} from "./sync-outcome";
import { apiClient } from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";
import { query, execute, isTauri, isWriterTab } from "../core";
import { reconcileStockQuantities as reconcileStockQuantitiesImpl } from "./reconcile-quantities";
import { verifyStockIntegrity, foldStockQuantities } from "./stock-integrity";
import { getValidColumns } from "./schema";
import { getSyncQueueBreakdown } from "@/lib/db/queries/setup";
import { pruneSyncedAuditLogs } from "../retention";
import { devLog } from "@/lib/utils/dev-log";
import { APP_EVENTS, emitAppEvent } from "@/lib/events";
import { logCrash } from "@/lib/utils/error-logger";
import {
  isImpersonatedSession,
  SYNC_DISABLED_IMPERSONATION_MESSAGE,
} from "@/lib/utils/impersonation";
import {
  STORAGE_KEYS,
  setLastSyncTime,
  getAuthToken,
} from "@/lib/storage-keys";

let isSyncInProgress = false;

export function isSyncing(): boolean {
  return isSyncInProgress;
}

/** Opaque per-sync-run token. crypto.randomUUID is unavailable on insecure
 * origins and older webviews, so it falls back to timestamp+random; only
 * per-device uniqueness within one short run window matters. */
function newSyncRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Returned instead of a real failure when another sync already holds the
 * mutex. Callers must treat it as a no-op, not an error (see SyncIndicator). */
export { SYNC_IN_PROGRESS_ERROR } from "./sync-outcome";

/**
 * Escape hatch for a device whose pull cursor has drifted ahead of rows it
 * never received: clears `_sync_state` only, forcing a full re-fetch. See
 * client/AGENTS.md, "`sync()` and friends (sync-engine/index.ts)".
 */
export async function forceFullResync(): Promise<SyncResult> {
  if (isSyncInProgress) {
    return { success: false, pushed: 0, pulled: 0, error: SYNC_IN_PROGRESS_ERROR };
  }
  await execute("DELETE FROM _sync_state");
  return sync(true);
}

/** See reconcile-quantities.ts for the implementation; re-exported here so
 * every other sync-engine entry point (including the `window.*` DevTools
 * hooks below) lives in one place. */
export async function reconcileStockQuantities(): Promise<{
  reconciled: number;
  checked: number;
}> {
  return reconcileStockQuantitiesImpl(sync);
}

// DevTools support hooks, kept out of this file so it stays under the
// 350-line limit. Imported for its side effect.
import "./devtools-hooks";

/**
 * Records every attempt's outcome, then returns it. A wrapper rather than a
 * line at each `return` so an exit path added later cannot forget — see
 * sync-outcome.ts for why the last ATTEMPT is the number that was missing.
 */
export async function sync(
  isManual: boolean = false,
  isSetup: boolean = false,
  onCriticalTablesReady?: (pullSucceeded: boolean) => void,
): Promise<SyncResult> {
  const result = await runSync(isManual, isSetup, onCriticalTablesReady);
  recordSyncOutcome(result);

  return result;
}

/**
 * One push-then-pull cycle; every guard it applies is documented in
 * client/AGENTS.md, "`sync()` and friends".
 */
async function runSync(
  isManual: boolean = false,
  isSetup: boolean = false,
  // Setup-only: fires once store/user identity is pulled, with whether the
  // pull actually succeeded. See pullChanges and client/AGENTS.md.
  onCriticalTablesReady?: (pullSucceeded: boolean) => void,
): Promise<SyncResult> {
  if (isSyncInProgress) {
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: SYNC_IN_PROGRESS_ERROR,
    };
  }

  // An impersonated session is read-only support access; gated here so no
  // call site, present or future, can bypass it.
  if (isImpersonatedSession()) {
    devLog("[SyncEngine] Sync skipped: impersonated session is read-only.");
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: SYNC_DISABLED_IMPERSONATION_MESSAGE,
    };
  }

  // A read-only tab (tab-lock.ts) must never write; catch it before
  // push/pull throw mid-sync via core.ts's assertWritable().
  if (!isTauri() && !isWriterTab()) {
    devLog("[SyncEngine] Sync skipped: this tab is read-only.");
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: READ_ONLY_TAB_MESSAGE,
    };
  }

  const token =
    typeof window !== "undefined" ? getAuthToken() : null;
  if (!token) {
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: "Unauthenticated. Please link your cloud account in settings.",
    };
  }

  // Centralized so an offline attempt never burns the queue's retry budget
  // and raises a false "stuck sync" alarm.
  if (typeof window !== "undefined" && !navigator.onLine) {
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: "Offline. Will sync automatically when back online.",
    };
  }

  try {
    isSyncInProgress = true;
    // One token for the whole run; the server throttles per run, not per
    // request, so every batch and page must carry it.
    const runId = newSyncRunId();
    const pushResult = await pushChanges(isManual, isSetup, runId);
    const pullResult = await pullChanges(isManual, isSetup, onCriticalTablesReady, runId);

    if (pushResult.pushed > 0 || pullResult.pulled > 0) {
      devLog(
        `Sync completed: Pushed ${pushResult.pushed}, Pulled ${pullResult.pulled}`
      );
    }

    try {
      // getSystemConfig() already unwraps the {success, data} envelope.
      const value = await apiClient
        .getSystemConfig("global_suggestions")
        .catch(() => null);
      if (typeof value === "string") {
        JSON.parse(value); // Validate JSON
        localStorage.setItem(STORAGE_KEYS.suggestions, value);
      } else if (value && typeof value === "object") {
        localStorage.setItem(STORAGE_KEYS.suggestions, JSON.stringify(value));
      }
    } catch (err) {
      console.error("Failed to sync autocomplete suggestions:", err);
    }

    setLastSyncTime(new Date().toISOString());

    if (isWriterTab()) {
      await pruneSyncedAuditLogs().catch((err) =>
        console.error("Failed to prune local audit logs", err),
      );
    }

    if (typeof window !== "undefined") {
      // Matches on meta.tables like base-helpers.ts; untagged queries still
      // always invalidate, so this is safe pre-migration.
      if (pullResult.updatedTables && pullResult.updatedTables.length > 0) {
        const updated = pullResult.updatedTables;
        void queryClient.invalidateQueries({
          predicate: (q) => {
            const tables = q.meta?.tables as string[] | undefined;
            return !tables || tables.some((t) => updated.includes(t));
          },
        });
        if (pullResult.updatedTables.includes("stores")) {
          emitAppEvent(APP_EVENTS.subscriptionUpdated);
        }
      }

      emitAppEvent(APP_EVENTS.syncCompleted, {
        updatedTables: pullResult.updatedTables || [],
      });
    }

    // pushChanges() swallows a bad batch so the rest can proceed; without
    // this the indicator would toast success when nothing pushed.
    if (pushResult.failedBatches > 0) {
      return {
        success: false,
        pushed: pushResult.pushed,
        pulled: pullResult.pulled,
        error: `${pushResult.failedBatches} batch(es) failed to push; will retry automatically`,
      };
    }

    return {
      success: true,
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
    };
  } catch (error) {
    console.error("Sync failed:", error);
    // Support-only context for Sentry (area:sync-run), never user-facing.
    const queueBreakdown = await getSyncQueueBreakdown().catch(() => null);
    logCrash(error, false, {
      area: "sync-run",
      queueBreakdown: queueBreakdown
        ? JSON.stringify(queueBreakdown.slice(0, 20))
        : undefined,
    }).catch(() => {});
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: error instanceof Error ? error.message : error,
    };
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Privileged Subscription Status Sync
 *
 * Pulls ONLY the `stores` table (subscription_tier, status,
 * suspension_reason, license_token), regardless of plan tier, so downgrades,
 * suspensions and renewals still land when full sync is disabled.
 */
export async function syncSubscriptionStatus(): Promise<{
  success: boolean;
  updated: boolean;
}> {
  const token =
    typeof window !== "undefined" ? getAuthToken() : null;

  if (!token || !navigator.onLine) {
    return { success: false, updated: false };
  }

  try {
    // Empty last_synced returns the full store record regardless of delta
    // timestamps; isSetup bypasses the backend's free-tier sync block.
    const response = (await apiClient.pullChanges(
      { last_synced: { stores: "" } },
      false,
      true
    )) as PullResponse;

    const storeRecords = response?.changes?.stores;
    if (!storeRecords || storeRecords.length === 0) {
      return { success: true, updated: false };
    }

    const validColumns = await getValidColumns("stores");

    // Only apply the subscription-critical fields to avoid clobbering local-only columns
    const SUBSCRIPTION_FIELDS = new Set([
      "subscription_tier",
      "status",
      "suspension_reason",
      "license_token",
      "updated_at",
    ]);

    for (const record of storeRecords) {
      const { id, _deleted, ...rawData } = record;
      const storeId = id as string;

      const data: Record<string, unknown> = {};
      for (const key in rawData) {
        if (validColumns.has(key) && SUBSCRIPTION_FIELDS.has(key)) {
          data[key] = rawData[key];
        }
      }

      const columns = Object.keys(data);
      if (columns.length === 0) continue;

      const setClause = columns.map((c) => `${c} = ?`).join(", ");
      const values = columns.map((c) => data[c]);

      const exists = await query<{ 1: number }>(`SELECT 1 FROM stores WHERE id = ?`, [
        storeId,
      ]);
      if (exists.length > 0) {
        await execute(
          `UPDATE stores SET ${setClause}, _synced = 1 WHERE id = ?`,
          [...values as (string | number | null)[], storeId]
        );
      }
    }

    await stampPullWindowUnlessRewinding("stores", response.server_timestamp);

    // Prefix-only keys, so every store/user-scoped variant is matched.
    if (typeof window !== "undefined") {
      void queryClient.invalidateQueries({ queryKey: ["storeProfile"] });
      void queryClient.invalidateQueries({ queryKey: ["allStores"] });
      emitAppEvent(APP_EVENTS.subscriptionUpdated);
    }

    devLog("[SyncEngine] Subscription status synced from server.");
    return { success: true, updated: true };
  } catch (error) {
    console.error("[SyncEngine] Failed to sync subscription status:", error);
    return { success: false, updated: false };
  }
}

// Re-export for backwards compatibility
export { pushChanges } from "./push";
export { pullChanges } from "./pull";
