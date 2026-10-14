import { query, execute, getActiveStoreId } from "./core";

/**
 * `stock_batches.quantity` is a cache of its own movement log, not a running
 * total maintained by deltas. See
 * docs/superpowers/specs/2026-10-10-derived-stock-quantity-design.md.
 */

/**
 * What a change did to a batch's log, so the carve-out can be judged against
 * the log as it stood *before* it: `inbound` grows with the very movement
 * being applied, and reading it afterwards writes off a legacy batch whose
 * stored quantity sales have worn down below it.
 */
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

/**
 * What a batch's `quantity` should hold now that its log has changed, read
 * from the log this device already has. `incrementalDelta` is only consulted
 * for a batch holding more than its inbound movements account for — stock that
 * was never logged (A-148), which a rebuild would write off. A-215's form of
 * the test: `stored > total inbound`, never `no inbound movements`, because one
 * adjustment logged against a legacy batch must not take it out of the
 * carve-out.
 *
 * Returns null when this device has no such batch; the recompute that runs
 * when the batch arrives picks the movements up.
 */
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

/**
 * Rebuilds each touched batch from its log, keyed by batch id with the net
 * delta of the movements that touched it — used only for the deltas the pull
 * applies, so the write stays raw: a pulled batch must not be re-queued for
 * push, and `_synced` must not be reset. Local writers go through
 * `insert()`/`softDelete()`, which keep the batch's `update()`.
 */
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

/**
 * Batches whose movement log sums below zero — more went out than the log can
 * account for going in. The deficit is what the next inbound movement pays off
 * before it adds anything, which is why a cycle count on one of these reads as
 * having done nothing (A-265).
 *
 * Read from the log rather than from a movement's reason text: the alert this
 * replaced matched the word "oversold" in free text inside a 30-day window, so
 * it reported the event and never the outstanding shortfall (A-212).
 *
 * A carve-out batch is excluded even when its log sums below zero: the units it
 * sold were on the shelf, they were just never written down (A-148), so nothing
 * is owed and an inbound movement is not absorbed. The set reported here is
 * exactly the set `resolveBatchQuantity()` would rebuild to 0.
 */
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
