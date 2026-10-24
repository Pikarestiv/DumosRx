import { query, execute } from "../core";
import { recordDeferredStockDelta } from "./deferred-stock-deltas";
import { toPulledRow, holdsCursorAfterUniqueSkip } from "./pull-records";
import type { SkippedRecord } from "./pull-skip-report";

export interface PullPageContext {
  touchBatch: (batchId: string, delta: number) => void;
  skippedRecords: SkippedRecord[];
  onDeferredDelta: () => void;
}

export interface PulledRecordOutcome {
  counted: boolean;
  skipped: boolean;
}

export async function applyPulledRecord(
  table: string,
  record: Record<string, unknown>,
  validColumns: Set<string>,
  page: PullPageContext,
): Promise<PulledRecordOutcome> {
  let skipped = false;

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
        return { counted: false, skipped: true };
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
          page.touchBatch(recordId, 0);
        } else if (table === "stock_movements" && data.stock_batch_id) {
          page.touchBatch(data.stock_batch_id as string, 0);
        }
      } catch (err) {
        if (holdsCursorAfterUniqueSkip(err, "update", table, recordId, page.skippedRecords)) {
          skipped = true;
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
          page.touchBatch(recordId, 0);
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
            page.touchBatch(data.stock_batch_id as string, data.quantity);
          } else {
            await recordDeferredStockDelta(
              recordId,
              data.stock_batch_id as string,
              data.quantity as number,
            );
            page.onDeferredDelta();
          }
        }
      } catch (err) {
        if (holdsCursorAfterUniqueSkip(err, "insert", table, recordId, page.skippedRecords)) {
          skipped = true;
        }
      }
    }


  return { counted: true, skipped };
}
