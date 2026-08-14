import { query, execute } from "../core";
import { isTauri } from "../local-database";
import { apiClient } from "@/lib/api/client";
import { PullResponse } from "./types";
import { getValidColumns } from "./schema";

/**
 * Pull changes from server
 */
export async function pullChanges(
  isManual: boolean = false,
  isSetup: boolean = false
): Promise<{
  pulled: number;
  updatedTables?: string[];
  error?: unknown;
}> {
  try {
    // Get last sync timestamp for each table
    const syncState = await query<{
      table_name: string;
      last_synced_at: string;
    }>("SELECT table_name, last_synced_at FROM _sync_state");

    // Map to object { table: timestamp }
    const lastSyncedMap = syncState.reduce(
      (acc, row) => {
        acc[row.table_name] = row.last_synced_at;
        return acc;
      },
      {} as Record<string, string>
    );

    // Fetch changes from server
    const response = (await apiClient.pullChanges(
      {
        last_synced: lastSyncedMap,
      },
      isManual,
      isSetup
    )) as PullResponse;
    const { changes, server_timestamp } = response;

    if (!changes || Object.keys(changes).length === 0) {
      return { pulled: 0 };
    }

    let pulledCount = 0;

    // Apply changes transactionally
    try {
      const rawDb = isTauri() ? null : (await import("../core")).getDatabase();

      if (!isTauri() && rawDb) {
        rawDb.run("BEGIN");
      }

      const updatedTables: string[] = [];

      for (const [table, records] of Object.entries(changes)) {
        if (!Array.isArray(records)) continue;
        if (records.length > 0) {
          updatedTables.push(table);
        }

        const validColumns = await getValidColumns(table);

        // If any record in this table's batch gets skipped below (because a
        // local edit for it hasn't been pushed yet), the per-table sync
        // cursor must not advance past it — otherwise the server's copy of
        // that record would never be re-offered on a future pull (its
        // updated_at is already older than the new cursor), and the local
        // row would be stuck showing stale, already-superseded data forever.
        // Leaving the cursor where it was just means this same batch gets
        // re-fetched and re-applied next time, which is harmless — applying
        // an already-applied change again is a no-op.
        let anySkipped = false;

        for (const record of records) {
          const { id, _deleted, ...rawData } = record;
          const recordId = id as string;

          const data: Record<string, unknown> = {};
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
          const exists = await query<{ 1: number }>(
            `SELECT 1 FROM ${table} WHERE id = ?`,
            [recordId]
          );

          const version = (rawData._version as number) || 1;

          if (exists.length > 0) {
            // Don't blindly overwrite a row that has a local edit still
            // waiting to be pushed — otherwise the user's own not-yet-synced
            // change gets silently discarded here, before the server ever
            // gets a chance to compare versions and decide which edit should
            // win. Defer to the next push (now that push preserves _version
            // instead of stripping it) to resolve the conflict properly;
            // this pull just leaves the local row alone for now.
            const pendingLocalEdit = await query<{ 1: number }>(
              "SELECT 1 FROM _sync_queue WHERE table_name = ? AND record_id = ? LIMIT 1",
              [table, recordId],
            );
            if (pendingLocalEdit.length > 0) {
              anySkipped = true;
              continue;
            }

            // Update only columns returned by server to preserve local columns
            const setClause = [...columns, "_synced", "_version", "_deleted"]
              .map((c) => `${c} = ?`)
              .join(", ");
            const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
            const params = [
              ...values as (string | number | null)[],
              1,
              version,
              _deleted ? 1 : 0,
              recordId,
            ];

            try {
              if (isTauri()) {
                await execute(sql, params);
              } else if (rawDb) {
                rawDb.run(sql, params);
              }
            } catch (err) {
              const errMsg =
                typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
              if (errMsg.includes("UNIQUE constraint failed")) {
                console.warn(
                  `[Sync] Skipped updating record in ${table} due to unique constraint:`,
                  recordId,
                  errMsg
                );
              } else {
                throw err;
              }
            }
          } else {
            // Insert new record
            const allCols = [
              "id",
              ...columns,
              "_synced",
              "_version",
              "_deleted",
            ];
            const allPlaceholders = allCols.map(() => "?");
            const sql = `INSERT INTO ${table} (${allCols.join(", ")}) VALUES (${allPlaceholders.join(", ")})`;
            const params = [
              recordId,
              ...values as (string | number | null)[],
              1,
              version,
              _deleted ? 1 : 0,
            ];

            try {
              if (isTauri()) {
                await execute(sql, params);
              } else if (rawDb) {
                rawDb.run(sql, params);
              }
            } catch (err) {
              const errMsg =
                typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
              if (errMsg.includes("UNIQUE constraint failed")) {
                console.warn(
                  `[Sync] Skipped inserting record in ${table} due to unique constraint:`,
                  recordId,
                  errMsg
                );
              } else {
                throw err;
              }
            }
          }

          pulledCount++;
        }

        // 'stores' is always a full, unfiltered snapshot of every store this
        // account owns (see SyncController::pull, which deliberately exempts
        // it from the last-synced cursor other tables use) — so, unlike
        // every other table, a local store row NOT in this response isn't
        // just "not updated yet," it's confirmed stale: created on this
        // device before it was ever cloud-linked, or left over from a
        // previously-linked account. Every other table only ever gets
        // additive inserts/updates from pull with no equivalent reconcile
        // step, since a partial/delta response there can't be safely
        // treated as authoritative the way this always-full snapshot can.
        if (table === "stores" && records.length > 0) {
          const serverStoreIds = records.map((r) => r.id as string);
          const placeholders = serverStoreIds.map(() => "?").join(", ");
          // Never silently prune a store that has real accumulated business
          // data attached — a store the server doesn't currently recognize
          // is still not "safe to hide" if it's the one everything on this
          // device's local history is actually attributed to (e.g. the
          // original pre-cloud-link store on a device, before it was ever
          // reconciled with a server-side account). Losing visibility into
          // real products/sales is a far worse outcome than a stale entry
          // lingering in the switcher, so this only prunes stores that are
          // genuinely empty locally.
          const pruneSql = `
            UPDATE stores SET _deleted = 1
            WHERE _deleted = 0
              AND id NOT IN (${placeholders})
              AND id NOT IN (SELECT DISTINCT store_id FROM products WHERE store_id IS NOT NULL)
              AND id NOT IN (SELECT DISTINCT store_id FROM sales WHERE store_id IS NOT NULL)
          `;

          if (isTauri()) {
            await execute(pruneSql, serverStoreIds);
          } else if (rawDb) {
            rawDb.run(pruneSql, serverStoreIds);
          }
        }

        if (!anySkipped) {
          const syncSql =
            "INSERT OR REPLACE INTO _sync_state (table_name, last_synced_at) VALUES (?, ?)";
          const syncParams = [table, server_timestamp];

          if (isTauri()) {
            await execute(syncSql, syncParams);
          } else if (rawDb) {
            rawDb.run(syncSql, syncParams);
          }
        }
      }

      if (!isTauri() && rawDb) {
        rawDb.run("COMMIT");
        (await import("../core")).saveDatabase();
      }

      return { pulled: pulledCount, updatedTables };
    } catch (err) {
      console.error("Failed to apply pull changes:", err);
      try {
        const rawDb = isTauri() ? null : (await import("../core")).getDatabase();
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
