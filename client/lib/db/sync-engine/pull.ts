import { query, execute, transaction } from "../core";
import { resolveSyncRun, type SyncRun } from "./sync-run";
import { apiClient } from "@/lib/api/client";
import { PullResponse } from "./types";
import { getValidColumns } from "./schema";
import { DUPLICATE_NAME_TABLES } from "../reconcile-identity";
import { logCrash } from "@/lib/utils/error-logger";
import { forgetWithheldPullWindows, restoreExhaustedPullWindows, rewindPullWindow } from "./pull-window";
import { summarizeSkippedRecords, type SkippedRecord } from "./pull-skip-report";
import { recomputeBatchQuantities } from "../batch-quantity";
import type { BatchLogChange } from "../batch-quantity";
import {
  applyDeferredStockDeltas,
  countDeferredStockDeltas,
  discardDeferredStockDeltas,
  recordDeferredStockDelta,
  type DeferredStockDelta,
} from "./deferred-stock-deltas";
import {
  MAX_PULL_PAGES,
  SETUP_CRITICAL_TABLES,
  PULL_PROGRESS,
  cursorForLastRecord,
  readPullStartState,
  storesSnapshotIsAccountWide,
} from "./pull-state";
import { toPulledRow, holdsCursorAfterUniqueSkip } from "./pull-records";
import { pruneStoresMissingFromSnapshot, reconcileDuplicateNames } from "./pull-reconcile";

// Pull changes from server.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-sync-engine-pull-L115
export async function pullChanges(
  isManual: boolean = false,
  isSetup: boolean = false,
  onCriticalTablesReady?: (pullSucceeded: boolean) => void,
  // Same sync run as the push that preceded it; the server throttles per run.
  run?: SyncRun,
): Promise<{
  pulled: number;
  updatedTables?: string[];
  error?: unknown;
}> {
  const activeRun = resolveSyncRun(run);
  // '' is the key a watermark of unknown store carries: see A-305's migration.
  const windowStoreId = activeRun.storeId ?? "";
  const criticalTablesPending = new Set(SETUP_CRITICAL_TABLES);
  let criticalReadyFired = false;
  let pullFailed = false;
  const fireCriticalReadyOnce = (pullSucceeded: boolean) => {
    if (criticalReadyFired) return;
    criticalReadyFired = true;
    onCriticalTablesReady?.(pullSucceeded);
  };

  try {
    await restoreExhaustedPullWindows(windowStoreId);

    const { lastSyncedMap, pageCursors } = await readPullStartState(windowStoreId);

    let pulledCount = 0;
    const updatedTables: string[] = [];
    // Reported after the transaction commits: logCrash writes to SQLite and
    // would otherwise nest a write transaction inside this one.
    const skippedRecords: SkippedRecord[] = [];

    // Legacy offset paging, sent alongside page_cursor so client and server
    // can deploy independently. See docs/SYNC_PULL_PAGINATION.md.
    const pageOffsets: Record<string, number> = {};
    const skippedTables = new Set<string>();
    const missingLocalTables = new Set<string>();

    // Deltas whose stock_batches row hadn't arrived yet live in `_pending_stock_deltas`, written with the movement row itself and drained below.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-pull-ts-L182
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
    // The window a drained table is stamped with covers only what the round actually queried, so it is the FIRST page's instant, never the last pa…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-pull-ts-L199
    let roundTimestamp: string | null = null;
    // Survives the page boundary:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-pull-ts-L203
    let batchesArrivedSinceDrain = false;

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
        activeRun.id,
        activeRun.storeId,
      )) as PullResponse;
      const { changes, server_timestamp, has_more } = response;
      roundTimestamp ??= server_timestamp;

      if (page === 1 && response.refused_store_id && response.refused_store_id === activeRun.storeId) {
        await forgetWithheldPullWindows(windowStoreId, Object.keys(changes ?? {}));
      }

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

      // Every batch whose log this page changed, against the net delta of the movements that changed it.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-pull-ts-L239
      const touchedBatches = new Map<string, BatchLogChange>();
      const touchBatch = (batchId: string, delta: number) => {
        const seen = touchedBatches.get(batchId) ?? { delta: 0, inbound: 0 };
        touchedBatches.set(batchId, {
          delta: seen.delta + delta,
          inbound: seen.inbound + Math.max(0, delta),
        });
      };

      await transaction(async () => {
        for (const [table, records] of orderedEntries) {
          if (!Array.isArray(records)) continue;

          // Settles deltas an arriving batch has resolved while their rows are still in the table.
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-pull-ts-L256
          if (batchesArrivedSinceDrain && table !== "stock_batches") {
            batchesArrivedSinceDrain = false;
            const voidedMovements = changes.stock_movements;
            if (Array.isArray(voidedMovements)) {
              await discardDeferredStockDeltas(
                voidedMovements.filter((r) => r._deleted).map((r) => String(r.id)),
              );
            }
            await applyDeferredStockDeltas({ countAttempts: false });
          }
          if (table === "stock_batches" && records.length > 0) {
            batchesArrivedSinceDrain = true;
          }

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

            const { data, columns, values } = toPulledRow(table, rawData, validColumns);

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

                // Delta 0 because a pulled UPDATE changes no movement quantity today; see client/AGENTS.md, "Pull details", before making one that does.
                // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-pull-ts-L377
                if (table === "stock_batches") {
                  touchBatch(recordId, 0);
                } else if (table === "stock_movements" && data.stock_batch_id) {
                  touchBatch(data.stock_batch_id as string, 0);
                }
              } catch (err) {
                if (holdsCursorAfterUniqueSkip(err, "update", table, recordId, skippedRecords)) {
                  anySkipped = true;
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

                // An arriving batch is rebuilt from the movements this device already holds, which is what makes a batch landing after its own movements a non…
                // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-pull-ts-L425
                if (table === "stock_batches") {
                  touchBatch(recordId, 0);
                }

                // No movement_type special-case here; see client/AGENTS.md.
                if (
                  table === "stock_movements" &&
                  !_deleted &&
                  data.stock_batch_id &&
                  typeof data.quantity === "number"
                ) {
                  // A batch that has not arrived is still recorded as pending, not because the delta is owed to it — the recompute reads the whole log whenever…
                  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-pull-ts-L439
                  const batchExists = await query<{ 1: number }>(
                    "SELECT 1 FROM stock_batches WHERE id = ?",
                    [data.stock_batch_id as string],
                  );
                  if (batchExists.length > 0) {
                    touchBatch(data.stock_batch_id as string, data.quantity);
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
                if (holdsCursorAfterUniqueSkip(err, "insert", table, recordId, skippedRecords)) {
                  anySkipped = true;
                }
              }
            }

            pulledCount++;
          }

          // Only an account-wide snapshot is authoritative; both guards fail
          // closed. See client/AGENTS.md, "The `stores` prune".
          if (table === "stores" && records.length > 0 && storesSnapshotIsAccountWide()) {
            await pruneStoresMissingFromSnapshot(records);
          }

          if (Object.hasOwn(DUPLICATE_NAME_TABLES, table) && records.length > 0) {
            await reconcileDuplicateNames(table, records);
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
              await execute(PULL_PROGRESS.savePosition, [
                windowStoreId,
                table,
                JSON.stringify(nextCursor),
              ]);
            }
          }

          if (!tableHasMore && !skippedTables.has(table)) {
            criticalTablesPending.delete(table);
            // Carried to the final transaction so the stamp commits with
            // the deltas it depends on, never before them.
            if (table === "stock_movements" && deferredThisRound > 0) {
              deferredMovementCursor = roundTimestamp;
            } else {
              await execute(PULL_PROGRESS.completeWindow, [windowStoreId, table, roundTimestamp]);
            }
          }
        }
        await recomputeBatchQuantities(touchedBatches);
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
            windowStoreId,
            "stock_movements",
            deferredMovementCursor,
          ]);
        } else if (deferredMovementPageCursor !== null) {
          await execute(PULL_PROGRESS.savePosition, [
            windowStoreId,
            "stock_movements",
            deferredMovementPageCursor,
          ]);
        }
      });
    }

    // A stranded batch is only re-sent if it is updated again, so a chronic
    // deferral needs the window reopened or it never resolves (A-176).
    if (unresolvedDeltas.length > 0) {
      await rewindPullWindow(windowStoreId, "stock_batches", "unresolved stock delta");
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

    const skipSummary = summarizeSkippedRecords(skippedRecords);
    if (skipSummary) {
      logCrash(new Error(skipSummary.message), false, skipSummary.context).catch(() => {});
    }

    return { pulled: pulledCount, updatedTables };
  } catch (error) {
    pullFailed = true;
    console.error("Pull sync failed:", error);
    logCrash(error, false, { area: "sync-pull" }).catch(() => {});
    throw error; // Throw so sync() can catch it properly
  } finally {
    // In `finally`, so a round with no stores/users changes — or a thrown pull — can never leave a caller awaiting this callback forever.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-sync-engine-pull-ts-L672
    fireCriticalReadyOnce(!pullFailed);
  }
}
