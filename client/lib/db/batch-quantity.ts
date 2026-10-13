import { query, execute } from "./core";

/**
 * `stock_batches.quantity` is a cache of its own movement log, not a running
 * total maintained by deltas. See
 * docs/superpowers/specs/2026-10-10-derived-stock-quantity-design.md.
 */

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
  incrementalDelta: number,
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
  const inbound = Number(log?.inbound ?? 0);
  const carveOut = stored > inbound;

  return {
    stored,
    carveOut,
    quantity: carveOut ? Math.max(0, stored + incrementalDelta) : Math.max(0, total),
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
  touched: Map<string, number>,
): Promise<void> {
  for (const [batchId, delta] of touched) {
    const resolved = await resolveBatchQuantity(batchId, delta);
    if (!resolved || resolved.quantity === resolved.stored) continue;
    await execute("UPDATE stock_batches SET quantity = ? WHERE id = ?", [
      resolved.quantity,
      batchId,
    ]);
  }
}
