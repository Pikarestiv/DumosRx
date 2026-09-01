# Stock Import/Export (CSV & XLS/XLSX) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user import products (and opening stock) from a QuickBooks, Moniebook, or DumosRx CSV/XLS/XLSX export with auto-mapped columns, and export DumosRx's own product/stock data as CSV or XLSX.

**Architecture:** Everything runs client-side (DumosRx is an offline-first, single-store SQLite app — see `client/lib/db/schema.ts`, `client/lib/db/core.ts`). A pure mapping/parsing layer (`client/lib/utils/product-import-export.ts`) turns any spreadsheet's header row into a `ColumnMapping` via a header-alias dictionary, independent of the DB. A separate DB layer (`client/lib/db/queries/product-import.ts`) resolves category/supplier names to ids (creating them if missing) and upserts products + an "opening stock" batch, wrapped in a single `transaction()`. Two new dialogs (`import-mapping-dialog.tsx`, `export-columns-dialog.tsx`) and a toolbar (`import-export-toolbar.tsx`) wire this into the existing Catalog toolbar (`product-database-filters.tsx`).

**Tech Stack:** Next.js 15 / React 19, TypeScript, SQLite (via `@tauri-apps/plugin-sql` on desktop, `sql.js` on web — both behind `client/lib/db/core.ts`), Vitest, [SheetJS `xlsx`](https://www.npmjs.com/package/xlsx) (new dependency) for CSV/XLS/XLSX parsing and writing, shadcn/Radix UI components already in the repo (`Dialog`/`ResponsiveModal`, `Combobox`, `Checkbox`, `DropdownMenu`).

**Spec:** `docs/superpowers/specs/2026-08-31-stock-import-export-design.md`

## Global Constraints

- Single-store-per-database: every query filters by `getActiveStoreId()` when the table is store-scoped, matching every existing query in `client/lib/db/queries/products.ts` and `client/lib/db/procurement.ts`.
- No server round-trip. All parsing, mapping, and DB writes happen client-side.
- Never touch existing `stock_batches` rows when a product is matched/updated on import — only genuinely new products get an opening-stock batch.
- All DB writes for one import go through a single `transaction()` (from `client/lib/db/core.ts`) so a mid-import failure can't leave partial data.
- Reuse `insert()`/`update()` from `client/lib/db/base-helpers.ts` for all writes (never hand-roll `INSERT`/`UPDATE` SQL) so sync-queue and audit-log bookkeeping stay correct.
- Dedupe key on import: `barcode` exact match first; else product name + category (both trimmed, case-insensitive) when a category column was mapped; else name alone.

---

### Task 1: Add the `xlsx` dependency

**Files:**
- Modify: `client/package.json`

**Interfaces:**
- Produces: the `xlsx` package (SheetJS), imported as `import * as XLSX from "xlsx"` in Task 2 and Task 5.

- [ ] **Step 1: Install the package**

Run: `cd client && npm install xlsx@^0.18.5`

- [ ] **Step 2: Verify it resolves**

Run: `cd client && node -e "const XLSX = require('xlsx'); console.log(typeof XLSX.read)"`
Expected: prints `function`

- [ ] **Step 3: Commit**

```bash
cd client
git add package.json package-lock.json
git commit -m "chore: add xlsx dependency for stock import/export"
```

---

### Task 2: Column-mapping engine (alias dictionary + auto-detect)

**Files:**
- Create: `client/lib/utils/product-import-export.ts`
- Test: `client/__tests__/product-import-export-mapping.test.ts`

**Interfaces:**
- Produces:
  - `type ProductField = "name" | "category" | "supplier" | "cost_price" | "selling_price" | "quantity" | "reorder_level" | "barcode" | "ignore"`
  - `type ColumnMapping = Record<string, ProductField>` (file header string → field)
  - `function detectColumnMapping(headers: string[]): ColumnMapping`
  - `const FIELD_LABELS: Record<ProductField, string>` (for the mapping-dialog dropdown labels)

- [ ] **Step 1: Write the failing tests**

```typescript
// client/__tests__/product-import-export-mapping.test.ts
import { describe, it, expect } from "vitest";
import { detectColumnMapping } from "@/lib/utils/product-import-export";

describe("detectColumnMapping", () => {
  it("maps the first QuickBooks export's headers (Item Number, Item Name, Average Unit Cost, Regular Price, Department Name, Qty 1)", () => {
    const headers = [
      "Item Number",
      "Item Name",
      "Average Unit Cost",
      "Regular Price",
      "Department Name",
      "Qty 1",
    ];
    expect(detectColumnMapping(headers)).toEqual({
      "Item Number": "barcode",
      "Item Name": "name",
      "Average Unit Cost": "cost_price",
      "Regular Price": "selling_price",
      "Department Name": "category",
      "Qty 1": "quantity",
    });
  });

  it("maps the second QuickBooks export's headers, including Vendor Name and Reorder Point 1", () => {
    const headers = [
      "Item Number",
      "Item Name",
      "Average Unit Cost",
      "Regular Price",
      "Item Type",
      "Department Name",
      "Department Code",
      "Vendor Name",
      "Qty 1",
      "Reorder Point 1",
    ];
    const mapping = detectColumnMapping(headers);
    expect(mapping["Vendor Name"]).toBe("supplier");
    expect(mapping["Reorder Point 1"]).toBe("reorder_level");
    expect(mapping["Item Type"]).toBe("ignore");
    expect(mapping["Department Code"]).toBe("ignore");
  });

  it("maps the Moniebook CSV headers, taking only the first per-branch Stock/Available column", () => {
    const headers = [
      "SKU",
      "Item Name",
      "Category",
      "Cost Price",
      "Fixed Sell Price",
      "Supplier",
      "Barcode",
      "Available [Main branch]",
      "Stock [Main branch]",
      "Available [Enugu agidi 2]",
      "Stock [Enugu agidi 2]",
    ];
    const mapping = detectColumnMapping(headers);
    expect(mapping).toMatchObject({
      SKU: "barcode",
      "Item Name": "name",
      Category: "category",
      "Cost Price": "cost_price",
      "Fixed Sell Price": "selling_price",
      Supplier: "supplier",
      Barcode: "ignore", // SKU already claimed "barcode"; first match wins
      "Available [Main branch]": "quantity",
      "Stock [Main branch]": "ignore", // "quantity" already claimed
      "Available [Enugu agidi 2]": "ignore",
      "Stock [Enugu agidi 2]": "ignore",
    });
  });

  it("marks an unrecognized column as ignore instead of guessing", () => {
    const mapping = detectColumnMapping(["Some Custom Field"]);
    expect(mapping["Some Custom Field"]).toBe("ignore");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run __tests__/product-import-export-mapping.test.ts`
Expected: FAIL — `Cannot find module '@/lib/utils/product-import-export'`

- [ ] **Step 3: Implement the mapping engine**

```typescript
// client/lib/utils/product-import-export.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx vitest run __tests__/product-import-export-mapping.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd client
git add lib/utils/product-import-export.ts __tests__/product-import-export-mapping.test.ts
git commit -m "feat: add column-mapping engine for stock import"
```

---

### Task 3: Row mapping, numeric parsing, and file parsing

**Files:**
- Modify: `client/lib/utils/product-import-export.ts`
- Test: `client/__tests__/product-import-export-rows.test.ts`

**Interfaces:**
- Consumes: `ColumnMapping`, `ProductField` from Task 2.
- Produces:
  - `interface ProductImportRow { name: string; category?: string; supplier?: string; costPrice?: number; sellingPrice?: number; quantity?: number; reorderLevel?: number; barcode?: string }`
  - `function parseNumericValue(raw: unknown): number | undefined`
  - `function mapRowToProduct(row: Record<string, unknown>, mapping: ColumnMapping): ProductImportRow | null` (returns `null` when the row has no name — caller reports it as skipped)
  - `interface ParsedSpreadsheet { headers: string[]; rows: Record<string, unknown>[] }`
  - `function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet>` (uses `xlsx` from Task 1)

- [ ] **Step 1: Write the failing tests**

```typescript
// client/__tests__/product-import-export-rows.test.ts
import { describe, it, expect } from "vitest";
import {
  parseNumericValue,
  mapRowToProduct,
  detectColumnMapping,
} from "@/lib/utils/product-import-export";

describe("parseNumericValue", () => {
  it("parses plain numbers", () => {
    expect(parseNumericValue(1500)).toBe(1500);
    expect(parseNumericValue("1500")).toBe(1500);
  });

  it("strips currency symbols and thousands separators", () => {
    expect(parseNumericValue("₦1,500.00")).toBe(1500);
    expect(parseNumericValue("1,500")).toBe(1500);
  });

  it("returns undefined for blank or non-numeric input", () => {
    expect(parseNumericValue("")).toBeUndefined();
    expect(parseNumericValue(undefined)).toBeUndefined();
    expect(parseNumericValue("N/A")).toBeUndefined();
  });
});

describe("mapRowToProduct", () => {
  const headers = [
    "Item Number",
    "Item Name",
    "Average Unit Cost",
    "Regular Price",
    "Department Name",
    "Qty 1",
  ];
  const mapping = detectColumnMapping(headers);

  it("maps a real QuickBooks row into a ProductImportRow", () => {
    const row = {
      "Item Number": 114,
      "Item Name": "CYPRI GOLD SMALL SYRUP",
      "Average Unit Cost": 249.91497,
      "Regular Price": 1000,
      "Department Name": "DRUGS",
      "Qty 1": 3,
    };
    expect(mapRowToProduct(row, mapping)).toEqual({
      name: "CYPRI GOLD SMALL SYRUP",
      barcode: "114",
      costPrice: 249.91497,
      sellingPrice: 1000,
      category: "DRUGS",
      quantity: 3,
    });
  });

  it("returns null when the name is blank, so the caller can skip the row", () => {
    const row = { "Item Number": 999, "Item Name": "", "Qty 1": 5 };
    expect(mapRowToProduct(row, mapping)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run __tests__/product-import-export-rows.test.ts`
Expected: FAIL — `parseNumericValue`/`mapRowToProduct` are not exported

- [ ] **Step 3: Implement row mapping and file parsing**

Add to the top of `client/lib/utils/product-import-export.ts` (this is the first task to need `xlsx`; Task 6 reuses this same import):

```typescript
import * as XLSX from "xlsx";
```

Append the rest to `client/lib/utils/product-import-export.ts`:

```typescript
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

/** Reads a CSV/XLS/XLSX File (from an <input type="file">) into headers + row objects. */
export async function parseSpreadsheetFile(file: File): Promise<ParsedSpreadsheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const [headerRow] = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
  });
  return { headers: (headerRow || []).map(String), rows };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx vitest run __tests__/product-import-export-rows.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd client
git add lib/utils/product-import-export.ts __tests__/product-import-export-rows.test.ts
git commit -m "feat: add row mapping and spreadsheet file parsing for stock import"
```

---

### Task 4: In-file duplicate detection

**Files:**
- Create: `client/lib/db/queries/product-import.ts`
- Test: `client/__tests__/product-import-duplicates.test.ts`

**Interfaces:**
- Consumes: `ProductImportRow` from Task 3.
- Produces: `function findInFileDuplicates(rows: ProductImportRow[]): number[][]` — each inner array is a group of row indexes (0-based, into the original `rows` array) that would collide on import.

- [ ] **Step 1: Write the failing test**

```typescript
// client/__tests__/product-import-duplicates.test.ts
import { describe, it, expect } from "vitest";
import { findInFileDuplicates } from "@/lib/db/queries/product-import";
import type { ProductImportRow } from "@/lib/utils/product-import-export";

describe("findInFileDuplicates", () => {
  it("flags two rows with the same name and category", () => {
    const rows: ProductImportRow[] = [
      { name: "PARACETAMOL", category: "DRUGS" },
      { name: "paracetamol", category: "drugs" }, // case-insensitive match
      { name: "IBUPROFEN", category: "DRUGS" },
    ];
    expect(findInFileDuplicates(rows)).toEqual([[0, 1]]);
  });

  it("does not flag the same name in different categories", () => {
    const rows: ProductImportRow[] = [
      { name: "PARACETAMOL", category: "DRUGS" },
      { name: "PARACETAMOL", category: "OTC" },
    ];
    expect(findInFileDuplicates(rows)).toEqual([]);
  });

  it("flags same-name rows when no category was mapped at all", () => {
    const rows: ProductImportRow[] = [
      { name: "PARACETAMOL" },
      { name: "PARACETAMOL" },
    ];
    expect(findInFileDuplicates(rows)).toEqual([[0, 1]]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/product-import-duplicates.test.ts`
Expected: FAIL — `Cannot find module '@/lib/db/queries/product-import'`

- [ ] **Step 3: Implement it**

```typescript
// client/lib/db/queries/product-import.ts
import type { ProductImportRow } from "@/lib/utils/product-import-export";

/**
 * Groups row indexes that would collide on import (same dedupe key as
 * importProductRows: name+category, or name alone when no category was
 * mapped). Two rows in the same group would both match the same existing/new
 * product, silently merging what may be two distinct products — the caller
 * surfaces this as a pre-flight warning instead of writing it silently.
 */
export function findInFileDuplicates(rows: ProductImportRow[]): number[][] {
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = `${row.name.trim().toLowerCase()}::${(row.category || "").trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) {
      group.push(index);
    } else {
      groups.set(key, [index]);
    }
  });
  return [...groups.values()].filter((group) => group.length > 1);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/product-import-duplicates.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd client
git add lib/db/queries/product-import.ts __tests__/product-import-duplicates.test.ts
git commit -m "feat: detect in-file name+category collisions before stock import"
```

---

### Task 5: Import DB layer (dedupe, resolve, upsert, transaction)

**Files:**
- Modify: `client/lib/db/queries/product-import.ts`
- Test: `client/__tests__/product-import-upsert.test.ts`

**Interfaces:**
- Consumes:
  - `ProductImportRow` from Task 3.
  - `query`, `transaction` from `@/lib/db/local-database` (re-exports `./core`).
  - `insert`, `update` from `@/lib/db/local-database` (re-exports `./base-helpers`).
  - `getActiveStoreId` from `@/lib/db/local-database` (re-exports `./core`).
  - `getCategoryByName`, `getSupplierByName` from `@/lib/db/queries/products`.
  - `createSupplier` from `@/lib/db/local-database` (re-exports `./procurement`).
- Produces:
  - `interface ImportResult { created: number; updated: number; skipped: { row: number; reason: string }[] }`
  - `function importProductRows(rows: ProductImportRow[]): Promise<ImportResult>`

- [ ] **Step 1: Write the failing tests**

```typescript
// client/__tests__/product-import-upsert.test.ts
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("importProductRows", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let importProductRows: typeof import("@/lib/db/queries/product-import").importProductRows;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ importProductRows } = await import("@/lib/db/queries/product-import"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM products; DELETE FROM categories; DELETE FROM suppliers;
      DELETE FROM stock_batches; DELETE FROM _sync_queue;
    `);
  });

  it("creates a new product plus one opening-stock batch, and resolves/creates its category and supplier", async () => {
    const result = await importProductRows([
      {
        name: "CYPRI GOLD SMALL SYRUP",
        category: "DRUGS",
        supplier: "System",
        costPrice: 249.91,
        sellingPrice: 1000,
        quantity: 3,
        barcode: "114",
      },
    ]);

    expect(result).toEqual({ created: 1, updated: 0, skipped: [] });

    const products = db.exec(
      `SELECT p.name, p.selling_price, p.barcode, c.name as category_name
       FROM products p LEFT JOIN categories c ON c.id = p.category_id`,
    );
    expect(products[0].values[0]).toEqual([
      "CYPRI GOLD SMALL SYRUP",
      1000,
      "114",
      "DRUGS",
    ]);

    const batches = db.exec(
      `SELECT sb.quantity, sb.cost_price, sb.batch_number, sb.expiry_date, s.name as supplier_name
       FROM stock_batches sb LEFT JOIN suppliers s ON s.id = sb.supplier_id`,
    );
    expect(batches[0].values[0]).toEqual([3, 249.91, null, null, "System"]);
  });

  it("updates an existing product matched by barcode without creating a second batch", async () => {
    db.run(
      `INSERT INTO products (id, name, barcode, selling_price, _deleted) VALUES ('p1', 'OLD NAME', '114', 500, 0)`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, _deleted, is_active) VALUES ('b1', 'p1', 10, 0, 1)`,
    );

    const result = await importProductRows([
      { name: "CYPRI GOLD SMALL SYRUP", sellingPrice: 1000, quantity: 3, barcode: "114" },
    ]);

    expect(result).toEqual({ created: 0, updated: 1, skipped: [] });

    const products = db.exec(`SELECT name, selling_price FROM products WHERE id = 'p1'`);
    expect(products[0].values[0]).toEqual(["CYPRI GOLD SMALL SYRUP", 1000]);

    const batchCount = db.exec(`SELECT COUNT(*) FROM stock_batches WHERE product_id = 'p1'`);
    expect(batchCount[0].values[0][0]).toBe(1); // still just the original batch
  });

  it("treats the same name in different categories as distinct products", async () => {
    db.run(`INSERT INTO categories (id, name, _deleted) VALUES ('c1', 'DRUGS', 0)`);
    db.run(
      `INSERT INTO products (id, name, category_id, _deleted) VALUES ('p1', 'PARACETAMOL', 'c1', 0)`,
    );

    const result = await importProductRows([
      { name: "PARACETAMOL", category: "OTC", quantity: 5 },
    ]);

    expect(result.created).toBe(1);
    const count = db.exec(`SELECT COUNT(*) FROM products WHERE name = 'PARACETAMOL'`);
    expect(count[0].values[0][0]).toBe(2);
  });

  it("reports a skipped row without throwing when the name is blank", async () => {
    const result = await importProductRows([{ name: "" }]);
    expect(result).toEqual({
      created: 0,
      updated: 0,
      skipped: [{ row: 0, reason: "Missing product name" }],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd client && npx vitest run __tests__/product-import-upsert.test.ts`
Expected: FAIL — `importProductRows` is not exported

- [ ] **Step 3: Implement it**

Append to `client/lib/db/queries/product-import.ts`:

```typescript
import { query, transaction, getActiveStoreId, insert, update, createSupplier } from "@/lib/db/local-database";
import { getCategoryByName, getSupplierByName } from "@/lib/db/queries/products";
import type { ProductImportRow } from "@/lib/utils/product-import-export";

async function resolveCategoryId(name: string | undefined): Promise<string | undefined> {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  const existing = await getCategoryByName(trimmed);
  if (existing) return existing;
  return await insert("categories", { name: trimmed });
}

async function resolveSupplierId(name: string | undefined): Promise<string | undefined> {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  const existing = await getSupplierByName(trimmed);
  if (existing) return existing;
  return await createSupplier({ name: trimmed });
}

async function findExistingProductId(
  row: ProductImportRow,
): Promise<string | null> {
  const storeId = getActiveStoreId();
  if (row.barcode) {
    const byBarcode = await query<{ id: string }>(
      `SELECT id FROM products WHERE barcode = ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""} LIMIT 1`,
      storeId ? [row.barcode, storeId] : [row.barcode],
    );
    if (byBarcode.length > 0) return byBarcode[0].id;
  }

  if (row.category) {
    const byNameAndCategory = await query<{ id: string }>(
      `SELECT p.id FROM products p LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.name = ? COLLATE NOCASE AND c.name = ? COLLATE NOCASE AND p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
       LIMIT 1`,
      storeId ? [row.name, row.category, storeId] : [row.name, row.category],
    );
    return byNameAndCategory[0]?.id ?? null;
  }

  const byNameOnly = await query<{ id: string }>(
    `SELECT id FROM products WHERE name = ? COLLATE NOCASE AND _deleted = 0${storeId ? " AND store_id = ?" : ""} LIMIT 1`,
    storeId ? [row.name, storeId] : [row.name],
  );
  return byNameOnly[0]?.id ?? null;
}

export interface ImportResult {
  created: number;
  updated: number;
  skipped: { row: number; reason: string }[];
}

/**
 * Upserts every row inside a single transaction. Matched products only have
 * their fields updated — existing stock_batches are never touched, so
 * re-running the same import twice can't double-count quantity (see
 * docs/superpowers/specs/2026-08-31-stock-import-export-design.md).
 */
export async function importProductRows(rows: ProductImportRow[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, updated: 0, skipped: [] };

  await transaction(async () => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.name) {
        result.skipped.push({ row: i, reason: "Missing product name" });
        continue;
      }

      const categoryId = await resolveCategoryId(row.category);
      const existingId = await findExistingProductId(row);

      if (existingId) {
        await update("products", existingId, {
          name: row.name,
          ...(categoryId ? { category_id: categoryId } : {}),
          ...(row.sellingPrice !== undefined ? { selling_price: row.sellingPrice } : {}),
          ...(row.reorderLevel !== undefined ? { reorder_level: row.reorderLevel } : {}),
          ...(row.barcode ? { barcode: row.barcode } : {}),
        });
        result.updated++;
        continue;
      }

      const productId = await insert("products", {
        name: row.name,
        category_id: categoryId,
        selling_price: row.sellingPrice ?? 0,
        reorder_level: row.reorderLevel ?? 10,
        barcode: row.barcode,
      });

      if (row.quantity !== undefined && row.quantity !== 0) {
        const supplierId = await resolveSupplierId(row.supplier);
        await insert("stock_batches", {
          product_id: productId,
          batch_number: null,
          expiry_date: null,
          quantity: row.quantity,
          cost_price: row.costPrice ?? null,
          supplier_id: supplierId,
          is_active: 1,
        });
      }

      result.created++;
    }
  });

  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && npx vitest run __tests__/product-import-upsert.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd client
git add lib/db/queries/product-import.ts __tests__/product-import-upsert.test.ts
git commit -m "feat: add dedupe/upsert DB layer for stock import"
```

---

### Task 6: Export query + workbook builder

**Files:**
- Create: `client/lib/db/queries/product-export.ts`
- Modify: `client/lib/utils/product-import-export.ts`
- Test: `client/__tests__/product-export.test.ts`

**Interfaces:**
- Consumes: `query`, `getActiveStoreId` from `@/lib/db/local-database`.
- Produces:
  - `interface ExportableProduct { name: string; category: string; supplier: string; barcode: string; costPrice: number; sellingPrice: number; quantity: number; reorderLevel: number }`
  - `function getProductsForExport(): Promise<ExportableProduct[]>` (in `product-export.ts`)
  - `const EXPORT_COLUMNS: { key: keyof ExportableProduct; label: string }[]` (in `product-import-export.ts`)
  - `function buildExportBlob(products: ExportableProduct[], columns: (keyof ExportableProduct)[], format: "csv" | "xlsx"): Blob` (in `product-import-export.ts`)

- [ ] **Step 1: Write the failing test**

```typescript
// client/__tests__/product-export.test.ts
import { describe, it, expect } from "vitest";
import { EXPORT_COLUMNS, buildExportBlob } from "@/lib/utils/product-import-export";
import type { ExportableProduct } from "@/lib/db/queries/product-export";

describe("buildExportBlob", () => {
  const products: ExportableProduct[] = [
    {
      name: "CYPRI GOLD SMALL SYRUP",
      category: "DRUGS",
      supplier: "System",
      barcode: "114",
      costPrice: 700,
      sellingPrice: 1000,
      quantity: 5,
      reorderLevel: 2,
    },
  ];

  it("includes every EXPORT_COLUMNS label by default", () => {
    const allKeys = EXPORT_COLUMNS.map((c) => c.key);
    const blob = buildExportBlob(products, allKeys, "csv");
    expect(blob.type).toContain("text/csv");
  });

  it("only includes the selected columns, in the fixed EXPORT_COLUMNS order (not selection order)", async () => {
    const blob = buildExportBlob(products, ["sellingPrice", "name"], "csv");
    const text = await blob.text();
    const [header] = text.trim().split("\n");
    expect(header).toBe("Product Name,Selling Price");
  });

  it("produces an xlsx blob with the correct MIME type", () => {
    const blob = buildExportBlob(products, ["name"], "xlsx");
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/product-export.test.ts`
Expected: FAIL — `EXPORT_COLUMNS`/`buildExportBlob` not exported, and `@/lib/db/queries/product-export` doesn't exist

- [ ] **Step 3: Implement the export query**

```typescript
// client/lib/db/queries/product-export.ts
import { query, getActiveStoreId } from "@/lib/db/local-database";

export interface ExportableProduct {
  name: string;
  category: string;
  supplier: string;
  barcode: string;
  costPrice: number;
  sellingPrice: number;
  quantity: number;
  reorderLevel: number;
}

/**
 * One row per product. Supplier comes from whichever active batch happens to
 * be picked by SQLite's GROUP BY when a product has batches from more than
 * one supplier — acceptable for an export snapshot; batch-level supplier
 * detail is already visible in Batch Management.
 */
export async function getProductsForExport(): Promise<ExportableProduct[]> {
  const storeId = getActiveStoreId();
  const rows = await query<{
    name: string;
    category_name: string | null;
    supplier_name: string | null;
    barcode: string | null;
    cost_price: number | null;
    selling_price: number | null;
    stock_quantity: number | null;
    reorder_level: number | null;
  }>(
    `SELECT p.name, c.name as category_name, s.name as supplier_name, p.barcode,
       (SELECT AVG(sb.cost_price) FROM stock_batches sb WHERE sb.product_id = p.id AND sb._deleted = 0 AND sb.is_active = 1) as cost_price,
       p.selling_price,
       (SELECT SUM(sb.quantity) FROM stock_batches sb WHERE sb.product_id = p.id AND sb._deleted = 0 AND sb.is_active = 1) as stock_quantity,
       p.reorder_level
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN stock_batches sb2 ON sb2.product_id = p.id AND sb2._deleted = 0 AND sb2.is_active = 1
     LEFT JOIN suppliers s ON s.id = sb2.supplier_id
     WHERE p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
     GROUP BY p.id
     ORDER BY p.name ASC`,
    storeId ? [storeId] : [],
  );

  return rows.map((r) => ({
    name: r.name,
    category: r.category_name || "",
    supplier: r.supplier_name || "",
    barcode: r.barcode || "",
    costPrice: r.cost_price || 0,
    sellingPrice: r.selling_price || 0,
    quantity: r.stock_quantity || 0,
    reorderLevel: r.reorder_level || 0,
  }));
}
```

- [ ] **Step 4: Implement the workbook builder**

Append to `client/lib/utils/product-import-export.ts` (the `xlsx` import already sits at the top of this file from Task 3 — only add the `ExportableProduct` type import here):

```typescript
import type { ExportableProduct } from "@/lib/db/queries/product-export";

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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd client && npx vitest run __tests__/product-export.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
cd client
git add lib/db/queries/product-export.ts lib/utils/product-import-export.ts __tests__/product-export.test.ts
git commit -m "feat: add product export query and CSV/XLSX workbook builder"
```

---

### Task 7: Export dialog with optional column picker (remembers last selection)

**Files:**
- Create: `client/components/stock-batch/export-columns-dialog.tsx`
- Test: `client/__tests__/export-column-selection.test.ts`

**Interfaces:**
- Consumes: `EXPORT_COLUMNS` from `@/lib/utils/product-import-export`; `Checkbox` from `@/components/ui/checkbox`; `ResponsiveModal` from `@/components/ui/responsive-modal`; `Button` from `@/components/ui/button`.
- Produces:
  - `function getStoredExportColumns(): (keyof ExportableProduct)[] | null` and `function setStoredExportColumns(columns: (keyof ExportableProduct)[]): void` — plain localStorage helpers, exported from the same file so Task 8 can read the last selection without opening the dialog.
  - `function ExportColumnsDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; onConfirm: (columns: (keyof ExportableProduct)[]) => void })`

- [ ] **Step 1: Write the failing test (for the localStorage helpers — the dialog itself is verified manually in Task 9, matching how `manage-categories-dialog.tsx` and other dialogs in this codebase have no dedicated render test)**

```typescript
// client/__tests__/export-column-selection.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredExportColumns,
  setStoredExportColumns,
} from "@/components/stock-batch/export-columns-dialog";

describe("export column selection persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when nothing has been stored yet", () => {
    expect(getStoredExportColumns()).toBeNull();
  });

  it("round-trips a stored selection", () => {
    setStoredExportColumns(["name", "sellingPrice"]);
    expect(getStoredExportColumns()).toEqual(["name", "sellingPrice"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && npx vitest run __tests__/export-column-selection.test.ts`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement the dialog + persistence helpers**

```typescript
// client/components/stock-batch/export-columns-dialog.tsx
"use client";

import { useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EXPORT_COLUMNS } from "@/lib/utils/product-import-export";
import type { ExportableProduct } from "@/lib/db/queries/product-export";

const STORAGE_KEY = "drx_export_columns";

export function getStoredExportColumns(): (keyof ExportableProduct)[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredExportColumns(columns: (keyof ExportableProduct)[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
}

interface ExportColumnsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (columns: (keyof ExportableProduct)[]) => void;
}

export function ExportColumnsDialog({
  open,
  onOpenChange,
  onConfirm,
}: ExportColumnsDialogProps) {
  const allKeys = EXPORT_COLUMNS.map((c) => c.key);
  const [selected, setSelected] = useState<Set<keyof ExportableProduct>>(
    () => new Set(getStoredExportColumns() ?? allKeys),
  );

  const toggle = (key: keyof ExportableProduct) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleConfirm = () => {
    const columns = EXPORT_COLUMNS.map((c) => c.key).filter((key) =>
      selected.has(key),
    );
    setStoredExportColumns(columns);
    onConfirm(columns);
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Choose columns to export"
      footer={
        <div className="flex justify-end gap-2 p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selected.size === 0}>
            Export
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {EXPORT_COLUMNS.map((column) => (
          <div key={column.key} className="flex items-center gap-2">
            <Checkbox
              id={`export-col-${column.key}`}
              checked={selected.has(column.key)}
              onCheckedChange={() => toggle(column.key)}
            />
            <Label htmlFor={`export-col-${column.key}`}>{column.label}</Label>
          </div>
        ))}
      </div>
    </ResponsiveModal>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd client && npx vitest run __tests__/export-column-selection.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd client
git add components/stock-batch/export-columns-dialog.tsx __tests__/export-column-selection.test.ts
git commit -m "feat: add export column-picker dialog with persisted selection"
```

---

### Task 8: Import mapping dialog

**Files:**
- Create: `client/components/stock-batch/import-mapping-dialog.tsx`

**Interfaces:**
- Consumes:
  - `parseSpreadsheetFile`, `detectColumnMapping`, `mapRowToProduct`, `FIELD_LABELS`, `ColumnMapping`, `ProductField`, `ProductImportRow` from `@/lib/utils/product-import-export`.
  - `findInFileDuplicates`, `importProductRows`, `ImportResult` from `@/lib/db/queries/product-import`.
  - `ResponsiveModal` from `@/components/ui/responsive-modal`; `Combobox` from `@/components/ui/combobox`; `Button` from `@/components/ui/button`; `toast` from `sonner`.
- Produces: `function ImportMappingDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; onImported: () => void })` — `onImported` is called after a successful import so the caller (Task 9's toolbar, mounted inside `ProductDatabase`) can `refetch()` the product list the same way `AddProductDialog`'s `onAddProduct` already does.

This task has no automated test: it's a thin orchestration layer over the already-tested pure functions (Tasks 2–3) and DB layer (Tasks 4–5), the same way `manage-categories-dialog.tsx` and `add-product-dialog.tsx` have no dedicated render tests in this codebase. It's verified manually in Task 10 against the real QuickBooks file.

- [ ] **Step 1: Implement the dialog**

```typescript
// client/components/stock-batch/import-mapping-dialog.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Upload, AlertTriangle } from "lucide-react";
import {
  parseSpreadsheetFile,
  detectColumnMapping,
  mapRowToProduct,
  FIELD_LABELS,
  type ColumnMapping,
  type ProductField,
  type ProductImportRow,
} from "@/lib/utils/product-import-export";
import {
  findInFileDuplicates,
  importProductRows,
  type ImportResult,
} from "@/lib/db/queries/product-import";

type Step = "pick-file" | "map-columns" | "result";

interface ImportMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const FIELD_OPTIONS = Object.entries(FIELD_LABELS).map(
  ([value, label]) => `${label}`,
);
const LABEL_TO_FIELD: Record<string, ProductField> = Object.fromEntries(
  Object.entries(FIELD_LABELS).map(([field, label]) => [label, field as ProductField]),
);

export function ImportMappingDialog({
  open,
  onOpenChange,
  onImported,
}: ImportMappingDialogProps) {
  const [step, setStep] = useState<Step>("pick-file");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setStep("pick-file");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
  };

  const handleFile = async (file: File) => {
    const parsed = await parseSpreadsheetFile(file);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(detectColumnMapping(parsed.headers));
    setStep("map-columns");
  };

  const mappedRows = (): ProductImportRow[] =>
    rows
      .map((row) => mapRowToProduct(row, mapping))
      .filter((row): row is ProductImportRow => row !== null);

  const handleConfirmImport = async () => {
    const validRows = mappedRows();
    const duplicateGroups = findInFileDuplicates(validRows);
    if (duplicateGroups.length > 0) {
      const proceed = window.confirm(
        `${duplicateGroups.length} product name(s) appear more than once in this file with the same category. Importing anyway will merge them into one product (last row wins). Continue?`,
      );
      if (!proceed) return;
    }

    setImporting(true);
    try {
      const importResult = await importProductRows(validRows);
      setResult(importResult);
      setStep("result");
      onImported();
    } catch (err) {
      console.error("Failed to import products:", err);
      toast.error("Import failed. No changes were saved.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Import products"
      description="Upload a CSV or XLS/XLSX file exported from QuickBooks, Moniebook, or DumosRx."
    >
      <div className="flex flex-col gap-4 p-4">
        {step === "pick-file" && (
          <div className="relative">
            <Button variant="outline" asChild className="cursor-pointer">
              <label htmlFor="product-import-file">
                <Upload className="w-4 h-4 mr-2" />
                Select CSV or XLS/XLSX File
              </label>
            </Button>
            <input
              type="file"
              id="product-import-file"
              className="hidden"
              accept=".csv,.xls,.xlsx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        )}

        {step === "map-columns" && (
          <>
            <p className="text-sm text-muted-foreground">
              We matched {Object.values(mapping).filter((f) => f !== "ignore").length} of{" "}
              {headers.length} columns automatically. Review or correct any below.
            </p>
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-3">
                  <span className="w-1/2 text-sm truncate" title={header}>
                    {header}
                  </span>
                  <Combobox
                    options={FIELD_OPTIONS}
                    value={FIELD_LABELS[mapping[header]]}
                    onChange={(label) =>
                      setMapping((prev) => ({
                        ...prev,
                        [header]: LABEL_TO_FIELD[label],
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {rows.length} row(s) will be imported; rows without a mapped Product Name are skipped.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              <Button onClick={handleConfirmImport} disabled={importing}>
                {importing ? "Importing..." : `Import ${rows.length} Row(s)`}
              </Button>
            </div>
          </>
        )}

        {step === "result" && result && (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <strong>{result.created}</strong> product(s) created,{" "}
              <strong>{result.updated}</strong> updated,{" "}
              <strong>{result.skipped.length}</strong> skipped.
            </p>
            {result.skipped.length > 0 && (
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto text-xs text-muted-foreground">
                {result.skipped.map((s) => (
                  <div key={s.row} className="flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    Row {s.row + 1}: {s.reason}
                  </div>
                ))}
              </div>
            )}
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors in `import-mapping-dialog.tsx`

- [ ] **Step 3: Commit**

```bash
cd client
git add components/stock-batch/import-mapping-dialog.tsx
git commit -m "feat: add import column-mapping dialog"
```

---

### Task 9: Import/Export toolbar, wired into the Catalog toolbar

**Files:**
- Create: `client/components/stock-batch/import-export-toolbar.tsx`
- Modify: `client/components/products/product-database-filters.tsx`
- Modify: `client/components/products/product-database.tsx`

**Interfaces:**
- Consumes: `ImportMappingDialog` (Task 8), `ExportColumnsDialog` (Task 7), `getProductsForExport` (Task 6), `buildExportBlob`, `EXPORT_COLUMNS` (Task 6), `downloadBlob` from `@/lib/utils/report-pdf`, `DropdownMenu`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuTrigger` from `@/components/ui/dropdown-menu`.
- Produces: `function ImportExportToolbar(props: { onImported: () => void })` — mounted once inside `ProductDatabaseFilters`.

- [ ] **Step 1: Implement the toolbar**

```typescript
// client/components/stock-batch/import-export-toolbar.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadBlob } from "@/lib/utils/report-pdf";
import { EXPORT_COLUMNS, buildExportBlob } from "@/lib/utils/product-import-export";
import { getProductsForExport, type ExportableProduct } from "@/lib/db/queries/product-export";
import { ImportMappingDialog } from "./import-mapping-dialog";
import { ExportColumnsDialog, getStoredExportColumns } from "./export-columns-dialog";

interface ImportExportToolbarProps {
  onImported: () => void;
}

export function ImportExportToolbar({ onImported }: ImportExportToolbarProps) {
  const [showImport, setShowImport] = useState(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<"csv" | "xlsx" | null>(null);

  const runExport = async (
    format: "csv" | "xlsx",
    columns: (keyof ExportableProduct)[],
  ) => {
    const products = await getProductsForExport();
    const blob = buildExportBlob(products, columns, format);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `DumosRx_Products_${dateStr}.${format}`);
    toast.success(`Exported ${products.length} product(s)`);
  };

  const handleExportClick = (format: "csv" | "xlsx", chooseColumns: boolean) => {
    if (chooseColumns) {
      setPendingFormat(format);
      setShowColumnPicker(true);
      return;
    }
    runExport(format, EXPORT_COLUMNS.map((c) => c.key));
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-[12px]"
        onClick={() => setShowImport(true)}
      >
        <Upload className="h-3.5 w-3.5" />
        Import
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-[12px]">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleExportClick("csv", false)}>
            Export as CSV (all columns)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("xlsx", false)}>
            Export as XLSX (all columns)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("csv", true)}>
            Export as CSV (choose columns)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExportClick("xlsx", true)}>
            Export as XLSX (choose columns)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportMappingDialog
        open={showImport}
        onOpenChange={setShowImport}
        onImported={onImported}
      />

      <ExportColumnsDialog
        open={showColumnPicker}
        onOpenChange={setShowColumnPicker}
        onConfirm={(columns) => {
          if (pendingFormat) runExport(pendingFormat, columns);
          setPendingFormat(null);
        }}
      />
    </>
  );
}
```

Note: `getStoredExportColumns` is imported for parity with Task 7's exports but isn't called directly here — `ExportColumnsDialog` already reads it internally to pre-fill its checklist. Remove the unused import if `tsc`/lint flags it.

- [ ] **Step 2: Wire it into the Catalog toolbar**

In `client/components/products/product-database-filters.tsx`, add the import and render the toolbar next to the existing "Manage" button:

```typescript
import { ImportExportToolbar } from "@/components/stock-batch/import-export-toolbar";
```

```typescript
interface ProductDatabaseFiltersProps {
  // ...existing props...
  onManageCategories: () => void;
  onProductsImported: () => void;
}
```

Change the first `<div className="flex items-center gap-2">` block to:

```typescript
      <div className="flex items-center gap-2">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search by name or SKU"
        />
        <ImportExportToolbar onImported={onProductsImported} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5 text-[12px]"
          onClick={onManageCategories}
        >
          <Settings2 className="h-3.5 w-3.5" />
          Manage
        </Button>
      </div>
```

- [ ] **Step 3: Pass the new prop from `product-database.tsx`**

In `client/components/products/product-database.tsx`, find the `<ProductDatabaseFilters ... />` call and add:

```typescript
          <ProductDatabaseFilters
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            categories={categories}
            statuses={statuses}
            onManageCategories={() => setShowManageCategories(true)}
            onProductsImported={refetch}
          />
```

(`refetch` already exists in this component from the `useQuery` call for `getProductsWithDetails` — the same function `useAddProduct`'s `refetch` prop already uses.)

- [ ] **Step 4: Type-check**

Run: `cd client && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Manually verify in the running app**

Run: `cd client && npm run dev`, open the Inventory → Catalog tab, confirm the Import and Export buttons render next to "Manage" on desktop.

- [ ] **Step 6: Commit**

```bash
cd client
git add components/stock-batch/import-export-toolbar.tsx components/products/product-database-filters.tsx components/products/product-database.tsx
git commit -m "feat: wire import/export toolbar into the product catalog page"
```

---

### Task 10: End-to-end verification with the real QuickBooks file

**Files:** none (manual verification only)

- [ ] **Step 1: Start the app**

Run: `cd client && npm run dev`, open the Inventory → Catalog tab.

- [ ] **Step 2: Import the real QuickBooks file**

Click Import, select `refs/client-requirement-meeting-with-ada-27082026/exports/QB-export-POS-Inventory-Items-Export.xls` (rename or copy to `.xlsx` first if the file picker's `accept=".csv,.xls,.xlsx"` rejects the double-zipped `.xls`-named xlsx — if so, note this as a follow-up: browsers key the accept filter off the file extension, and this file is xlsx content with an `.xls` extension). Confirm the mapping screen auto-maps Item Number→Barcode, Item Name→Product Name, Average Unit Cost→Cost Price, Regular Price→Selling Price, Department Name→Category, Qty 1→Stock Quantity with no manual correction needed. Import and confirm the result summary shows ~1500 created, 0 skipped (barring genuinely blank-name rows).

- [ ] **Step 3: Re-import the same file**

Repeat the import with the identical file. Confirm the result summary shows 0 created, ~1500 updated, and that stock quantities in the Catalog list did not double.

- [ ] **Step 4: Export and inspect**

Click Export → "Export as XLSX (all columns)", open the downloaded file, and confirm it contains the imported products with correct values. Then try "Export as CSV (choose columns)", uncheck a few columns, confirm the CSV only has the selected columns in `EXPORT_COLUMNS` order, and re-open the column picker to confirm the unchecked columns are still unchecked (persisted).

- [ ] **Step 5: Run the full test suite**

Run: `cd client && npm test`
Expected: all tests pass, including every test added in Tasks 2–7.

- [ ] **Step 6: Report findings**

If the `.xls`-extension-but-xlsx-content issue from Step 2 is real, note it as a known follow-up (e.g. loosen the `accept` attribute or sniff file content) rather than fixing it silently — surface it to the user before considering this plan done, since spec explicitly names that exact reference file as the primary use case.
