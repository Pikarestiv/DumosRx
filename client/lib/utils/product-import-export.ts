import type { ExportableProduct } from "@/lib/db/queries/product-export";
import { buildBlobFromRows } from "./spreadsheet-io";

// The CSV/XLSX reader/writer half lives in ./spreadsheet-io and is re-exported
// here so every existing import of this module keeps working.
export * from "./spreadsheet-io";

export type ProductField =
  | "name"
  | "category"
  | "supplier"
  | "cost_price"
  | "selling_price"
  | "quantity"
  | "reorder_level"
  | "barcode"
  | "show_online"
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
  show_online: "Show in Online Store",
  ignore: "Ignore this column",
};

// Known header strings from QuickBooks POS's "Export Templates" dialog, Moniebook's inventory export, and DumosRx's own export — seeded from t…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-product-import-export-ts-L33
const HEADER_ALIASES: Record<string, ProductField> = {
  "item name": "name",
  "product name": "name",
  "item description": "name",
  "name": "name",
  "label": "name",
  "department name": "category",
  "department": "category",
  "category": "category",
  "vendor name": "supplier",
  "vendor": "supplier",
  "supplier": "supplier",
  "average unit cost": "cost_price",
  "cost price": "cost_price",
  "cost": "cost_price",
  "p.buying": "cost_price",
  "regular price": "selling_price",
  "fixed sell price": "selling_price",
  "selling price": "selling_price",
  "price": "selling_price",
  "p.selling": "selling_price",
  "stock quantity": "quantity",
  "qty 1": "quantity",
  "qty": "quantity",
  "quantity": "quantity",
  "stock": "quantity",
  "available": "quantity",
  "qty machine": "quantity",
  "reorder point 1": "reorder_level",
  "reorder point": "reorder_level",
  "reorder level": "reorder_level",
  "item number": "barcode",
  "sku": "barcode",
  "barcode": "barcode",
  "show in online store": "show_online",
  "show online": "show_online",
  "online store": "show_online",
  "online": "show_online",
  "sell online": "show_online",
  "visible online": "show_online",
};

// Strips bracket suffixes like " [Main branch]" (Moniebook's per-branch columns) and "( % )" (Moniebook's margin columns) before matching, sin…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-product-import-export-ts-L82
function normalizeHeader(header: string): string {
  return header
    .replace(/\s*\[[^\]]*\]\s*/g, " ")
    .replace(/\(\s*%\s*\)/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export type ColumnMapping = Record<string, ProductField>;

// Auto-maps a file's header row to internal fields.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-product-import-export-ts-L98
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

export interface ProductImportRow {
  name: string;
  category?: string;
  supplier?: string;
  costPrice?: number;
  sellingPrice?: number;
  quantity?: number;
  reorderLevel?: number;
  barcode?: string;
  /** undefined = column absent or unrecognised value; the product keeps
   * whatever it already has (and a new one keeps the schema default, off). */
  showOnline?: boolean;
}

const TRUE_VALUES = new Set(["1", "true", "yes", "y", "on", "online", "visible", "show", "shown"]);
const FALSE_VALUES = new Set(["0", "false", "no", "n", "off", "offline", "hidden", "hide"]);

// Accepts the spellings a store owner actually types in a spreadsheet ("Yes"/"TRUE"/1/"online"), and returns undefined rather than guessing fo…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-product-import-export-ts-L137
export function parseBooleanValue(raw: unknown): boolean | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const value = String(raw).trim().toLowerCase();
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return undefined;
}

// Accepts "1500", 1500, "1,500.00", "₦1,500.00"; rejects blank/non-numeric/ negative.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-product-import-export-ts-L151
export function parseNumericValue(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return undefined;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

function trimmedOrUndefined(raw: unknown): string | undefined {
  const value = String(raw ?? "").trim();
  return value || undefined;
}

/** Returns null (caller reports "skipped: missing name") when the row has no name. */
export function mapRowToProduct(
  row: Record<string, unknown>,
  mapping: ColumnMapping,
): ProductImportRow | null {
  const result: Partial<ProductImportRow> = {};
  for (const [header, field] of Object.entries(mapping)) {
    if (field === "ignore") continue;
    const raw = row[header];
    switch (field) {
      case "name":
        result.name = String(raw ?? "").trim();
        break;
      case "category":
        result.category = trimmedOrUndefined(raw);
        break;
      case "supplier":
        result.supplier = trimmedOrUndefined(raw);
        break;
      case "barcode":
        result.barcode = trimmedOrUndefined(raw);
        break;
      case "cost_price":
        result.costPrice = parseNumericValue(raw);
        break;
      case "selling_price":
        result.sellingPrice = parseNumericValue(raw);
        break;
      case "quantity":
        result.quantity = parseNumericValue(raw);
        break;
      case "reorder_level":
        result.reorderLevel = parseNumericValue(raw);
        break;
      case "show_online":
        result.showOnline = parseBooleanValue(raw);
        break;
    }
  }
  if (!result.name) return null;
  return result as ProductImportRow;
}


export const EXPORT_COLUMNS: { key: keyof ExportableProduct; label: string }[] = [
  { key: "name", label: "Product Name" },
  { key: "category", label: "Category" },
  { key: "supplier", label: "Supplier" },
  { key: "barcode", label: "Barcode" },
  { key: "costPrice", label: "Cost Price" },
  { key: "sellingPrice", label: "Selling Price" },
  { key: "quantity", label: "Stock Quantity" },
  { key: "reorderLevel", label: "Reorder Level" },
  // Exported as the same "Yes"/"No" the importer reads back, so an export ->
  // edit -> re-import round trip is the bulk way to publish a catalog online.
  { key: "showOnline", label: "Show in Online Store" },
];

/** Column order always follows EXPORT_COLUMNS, regardless of the order the
 * caller passed `columns` in, so the file stays predictable to re-import. */
export function buildExportRows(
  products: ExportableProduct[],
  columns: (keyof ExportableProduct)[],
): { headers: string[]; rows: Record<string, unknown>[] } {
  const selected = EXPORT_COLUMNS.filter((c) => columns.includes(c.key));
  const rows = products.map((product) => {
    const row: Record<string, unknown> = {};
    for (const col of selected) row[col.label] = product[col.key];
    return row;
  });
  return { headers: selected.map((c) => c.label), rows };
}

// Printable physical stock-count sheet:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-product-import-export-ts-L244
export function buildStockAuditRows(
  products: { name: string; category?: string; quantity: number; countedQty?: number }[],
): { headers: string[]; rows: Record<string, unknown>[]; columnFlex: number[] } {
  const headers = ["#", "Product", "Category", "System Qty", "Counted Qty", "Notes"];
  const columnFlex = [0.5, 3, 1.5, 1, 1, 2];
  const rows = products.map((product, i) => ({
    "#": i + 1,
    Product: product.name,
    Category: product.category || "",
    "System Qty": product.quantity,
    "Counted Qty": product.countedQty ?? "",
    Notes: "",
  }));
  return { headers, rows, columnFlex };
}

export async function buildExportBlob(
  products: ExportableProduct[],
  columns: (keyof ExportableProduct)[],
  format: "csv" | "xlsx",
): Promise<Blob> {
  const { headers, rows: data } = buildExportRows(products, columns);
  return buildBlobFromRows(headers, data, format, "Products");
}
