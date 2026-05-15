import {
  getPendingSyncItems,
  markSynced,
  query,
  execute,
  isTauri,
} from "./local-database";
import { apiClient } from "@/lib/api/client";

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
export async function pushChanges(): Promise<{ pushed: number }> {
  const pending = await getPendingSyncItems();

  if (pending.length === 0) return { pushed: 0 };

  // Process in batches
  let pushedCount = 0;

  for (let i = 0; i < pending.length; i += SYNC_BATCH_SIZE) {
    const batch = pending.slice(i, i + SYNC_BATCH_SIZE);

    try {
      // payload needs to be parsed from string
      const changes = batch.map((item) => ({
        ...item,
        payload: JSON.parse(item.payload),
      }));

      const response = (await apiClient.pushChanges({
        changes,
      })) as PushResponse;

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
export async function pullChanges(): Promise<{
  pulled: number;
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
    })) as PullResponse;
    const { changes, server_timestamp } = response;

    if (!changes || Object.keys(changes).length === 0) {
      return { pulled: 0 };
    }

    let pulledCount = 0;

    // Apply changes transactionally
    try {
      const rawDb = isTauri() ? null : (await import("./core")).getDatabase();
      
      if (isTauri()) {
        await execute("BEGIN TRANSACTION");
      } else if (rawDb) {
        rawDb.run("BEGIN");
      }

      for (const [table, records] of Object.entries(changes)) {
        if (!Array.isArray(records)) continue;

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
          const placeholders = columns.map(() => "?");
          const values = columns.map((c) => data[c]);

          const allCols = ["id", ...columns, "_synced", "_version", "_deleted"];
          const allPlaceholders = ["?", ...placeholders, "?", "?", "?"];
          const allValues = [
            id,
            ...values,
            1,
            (record as any)._version || 1,
            _deleted ? 1 : 0,
          ];

          const sql = `INSERT OR REPLACE INTO ${table} (${allCols.join(", ")}) VALUES (${allPlaceholders.join(", ")})`;
          
          if (isTauri()) {
            await execute(sql, allValues);
          } else if (rawDb) {
            rawDb.run(sql, allValues);
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

      if (isTauri()) {
        await execute("COMMIT");
      } else if (rawDb) {
        rawDb.run("COMMIT");
        (await import("./core")).saveDatabase();
      }
    } catch (err) {
      console.error("Failed to apply pull changes:", err);
      try {
        const rawDb = isTauri() ? null : (await import("./core")).getDatabase();
        if (isTauri()) {
          await execute("ROLLBACK");
        } else if (rawDb) {
          rawDb.run("ROLLBACK");
        }
      } catch (rollbackErr) {
        // Silently fail rollback
      }
      throw err;
    }

    return { pulled: pulledCount };
  } catch (error) {
    console.error("Pull sync failed:", error);
    throw error; // Throw so sync() can catch it properly
  }
}

/**
 * Main Sync Function
 */
export async function sync(): Promise<SyncResult> {
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
    const pushResult = await pushChanges();
    const pullResult = await pullChanges();

    if (pushResult.pushed > 0 || pullResult.pulled > 0) {
      console.log(`Sync completed: Pushed ${pushResult.pushed}, Pulled ${pullResult.pulled}`);
    }

    localStorage.setItem("last_sync_time", new Date().toISOString());

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
