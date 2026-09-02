# Inventory

Routes: `app/(dashboard)/inventory/page.tsx` (renders `overview` directly,
without redirecting the URL) and `app/(dashboard)/inventory/[tab]/page.tsx`
(the tab-switched shell) → `components/stock-batch/stock-batch-management.tsx`.
`generateStaticParams()` on the `[tab]` route pre-renders exactly five tab
values — `overview`, `catalog`, `batches`, `ledger`, `audits` — because the
app builds with `output: export`; any other value 404s or (if linked to from
inside the app) throws a full-page Next.js runtime error instead of
navigating. Of those five, only three are exposed as actual clickable tabs
in the UI (`StockBatchTabNav`): **Overview**, **Catalog**, and **Movements**
(the visible label for the `ledger` route — gated behind
`canManageStockBatch`). `batches` has no dedicated screen of its own; `audits`
isn't a tab either — visiting `/inventory/audits` immediately flips
`isAuditing` to `true` and redirects to `/inventory/overview`
(`lib/hooks/use-stock-batch-management.ts`), so the audit flow always
overlays on top of Overview.

Walked live against the "Pikarestiv Stores 2" store (1,513 products, 10
categories, ₦1,929,051 stock value, 473 low-stock) on 2026-09-02.

## Overview tab

`components/stock-batch/stock-overview.tsx`, backed by
`useStockBatchStats()` and `getStockOverviewData()`
(`lib/db/queries/inventory.ts`) — the same stats source Task 1's Dashboard
walkthrough documented. Four stat cards (Total stock value, Total products,
Low stock, Expiring soon) sit above two panels:

- **Needs attention** (`needs-attention.tsx`) — up to 10 of the worst
  items: expiring batches (`getExpiringBatches(expiryDays)`, "View batch" →
  `/inventory/batches`) and low/critical/out-of-stock products ("Reorder" →
  `/procurement`). Live: showed "(10 of 50)" with an out-of-stock item first.
  **"View all" bug, fixed this task** — see Resolved section below.
- **Fast movers** (`fast-movers.tsx`) — last-7-days top sellers; empty live
  (this store has zero recorded sales/movements yet).

"Start Audit" (admin-only) is a header-level button here, not a tab — see
Audits below.

## Catalog tab

`components/products/product-database.tsx` (via
`ProductDatabase` → `ProductDatabaseFilters` + `catalog-list.tsx`). Route
title: "Product Catalog".

- **Search** — `SearchInput`, live-filters by name/SKU. Confirmed live:
  typing "paracetamol" narrowed 1,513 rows to the ~10 paracetamol products.
- **Category filter pill** — populated from `getCategoriesList()`
  (`lib/db/queries/products.ts`), which scopes to the active store
  (`WHERE store_id = ?`). See **Open finding** below: on Store 2 this
  returned Groceries/Beverages/Personal Care/Household/Snacks/Dairy — the
  generic non-pharmacy fallback list, not the store's real categories
  (Drugs, Cosmetics, etc. — visible on every product row). Selecting one of
  the fallback categories (e.g. "Groceries") correctly shows "No products
  found", so the filter mechanism itself works; only the option list is wrong.
- **Inventory filter pill** — All / Active / Inactive / Expiring Soon /
  Expired / Low Stock / Out Of Stock. Confirmed live: "Low Stock" narrows to
  the 473 below-reorder products and sets the `Inventory: Low Stock` chip —
  this is the exact filter state the Dashboard and Overview "low stock"
  links land on via `?status=low_stock`.
- **Column sort** — every header (Product, Category, Avg Cost, S. Price,
  Stock, Reorder) is clickable with an ascending/descending toggle.
  Confirmed live: sorting by Stock ascending correctly re-ordered to
  all-zero-stock rows first.
- **Manage** (`manage-categories-dialog.tsx`, admin-only) — a small dialog
  to add/rename/delete categories, plus an "Add starter categories" button
  that seeds `DEFAULT_CATEGORIES` (`lib/db/queries/categories.ts`: Drugs,
  Beverages, Toiletries, Cosmetics, Perfumes, Wines & Spirits, Provisions,
  Biscuits, Tea, Groceries, Baby Care). **Its list did not match the
  Category filter pill's list** live (see Open finding below) — it showed
  Analgesics/Antacids/Antibiotics/Antidiabetics/Antihistamines/
  Antihypertensives/Antimalarials, because it reads via a *different*,
  **store-unscoped** query (`getCategoryList()` in
  `lib/db/queries/categories.ts`, no `store_id` filter at all) than the
  filter pill's store-scoped `getCategoriesList()` (`products.ts`).
- **Export** — 4 options: CSV/XLSX × all-columns/choose-columns
  (`export-columns-dialog.tsx`, `buildExportBlob()` in
  `lib/utils/product-import-export.ts`). Confirmed live: "Export as CSV (all
  columns)" produced a toast "Exported 1513 product(s)" and downloaded a
  file.
- **Import** — see its own section below; this is the flow that shipped two
  real production bugs (see `docs/features/_findings-log.md` entries #1–2)
  with zero prior e2e coverage.

## Import flow (multi-sheet workbook support)

`components/stock-batch/import-mapping-dialog.tsx`
(`ImportMappingDialog`), triggered from `import-export-toolbar.tsx`'s
"Import" button. State machine: `pick-file` → `pick-sheet` (only if the
workbook has >1 sheet) → `map-columns` → `importing` → `result`.

1. **Pick file** — accepts `.csv,.xls,.xlsx`. `readWorkbookFile()`
   (`lib/utils/product-import-export.ts`) parses it via the `xlsx` package.
2. **Sheet picker** — shown only when `workbook.SheetNames.length > 1`:
   "This file has N sheets. Select the one with your product list." Single
   `Combobox` populated from every sheet name in the file, in file order.
   Confirmed live and in `e2e/product-import.spec.ts` with a synthetic
   3-sheet fixture (Sheet1: 3 rows, Sheet2: 2 rows, Sheet3: 0 rows) — all
   three sheet names appear as selectable options, and picking one loads
   that sheet's own row count into the next step.
3. **Auto-mapping** (`detectColumnMapping()`) — matches headers against a
   `HEADER_ALIASES` table seeded from real QuickBooks POS / Moniebook /
   DumosRx export headers (e.g. "Item Number"→barcode, "Item Name"→name,
   "Average Unit Cost"→cost_price, "Regular Price"→selling_price,
   "Department Name"→category, "Qty 1"→quantity). Header text is
   case/whitespace-normalized and strips bracket/percent suffixes
   (`normalizeHeader()`) before matching, and each internal field can only
   be auto-claimed by the *first* matching column (later duplicates fall
   back to "Ignore this column") since DumosRx tracks one quantity per
   product, not one per branch. Shows "We matched N of M columns
   automatically. Review or correct any below," with a per-column
   `Combobox` to override. Confirmed live and in the e2e spec: the fixture's
   6 QuickBooks-shaped headers auto-matched 6 of 6, with the correct row
   count ("3 row(s) will be imported" / "Import 3 Row(s)" button) tracking
   whichever sheet was picked.
4. **Dedupe warning** — `findInFileDuplicates()`
   (`lib/db/queries/product-import.ts`), triggered on clicking
   "Import N Row(s)": if the file has more than one row with the same
   product name *and* category, a `window.confirm()` warns "N product
   name(s) appear more than once in this file with the same category.
   Importing anyway will merge them into one product (last row wins).
   Continue?" before proceeding. Not exercised live this session (the
   fixture has no in-file duplicates) — logic-level coverage only, via
   Vitest.
5. **Importing / Result** — `importProductRows()` writes rows in a single
   batched `transaction()` (the fix for finding #1 in the log) and reports
   `{created, updated, skipped}`, with skip reasons listed per row.

Not driven to completion live this session by design: Step 1 explicitly
scopes this to "open the dialog, verify the sheet picker, then close
without importing" to avoid re-polluting Store 2's real 1,513-row catalog
with the synthetic fixture data. The write path itself (`importProductRows`,
batched invalidation) is unchanged from the fix verified in finding #1's
323-passing-test / live 1,513-row re-import verification.

## Movements tab (`ledger` route)

`components/stock-batch/stock-movements.tsx`. Route title: "Stock
Movements" (gated behind `canManageStockBatch`; direct navigation to
`/inventory/ledger` without that permission bounces to `/inventory/overview`
per `use-stock-batch-management.ts`). An immutable log ("Immutable log,
entries can't be edited") of stock movements with:

- **Search** by product, reference, or user.
- **Type filter pills** — All types / Sales / Restock / Returns / Damage /
  Adjustments.
- **Date range picker** — presets (Today, Yesterday, Last 7 days, Last 30
  days, This month, Last month, Year to date, Last year) plus a manual
  two-month calendar range. Defaults to "last 30 days."
- **Sortable columns** — Time, Product, Type, Qty, Reference/Reason, User.

Confirmed live: default (last-30-days) view showed "No movements found,"
and widening to "Last year" (1 Jan–31 Dec 2025) was still empty — this
store genuinely has zero recorded stock movements yet (the 1,513-product
bulk import writes products/batches directly, not through the movements
ledger, and there have been no sales/restocks/audits submitted on this
store to date).

## Audits ("Start Audit" flow)

Not a tab (see routing note above) — `components/stock-batch/stock-audits.tsx`,
a full-screen overlay opened by the Overview tab's admin-only "Start Audit"
button. Three-step flow (`AuditStep`: `ledger` → `review` → `done`):

1. **Physical inventory (ledger step)** — on open, immediately triggers a
   full `sync(true)` before showing any rows ("Syncing latest stock
   levels…"), so counts always reflect the latest known state, not a stale
   local snapshot. Confirmed live: after syncing, showed "1513 of 1513
   items shown," one editable row per product (Counted Qty, Counted Cost,
   Counted Selling — each pre-filled with the system's current value via
   `EditableNumberCell`), with live Diff Qty/Diff Cost/Diff Selling columns
   and a category filter + search. Every field starts equal to the system
   value, so nothing counts as "adjusted" until a value is actually
   touched.
2. **Review & submit** — `audit-review-step.tsx`; shows a "Total Counted" /
   "Adjusted" summary and a card per adjusted item with its qty change
   (confirmed live: editing one product's Counted Qty from 0→5 surfaced
   exactly one card, "MACA GUMMIES — Qty: 0 → 5", with Adjusted: 1).
3. **Submit** — `useSubmitStockAuditMutation()` writes one stock-movement
   row per adjusted item (`reason` supported per-row) and shows a "Cycle
   Count / Finished" success screen with counted/adjusted totals.

Verified the full ledger→review round trip live on Store 2's real data,
then **backed out without submitting** (reset the edited quantity to 0 and
navigated away) specifically to avoid writing a synthetic adjustment into
the real audit/movement history, per this task's no-destructive-writes
constraint. The submit path itself is otherwise unverified live this
session — only its Vitest-level and manual pre-submit-screen behavior are
confirmed.

## Resolved

### "Needs attention" panel's "View all" link crashed the app

- **Found:** clicking "View all" on the Inventory Overview tab's Needs
  Attention panel navigated to `/inventory/products` — the identical dead
  route Task 1 found and fixed in the Dashboard's Action Center
  (`/inventory/products?status=low_stock`), left as a known residual issue
  for whichever task walked Inventory (see finding #3 in
  `docs/features/_findings-log.md`). Reproduced live: full-page Next.js
  "Runtime Error: Page ... is missing param ... in generateStaticParams()".
- **Fix:** `client/components/stock-batch/needs-attention.tsx`'s "View
  all" `onClick` now calls `router.push("/inventory/catalog?status=low_stock")`
  — the same real, working destination Task 1's fix used, which the Catalog
  tab already reads and applies via its Inventory filter pill.
- **Verified by:** a second assertion added to the existing
  `client/__tests__/dashboard-action-center-routes.test.ts` (this file
  doesn't use the `actionRoute:` prop pattern Task 1's regex targets — it
  calls `router.push()` directly inline — so the new assertion uses its own
  regex against the same `allowedTabs` source of truth). Confirmed to fail
  (`references unknown inventory tab "products"`) against the pre-fix
  source via `git stash`, pass after. Re-clicked "View all" live post-fix:
  lands on Catalog with the Low Stock chip pre-applied, no error overlay.

## Open

### Category filter pill and Manage Categories dialog disagree, and neither shows this store's real categories

- **Found while walking Catalog:** the Category filter pill's option list
  (Groceries/Beverages/Personal Care/Household/Snacks/Dairy) doesn't match
  either the categories actually used by Store 2's products (Drugs,
  Cosmetics, and others — visible on every product row) or the list shown
  in "Manage Categories" (Analgesics/Antacids/Antibiotics/Antidiabetics/
  Antihistamines/Antihypertensives/Antimalarials — likely another store's
  categories, or an orphaned starter-category seed).
- **Root cause (read, not fixed):** two different, non-equivalent queries
  both read the same `categories` table. The filter pill uses
  `getCategoriesList()` (`lib/db/queries/products.ts`), which correctly
  scopes `WHERE store_id = ?` — but returns zero rows for this store,
  triggering product-database.tsx's hardcoded `defaultCategories` fallback.
  "Manage Categories" uses a *different* function, `getCategoryList()`
  (`lib/db/queries/categories.ts`), which has **no `store_id` filter at
  all** — a likely multi-tenancy leak, since it can show and let a store
  owner edit/delete categories that may belong to a different store.
- **Not fixed:** the underlying data question (why the store-scoped query
  returns zero rows when products clearly have categories) needs
  investigation into the `categories` table's `store_id` population, which
  is bigger than the "fix the one bug you found" scope for this task and
  risks touching real Store 2 data. Flagged here for a follow-up pass
  specifically on category data integrity and the `getCategoryList()`
  scoping gap.

### Stock Movements tab is untestable against a store with zero movement history

- **Found while walking Movements:** Store 2 has recorded zero stock
  movements (bulk product import doesn't route through the movements
  ledger, and no sales/restocks/audits have been submitted on this store).
  This means the Movements tab's search, type filters, and sort could only
  be confirmed to render an empty state correctly, not that they actually
  filter/sort real rows.
- **Coverage:** the new `e2e/product-import.spec.ts` doesn't cover this tab
  either (out of scope — see Step 4). No existing e2e spec drives the
  Movements tab at all.
- **Not fixed:** would require either seeding movement rows into a test
  store or running a real sale/restock against Store 2's live data, which
  this task's no-destructive-writes constraint rules out for the real
  store. Recommend adding movement-row fixtures to the Playwright test-db
  seed (`e2e/global.setup.ts`) so a future spec can assert real
  filter/sort behavior.

### `client/e2e/products.spec.ts` and its shared `login()` fixture had drifted out of sync with the current UI

- **Found while running Step 3/6 verification:** `e2e/fixtures.ts`'s shared
  `login()` helper used `page.getByPlaceholder('••••')` for the PIN field,
  but `components/auth/traditional-login-form.tsx` switched that field to
  an `InputOTP` component with no such placeholder — every spec using
  `login()` (all of them) was silently timing out on login. **Fixed** as
  part of this task (`e2e/fixtures.ts` now uses
  `input[data-input-otp="true"]`, the same selector `global.setup.ts`
  already used for the analogous field on `/setup`), since it blocked this
  task's own required `npx playwright test` verification step.
- **Found, not fixed:** `products.spec.ts` itself has two further stale
  assertions surfaced once login was fixed: (1) it expects `/inventory` to
  redirect to `/inventory/overview`, but
  `app/(dashboard)/inventory/page.tsx` renders the Overview tab directly
  without changing the URL — this may be a legitimately stale test
  assertion rather than a product bug; (2) it expects the `/inventory/ledger`
  header to read "Stock Ledger", but
  `lib/constants/dashboard-page-routes.ts` titles that route "Stock
  Movements". Both are pre-existing, unrelated to any file this task
  touched, and out of scope to fix here.
- **Found, not fixed (larger issue):** `e2e/global.setup.ts` (which builds
  the shared `.auth/test-db.bin` fixture every other spec's `login()`
  restores) is also broken against the current `/setup` wizard — it clicks
  a button named "Create New Store" that no longer exists (now "Set Up New
  Business"), and even past that, `register-step.tsx` now requires
  Email/Phone/Password/Confirm Password fields the setup script never
  fills. This is a substantial, pre-existing drift affecting every e2e spec
  in the suite, not specific to Inventory; fixing it needs a product
  decision on what test credentials to seed and was left out of scope here.
  This task's own verification instead reused the already-committed
  `e2e/.auth/test-db.bin` fixture via `--no-deps`, bypassing the broken
  setup step (see task report for exact commands run).
