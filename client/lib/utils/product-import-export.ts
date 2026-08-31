import * as XLSX from "xlsx";

export type ProductField =
  | "name"
  | "category"
  | "supplier"
  | "cost_price"
  | "selling_price"
  | "quantity"
  | "reorder_level"
  | "barcode"
  | "ignore";

export const FIELD_LABELS: Record<ProductField, string> = {
  name: "Product Name",
  category: "Category",
  supplier: "Supplier",
  cost_price: "Cost Price",
  selling_price: "Selling Price",
  quantity: "Stock Quantity",
  reorder_level: "Reorder Level",
  barcode: "Barcode / Item Number",
  ignore: "Ignore this column",
};

/**
 * Known header strings from QuickBooks POS's "Export Templates" dialog,
 * Moniebook's inventory export, and DumosRx's own export — seeded from the
 * actual files reviewed while designing this feature (see
 * docs/superpowers/specs/2026-08-31-stock-import-export-design.md). Any
 * header not listed here falls back to "ignore" and the user maps it by hand.
 */
const HEADER_ALIASES: Record<string, ProductField> = {
  "item name": "name",
  "product name": "name",
  "item description": "name",
  "name": "name",
  "department name": "category",
  "department": "category",
  "category": "category",
  "vendor name": "supplier",
  "vendor": "supplier",
  "supplier": "supplier",
  "average unit cost": "cost_price",
  "cost price": "cost_price",
  "cost": "cost_price",
  "regular price": "selling_price",
  "fixed sell price": "selling_price",
  "selling price": "selling_price",
  "price": "selling_price",
  "qty 1": "quantity",
  "qty": "quantity",
  "quantity": "quantity",
  "stock": "quantity",
  "available": "quantity",
  "reorder point 1": "reorder_level",
  "reorder point": "reorder_level",
  "reorder level": "reorder_level",
  "item number": "barcode",
  "sku": "barcode",
  "barcode": "barcode",
};

/**
 * Strips bracket suffixes like " [Main branch]" (Moniebook's per-branch
 * columns) and "( % )" (Moniebook's margin columns) before matching, since
 * DumosRx is single-store and doesn't need the branch qualifier.
 */
function normalizeHeader(header: string): string {
  return header
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\(\s*%\s*\)/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type ColumnMapping = Record<string, ProductField>;

/**
 * Auto-maps a file's header row to internal fields. Fields that can
 * legitimately repeat across columns (e.g. Moniebook's "Stock [Branch]" per
 * branch) only take their FIRST matching column — DumosRx tracks one
 * quantity per product, not one per branch — so every later column that
 * would map to an already-claimed field falls back to "ignore".
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const claimed = new Set<ProductField>();
  for (const header of headers) {
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field && !claimed.has(field)) {
      mapping[header] = field;
      claimed.add(field);
    } else {
      mapping[header] = "ignore";
    }
  }
  return mapping;
}
