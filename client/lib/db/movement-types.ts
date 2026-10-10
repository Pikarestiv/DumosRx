/**
 * The movement type the server writes when it adopts this device's own
 * stock_batches.quantity (POST /app/sync/reconcile-quantities). It is a
 * real, permanent record of a sync correction — not a stock event — so the
 * owner-facing movement lists and the stock-value summaries deliberately
 * exclude it, and pull.ts never replays it as a local delta. See
 * client/AGENTS.md, "Stock quantity reconciliation".
 */
export const RECONCILIATION_MOVEMENT_TYPE = "sync_reconciliation";

/**
 * Written by `sync:repair-health-sync-reconciliation` to cancel one of the
 * A-214 movements. Same kind of row for the same reason, so it is hidden
 * wherever the type above is.
 */
export const RECONCILIATION_REVERSAL_MOVEMENT_TYPE = "sync_reconciliation_reversal";

/** Sync bookkeeping, never a stock event: excluded from every owner-facing
 * movement list. `HIDDEN_MOVEMENT_TYPES_SQL` matches its arity. */
export const HIDDEN_MOVEMENT_TYPES = [
  RECONCILIATION_MOVEMENT_TYPE,
  RECONCILIATION_REVERSAL_MOVEMENT_TYPE,
] as const;

export const HIDDEN_MOVEMENT_TYPES_SQL = `(${HIDDEN_MOVEMENT_TYPES.map(() => "?").join(", ")})`;
