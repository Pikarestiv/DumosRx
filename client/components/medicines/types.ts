export interface Medicine {
  id: string;
  name: string;
  genericName: string;
  brand: string;
  category: string;
  nafdacNumber: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  supplier: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  expiryDate: string;
  batchNumber: string;
  barcode: string;
  baseUnit: string;
  bulkUnit: string;
  unitsPerBulk: number;
  status: "active" | "inactive" | "expired" | "low_stock";
  showOnline: boolean;
}

// Helper to transform API/Local response to UI model (camelCase)
export const transformMedicine = (apiData: any): Medicine => ({
  id: apiData.id,
  name: apiData.name,
  genericName: apiData.generic_name || "",
  brand: apiData.brand_name || apiData.brand || "",
  category: apiData.category_name || apiData.category || apiData.category_id || (apiData.category as any)?.name || "Uncategorized",
  nafdacNumber: apiData.nafdac_number || "",
  strength: apiData.strength || "",
  dosageForm: apiData.dosage_form || "",
  manufacturer: apiData.manufacturer || "",
  supplier: apiData.supplier_name || apiData.supplier || apiData.supplier_id || (apiData.supplier as any)?.name || "Unknown",
  costPrice: Number(apiData.cost_price) || 0,
  sellingPrice: Number(apiData.selling_price) || 0,
  stockQuantity: Number(apiData.stock_quantity) || 0,
  reorderLevel: Number(apiData.reorder_level) || 0,
  expiryDate: apiData.expiry_date
    ? new Date(apiData.expiry_date).toISOString().split("T")[0]
    : "",
  batchNumber: apiData.batch_number || "",
  barcode: apiData.barcode || "",
  baseUnit: apiData.base_unit || "Unit",
  bulkUnit: apiData.bulk_unit || "",
  unitsPerBulk: Number(apiData.units_per_bulk) || 1,
  showOnline: apiData.show_online === 1 || apiData.show_online === true,
  status: (() => {
    const stock = Number(apiData.stock_quantity) || 0;
    const reorder = Number(apiData.reorder_level) || 0;
    const expiry = apiData.expiry_date ? new Date(apiData.expiry_date) : null;
    const now = new Date();

    if (expiry && expiry < now) return "expired";
    if (stock <= reorder) return "low_stock";
    return (apiData.status as any) || "active";
  })(),
});
