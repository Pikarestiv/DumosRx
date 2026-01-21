import {
  getPendingSyncItems,
  markSynced,
  execute,
  query,
  getDatabase,
} from "./local-database";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";

/**
 * Sync Engine
 * Handles bidirectional synchronization between SQLite and Laravel
 */

const SYNC_BATCH_SIZE = 50;

/**
 * Push local changes to server
 */
export async function pushChanges() {
  const pending = getPendingSyncItems();

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

      const response = await apiClient.pushChanges({ changes });

      // If successful, mark as synced
      if (response.success) {
        const ids = batch.map((b) => b.id);
        markSynced(ids);
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
export async function pullChanges() {
  try {
    // Get last sync timestamp for each table
    const syncState = query<{ table_name: string; last_synced_at: string }>(
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
    const response = await apiClient.pullChanges({
      last_synced: lastSyncedMap,
    });
    const { changes, server_timestamp } = response;

    if (!changes || Object.keys(changes).length === 0) {
      return { pulled: 0 };
    }

    let pulledCount = 0;

    // Apply changes transactionally
    const db = getDatabase();
    if (!db) throw new Error("DB not initialized");

    db.run("BEGIN TRANSACTION");

    try {
      for (const [table, records] of Object.entries(changes)) {
        if (!Array.isArray(records)) continue;

        for (const record of records) {
          const { id, _deleted, ...data } = record as any;

          if (_deleted) {
            // Check if exists before deleting? Or just delete
            // We use soft delete locally too usually, but if server says deleted, we can hard delete or soft delete
            // Let's mirror server: if server soft deleted, record._deleted is 1
            const columns = Object.keys(data);
            const placeholders = columns.map(() => "?").join(", ");
            const values = columns.map((c) => data[c]);

            // Upsert (Insert or Replace)
            // We need to disable sync logging for these operations to prevent loops
            // But our 'insert'/'update' helpers automatically log.
            // So we must use raw SQL execution here.

            // Construct UPSERT query
            // SQLite INSERT OR REPLACE works for this

            // Flatten object values for binding
            const allCols = ["id", ...columns, "_synced"];
            const allPlaceholders = ["?", ...placeholders, "1"];
            const allValues = [id, ...values, 1]; // _synced = 1 means it came from server

            db.run(
              `INSERT OR REPLACE INTO ${table} (${allCols.join(", ")}) VALUES (${allPlaceholders.join(", ")})`,
              allValues,
            );
          } else {
            // Same logic for Active records
            const columns = Object.keys(data);
            const placeholders = columns.map(() => "?").join(", ");
            // Add id
            const allCols = ["id", ...columns, "_synced"];
            const allPlaceholders = ["?", ...placeholders, "1"];
            const allValues = [id, ...Object.values(data), 1];

            db.run(
              `INSERT OR REPLACE INTO ${table} (${allCols.join(", ")}) VALUES (${allPlaceholders.join(", ")})`,
              allValues,
            );
          }
          pulledCount++;
        }

        // Update sync state for table
        db.run(
          "INSERT OR REPLACE INTO _sync_state (table_name, last_synced_at) VALUES (?, ?)",
          [table, server_timestamp],
        );
      }

      db.run("COMMIT");
    } catch (err) {
      console.error("Failed to apply pull changes:", err);
      db.run("ROLLBACK");
      throw err;
    }

    return { pulled: pulledCount };
  } catch (error) {
    console.error("Pull sync failed:", error);
    return { pulled: 0, error };
  }
}

/**
 * Main Sync Function
 */
export async function sync() {
  try {
    const pushResult = await pushChanges();
    const pullResult = await pullChanges();

    if (pushResult.pushed > 0 || pullResult.pulled > 0) {
      console.log(
        `Sync completed: Pushed ${pushResult.pushed}, Pulled ${pullResult.pulled}`,
      );
      // toast.success("Data synced successfully");
    }

    return { success: true, ...pushResult, ...pullResult };
  } catch (error) {
    console.error("Sync failed:", error);
    // toast.error("Sync failed");
    return { success: false, error };
  }
}
