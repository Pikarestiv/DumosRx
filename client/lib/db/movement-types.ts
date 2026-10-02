/**
 * The movement type the server writes when it adopts this device's own
 * stock_batches.quantity (POST /app/sync/reconcile-quantities). It is a
 * real, permanent record of a sync correction — not a stock event — so the
 * owner-facing movement lists and the stock-value summaries deliberately
 * exclude it, and pull.ts never replays it as a local delta. See
 * client/AGENTS.md, "Stock quantity reconciliation".
 */
export const RECONCILIATION_MOVEMENT_TYPE = "sync_reconciliation";
