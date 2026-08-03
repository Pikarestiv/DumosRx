import { pushChanges } from "./push";
import { pullChanges } from "./pull";
import { SyncResult, PullResponse } from "./types";
import { apiClient } from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";
import { query, execute } from "../core";
import { getValidColumns } from "./schema";
import { devLog } from "@/lib/utils/dev-log";

let isSyncInProgress = false;

export function isSyncing(): boolean {
  return isSyncInProgress;
}

/**
 * Main Sync Function
 */
export async function sync(
  isManual: boolean = false,
  isSetup: boolean = false
): Promise<SyncResult> {
  if (isSyncInProgress) {
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: "Sync already in progress",
    };
  }

  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  if (!token) {
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: "Unauthenticated. Please link your cloud account in settings.",
    };
  }

  try {
    isSyncInProgress = true;
    const pushResult = await pushChanges(isManual, isSetup);
    const pullResult = await pullChanges(isManual, isSetup);

    if (pushResult.pushed > 0 || pullResult.pulled > 0) {
      devLog(
        `Sync completed: Pushed ${pushResult.pushed}, Pulled ${pullResult.pulled}`
      );
    }

    try {
      // getSystemConfig() already unwraps the server's {success, data}
      // envelope, so the fetched value itself is the suggestions payload —
      // not a nested {success, data} object.
      const value = await apiClient
        .getSystemConfig("global_suggestions")
        .catch(() => null);
      if (typeof value === "string") {
        JSON.parse(value); // Validate JSON
        localStorage.setItem("dumos_suggestions", value);
      } else if (value && typeof value === "object") {
        localStorage.setItem("dumos_suggestions", JSON.stringify(value));
      }
    } catch (err) {
      console.error("Failed to sync autocomplete suggestions:", err);
    }

    localStorage.setItem("last_sync_time", new Date().toISOString());

    if (typeof window !== "undefined") {
      // Invalidate exactly the queries tagged (via meta.tables, see
      // lib/query-keys.ts) as depending on any table that changed —
      // same predicate-based approach as base-helpers.ts's
      // invalidateQueriesForTable. Untagged queries still fall back to
      // always invalidating, so this stays safe for anything not yet
      // migrated to the factory.
      if (pullResult.updatedTables && pullResult.updatedTables.length > 0) {
        const updated = pullResult.updatedTables;
        queryClient.invalidateQueries({
          predicate: (q) => {
            const tables = q.meta?.tables as string[] | undefined;
            return !tables || tables.some((t) => updated.includes(t));
          },
        });
        if (pullResult.updatedTables.includes("stores")) {
          window.dispatchEvent(new CustomEvent("dumos_subscription_updated"));
        }
      }

      window.dispatchEvent(
        new CustomEvent("dumos_sync_completed", {
          detail: { updatedTables: pullResult.updatedTables || [] },
        })
      );
    }

    return {
      success: true,
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
    };
  } catch (error) {
    console.error("Sync failed:", error);
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
 * This runs regardless of the user's plan tier. It pulls ONLY the `stores`
 * table from the server so the local app always has the latest
 * subscription_tier, status, suspension_reason and license_token.
 *
 * This ensures that plan downgrades, suspensions and renewals are reflected
 * locally even when full cloud sync is disabled for free-tier users.
 */
export async function syncSubscriptionStatus(): Promise<{
  success: boolean;
  updated: boolean;
}> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  if (!token || !navigator.onLine) {
    return { success: false, updated: false };
  }

  try {
    // Always pass empty string so the server returns the full current store
    // record regardless of when the last sync happened. This ensures that
    // plan downgrades/upgrades written on the server are never missed due
    // to timestamp delta logic.
    // We pass isSetup=true as the 3rd arg to bypass the backend sync block for free tier.
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

    // Update the sync state timestamp for the stores table
    await execute(
      "INSERT OR REPLACE INTO _sync_state (table_name, last_synced_at) VALUES (?, ?)",
      ["stores", response.server_timestamp]
    );

    // Invalidate React Query cache so UI re-renders with new tier/status.
    // Prefix-only keys (no targetId/userStoreId arg) so this matches every
    // variant of these queries regardless of which store/user they're
    // scoped to — invalidateQueries does prefix matching by default.
    if (typeof window !== "undefined") {
      queryClient.invalidateQueries({ queryKey: ["storeProfile"] });
      queryClient.invalidateQueries({ queryKey: ["allStores"] });
      window.dispatchEvent(new CustomEvent("dumos_subscription_updated"));
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
