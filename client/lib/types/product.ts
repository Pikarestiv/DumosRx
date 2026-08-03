export interface Product {
  id: string;
  name: string;
  generic_name?: string;
  category_id?: string;
  category_name?: string;
  nafdac_number?: string;
  strength?: string;
  dosage_form?: string;
  manufacturer?: string;
  barcode?: string;
  base_unit?: string;
  bulk_unit?: string;
  units_per_bulk?: number;
  cost_price?: number;
  selling_price?: number;
  reorder_level?: number;
  show_online?: boolean;
  requires_prescription?: boolean;
  is_controlled?: boolean;
}

/** Row shape returned by getProductsWithDetails() — the `products` table
 * joined with its category name and current stock_batches aggregates
 * (on-hand quantity, latest cost, soonest-expiring batch). */
export interface ProductWithDetails extends Product {
  category_name?: string;
  stock_quantity?: number;
  expiry_date?: string | null;
  batch_number?: string;
}

export interface POSProduct {
  id: string;
  name: string;
  generic_name: string;
  strength: string;
  unit_price: number;
  stock: number;
  cost_price?: number;
  barcode?: string;
  batch_number?: string;
  category_id?: string;
  category_name?: string;
  reorder_level?: number;
}

/** snake_case payload built by AddProductDialog's submit handler — the shape
 * createProduct()/updateProduct() actually insert into the `products` table. */
export interface NewProductPayload {
  [key: string]: unknown;
  id?: string;
  name: string;
  generic_name?: string;
  category_id?: string;
  nafdac_number?: string;
  strength?: string;
  dosage_form?: string;
  manufacturer?: string;
  selling_price?: number;
  reorder_level?: number;
  barcode?: string;
  base_unit?: string;
  bulk_unit?: string;
  units_per_bulk?: number;
  is_active?: number;
  show_online?: number;
  requires_prescription?: number;
  is_controlled?: number;
}

export interface ProductViewModel {
  id: string;
  name: string;
  genericName: string;
  category: string;
  nafdacNumber: string;
  strength: string;
  dosageForm: string;
  manufacturer: string;
  costPrice: number;
  sellingPrice: number;
  stockQuantity: number;
  reorderLevel: number;
  expiryDate: string | null;
  batchNumber: string;
  barcode: string;
  baseUnit: string;
  bulkUnit: string;
  unitsPerBulk: number;
  status: "active" | "inactive" | "expired" | "low_stock" | "out_of_stock";
  showOnline: boolean;
  requiresPrescription: boolean;
  isControlled: boolean;
}
