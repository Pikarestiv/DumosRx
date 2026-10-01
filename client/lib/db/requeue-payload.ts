/**
 * Shared payload builder for the two whole-row requeue paths
 * (requeueOrphanedRows in reconcile-identity.ts and forceSyncAllData in
 * local-database.ts), both of which rebuild a sync payload from a
 * `SELECT *` rather than from the write that produced the row.
 *
 * Why null keys are dropped rather than sent: several columns are nullable
 * in the local SQLite schema but NOT NULL with a server-side DEFAULT in
 * MySQL (stock_batches.cost_price is the one that bit us). The original
 * INSERT simply omitted them, so the server applied its default; a requeue
 * that resends them as explicit nulls turns into an UPDATE that writes a
 * literal NULL and is rejected outright. A stale re-queue must never
 * override a server-side default. See docs/FIXED_BUGS.md A-128.
 */
export function buildRequeuePayload(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null),
  );
}

export function serializeRequeuePayload(row: Record<string, unknown>): string {
  return JSON.stringify(buildRequeuePayload(row));
}
