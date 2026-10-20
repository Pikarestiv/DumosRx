interface FakeBatchLike {
  quantity: number;
}

interface FakeMovementLike {
  stock_batch_id?: string;
  quantity?: unknown;
  _deleted?: unknown;
}

// What `insert("stock_movements", …)` now does to the batch it names, for the in-memory fakes that stub out `@/lib/db/loca…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-helpers-fake-batch-quantity-ts-L11
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
