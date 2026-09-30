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

/** stock_movements has no note column, so an adjustment's optional note rides
 * along inside `reason` behind this separator - see buildAdjustmentReason and
 * parseAdjustmentReason in components/stock-batch/adjustment-derivations.ts. */
export const ADJUSTMENT_REASON_NOTE_SEPARATOR = " — ";

/** The ADJUSTMENT_REASONS entries whose direction is "decrease", i.e. the ones
 * that mean stock is gone rather than sold - these are what the Stock Loss
 * figure values (see docs/STOCK_LOSS_METRIC.md). Held as the persisted LABELS
 * rather than the form's `value` keys because that is what
 * buildAdjustmentReason writes into stock_movements.reason; kept in step with
 * ADJUSTMENT_REASONS by adjustment-derivations.test.ts. */
export const STOCK_LOSS_REASON_LABELS = ["Damage", "Loss"] as const;
