import {
  getPendingSyncItems,
  markSynced,
} from "./local-database";
import { execute, query } from "./core";
import { isTauri } from "./local-database";
import { apiClient } from "@/lib/api/client";
import { queryClient } from "@/lib/query-client";

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
        if (item.table_name === "sales" && payload.payment_method === "mixed") {
          payload.payment_method = "split";
        }
        if (item.table_name === "purchase_orders") {
          if (!payload.order_number) {
            payload.order_number = `PO-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
          }
          if (!payload.ordered_by) {
            payload.ordered_by = "u1";
          }
          if (!payload.order_date) {
            payload.order_date = payload.created_at ? payload.created_at.split('T')[0] : new Date().toISOString().split('T')[0];
          }
          if (!payload.supplier_id && payload.vendor_id) {
            payload.supplier_id = payload.vendor_id;
          }
          if (payload.status === "completed") {
            payload.status = "received";
          } else if (payload.status === "draft") {
            payload.status = "pending";
          }
        }
        if (item.table_name === "purchase_order_items") {
          if (!payload.quantity_ordered && payload.bulk_quantity) {
            payload.quantity_ordered = payload.bulk_quantity * (payload.units_per_bulk || 1);
          }
          if (!payload.total_cost && payload.subtotal) {
            payload.total_cost = payload.subtotal;
          }
          if (!payload.purchase_order_id && payload.po_id) {
            payload.purchase_order_id = payload.po_id;
          }
          if (!payload.status) {
            payload.status = "pending";
          }
        }
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
      // Don't throw, just stop pushing and continue to pull
      break;
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

        // Fetch local table columns to avoid "no such column" errors
        const tableInfo = await query<{ name: string }>(`PRAGMA table_info(${table})`);
        const validColumns = new Set(tableInfo.map((c) => c.name));

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
            
            if (isTauri()) {
              await execute(sql, params);
            } else if (rawDb) {
              rawDb.run(sql, params);
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
            
            if (isTauri()) {
              await execute(sql, params);
            } else if (rawDb) {
              rawDb.run(sql, params);
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
