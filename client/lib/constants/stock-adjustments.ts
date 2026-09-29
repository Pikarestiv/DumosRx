/** The two stock_movements.reference_type values that mean "a stock
 * correction outside a sale/purchase/transfer": a full cycle count writes
 * AUDIT_REFERENCE_TYPE, the quick Adjust Stock flow writes
 * ADJUSTMENT_REFERENCE_TYPE. Both carry movement_type "adjustment" and both
 * appear in the Adjustments ledger - see client/AGENTS.md. */
export const ADJUSTMENT_REFERENCE_TYPE = "stock_adjustment";
export const AUDIT_REFERENCE_TYPE = "stock_audit";

/** Bulk CSV/XLSX import also corrects a product's quantity via
 * submitStockAudit, but tagged with this reference_type instead of
 * AUDIT_REFERENCE_TYPE - an import side effect isn't something a person
 * deliberately recorded, so the Adjustments ledger excludes it. Reuses the
 * same value product-import.ts already stamps on its opening-stock
 * movement, rather than a second near-synonym. See client/AGENTS.md. */
export const PRODUCT_IMPORT_REFERENCE_TYPE = "import";
