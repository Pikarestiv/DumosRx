import * as XLSX from "xlsx";
import type { ExportableProduct } from "@/lib/db/queries/product-export";

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

export interface ProductImportRow {
  name: string;
  category?: string;
  supplier?: string;
  costPrice?: number;
  sellingPrice?: number;
  quantity?: number;
  reorderLevel?: number;
  barcode?: string;
}

/** Accepts "1500", 1500, "1,500.00", "₦1,500.00"; rejects blank/non-numeric. */
export function parseNumericValue(raw: unknown): number | undefined {
  if (raw === null || raw === undefined || raw === "") return undefined;
  const cleaned = String(raw).replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
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
    }
  }
  if (!result.name) return null;
  return result as ProductImportRow;
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: Record<string, unknown>[];
}

/** Reads a CSV/XLS/XLSX File (from an <input type="file">) into a workbook for sheet selection. */
export async function readWorkbookFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: "array" });
}

/** Parses a single sheet of an already-read workbook into headers + row objects. */
export function parseWorkbookSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
): ParsedSpreadsheet {
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const [headerRow] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
  });
  return { headers: (headerRow || []).map(String), rows };
}

/** Reads a CSV/XLS/XLSX File and parses its first sheet into headers + row objects. */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const workbook = await readWorkbookFile(file);
  return parseWorkbookSheet(workbook, workbook.SheetNames[0]);
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
];

/** Column order always follows EXPORT_COLUMNS, regardless of the order the
 * caller passed `columns` in, so the file stays predictable to re-import. */
export function buildExportBlob(
  products: ExportableProduct[],
  columns: (keyof ExportableProduct)[],
  format: "csv" | "xlsx",
): Blob {
  const selected = EXPORT_COLUMNS.filter((c) => columns.includes(c.key));
  const data = products.map((product) => {
    const row: Record<string, unknown> = {};
    for (const col of selected) row[col.label] = product[col.key];
    return row;
  });
  const sheet = XLSX.utils.json_to_sheet(data, {
    header: selected.map((c) => c.label),
  });

  if (format === "csv") {
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return new Blob([csv], { type: "text/csv;charset=utf-8;" });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Products");
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
