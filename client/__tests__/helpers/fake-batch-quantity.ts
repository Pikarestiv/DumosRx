interface FakeBatchLike {
  quantity: number;
}

interface FakeMovementLike {
  stock_batch_id?: string;
  quantity?: unknown;
  _deleted?: unknown;
}

/**
 * What `insert("stock_movements", …)` now does to the batch it names, for the
 * in-memory fakes that stub out `@/lib/db/local-database` — see
 * `resolveBatchQuantity()` in `lib/db/batch-quantity.ts`, which this mirrors.
 * Call it after the movement has been pushed onto `movements`, the way the
 * real hook runs after the row is written. `applied: false` mirrors
 * `movementChange(q, false)`, i.e. a soft-delete: pass the movement's own
 * quantity and mark it `_deleted` in `movements` first.
 */
export function applyMovementToFakeBatch(
  batches: Record<string, FakeBatchLike>,
  movements: FakeMovementLike[],
  data: Record<string, unknown>,
  applied = true,
): void {
  const batchId = data.stock_batch_id as string | undefined;
  const batch = batchId ? batches[batchId] : undefined;
  if (!batch) return;

  const log = movements.filter((m) => m.stock_batch_id === batchId && !m._deleted);
  const total = log.reduce((sum, m) => sum + Number(m.quantity ?? 0), 0);
  const inbound = log.reduce((sum, m) => sum + Math.max(0, Number(m.quantity ?? 0)), 0);
  const rebuilt = Math.max(0, total);

  if (batch.quantity === rebuilt) return;

  const quantity = Number(data.quantity ?? 0);
  const sign = applied ? 1 : -1;
  const delta = sign * quantity;
  const inboundBefore = inbound - sign * Math.max(0, quantity);

  batch.quantity =
    batch.quantity > inboundBefore ? Math.max(0, batch.quantity + delta) : rebuilt;
}
