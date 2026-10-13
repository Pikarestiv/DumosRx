import { query, execute } from "./core";

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
  const rebuilt = Math.max(0, total);

  // Equality first, before the carve-out is even judged: a batch created
  // together with its first inbound movement (a receipt, an import row, a
  // transfer's destination) holds exactly that movement's quantity, and the
  // log it was created from agrees. Classifying it would see a stored figure
  // above the log's *previous* inbound of nothing and patch the delta on top,
  // doubling the receipt. Nothing to write is the honest answer, and it is
  // also what keeps one push row per created batch instead of two.
  if (stored === rebuilt) {
    return { stored, carveOut: false, quantity: stored };
  }

  const inboundBefore = Number(log?.inbound ?? 0) - change.inbound;
  const carveOut = stored > inboundBefore;

  return {
    stored,
    carveOut,
    quantity: carveOut ? Math.max(0, stored + change.delta) : rebuilt,
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
