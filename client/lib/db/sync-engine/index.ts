import { pushChanges } from "./push";
import { pullChanges } from "./pull";
import { SyncResult, PullResponse } from "./types";
import { apiClient } from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";
import { query, execute } from "../core";
import { getValidColumns } from "./schema";

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
      console.log(
        `Sync completed: Pushed ${pushResult.pushed}, Pulled ${pullResult.pulled}`
      );
    }

    try {
      const suggestionsConfig = await apiClient
        .getSystemConfig("global_suggestions")
        .catch(() => null);
      if (suggestionsConfig && suggestionsConfig.success) {
        const value = suggestionsConfig.data;
        if (typeof value === "string") {
          JSON.parse(value); // Validate JSON
          localStorage.setItem("dumos_suggestions", value);
        } else if (value && typeof value === "object") {
          localStorage.setItem("dumos_suggestions", JSON.stringify(value));
        }
      }
    } catch (err) {
      console.error("Failed to sync autocomplete suggestions:", err);
    }

    localStorage.setItem("last_sync_time", new Date().toISOString());

    if (typeof window !== "undefined") {
      // Invalidate React Query cache for any tables that were updated
      if (pullResult.updatedTables && pullResult.updatedTables.length > 0) {
        pullResult.updatedTables.forEach((table) => {
          queryClient.invalidateQueries({ queryKey: [table] });
          if (table === "stores") {
            queryClient.invalidateQueries({ queryKey: ["storeProfile"] });
            window.dispatchEvent(new CustomEvent("dumos_subscription_updated"));
          }
        });
        // Globally invalidate localData abstraction queries
        queryClient.invalidateQueries({ queryKey: ["localData"] });
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
  } catch (error: any) {
    console.error("Sync failed:", error);
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      error: error.message || error,
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
  console.log("Syncing sub");

  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  console.log("Token", token);

  if (!token || !navigator.onLine) {
    console.log("No token");

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
    console.log("🚀 ~ syncSubscriptionStatus ~ response:", response);

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
    console.log(
      "🚀 ~ syncSubscriptionStatus ~ SUBSCRIPTION_FIELDS:",
      SUBSCRIPTION_FIELDS
    );

    for (const record of storeRecords) {
      const { id, _deleted, ...rawData } = record as any;

      const data: Record<string, any> = {};
      for (const key in rawData) {
        if (validColumns.has(key) && SUBSCRIPTION_FIELDS.has(key)) {
          data[key] = rawData[key];
        }
      }

      const columns = Object.keys(data);
      if (columns.length === 0) continue;

      const setClause = columns.map((c) => `${c} = ?`).join(", ");
      const values = columns.map((c) => data[c]);

      const exists = await query<any>(`SELECT 1 FROM stores WHERE id = ?`, [
        id,
      ]);
      if (exists.length > 0) {
        await execute(
          `UPDATE stores SET ${setClause}, _synced = 1 WHERE id = ?`,
          [...values, id]
        );
      }
    }

    // Update the sync state timestamp for the stores table
    await execute(
      "INSERT OR REPLACE INTO _sync_state (table_name, last_synced_at) VALUES (?, ?)",
      ["stores", response.server_timestamp]
    );

    // Invalidate React Query cache so UI re-renders with new tier/status
    if (typeof window !== "undefined") {
      queryClient.invalidateQueries({ queryKey: ["localData"] });
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["storeProfile"] });
      window.dispatchEvent(new CustomEvent("dumos_subscription_updated"));
    }

    console.log("[SyncEngine] Subscription status synced from server.");
    return { success: true, updated: true };
  } catch (error) {
    console.error("[SyncEngine] Failed to sync subscription status:", error);
    return { success: false, updated: false };
  }
}

// Re-export for backwards compatibility
export { pushChanges } from "./push";
export { pullChanges } from "./pull";
