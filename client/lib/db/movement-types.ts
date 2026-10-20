// The movement type the server writes when it adopts this device's own stock_batches.quantity (POST /app/sync/reconcile-quantities).
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-movement-types-L1
export const RECONCILIATION_MOVEMENT_TYPE = "sync_reconciliation";

// Written by `sync:repair-health-sync-reconciliation` to cancel one of the A-214 movements.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-movement-types-ts-L5
export const RECONCILIATION_REVERSAL_MOVEMENT_TYPE = "sync_reconciliation_reversal";

/** Sync bookkeeping, never a stock event: excluded from every owner-facing
 * movement list. `HIDDEN_MOVEMENT_TYPES_SQL` matches its arity. */
export const HIDDEN_MOVEMENT_TYPES = [
  RECONCILIATION_MOVEMENT_TYPE,
  RECONCILIATION_REVERSAL_MOVEMENT_TYPE,
] as const;

export const HIDDEN_MOVEMENT_TYPES_SQL = `(${HIDDEN_MOVEMENT_TYPES.map(() => "?").join(", ")})`;
