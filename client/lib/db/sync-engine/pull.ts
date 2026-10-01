import { query, execute, transaction, STORE_SCOPED_TABLES } from "../core";
import { apiClient } from "@/lib/api/client";
import { PullResponse } from "./types";
import { getValidColumns } from "./schema";
import { remapForeignKey, DUPLICATE_NAME_TABLES, columnExists } from "../reconcile-identity";
import { logCrash } from "@/lib/utils/error-logger";
import { STORAGE_KEYS, getStoredUser } from "@/lib/storage-keys";
import {
  applyDeferredStockDeltas,
  countDeferredStockDeltas,
  recordDeferredStockDelta,
  type DeferredStockDelta,
} from "./deferred-stock-deltas";

// Safety bound only, not a correctness ceiling — every committed page
// persists its own keyset position. See docs/SYNC_PULL_PAGINATION.md.
const MAX_PULL_PAGES = 1000;

// A UNIQUE collision isn't self-resolving, so give up eventually rather
// than stall the table's cursor. See client/AGENTS.md, "Pull details".
const MAX_UNIQUE_SKIP_RETRIES = 5;
const UNIQUE_SKIP_COUNTS_KEY = STORAGE_KEYS.syncUniqueSkipCounts;

function readSkipCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(UNIQUE_SKIP_COUNTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSkipCounts(counts: Record<string, number>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(UNIQUE_SKIP_COUNTS_KEY, JSON.stringify(counts));
  } catch {
    // Best-effort; a failed write only resets this record's retry count.
  }
}

/**
 * Whether this pull's `stores` response can be read as a snapshot of every
 * store the ACCOUNT owns — the premise the prune below rests on. It cannot
 * for a staff identity. See client/AGENTS.md, "The `stores` prune and how a
 * store disappears".
 */
function storesSnapshotIsAccountWide(): boolean {
  return !getStoredUser()?.store_id;
}

function recordUniqueSkipAndCheckGiveUp(table: string, recordId: string): boolean {
  const key = `${table}:${recordId}`;
  const counts = readSkipCounts();
  const nextCount = (counts[key] ?? 0) + 1;
  counts[key] = nextCount;
  writeSkipCounts(counts);
  return nextCount > MAX_UNIQUE_SKIP_RETRIES;
}

// Decides only when `onCriticalTablesReady` fires, not what's fetched.
const SETUP_CRITICAL_TABLES = ["stores", "users"];

/**
 * Columns each device owns privately: written locally, never pushed, so the
 * server's copy is meaningless and must never be written back. See
 * client/AGENTS.md, "Pull details (sync-engine/pull.ts)".
 */
const DEVICE_LOCAL_PULL_COLUMNS: Record<string, readonly string[]> = {
  stores: ["last_monotonic_time"],
};

interface PullPageCursor {
  updated_at: string;
  id: string;
}

// Upserts one column without disturbing the other; the two cursors advance
// on different schedules (docs/SYNC_PULL_PAGINATION.md).
const PULL_PROGRESS = {
  savePosition:
    `INSERT INTO _sync_state (table_name, last_synced_at, server_cursor) VALUES (?, NULL, ?)
     ON CONFLICT(table_name) DO UPDATE SET server_cursor = excluded.server_cursor`,
  completeWindow:
    `INSERT INTO _sync_state (table_name, last_synced_at, server_cursor) VALUES (?, ?, NULL)
     ON CONFLICT(table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at, server_cursor = NULL`,
} as const;

function parsePullPageCursor(raw: string | null | undefined): PullPageCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.updated_at === "string" && typeof parsed.id === "string") {
      return parsed;
    }
  } catch {
    // A corrupt cursor just re-pages the window, which is idempotent.
  }
  return null;
}

function cursorForLastRecord(records: Record<string, unknown>[]): PullPageCursor | null {
  const last = records[records.length - 1];
  if (!last || typeof last.updated_at !== "string" || last.id == null) return null;
  return { updated_at: last.updated_at, id: String(last.id) };
}

/**
 * Pull changes from server.
 *
 * `onCriticalTablesReady`, when passed, fires exactly once — the first time
 * every table in SETUP_CRITICAL_TABLES has drained for this round, or at
 * the very end as a fallback. No-op for a normal pull that omits it. Always
 * passed whether the pull actually succeeded: a thrown pull still fires it,
 * but with `false`, since the page transaction carrying stores/users rolls
 * back as a unit and there is no identity to move on with. See
 * client/AGENTS.md, "Pull details (sync-engine/pull.ts)".
 */
export async function pullChanges(
  isManual: boolean = false,
  isSetup: boolean = false,
  onCriticalTablesReady?: (pullSucceeded: boolean) => void,
  // Same sync run as the push that preceded it; the server throttles per run.
  runId?: string,
): Promise<{
  pulled: number;
  updatedTables?: string[];
  error?: unknown;
}> {
  const criticalTablesPending = new Set(SETUP_CRITICAL_TABLES);
  let criticalReadyFired = false;
  let pullFailed = false;
  const fireCriticalReadyOnce = (pullSucceeded: boolean) => {
    if (criticalReadyFired) return;
    criticalReadyFired = true;
    onCriticalTablesReady?.(pullSucceeded);
  };

  try {
    // Get last sync timestamp for each table
    const syncState = await query<{
      table_name: string;
      last_synced_at: string;
      server_cursor: string | null;
    }>("SELECT table_name, last_synced_at, server_cursor FROM _sync_state");

    // DUPLICATE_NAME_TABLES and still-NULL windows are deliberately left
    // out of the cursor map — see client/AGENTS.md, "Pull details".
    const lastSyncedMap = syncState.reduce(
      (acc, row) => {
        if (!(row.table_name in DUPLICATE_NAME_TABLES) && row.last_synced_at) {
          acc[row.table_name] = row.last_synced_at;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    // Where the last round got to inside each table's undrained window; a
    // drained table has none, so it starts from the window boundary.
    const pageCursors = syncState.reduce(
      (acc, row) => {
        const cursor = parsePullPageCursor(row.server_cursor);
        if (cursor && !(row.table_name in DUPLICATE_NAME_TABLES)) {
          acc[row.table_name] = cursor;
        }
        return acc;
      },
      {} as Record<string, PullPageCursor>
    );

    let pulledCount = 0;
    const updatedTables: string[] = [];
    // Reported after the transaction commits: logCrash writes to SQLite and
    // would otherwise nest a write transaction inside this one.
    const skippedRecords: { table: string; recordId: string; reason: string }[] = [];

    // Legacy offset paging, sent alongside page_cursor so client and server
    // can deploy independently. See docs/SYNC_PULL_PAGINATION.md.
    const pageOffsets: Record<string, number> = {};
    const skippedTables = new Set<string>();
    const missingLocalTables = new Set<string>();

    // Deltas whose stock_batches row hadn't arrived yet live in
    // `_pending_stock_deltas`, written with the movement row itself and
    // drained below. Both cursor stamps are still held back so they commit
    // with the drain. See client/AGENTS.md, "Deferred movement deltas".
    let deferredThisRound = 0;
    let deferredMovementCursor: string | null = null;
    let deferredMovementPageCursor: string | null = null;
    const unresolvedDeltas: DeferredStockDelta[] = [];

    if ((await countDeferredStockDeltas()) > 0) {
      await transaction(async () => {
        unresolvedDeltas.push(...(await applyDeferredStockDeltas()));
      });
    }

    let hasMoreAny = true;
    let page = 0;

    while (hasMoreAny && page < MAX_PULL_PAGES) {
      page++;

      // Fetch changes from server
      const response = (await apiClient.pullChanges(
        {
          last_synced: lastSyncedMap,
          page_offset: { ...pageOffsets },
          page_cursor: { ...pageCursors },
        },
        isManual,
        isSetup,
        runId,
      )) as PullResponse;
      const { changes, server_timestamp, has_more } = response;

      if (!changes || Object.keys(changes).length === 0) {
        break;
      }

      // stock_batches must be applied before stock_movements; the server's
      // own table order happens to match, but that isn't a contract.
      const orderedEntries = Object.entries(changes).sort(([a], [b]) => {
        if (a === b) return 0;
        if (a === "stock_batches") return -1;
        if (b === "stock_batches") return 1;
        return 0;
      });

      await transaction(async () => {
        for (const [table, records] of orderedEntries) {
          if (!Array.isArray(records)) continue;

          const validColumns = await getValidColumns(table);

          // Skipped, not allowed to throw and roll back the whole page's
          // transaction. See client/AGENTS.md, "Pull details".
          if (validColumns.size === 0) {
            if (!missingLocalTables.has(table)) {
              missingLocalTables.add(table);
              console.warn(
                `[SyncPull] Skipping "${table}": this device has no local schema for it.`,
              );
              logCrash(
                new Error(`Pull skipped table ${table}: missing from local schema`),
                false,
                { area: "sync-pull", table },
              ).catch(() => {});
            }
            pageOffsets[table] = (pageOffsets[table] ?? 0) + records.length;
            const missingTableCursor = cursorForLastRecord(records);
            if (missingTableCursor) {
              pageCursors[table] = missingTableCursor;
            }
            continue;
          }

          if (records.length > 0) {
            updatedTables.push(table);
          }

          // Any skipped record holds this table's window cursor back, or the
          // server would never re-offer it (client/AGENTS.md, "Pull details").
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

            // Quantity is never trusted from a pulled snapshot; it is
            // derived from movement deltas (client/AGENTS.md, "Pull details").
            if (table === "stock_batches") {
              delete data.quantity;
            }

            for (const deviceLocalColumn of DEVICE_LOCAL_PULL_COLUMNS[table] ?? []) {
              delete data[deviceLocalColumn];
            }

            const columns = Object.keys(data);
            const values = columns.map((c) => {
              const val = data[c];
              if (typeof val === "boolean") {
                return val ? 1 : 0;
              }
              // A JSON-cast server attribute arrives as a real array/object;
              // binding it directly mis-serializes it under sql.js.
              if (val !== null && typeof val === "object") {
                return JSON.stringify(val);
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
              // A row with an unpushed local edit is left alone; the next
              // push resolves it by version comparison.
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
                  // Not applied: hold the cursor back until the retry cap.
                  if (!recordUniqueSkipAndCheckGiveUp(table, recordId)) {
                    anySkipped = true;
                  }
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

                // Each pulled movement applies its own delta, floor
                // included (client/AGENTS.md, "Pull details").
                if (
                  table === "stock_movements" &&
                  !_deleted &&
                  data.stock_batch_id &&
                  typeof data.quantity === "number"
                ) {
                  // The batch may arrive on a later page; defer rather than
                  // let the UPDATE silently match zero rows.
                  const batchExists = await query<{ 1: number }>(
                    "SELECT 1 FROM stock_batches WHERE id = ?",
                    [data.stock_batch_id as string],
                  );
                  if (batchExists.length > 0) {
                    await execute(
                      "UPDATE stock_batches SET quantity = MAX(0, quantity + ?) WHERE id = ?",
                      [data.quantity, data.stock_batch_id as string],
                    );
                  } else {
                    await recordDeferredStockDelta(
                      recordId,
                      data.stock_batch_id as string,
                      data.quantity as number,
                    );
                    deferredThisRound++;
                  }
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
                  skippedRecords.push({ table, recordId, reason: `insert: ${errMsg}` });
                  // Not applied: hold the cursor back until the retry cap.
                  if (!recordUniqueSkipAndCheckGiveUp(table, recordId)) {
                    anySkipped = true;
                  }
                } else {
                  throw err;
                }
              }
            }

            pulledCount++;
          }

          // Only an account-wide snapshot is authoritative; both guards fail
          // closed. See client/AGENTS.md, "The `stores` prune".
          if (table === "stores" && records.length > 0 && storesSnapshotIsAccountWide()) {
            const serverStoreIds = records.map((r) => r.id as string);
            const placeholders = serverStoreIds.map(() => "?").join(", ");
            // A store with an unpushed local edit is never a prune
            // candidate — that prune could never be undone.
            const pruneCandidates = await query<{ id: string }>(
              `SELECT id FROM stores WHERE _deleted = 0 AND id NOT IN (${placeholders})
                 AND id NOT IN (SELECT record_id FROM _sync_queue WHERE table_name = 'stores')`,
              serverStoreIds,
            );

            if (pruneCandidates.length > 0) {
              // Only genuinely empty stores are pruned, and only tables that
              // actually have store_id yet are checked (runtime migration).
              const scopedTablesWithStoreId: string[] = [];
              for (const t of STORE_SCOPED_TABLES) {
                if (await columnExists(t, "store_id")) {
                  scopedTablesWithStoreId.push(t);
                }
              }
              const noDataClauses = scopedTablesWithStoreId.map(
                (t) => `AND id NOT IN (SELECT DISTINCT store_id FROM ${t} WHERE store_id IS NOT NULL)`,
              ).join("\n                ");
              const candidatePlaceholders = pruneCandidates.map(() => "?").join(", ");
              const pruneSql = `
                UPDATE stores SET _deleted = 1
                WHERE id IN (${candidatePlaceholders})
                  ${noDataClauses}
              `;

              await execute(pruneSql, pruneCandidates.map((r) => r.id));
            }
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

              await execute(`UPDATE ${table} SET _deleted = 1 WHERE id = ?`, [row.id]);
            }
          }

          pageOffsets[table] = (pageOffsets[table] ?? 0) + records.length;
          if (anySkipped) {
            skippedTables.add(table);
          }

          // Always advances, even past a skipped record, or the next request
          // would re-ask for this page and the round would never terminate.
          const nextCursor = cursorForLastRecord(records);
          if (nextCursor) {
            pageCursors[table] = nextCursor;
          }

          // The window stamp below requires a fully drained, skip-free
          // table; the mid-window position is persisted per page.
          const tableHasMore = has_more?.[table] ?? false;

          if (tableHasMore && nextCursor && !skippedTables.has(table)) {
            if (table === "stock_movements" && deferredThisRound > 0) {
              deferredMovementPageCursor = JSON.stringify(nextCursor);
            } else {
              await execute(PULL_PROGRESS.savePosition, [table, JSON.stringify(nextCursor)]);
            }
          }

          if (!tableHasMore && !skippedTables.has(table)) {
            criticalTablesPending.delete(table);
            // Carried to the final transaction so the stamp commits with
            // the deltas it depends on, never before them.
            if (table === "stock_movements" && deferredThisRound > 0) {
              deferredMovementCursor = server_timestamp;
            } else {
              await execute(PULL_PROGRESS.completeWindow, [table, server_timestamp]);
            }
          }
        }
      }).catch((err) => {
        // Rethrown so the outer catch reports it once, not twice.
        console.error("Failed to apply pull changes:", err);
        throw err;
      });

      hasMoreAny = Object.values(has_more ?? {}).some(Boolean);

      // Only after the page's transaction has committed.
      if (criticalTablesPending.size === 0) {
        fireCriticalReadyOnce(true);
      }
    }

    // Deltas and the cursor stamp commit as one unit: no window in between
    // for a crash to fall into.
    if (
      (await countDeferredStockDeltas()) > 0 ||
      deferredMovementCursor !== null ||
      deferredMovementPageCursor !== null
    ) {
      await transaction(async () => {
        unresolvedDeltas.push(...(await applyDeferredStockDeltas()));
        if (deferredMovementCursor !== null) {
          await execute(PULL_PROGRESS.completeWindow, [
            "stock_movements",
            deferredMovementCursor,
          ]);
        } else if (deferredMovementPageCursor !== null) {
          await execute(PULL_PROGRESS.savePosition, [
            "stock_movements",
            deferredMovementPageCursor,
          ]);
        }
      });
    }

    for (const d of unresolvedDeltas) {
      logCrash(
        new Error(
          `Pull deferred stock delta unresolved: movement ${d.movement_id} still has no stock_batches row ${d.stock_batch_id}`,
        ),
        false,
        {
          area: "sync-pull",
          table: "stock_movements",
          recordId: d.movement_id,
        },
      ).catch(() => {});
    }

    for (const s of skippedRecords) {
      logCrash(
        new Error(`Pull skipped ${s.table}/${s.recordId}: ${s.reason}`),
        false,
        { area: "sync-pull", table: s.table, recordId: s.recordId },
      ).catch(() => {});
    }

    return { pulled: pulledCount, updatedTables };
  } catch (error) {
    pullFailed = true;
    console.error("Pull sync failed:", error);
    logCrash(error, false, { area: "sync-pull" }).catch(() => {});
    throw error; // Throw so sync() can catch it properly
  } finally {
    // In `finally`, so a round with no stores/users changes — or a thrown
    // pull — can never leave a caller awaiting this callback forever. The
    // success flag keeps a thrown (nothing-written) pull from being reported
    // as "identity ready". See client/AGENTS.md, "Pull details".
    fireCriticalReadyOnce(!pullFailed);
  }
}
