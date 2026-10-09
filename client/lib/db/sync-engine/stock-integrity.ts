import {
  query,
  execute,
  transaction,
  getActiveStoreId,
  queueTableInvalidation,
} from "../core";
import {
  logTillRepair,
  TILL_REPAIR_ACTIONS,
} from "@/lib/utils/till-inspection-audit";

/**
 * Divergence between a batch's stored `quantity` and the sum of its own
 * `stock_movements`. See
 * docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md.
 */
export type BatchVerdict =
  | "consistent"
  | "diverged"
  /** Disagrees with the log, but has a delta still queued to apply — so the
   * disagreement may be the queued work, and folding it would let the drain
   * apply the same delta twice. Reported, never folded. */
  | "pending"
  /** Holds stock with no movement behind it, so the log cannot rebuild it
   * (A-148); folding one would compute 0 and destroy the only record. */
  | "unreconstructable";

export interface BatchIntegrity {
  batchId: string;
  productId: string;
  batchQuantity: number;
  movementQuantity: number;
  movementCount: number;
  verdict: BatchVerdict;
  /** batchQuantity − movementQuantity; positive means the device is over. */
  delta: number;
}

export interface StockIntegrityReport {
  checked: number;
  consistent: number;
  diverged: number;
  /** Disagrees with the log but has unapplied deltas; not safe to fold. */
  pending: number;
  unreconstructable: number;
  /** Net units this device is over (positive) or under (negative) the log. */
  netUnitDelta: number;
  divergedBatches: BatchIntegrity[];
  unreconstructableBatches: BatchIntegrity[];
}


/** Replays the log the way both the pull and the server do: the floor is
 * applied after every movement, never once over the sum. */
// Depends on no movement ever being soft-deleted: the replay filters
// `_deleted = 0` while its delta stays in `quantity`, so the first void-sale
// soft-delete would make a fold destroy stock. Nothing soft-deletes one today.
export function replayMovements(deltas: number[]): number {
  return deltas.reduce((running, delta) => Math.max(0, running + delta), 0);
}

function classify(
  batchId: string,
  productId: string,
  batchQuantity: number,
  deltas: number[],
  awaitingDelta: boolean,
): BatchIntegrity {
  const replayed = replayMovements(deltas);
  const inboundCount = deltas.filter((delta) => delta > 0).length;

  // The log can only rebuild a balance it can account for. No inbound
  // movement at all means the opening stock was never recorded (A-148).
  const unreconstructable = batchQuantity > 0 && inboundCount === 0;

  const matches = batchQuantity === replayed;
  const verdict: BatchVerdict = unreconstructable
    ? "unreconstructable"
    : matches
      ? "consistent"
      : awaitingDelta
        ? "pending"
        : "diverged";

  return {
    batchId,
    productId,
    batchQuantity,
    movementQuantity: replayed,
    movementCount: deltas.length,
    verdict,
    delta: batchQuantity - replayed,
  };
}

export async function verifyStockIntegrity(): Promise<StockIntegrityReport> {
  const storeId = getActiveStoreId();

  const batches = await query<{
    batch_id: string;
    product_id: string;
    batch_qty: number | null;
  }>(
    `SELECT sb.id AS batch_id, sb.product_id AS product_id, sb.quantity AS batch_qty
       FROM stock_batches sb
      WHERE sb._deleted = 0 AND sb.is_active = 1${storeId ? " AND sb.store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );

  // Ordered by rowid — local insert order — because that is the order THIS
  // device applied the deltas in, and so the order that produced the stored
  // quantity. Not created_at: it is nullable, second-resolution from MySQL
  // so bulk imports collide, and a sale rung offline on another till arrives
  // days after its own timestamp. Any of those reorders the replay past a
  // floor event and makes a correct batch look diverged.
  const movements = await query<{
    stock_batch_id: string;
    quantity: number | null;
  }>(
    `SELECT sm.stock_batch_id, sm.quantity
       FROM stock_movements sm
       JOIN stock_batches sb ON sb.id = sm.stock_batch_id
      WHERE sm._deleted = 0 AND sb._deleted = 0 AND sb.is_active = 1${storeId ? " AND sb.store_id = ?" : ""}
      ORDER BY sm.stock_batch_id, sm.rowid`,
    storeId ? [storeId] : [],
  );

  const byBatch = new Map<string, number[]>();
  for (const movement of movements) {
    const list = byBatch.get(movement.stock_batch_id);
    const value = Number(movement.quantity ?? 0);
    if (list) list.push(value);
    else byBatch.set(movement.stock_batch_id, [value]);
  }

  // A delta that has not been applied yet is not a disagreement, it is work
  // in progress — and folding it in would let the pending drain apply it a
  // second time.
  const awaitingDelta = new Set(
    (
      await query<{ stock_batch_id: string }>(
        "SELECT DISTINCT stock_batch_id FROM _pending_stock_deltas",
      )
    ).map((row) => row.stock_batch_id),
  );

  const report: StockIntegrityReport = {
    checked: batches.length,
    consistent: 0,
    diverged: 0,
    pending: 0,
    unreconstructable: 0,
    netUnitDelta: 0,
    divergedBatches: [],
    unreconstructableBatches: [],
  };

  for (const row of batches) {
    const deltas = byBatch.get(row.batch_id) ?? [];
    const entry = classify(
      row.batch_id,
      row.product_id,
      Number(row.batch_qty ?? 0),
      deltas,
      awaitingDelta.has(row.batch_id),
    );

    if (entry.verdict === "consistent") {
      report.consistent++;
      continue;
    }

    if (entry.verdict === "pending") {
      report.pending++;
      continue;
    }

    report.netUnitDelta += entry.delta;

    if (entry.verdict === "diverged") {
      report.diverged++;
      report.divergedBatches.push(entry);
    } else {
      report.unreconstructable++;
      report.unreconstructableBatches.push(entry);
    }
  }

  return report;
}

/** Compact shape for the sync-health Sentry report. */
export function summarizeIntegrity(report: StockIntegrityReport): Record<string, number> {
  return {
    checked: report.checked,
    diverged: report.diverged,
    pending: report.pending,
    unreconstructable: report.unreconstructable,
    netUnitDelta: report.netUnitDelta,
  };
}

export interface FoldResult {
  folded: number;
  refused: number;
  unitsCorrected: number;
  refusedBatchIds: string[];
}

/**
 * Rebuilds each diverged batch's `quantity` from its own movement log.
 *
 * The log is the authority: `stock_movements` is append-only and never
 * pruned, and it already includes anything this device created but has not
 * pushed, so a fold cannot discard unsynced work the way a factory reset
 * can. `unreconstructable` batches are refused, never folded — computing 0
 * for a batch whose opening stock was never recorded would destroy the only
 * record of it (A-148).
 *
 * Local-only and deliberately not queued: the server derives
 * `stock_batches.quantity` from movement deltas and ignores a pushed value,
 * so there is nothing to send. This brings the device back in line with a
 * log it already holds; it is not a claim about the truth, which is why it
 * writes no `sync_reconciliation` movement.
 */
export async function foldStockQuantities(): Promise<FoldResult> {
  // Without an active store the audit widens to every store on the device.
  // Harmless for a read; for a write it would rewrite another branch's
  // quantities (A-189 established at least one owner runs two).
  if (!getActiveStoreId()) {
    throw new Error(
      "No active store on this device, so there is nothing safe to rebuild.",
    );
  }

  const result: FoldResult = {
    folded: 0,
    refused: 0,
    unitsCorrected: 0,
    refusedBatchIds: [],
  };

  await transaction(async () => {
    // Inside the transaction, not before it: query() releases its queue slot
    // before returning, so a report taken outside could be invalidated by a
    // sale or a pull page landing in between — and the fold writes an
    // absolute value, which would silently undo it.
    const report = await verifyStockIntegrity();

    result.refused = report.unreconstructable;
    result.refusedBatchIds = report.unreconstructableBatches.map((b) => b.batchId);

    for (const batch of report.divergedBatches) {
      await execute("UPDATE stock_batches SET quantity = ? WHERE id = ?", [
        batch.movementQuantity,
        batch.batchId,
      ]);
      result.folded++;
      result.unitsCorrected += Math.abs(batch.batchQuantity - batch.movementQuantity);
    }
  });

  // Raw execute() bypasses base-helpers, so nothing queued an invalidation
  // and every stock figure on screen would stay stale until a reload.
  if (result.folded > 0) {
    queueTableInvalidation("stock_batches");
  }

  await logTillRepair(TILL_REPAIR_ACTIONS.fold, getActiveStoreId() ?? "unknown", {
    folded: result.folded,
    refused: result.refused,
    units_corrected: result.unitsCorrected,
  });

  return result;
}
