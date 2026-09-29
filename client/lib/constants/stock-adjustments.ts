/** The two stock_movements.reference_type values that mean "a stock
 * correction outside a sale/purchase/transfer": a full cycle count writes
 * AUDIT_REFERENCE_TYPE, the quick Adjust Stock flow writes
 * ADJUSTMENT_REFERENCE_TYPE. Both carry movement_type "adjustment" and both
 * appear in the Adjustments ledger - see client/AGENTS.md. */
export const ADJUSTMENT_REFERENCE_TYPE = "stock_adjustment";
export const AUDIT_REFERENCE_TYPE = "stock_audit";
