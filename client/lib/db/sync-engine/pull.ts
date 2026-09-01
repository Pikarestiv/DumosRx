import { query, execute, transaction, STORE_SCOPED_TABLES } from "../core";
import { apiClient } from "@/lib/api/client";
import { PullResponse } from "./types";
import { getValidColumns } from "./schema";
import { remapForeignKey, DUPLICATE_NAME_TABLES, columnExists } from "../reconcile-identity";
import { logCrash } from "@/lib/utils/error-logger";

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

    // Map to object { table: timestamp }. Tables in DUPLICATE_NAME_TABLES
    // (categories, suppliers) are deliberately never given a cursor here: the
    // server's pull() treats a table missing from last_synced as "return
    // everything" (see SyncController::pull), and the duplicate-name
    // reconciliation below can only fix a collision if the pre-existing row
    // it collided with is actually present in this response. A normal delta
    // pull (updated_at > last_synced) would never re-surface a long-unchanged
    // row like "DRUGS", permanently hiding the collision from every future
    // sync. Categories/suppliers are small collections by nature — tens,
    // rarely hundreds — so always fetching them in full costs nothing.
    const lastSyncedMap = syncState.reduce(
      (acc, row) => {
        if (!(row.table_name in DUPLICATE_NAME_TABLES)) {
          acc[row.table_name] = row.last_synced_at;
        }
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
    const updatedTables: string[] = [];
    // Collected rather than reported inline: logCrash writes to SQLite
    // itself, and calling it from inside the transaction() callback below
    // would nest a write transaction inside this one. Reported once the
    // outer transaction has committed instead.
    const skippedRecords: { table: string; recordId: string; reason: string }[] = [];

    // transaction() wraps this in BEGIN/COMMIT/ROLLBACK on both platforms
    // (unlike the manual sql.js-only rawDb.run("BEGIN") this replaced, which
    // left Tauri writes here fully unguarded — a mid-loop failure committed
    // everything applied so far with no rollback) and defers sql.js's
    // (expensive, whole-database) saveDatabase() export to once at commit
    // instead of once per execute() call.
    await transaction(async () => {
      for (const [table, records] of Object.entries(changes)) {
        if (!Array.isArray(records)) continue;
        if (records.length > 0) {
          updatedTables.push(table);
        }

        const validColumns = await getValidColumns(table);

        // If any record in this table's batch gets skipped below (because a
        // local edit for it hasn't been pushed yet), the per-table sync
        // cursor must not advance past it; otherwise the server's copy of
        // that record would never be re-offered on a future pull (its
        // updated_at is already older than the new cursor), and the local
        // row would be stuck showing stale, already-superseded data forever.
        // Leaving the cursor where it was just means this same batch gets
        // re-fetched and re-applied next time, which is harmless: applying
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
            // waiting to be pushed; otherwise the user's own not-yet-synced
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
              await execute(sql, params);
            } catch (err) {
              const errMsg =
                typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
              if (errMsg.includes("UNIQUE constraint failed")) {
                console.warn(
                  `[Sync] Skipped updating record in ${table} due to unique constraint:`,
                  recordId,
                  errMsg
                );
                skippedRecords.push({ table, recordId, reason: `update: ${errMsg}` });
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
              await execute(sql, params);
            } catch (err) {
              const errMsg =
                typeof err === "string" ? err : err instanceof Error ? err.message : String(err);
              if (errMsg.includes("UNIQUE constraint failed")) {
                console.warn(
                  `[Sync] Skipped inserting record in ${table} due to unique constraint:`,
                  recordId,
                  errMsg
                );
                skippedRecords.push({ table, recordId, reason: `insert: ${errMsg}` });
              } else {
                throw err;
              }
            }
          }

          pulledCount++;
        }

        // 'stores' is always a full, unfiltered snapshot of every store this
        // account owns (see SyncController::pull, which deliberately exempts
        // it from the last-synced cursor other tables use), so, unlike
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
          // data attached; a store the server doesn't currently recognize
          // is still not "safe to hide" if it's the one everything on this
          // device's local history is actually attributed to (e.g. the
          // original pre-cloud-link store on a device, before it was ever
          // reconciled with a server-side account). Losing visibility into
          // real data is a far worse outcome than a stale entry lingering
          // in the switcher, so this only prunes stores that are genuinely
          // empty locally — checked against every store-scoped table, not
          // just products/sales: a store whose only local data is, say,
          // expenses or customers deserves the exact same protection.
          // Most STORE_SCOPED_TABLES only gain their store_id column via
          // initDatabase()'s runtime ALTER TABLE migration, not the base
          // schema (see core.ts) — a device that hasn't run that migration
          // yet (or a test harness that bypasses it) would make this query
          // throw "no such column: store_id", rolling back the whole pull
          // transaction rather than just skipping the prune check for that
          // one table.
          const scopedTablesWithStoreId: string[] = [];
          for (const t of STORE_SCOPED_TABLES) {
            if (await columnExists(t, "store_id")) {
              scopedTablesWithStoreId.push(t);
            }
          }
          const noDataClauses = scopedTablesWithStoreId.map(
            (t) => `AND id NOT IN (SELECT DISTINCT store_id FROM ${t} WHERE store_id IS NOT NULL)`,
          ).join("\n              ");
          const pruneSql = `
            UPDATE stores SET _deleted = 1
            WHERE _deleted = 0
              AND id NOT IN (${placeholders})
              ${noDataClauses}
          `;

          await execute(pruneSql, serverStoreIds);
        }

        if (DUPLICATE_NAME_TABLES[table] && records.length > 0) {
          const serverIds = new Set(records.map((r) => r.id as string));
          const serverIdByName = new Map<string, string>();
          for (const r of records) {
            const name = String(r.name ?? "").trim().toLowerCase();
            if (name) serverIdByName.set(name, r.id as string);
          }

          const localRows = await query<{ id: string; name: string }>(
            `SELECT id, name FROM ${table} WHERE (_deleted = 0 OR _deleted IS NULL)`,
          );

          for (const row of localRows) {
            if (serverIds.has(row.id)) continue;
            const matchedServerId = serverIdByName.get(String(row.name ?? "").trim().toLowerCase());
            if (!matchedServerId || matchedServerId === row.id) continue;

            await remapForeignKey(row.id, matchedServerId, DUPLICATE_NAME_TABLES[table]);

            // The local duplicate is now redundant: every reference points
            // at the server's row instead. Soft-delete it rather than leave
            // an orphaned, unreferenced duplicate in the local table.
            await execute(`UPDATE ${table} SET _deleted = 1 WHERE id = ?`, [row.id]);
          }
        }

        if (!anySkipped) {
          await execute(
            "INSERT OR REPLACE INTO _sync_state (table_name, last_synced_at) VALUES (?, ?)",
            [table, server_timestamp],
          );
        }
      }
    }).catch((err) => {
      // Not reported here: rethrown, so the outer catch below reports it
      // once instead of twice.
      console.error("Failed to apply pull changes:", err);
      throw err;
    });

    for (const s of skippedRecords) {
      logCrash(
        new Error(`Pull skipped ${s.table}/${s.recordId}: ${s.reason}`),
        false,
        { area: "sync-pull", table: s.table, recordId: s.recordId },
      ).catch(() => {});
    }

    return { pulled: pulledCount, updatedTables };
  } catch (error) {
    console.error("Pull sync failed:", error);
    logCrash(error, false, { area: "sync-pull" }).catch(() => {});
    throw error; // Throw so sync() can catch it properly
  }
}
