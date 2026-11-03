// The two stock_movements.reference_type values that mean "a stock correction outside a sale/purchase/transfer":
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-stock-adjustments-ts-L1
export const ADJUSTMENT_REFERENCE_TYPE = "stock_adjustment";
export const AUDIT_REFERENCE_TYPE = "stock_audit";

// Bulk CSV/XLSX import also corrects a product's quantity via submitStockAudit, but tagged with this reference_type instead of AUDIT_REFERENCE…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-stock-adjustments-ts-L9
export const PRODUCT_IMPORT_REFERENCE_TYPE = "import";

// Rows written by product-import.ts before commit 3b7ce8b8 still carry AUDIT_REFERENCE_TYPE instead of PRODUCT_IMPORT_REFERENCE_TYPE - a raw c…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-stock-adjustments-ts-L17
export const LEGACY_PRODUCT_IMPORT_REASON = "Bulk import stock update";

// stock_movements has no note column, so an adjustment's optional note rides along inside `reason` behind this separator - see buildAdjustment…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-stock-adjustments-ts-L24
export const ADJUSTMENT_REASON_NOTE_SEPARATOR = " — ";

// The ADJUSTMENT_REASONS entries whose direction is "decrease", i.e.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#constants-stock-adjustments-ts-L29
export const STOCK_LOSS_REASON_LABELS = ["Damage", "Loss"] as const;

// A-265: the inbound adjustment an oversell writes for the units sold that the batch's ledger did not hold.
export const OVERSELL_REFERENCE_TYPE = "oversell";
export const OVERSELL_COMPENSATION_REASON = "Oversell compensation: sold units the ledger did not hold";
