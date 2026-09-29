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

/** Rows written by product-import.ts before commit 3b7ce8b8 still carry
 * AUDIT_REFERENCE_TYPE instead of PRODUCT_IMPORT_REFERENCE_TYPE - a raw
 * client-side UPDATE can't reach the server's copy through the sync queue,
 * so the ledger also matches this legacy reason as a heal-on-read fallback
 * (same ruling as A-29/A-30) rather than backfilling stored bytes. */
export const LEGACY_PRODUCT_IMPORT_REASON = "Bulk import stock update";
