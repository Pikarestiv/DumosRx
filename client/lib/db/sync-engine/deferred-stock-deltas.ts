import { query, execute } from "../core";

/**
 * Deferred `stock_movements` quantity deltas, persisted rather than held in
 * memory so an interrupted pull round cannot lose one. See client/AGENTS.md,
 * "Deferred movement deltas".
 */

const REPORT_AFTER_ATTEMPTS = 10;

export interface DeferredStockDelta {
  movement_id: string;
  stock_batch_id: string;
  quantity: number;
  attempts: number;
}

export async function recordDeferredStockDelta(
  movementId: string,
  stockBatchId: string,
  quantity: number,
): Promise<void> {
  await execute(
    `INSERT INTO _pending_stock_deltas (movement_id, stock_batch_id, quantity, attempts)
     VALUES (?, ?, ?, 0)
     ON CONFLICT(movement_id) DO UPDATE SET
       stock_batch_id = excluded.stock_batch_id,
       quantity = excluded.quantity`,
    [movementId, stockBatchId, quantity],
  );
}

export async function countDeferredStockDeltas(): Promise<number> {
  const rows = await query<{ pending: number }>(
    "SELECT COUNT(*) AS pending FROM _pending_stock_deltas",
  );
  return Number(rows[0]?.pending ?? 0);
}

/**
 * Applies every deferred delta whose batch has since arrived, deleting each
 * one in the same transaction that applies it so no delta can be applied
 * twice. Must be called inside a `transaction()`. Returns the deltas whose
 * batch has been unreachable long enough to be worth reporting; they stay
 * pending, since only a batch arriving can settle them.
 */
export async function applyDeferredStockDeltas(): Promise<DeferredStockDelta[]> {
  const pending = await query<DeferredStockDelta>(
    "SELECT movement_id, stock_batch_id, quantity, attempts FROM _pending_stock_deltas",
  );
  const unresolved: DeferredStockDelta[] = [];

  for (const delta of pending) {
    const movement = await query<{ _deleted: number | null }>(
      "SELECT _deleted FROM stock_movements WHERE id = ?",
      [delta.movement_id],
    );

    // A movement that is gone or soft-deleted contributes no delta, matching
    // the `!_deleted` gate the insert path applies.
    if (movement.length === 0 || movement[0]._deleted) {
      await discard(delta.movement_id);
      continue;
    }

    const batch = await query<{ 1: number }>("SELECT 1 FROM stock_batches WHERE id = ?", [
      delta.stock_batch_id,
    ]);

    if (batch.length === 0) {
      const attempts = delta.attempts + 1;
      await execute(
        "UPDATE _pending_stock_deltas SET attempts = ? WHERE movement_id = ?",
        [attempts, delta.movement_id],
      );
      if (attempts === REPORT_AFTER_ATTEMPTS) {
        unresolved.push({ ...delta, attempts });
      }
      continue;
    }

    await execute("UPDATE stock_batches SET quantity = MAX(0, quantity + ?) WHERE id = ?", [
      delta.quantity,
      delta.stock_batch_id,
    ]);
    await discard(delta.movement_id);
  }

  return unresolved;
}

async function discard(movementId: string): Promise<void> {
  await execute("DELETE FROM _pending_stock_deltas WHERE movement_id = ?", [movementId]);
}
