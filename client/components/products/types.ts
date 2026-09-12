import type { ProductViewModel, ProductWithDetails } from "@/lib/types/product";

export type Product = ProductViewModel;

// Helper to transform API/Local response to UI model (camelCase)
export const transformProduct = (apiData: ProductWithDetails): Product => ({
  id: apiData.id,
  name: apiData.name,
  genericName: apiData.generic_name || "",
  // A raw category_id with no matching category_name means the referenced
  // category row was deleted out from under this product (deleteCategory
  // never nulls out the products.category_id pointing at it) — falling back
  // to that id would show a bare UUID as the "category" instead of a
  // readable label.
  category: apiData.category_name || "Uncategorized",
  nafdacNumber: apiData.nafdac_number || "",
  strength: apiData.strength || "",
  dosageForm: apiData.dosage_form || "",
  manufacturer: apiData.manufacturer || "",
  costPrice: Number(apiData.cost_price) || 0,
  sellingPrice: Number(apiData.selling_price) || 0,
  stockQuantity: Number(apiData.stock_quantity) || 0,
  reorderLevel: Number(apiData.reorder_level) || 0,
  expiryDate: apiData.expiry_date && apiData.expiry_date !== "null"
    ? new Date(apiData.expiry_date as string).toISOString().split("T")[0]
    : "",
  batchNumber: apiData.batch_number || "",
  barcode: apiData.barcode || "",
  baseUnit: apiData.base_unit || "Unit",
  bulkUnit: apiData.bulk_unit || "",
  unitsPerBulk: Number(apiData.units_per_bulk) || 1,
  lastAuditedAt: apiData.last_audited_at || null,
  showOnline: apiData.show_online === 1,
  requiresPrescription: apiData.requires_prescription === 1,
  isControlled: apiData.is_controlled === 1,
  status: (() => {
    const stock = Number(apiData.stock_quantity) || 0;
    const reorder = Number(apiData.reorder_level) || 0;
    // Fix: If expiry_date is explicitly literal string "null" or JS null, handle it.
    const hasValidExpiry = apiData.expiry_date && apiData.expiry_date !== "null";
    const expiry = hasValidExpiry ? new Date(apiData.expiry_date as string) : null;
    const now = new Date();

    if (expiry && !isNaN(expiry.getTime()) && expiry < now) return "expired";
    if (stock <= 0) return "out_of_stock";
    if (stock <= reorder) return "low_stock";
    return "active";
  })(),
});
