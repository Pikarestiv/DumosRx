import {
  getPendingSyncItems,
  markSynced,
} from "./local-database";
import { execute, query } from "./core";
import { isTauri } from "./local-database";
import { apiClient } from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";

const schemaCache: Record<string, Set<string>> = {};

/**
 * Sync Engine
 * Handles bidirectional synchronization between SQLite and Laravel
 */

interface PushResponse {
  success: boolean;
  message?: string;
  processed?: number;
}

interface PullResponse {
  success: boolean;
  server_timestamp: string;
  changes: Record<string, Record<string, unknown>[]>;
}

interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  error?: unknown;
}

const SYNC_BATCH_SIZE = 50;
let isSyncInProgress = false;

export function isSyncing(): boolean {
  return isSyncInProgress;
}

/**
 * Push local changes to server
 */
export async function pushChanges(isManual: boolean = false, isSetup: boolean = false): Promise<{ pushed: number }> {
  const pending = await getPendingSyncItems();

  if (pending.length === 0) return { pushed: 0 };

  // Process in batches
  let pushedCount = 0;

  for (let i = 0; i < pending.length; i += SYNC_BATCH_SIZE) {
    const batch = pending.slice(i, i + SYNC_BATCH_SIZE);

    try {
      // payload needs to be parsed from string
      const changes = batch.map((item) => {
        const payload = JSON.parse(item.payload);

        return {
          ...item,
          payload,
        };
      });

      const response = (await apiClient.pushChanges({
        changes,
      }, isManual, isSetup)) as PushResponse;

      // If successful, mark as synced
      if (response.success) {
        const ids = batch.map((b) => b.id);
        await markSynced(ids);
        pushedCount += ids.length;
      }
    } catch (error) {
      console.error("Push sync failed for batch:", error);
      // Throw to properly report failure
      throw error;
    }
  }

  return { pushed: pushedCount };
}

/**
 * Pull changes from server
 */
export async function pullChanges(isManual: boolean = false, isSetup: boolean = false): Promise<{
  pulled: number;
  updatedTables?: string[];
  error?: unknown;
}> {
  try {
    // Get last sync timestamp for each table
    const syncState = await query<{ table_name: string; last_synced_at: string }>(
      "SELECT table_name, last_synced_at FROM _sync_state",
    );

    // Map to object { table: timestamp }
    const lastSyncedMap = syncState.reduce(
      (acc, row) => {
        acc[row.table_name] = row.last_synced_at;
        return acc;
      },
      {} as Record<string, string>,
    );

    // Fetch changes from server
    const response = (await apiClient.pullChanges({
      last_synced: lastSyncedMap,
    }, isManual, isSetup)) as PullResponse;
    const { changes, server_timestamp } = response;

    if (!changes || Object.keys(changes).length === 0) {
      return { pulled: 0 };
    }

    let pulledCount = 0;

    // Apply changes transactionally
    try {
      const rawDb = isTauri() ? null : (await import("./core")).getDatabase();
      
      if (!isTauri() && rawDb) {
        rawDb.run("BEGIN");
      }

      const updatedTables: string[] = [];

      for (const [table, records] of Object.entries(changes)) {
        if (!Array.isArray(records)) continue;
        if (records.length > 0) {
          updatedTables.push(table);
        }

        // Fetch local table columns to avoid "no such column" errors, with caching
        if (!schemaCache[table]) {
          const tableInfo = await query<{ name: string }>(`PRAGMA table_info(${table})`);
          schemaCache[table] = new Set(tableInfo.map((c) => c.name));
        }
        const validColumns = schemaCache[table];

        for (const record of records) {
          const { id, _deleted, ...rawData } = record as any;

          const data: Record<string, any> = {};
          for (const key in rawData) {
            if (validColumns.has(key)) {
              data[key] = rawData[key];
            }
          }

          const columns = Object.keys(data);
          const values = columns.map((c) => {
            const val = data[c];
            if (typeof val === "boolean") {
              return val ? 1 : 0;
            }
            return val;
          });

          // Check if record already exists to preserve local-only columns (e.g. is_initialized, theme, license_token)
          const exists = await query<any>(`SELECT 1 FROM ${table} WHERE id = ?`, [id]);
          
          if (exists.length > 0) {
            // Update only columns returned by server to preserve local columns
            const setClause = [...columns, "_synced", "_version", "_deleted"]
              .map((c) => `${c} = ?`)
              .join(", ");
            const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
            const params = [
              ...values,
              1,
              (record as any)._version || 1,
              _deleted ? 1 : 0,
              id,
            ];
            
            try {
              if (isTauri()) {
                await execute(sql, params);
              } else if (rawDb) {
                rawDb.run(sql, params);
              }
            } catch (err: any) {
              const errMsg = typeof err === "string" ? err : err?.message || String(err);
              if (errMsg.includes("UNIQUE constraint failed")) {
                console.warn(`[Sync] Skipped updating record in ${table} due to unique constraint:`, id, errMsg);
              } else {
                throw err;
              }
            }
          } else {
            // Insert new record
            const allCols = ["id", ...columns, "_synced", "_version", "_deleted"];
            const allPlaceholders = allCols.map(() => "?");
            const sql = `INSERT INTO ${table} (${allCols.join(", ")}) VALUES (${allPlaceholders.join(", ")})`;
            const params = [
              id,
              ...values,
              1,
              (record as any)._version || 1,
              _deleted ? 1 : 0,
            ];
            
            try {
              if (isTauri()) {
                await execute(sql, params);
              } else if (rawDb) {
                rawDb.run(sql, params);
              }
            } catch (err: any) {
              const errMsg = typeof err === "string" ? err : err?.message || String(err);
              if (errMsg.includes("UNIQUE constraint failed")) {
                console.warn(`[Sync] Skipped inserting record in ${table} due to unique constraint:`, id, errMsg);
              } else {
                throw err;
              }
            }
          }

          pulledCount++;
        }

        const syncSql = "INSERT OR REPLACE INTO _sync_state (table_name, last_synced_at) VALUES (?, ?)";
        const syncParams = [table, server_timestamp];
        
        if (isTauri()) {
          await execute(syncSql, syncParams);
        } else if (rawDb) {
          rawDb.run(syncSql, syncParams);
        }
      }

      if (!isTauri() && rawDb) {
        rawDb.run("COMMIT");
        (await import("./core")).saveDatabase();
      }

      return { pulled: pulledCount, updatedTables };
    } catch (err) {
      console.error("Failed to apply pull changes:", err);
      try {
        const rawDb = isTauri() ? null : (await import("./core")).getDatabase();
        if (!isTauri() && rawDb) {
          rawDb.run("ROLLBACK");
        }
      } catch (_rollbackErr) {
        // Silently fail rollback
      }
      throw err;
    }

    return { pulled: pulledCount, updatedTables: [] }; // fallback if it reaches here
  } catch (error) {
    console.error("Pull sync failed:", error);
    throw error; // Throw so sync() can catch it properly
  }
}

/**
 * Main Sync Function
 */
export async function sync(isManual: boolean = false, isSetup: boolean = false): Promise<SyncResult> {
  if (isSyncInProgress) {
    return { success: false, pushed: 0, pulled: 0, error: "Sync already in progress" };
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (!token) {
    return { 
      success: false, 
      pushed: 0, 
      pulled: 0, 
      error: "Unauthenticated. Please link your cloud account in settings." 
    };
  }

  try {
    isSyncInProgress = true;
    const pushResult = await pushChanges(isManual, isSetup);
    const pullResult = await pullChanges(isManual, isSetup);

    if (pushResult.pushed > 0 || pullResult.pulled > 0) {
      console.log(`Sync completed: Pushed ${pushResult.pushed}, Pulled ${pullResult.pulled}`);
    }

    try {
      const suggestionsConfig = await apiClient.getSystemConfig("global_suggestions").catch(() => null);
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
        });
        // Globally invalidate localData abstraction queries
        queryClient.invalidateQueries({ queryKey: ['localData'] });
      }

      window.dispatchEvent(new CustomEvent("dumos_sync_completed", { 
        detail: { updatedTables: pullResult.updatedTables || [] }
      }));
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
export async function syncSubscriptionStatus(): Promise<{ success: boolean; updated: boolean }> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (!token || !navigator.onLine) {
    return { success: false, updated: false };
  }

  try {
    // Ask the server for only the stores table changes
    const syncState = await query<{ table_name: string; last_synced_at: string }>(
      "SELECT table_name, last_synced_at FROM _sync_state WHERE table_name = 'stores'"
    );

    const lastSynced = syncState[0]?.last_synced_at ?? null;

    const response = (await apiClient.pullChanges({
      last_synced: { stores: lastSynced ?? "" },
    })) as PullResponse;

    const storeRecords = response?.changes?.stores;
    if (!storeRecords || storeRecords.length === 0) {
      return { success: true, updated: false };
    }

    // Fetch valid columns for the stores table (with caching)
    if (!schemaCache["stores"]) {
      const tableInfo = await query<{ name: string }>(`PRAGMA table_info(stores)`);
      schemaCache["stores"] = new Set(tableInfo.map((c) => c.name));
    }
    const validColumns = schemaCache["stores"];

    // Only apply the subscription-critical fields to avoid clobbering local-only columns
    const SUBSCRIPTION_FIELDS = new Set([
      "subscription_tier",
      "status",
      "suspension_reason",
      "license_token",
      "updated_at",
    ]);

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

      const exists = await query<any>(`SELECT 1 FROM stores WHERE id = ?`, [id]);
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
      window.dispatchEvent(new CustomEvent("dumos_subscription_updated"));
    }

    console.log("[SyncEngine] Subscription status synced from server.");
    return { success: true, updated: true };
  } catch (error) {
    console.error("[SyncEngine] Failed to sync subscription status:", error);
    return { success: false, updated: false };
  }
}
