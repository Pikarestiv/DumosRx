import { query, getActiveStoreId } from "../core";

/**
 * Divergence between a batch's stored `quantity` and the sum of its own
 * `stock_movements`. See
 * docs/superpowers/specs/2026-10-08-stock-integrity-fold-design.md.
 */
export type BatchVerdict =
  | "consistent"
  | "diverged"
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
  unreconstructable: number;
  /** Net units this device is over (positive) or under (negative) the log. */
  netUnitDelta: number;
  divergedBatches: BatchIntegrity[];
  unreconstructableBatches: BatchIntegrity[];
}

interface IntegrityRow {
  batch_id: string;
  product_id: string;
  batch_qty: number | null;
  movement_qty: number | null;
  movement_count: number | null;
  inbound_count: number | null;
}

function classify(row: IntegrityRow): BatchIntegrity {
  const batchQuantity = Number(row.batch_qty ?? 0);
  const movementQuantity = Number(row.movement_qty ?? 0);
  const movementCount = Number(row.movement_count ?? 0);

  const inboundCount = Number(row.inbound_count ?? 0);

  // The log can only rebuild a balance it can account for. No inbound
  // movement at all means the opening stock was never recorded (A-148) —
  // true whether the batch has no movements or only outbound ones.
  const unreconstructable = batchQuantity > 0 && inboundCount === 0;

  // stock_batches.quantity is floored at 0 in four places while the movement
  // keeps its full size (inventory.ts, pull.ts, SyncController), so an
  // oversold batch legitimately sits above its own negative sum.
  const reconciles =
    batchQuantity === movementQuantity ||
    batchQuantity === Math.max(0, movementQuantity);

  const verdict: BatchVerdict = unreconstructable
    ? "unreconstructable"
    : reconciles
      ? "consistent"
      : "diverged";

  return {
    batchId: row.batch_id,
    productId: row.product_id,
    batchQuantity,
    movementQuantity,
    movementCount,
    verdict,
    delta: batchQuantity - movementQuantity,
  };
}

/**
 * Read-only audit of every active batch against its own movement log. Writes
 * nothing, so it is safe to run anywhere including production.
 */
export async function verifyStockIntegrity(): Promise<StockIntegrityReport> {
  const storeId = getActiveStoreId();

  const rows = await query<IntegrityRow>(
    `SELECT sb.id AS batch_id,
            sb.product_id AS product_id,
            sb.quantity AS batch_qty,
            COALESCE(SUM(CASE WHEN sm._deleted = 0 THEN sm.quantity ELSE 0 END), 0) AS movement_qty,
            COUNT(CASE WHEN sm._deleted = 0 THEN 1 END) AS movement_count,
            COUNT(CASE WHEN sm._deleted = 0 AND sm.quantity > 0 THEN 1 END) AS inbound_count
       FROM stock_batches sb
       LEFT JOIN stock_movements sm ON sm.stock_batch_id = sb.id
      WHERE sb._deleted = 0 AND sb.is_active = 1${storeId ? " AND sb.store_id = ?" : ""}
      GROUP BY sb.id, sb.product_id, sb.quantity`,
    storeId ? [storeId] : [],
  );

  const report: StockIntegrityReport = {
    checked: rows.length,
    consistent: 0,
    diverged: 0,
    unreconstructable: 0,
    netUnitDelta: 0,
    divergedBatches: [],
    unreconstructableBatches: [],
  };

  for (const row of rows) {
    const entry = classify(row);

    if (entry.verdict === "consistent") {
      report.consistent++;
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
    unreconstructable: report.unreconstructable,
    netUnitDelta: report.netUnitDelta,
  };
}
