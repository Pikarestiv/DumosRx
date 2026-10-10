import { query, execute } from "../core";

/**
 * Deferred `stock_movements` quantity deltas, persisted rather than held in
 * memory so an interrupted pull round cannot lose one. See client/AGENTS.md,
 * "Deferred movement deltas".
 */

const REPORT_AFTER_ATTEMPTS = 10;

/**
 * A delta whose batch never arrives never resolves, so reporting it once and
 * falling silent reads as "it fixed itself". It is re-reported on this
 * interval afterwards: often enough that a chronic divergence stays visible,
 * rarely enough that it doesn't drown the issue it belongs to.
 */
const REREPORT_EVERY_ATTEMPTS = 25;

function shouldReport(attempts: number): boolean {
  return (
    attempts === REPORT_AFTER_ATTEMPTS ||
    (attempts > REPORT_AFTER_ATTEMPTS &&
      (attempts - REPORT_AFTER_ATTEMPTS) % REREPORT_EVERY_ATTEMPTS === 0)
  );
}

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
 *
 * `countAttempts: false` applies whatever is resolvable without charging an
 * attempt against what is not — for the mid-round drains, which run several
 * times per round and would otherwise race a long first sync to the
 * reporting threshold while the batches were still on their way.
 */
export async function applyDeferredStockDeltas(
  options: { countAttempts?: boolean } = {},
): Promise<DeferredStockDelta[]> {
  const countAttempts = options.countAttempts !== false;
  // rowid, i.e. the order the deltas were deferred in, which is the order the
  // server applied them in; the floor makes a replay order-dependent.
  const pending = await query<DeferredStockDelta>(
    "SELECT movement_id, stock_batch_id, quantity, attempts FROM _pending_stock_deltas ORDER BY rowid",
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
      if (!countAttempts) continue;
      const attempts = delta.attempts + 1;
      await execute(
        "UPDATE _pending_stock_deltas SET attempts = ? WHERE movement_id = ?",
        [attempts, delta.movement_id],
      );
      if (shouldReport(attempts)) {
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

/**
 * Drops deltas for movements the server has voided. The drain already does
 * this from the local row, but a mid-round drain runs before that page's own
 * soft-deletes have been written, so the void has to be read off the payload.
 */
export async function discardDeferredStockDeltas(movementIds: string[]): Promise<void> {
  for (const movementId of movementIds) {
    await discard(movementId);
  }
}
