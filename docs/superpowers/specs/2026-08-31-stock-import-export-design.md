# Stock Import/Export (CSV & XLS/XLSX)

**Date:** 2026-08-31
**Status:** Approved design, pending implementation plan

## Background

Ada (prospective client, "Nest Pharmacy") currently runs QuickBooks POS. To
convince her to migrate, the Stock/Procurement pages need import/export that
removes the friction of re-entering ~1500+ inventory items by hand.

Reference files reviewed (`refs/client-requirement-meeting-with-ada-27082026/`
and `refs/client-requirement-meeting-with-ada-04082026/`):

- `QB-export-POS-Inventory-Items-Export.xls` — QuickBooks export, columns:
  `Item Number, Item Name, Average Unit Cost, Regular Price, Department Name, Qty 1`.
- `QB-POS-Inventory-Items-Export-105544.xls` — a second QB export with a
  different column set: `Item Number, Item Name, Average Unit Cost,
  Regular Price, Item Type, Department Name, Department Code, Vendor Name,
  Qty 1, Reorder Point 1`.
- `QB-export-templates-1.png` / `-2.png` — QuickBooks' own "Export Templates"
  dialog: a checklist letting the user pick which fields to export, in any
  order. This is the source of Ada's confusion (different export runs can
  produce different column sets).
- `MB-inventory-2026-08-04-105444.csv` — a Moniebook (competitor) export,
  with a large fixed column set including per-branch columns like
  `Stock [Main branch]`, `Stock [Enugu agidi 2]`, `Available [...]`, etc.
- `MB-Inventory-List-Screen*.png` — Moniebook's "All items" screen, which has
  a "More actions" button next to "+ Add item" (import/export entry point
  pattern to emulate).

Key constraint discovered in our own schema
(`client/lib/db/schema.ts`): DumosRx is **single-store-per-database**
(offline-first, syncing SQLite). There is no multi-branch stock column on
`products` — stock lives in a separate `stock_batches` table (one row per
batch: `batch_number`, `expiry_date`, `cost_price`, `quantity`, `supplier_id`,
all nullable except quantity/product linkage). A product's total stock is the
sum of its active batches. This means Moniebook's per-branch stock columns
don't map 1:1 into our model — we only need one quantity per product.

No CSV/XLSX libraries are currently installed
(`client/package.json` has no `xlsx`, `papaparse`, `exceljs`, etc.), and no
import feature exists anywhere in the codebase today. CSV export exists only
for staff/reports, via hand-rolled string building
(`client/lib/utils/export-staff-csv.ts`) — not reused here since we need real
XLSX support, which requires a proper library.

## Goals

- Let Ada import her QuickBooks (or Moniebook, or our own) export with
  minimal manual work, regardless of which columns that export happens to
  contain.
- Let her export DumosRx stock data as CSV or XLSX, either as a complete
  fixed file or a user-chosen subset of columns.
- Make repeated imports of the same/updated file safe (idempotent), so she
  can re-sync from QuickBooks multiple times during a transition period.

## Non-goals

- Multi-branch/multi-location stock. Out of scope until DumosRx supports
  multiple stores per database.
- Importing batch-level detail (expiry dates, per-batch cost) — source
  systems don't export this; imported quantity becomes a single "opening
  stock" batch.
- Server-side processing. Everything runs client-side; this is an
  offline-first app with no reason to round-trip a spreadsheet through a
  server.

## Architecture

Single approach (not a 2-3-way tradeoff — the offline-first, single-store
architecture already settles this):

- **Library:** [SheetJS (`xlsx`)](https://www.npmjs.com/package/xlsx) for
  reading and writing CSV, XLS, and XLSX — one dependency covers both
  directions and all three formats, avoiding a separate CSV parser.
- **Everything client-side.** No server endpoint. Parsing, mapping,
  validation, and DB writes happen in the browser process against the local
  SQLite instance via existing query helpers.

## Components

### New files

- `client/lib/utils/product-import-export.ts`
  - Alias dictionary mapping known header strings (from QuickBooks, Moniebook,
    and our own export format) to internal field keys.
  - `detectColumnMapping(headers: string[]): ColumnMapping` — best-effort
    auto-mapping using the alias dictionary (case-insensitive, trims
    brackets like `Stock [Main branch]` → treated as `Stock`).
  - `parseWorkbook(file: File): { headers, rows }` — via `xlsx`.
  - `buildExportWorkbook(products, columns, format): Blob` — via `xlsx`.
  - `mapRowToProduct(row, mapping): ProductImportRow` — pure function, unit
    testable independent of the DB.

- `client/components/stock-batch/import-export-toolbar.tsx`
  - Two buttons: **Import**, **Export ▾** (dropdown: CSV / XLSX + "Choose
    columns" toggle). Shared by the stock-batch and procurement pages,
    following the existing toolbar pattern in `product-database-filters.tsx`
    and the `DropdownMenu` pattern in `report-center.tsx`.

- `client/components/stock-batch/import-mapping-dialog.tsx`
  - Step 1: file picker/drop zone.
  - Step 2: mapping table — "Column in file → maps to" — auto-filled from
    `detectColumnMapping`, each row has a combobox (reusing
    `client/components/ui/combobox.tsx`) to correct or set "Ignore".
  - Step 3: preview of first 5 mapped rows + pre-flight validation warnings
    (see Validation below).
  - Step 4: confirm → runs the import, shows a result summary (created /
    updated / skipped, with reasons).

- `client/components/stock-batch/export-columns-dialog.tsx`
  - Only shown if "Choose columns" is checked. Checklist of all exportable
    product fields, all pre-checked by default. Selection is persisted to
    local per-store settings (not synced) and reused as the default next
    time; resets to all-checked only the first time it's ever opened.

### Modified files

- `client/lib/db/queries/products.ts` — add bulk upsert helpers:
  `upsertProductsFromImport(rows: ProductImportRow[])`, plus
  `findOrCreateCategoryByName`, `findOrCreateSupplierByName` (or reuse
  existing helpers if equivalents already exist there).
- `client/components/stock-batch/stock-batch-management.tsx` and
  `client/components/procurement/procurement-management.tsx` — mount
  `import-export-toolbar.tsx` in their header rows.

## Data flow — Import

1. User picks a file → `parseWorkbook` extracts header row + data rows.
2. `detectColumnMapping` proposes a mapping using the alias dictionary,
   seeded with the exact header strings seen in the QuickBooks and Moniebook
   files above (`Item Name`, `Item Number`, `Average Unit Cost`,
   `Regular Price`, `Department Name`, `Vendor Name`, `Qty 1`,
   `Reorder Point 1`, `SKU`, `Cost Price`, `Category`, `Barcode`, `Stock
   [...]`/`Available [...]` bracket-suffixed variants, etc.).
3. User reviews/corrects mapping in the dialog.
4. Pre-flight validation runs against the *whole* file before any DB write:
   - Missing/blank name → row flagged, excluded from import.
   - Non-numeric price/cost/quantity → row flagged, excluded.
   - **Duplicate names within the file itself** (e.g. two "PARACETAMOL" rows
     from different QB departments) → flagged as a warning listing both rows,
     since blindly importing both would cause the second to silently
     update/merge into the first (see Dedupe below). User can proceed anyway
     (last one wins) or cancel and fix the source file.
5. On confirm, for each valid row:
   - **Dedupe/match:** by `barcode`/item-number first (exact), else by
     product name (trimmed, case-insensitive exact match).
   - **Match found:** update product fields (`name`, `selling_price`,
     `category_id`, `supplier_id`, `reorder_level`, `barcode` if newly
     provided). **Never touch existing stock_batches** — avoids double-
     counting quantity on re-import.
   - **No match:** create product, then create one `stock_batches` row:
     `batch_number: null`, `expiry_date: null`, `cost_price` from file,
     `quantity` from file, `location: null`. This "opening stock" batch can
     be split into real batches later via existing Batch Management.
   - Category/Supplier: looked up by name (case-insensitive); created if not
     found.
6. Result summary shown: counts of created / updated / skipped rows, with
   skip reasons, so nothing fails silently.

### Idempotency

Re-importing the same (or a since-updated) file is safe:

- Matched rows (by barcode or normalized name) only update product fields —
  they never create a second opening-stock batch or add to quantity.
- Only genuinely new rows (no match) create products + a first batch.
- The only failure mode is the in-file duplicate-name case above, which is
  surfaced as a pre-flight warning rather than silently corrupting data.

## Data flow — Export

1. User clicks Export → picks CSV or XLSX.
2. If "Choose columns" is unchecked (default): export includes every
   product field (name, category, cost, price, stock [sum of active
   batches], reorder level, supplier, barcode, etc.) in a fixed, documented
   column order — this format doubles as DumosRx's own re-importable
   template.
3. If "Choose columns" is checked: `export-columns-dialog.tsx` shows a
   checklist (pre-filled from the last-used selection, or all-checked the
   first time). Confirm → export only the selected columns, in the fixed
   order (not the user's click order, to keep it predictable).
4. `buildExportWorkbook` generates the file client-side; browser download,
   no server round-trip.

## Validation & error handling

- All validation happens before any write (no partial imports left in a bad
  state mid-file).
- Every outcome (created/updated/skipped) is reported to the user in a
  summary — no silent failures.
- Numeric parsing accepts common formats (currency symbols/commas stripped)
  since real-world exports are often "1,500.00" rather than "1500".

## Testing

- Unit tests for `detectColumnMapping` and `mapRowToProduct`, using the
  actual header rows extracted from the QuickBooks and Moniebook files
  referenced above, so the alias dictionary is verified against real data
  rather than invented examples.
- Unit tests for dedupe/upsert logic: match-by-barcode, match-by-name
  (case/whitespace variance), no-match-creates-new, re-import-is-idempotent,
  in-file duplicate-name warning.
- Manual end-to-end run importing the actual
  `QB-export-POS-Inventory-Items-Export.xls` file (1500+ rows) to confirm
  performance and correctness at realistic scale.
