import { query, execute, getActiveStoreId } from "./core";

// `stock_batches.quantity` is a cache of its own movement log, not a running total maintained by deltas.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-batch-quantity-ts-L3

// What a change did to a batch's log, so the carve-out can be judged against the log as it stood *before* it:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-batch-quantity-ts-L9
export interface BatchLogChange {
  /** Net quantity added to the log (negative for a sale or a voided receipt). */
  delta: number;
  /** How much of `delta` moved the log's inbound total. */
  inbound: number;
}

/** An insert of one movement; a soft-delete reverses both figures. */
export function movementChange(quantity: number, applied = true): BatchLogChange {
  const sign = applied ? 1 : -1;
  return { delta: sign * quantity, inbound: sign * Math.max(0, quantity) };
}

export interface ResolvedBatchQuantity {
  stored: number;
  quantity: number;
  /** Outside the invariant (A-148): patched by the delta, not rebuilt. */
  carveOut: boolean;
}

/** MAX(0, Σ deltas): one floor over the sum, never one per movement. */
export function onHandFromLog(deltas: number[]): number {
  return Math.max(
    0,
    deltas.reduce((sum, delta) => sum + delta, 0),
  );
}

// What a batch's `quantity` should hold now that its log has changed, read from the log this device already has.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-batch-quantity-L43
export async function resolveBatchQuantity(
  batchId: string,
  change: BatchLogChange,
): Promise<ResolvedBatchQuantity | null> {
  const [batch] = await query<{ quantity: number | null }>(
    "SELECT quantity FROM stock_batches WHERE id = ?",
    [batchId],
  );
  if (!batch) return null;

  const [log] = await query<{ total: number | null; inbound: number | null }>(
    `SELECT COALESCE(SUM(quantity), 0) AS total,
            COALESCE(SUM(CASE WHEN quantity > 0 THEN quantity ELSE 0 END), 0) AS inbound
       FROM stock_movements
      WHERE stock_batch_id = ? AND _deleted = 0`,
    [batchId],
  );

  const stored = Number(batch.quantity ?? 0);
  const total = Number(log?.total ?? 0);
  const inboundBefore = Number(log?.inbound ?? 0) - change.inbound;
  const carveOut = stored > inboundBefore;

  return {
    stored,
    carveOut,
    quantity: carveOut ? Math.max(0, stored + change.delta) : Math.max(0, total),
  };
}

// Rebuilds each touched batch from its log, keyed by batch id with the net delta of the movements that touched it — used only for the deltas t…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-batch-quantity-ts-L75
export async function recomputeBatchQuantities(
  touched: Map<string, BatchLogChange>,
): Promise<void> {
  for (const [batchId, change] of touched) {
    const resolved = await resolveBatchQuantity(batchId, change);
    if (!resolved || resolved.quantity === resolved.stored) continue;
    await execute("UPDATE stock_batches SET quantity = ? WHERE id = ?", [
      resolved.quantity,
      batchId,
    ]);
  }
}

export interface BatchDeficit {
  batchId: string;
  productId: string;
  productName: string;
  /** Units the log is short by, as a positive number. */
  deficit: number;
  lastMovementDate: string | null;
}

// Batches whose movement log sums below zero — more went out than the log can account for going in.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-batch-quantity-L114
export async function getBatchDeficits(): Promise<BatchDeficit[]> {
  const storeId = getActiveStoreId();

  const rows = await query<{
    batch_id: string;
    product_id: string;
    product_name: string;
    total: number | null;
    last_movement_date: string | null;
  }>(
    `SELECT sb.id AS batch_id,
            sb.product_id AS product_id,
            p.name AS product_name,
            COALESCE(SUM(sm.quantity), 0) AS total,
            MAX(sm.movement_date) AS last_movement_date
       FROM stock_movements sm
       JOIN stock_batches sb ON sb.id = sm.stock_batch_id
       JOIN products p ON p.id = sb.product_id
      WHERE sm._deleted = 0 AND sb._deleted = 0 AND sb.is_active = 1
        AND p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
      GROUP BY sb.id
     HAVING COALESCE(SUM(sm.quantity), 0) < 0
        AND sb.quantity <= COALESCE(SUM(CASE WHEN sm.quantity > 0 THEN sm.quantity ELSE 0 END), 0)
      ORDER BY total ASC`,
    storeId ? [storeId] : [],
  );

  return rows.map((row) => ({
    batchId: row.batch_id,
    productId: row.product_id,
    productName: row.product_name,
    deficit: -Number(row.total ?? 0),
    lastMovementDate: row.last_movement_date,
  }));
}
