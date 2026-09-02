# Smoke-Test Findings Log

Running log of every bug/UX issue found while walking the app section by
section (see docs/superpowers/plans/2026-09-02-full-app-smoke-test-and-docs.md).
Newest entries at the bottom of each section.

## Resolved

### 1. Bulk product import froze the tab (invalidation storm)
- **Found:** importing 1,513 rows via Inventory > Catalog > Import froze the
  browser tab for 10+ minutes; local writes were fine, but every single
  insert/update fired its own React Query cache invalidation, refetching the
  full product list up to ~6,000 times.
- **Fix:** `client/lib/db/core.ts` batches invalidations per `transaction()`
  block instead of per row. See git log for the commit.
- **Verified by:** all 323 pre-existing tests still pass; live re-import of
  the same file completed and synced all 1,513 rows.

### 2. Background sync could push uncommitted transaction rows
- **Found:** the 15-minute auto-sync timer (`components/dashboard/sync-
  indicator.tsx`) read the sync queue with a plain `query()`, which — on
  sql.js's single connection — sees a still-open `transaction()`'s
  uncommitted writes. A sync landing mid-import pushed 13 rows to the
  server before the import's transaction had committed; if that
  transaction had then rolled back (or the app closed before COMMIT),
  those 13 rows would be orphaned server-side forever.
- **Fix:** `getPendingSyncItems()` now awaits `awaitSettledTransactions()`
  first (`client/lib/db/core.ts`, `client/lib/db/base-helpers.ts`).
- **Verified by:** `client/__tests__/sync-queue-transaction-race.test.ts`
  (2 tests) — confirmed to fail without the fix, pass with it.
- **Known residual risk (accepted, not fixed):** a brand-new transaction
  can still start in the microtask gap right after
  `awaitSettledTransactions()` resolves and before the sync's `query()`
  runs. Closes the multi-minute real-world case; does not close an
  adversarial-timing case. Revisit only if this is ever observed in
  practice.

### 3. Dashboard's "Low Stock" Action Center card crashed the app
- **Found:** clicking the "N Items Low Stock" alert on the Dashboard
  navigated to `/inventory/products?status=low_stock`. The inventory
  section's dynamic route (`app/(dashboard)/inventory/[tab]/page.tsx`) only
  pre-renders `overview`/`catalog`/`batches`/`ledger`/`audits` via
  `generateStaticParams()` (required under `output: export`); "products"
  isn't a real tab, so Next.js threw a full-page Runtime Error instead of
  navigating.
- **Fix:** `client/components/dashboard/dashboard-action-center.tsx` now
  points the alert at `/inventory/catalog?status=low_stock` — the real
  product-list tab, which turns out to already read and apply the
  `status=low_stock` query param.
- **Verified by:** `client/__tests__/dashboard-action-center-routes.test.ts`
  — confirmed to fail (`references unknown inventory tab "products"`)
  against the original code, pass after the fix; re-clicked the card live
  post-fix with no error overlay.
- **Known residual issue (accepted, not fixed):** the same dead
  `/inventory/products` route is also referenced from
  `components/stock-batch/needs-attention.tsx`'s "View all" link, which
  lives on the Inventory Overview tab, not the Dashboard — out of scope
  for this task. Flagged for whichever task walks the Inventory section.

### 4. Inventory Overview's "Needs attention" panel had the same dead route as finding #3

- **Found:** clicking "View all" on the Inventory Overview tab's Needs
  Attention panel navigated to `/inventory/products` — the identical dead
  route from finding #3, in a second file. It was explicitly flagged as a
  residual issue in finding #3 ("out of scope for this task... flagged for
  whichever task walks the Inventory section") and this is that task.
  Reproduced live: full-page Next.js "Runtime Error: Page ... is missing
  param ... in generateStaticParams()".
- **Fix:** `client/components/stock-batch/needs-attention.tsx`'s "View
  all" `onClick` now calls
  `router.push("/inventory/catalog?status=low_stock")` — same real
  destination as finding #3's fix.
- **Verified by:** a second assertion added to
  `client/__tests__/dashboard-action-center-routes.test.ts` (this file
  calls `router.push()` directly rather than using the `actionRoute:` prop
  pattern finding #3's regex targets, so the new assertion uses its own
  regex against the same `allowedTabs` source of truth). Confirmed to fail
  (`references unknown inventory tab "products"`) against the pre-fix
  source via `git stash`, pass after. Re-clicked "View all" live post-fix:
  lands on Catalog with the Low Stock chip pre-applied, no error overlay.

### 5. POS: saving a product without a category always failed
- **Found:** while creating fixture products for the POS held-transaction
  test (Category has no "*" in Add Product — it's documented as optional),
  reproduced live via Chrome DevTools console: `Failed to save Product:
  Wrong API use : tried to bind a value of an unknown type (undefined).`
- **Fix:** `client/lib/hooks/use-save-product-mutation.ts` was setting
  `localPayload.category_id = undefined` when no category was chosen;
  sql.js's `bind()` throws on JS `undefined` (it only accepts `null`).
  Changed to `null` and extracted the mutation body into a standalone
  `saveProductToLocalDb()` export so it's directly unit-testable.
- **Verified by:** `client/__tests__/save-product-no-category.test.ts` —
  confirmed to fail with the exact same sql.js error pre-fix, pass after;
  live re-test in Chrome (product saved, tagged "Uncategorized"); the
  pre-existing `sales-lifecycle.spec.ts` (previously blocked at this exact
  step) now gets past it.
- See `docs/features/pos.md` for full detail.

### 6. POS: a completed sale could leave zero trace in the stock ledger
- **Found:** while investigating unexpectedly negative stock counts during
  the POS walkthrough, direct inspection of the synced MySQL data showed a
  `sale_items` row with no matching `stock_movements` row for one of its
  lines — a unit sold and charged for, with no corresponding stock
  deduction anywhere.
- **Root cause:** `use-pos-payment.ts`'s `handlePayment` used
  `getBatchesForProduct()` (correctly filtered to `quantity > 0` for FEFO
  picking) as the *only* source of batches to deduct from. Once a product's
  real stock was fully depleted, that filter returned nothing, and the
  per-item loop then had no batch to attribute the sale to at all — no
  stock_batches update, no sale_item_batches row, no stock_movements row,
  while the sale still completed and was recorded as revenue.
- **Fix:** extracted the per-item deduction logic into
  `recordSaleItemStock()` (`client/lib/db/queries/inventory.ts`), which now
  falls back to `getAnyActiveBatchForProduct()` (the most-recently-touched
  active batch, any quantity) when no batch has positive stock, so the sale
  is still attributed and logged (going further negative) instead of
  vanishing untracked.
- **Verified by:** `client/__tests__/record-sale-item-stock-depleted-batch.test.ts`
  (3 tests) — confirmed to fail pre-fix, pass after; also covers FEFO
  picking and the true-zero-batches edge case are unaffected.
- See `docs/features/pos.md` for full detail.

## Open

(Sections below add entries here as they're walked.)

### Dashboard: "Product added" activity rows are dead clicks
- **Found while walking:** all 5 Recent Activity rows on the smoke-tested
  store were `activity_type: "product"` entries. Clicking one sets
  `selectedActivity` but `dashboard-overview.tsx` has no dialog wired up
  for `type === "product"` (only sale/expense/purchase_order/prescription/
  stock_movement have one), so the click silently does nothing — no
  loading state, no error, just no visible response.
- **Coverage:** zero — `e2e/dashboard.spec.ts` never clicks a Recent
  Activity row of any type, and no `__tests__/` file covers the activity
  feed's click-to-dialog mapping.
- **Not fixed:** this is a missing-feature gap (no `ProductDetailsDialog`
  exists yet), not a wrong-number or broken-link regression, so it's out
  of the "fix the highest-value bug" scope for this task. Recommend a
  follow-up product-details dialog, or excluding `type: "product"` rows
  from being rendered as clickable in the interim.

### Inventory > Catalog: Category filter pill and "Manage Categories" dialog disagree, neither shows this store's real categories

- **Found while walking:** the Category filter pill on Catalog listed
  Groceries/Beverages/Personal Care/Household/Snacks/Dairy — matching
  neither the categories actually used by Store 2's 1,513 products (Drugs,
  Cosmetics, etc., visible on every row) nor the list shown in "Manage
  Categories" (Analgesics/Antacids/Antibiotics/Antidiabetics/
  Antihistamines/Antihypertensives/Antimalarials).
- **Root cause (read, not fixed):** `components/products/product-database.tsx`
  builds the filter pill's options from `getCategoriesList()`
  (`lib/db/queries/products.ts`), correctly scoped `WHERE store_id = ?`,
  which returns zero rows for this store and falls back to a hardcoded
  non-pharmacy default list. `manage-categories-dialog.tsx` instead reads
  via `getCategoryList()` (`lib/db/queries/categories.ts`) — which has
  **no `store_id` filter at all**, a likely multi-tenancy leak that shows
  (and lets an owner edit/delete) another store's categories.
- **Coverage:** zero — no `__tests__/` or `e2e/` file exercises either
  category query or the filter-pill/Manage-dialog category lists at all.
- **Not fixed:** root-causing why the store-scoped query returns zero rows
  despite products clearly having categories requires investigating the
  `categories` table's `store_id` data, which risks touching real Store 2
  data and is bigger than this task's "fix the one bug you found" scope.
  See `docs/features/inventory.md` for full detail.

### Inventory > Movements: zero real movement history to test against

- **Found while walking:** Store 2 has recorded zero stock movements (the
  bulk product import writes products/batches directly, not through the
  movements ledger, and no sales/restocks/audits have been submitted on
  this store). The tab's search, type filters, date-range picker, and sort
  could only be confirmed to render an empty state, not that they actually
  filter/sort real rows.
- **Coverage:** zero — no existing e2e spec drives the Movements tab at
  all, and the new `e2e/product-import.spec.ts` added this task doesn't
  cover it either (out of scope for Step 4, which targets Import only).
- **Not fixed:** would need movement-row fixtures seeded into the
  Playwright test-db (`e2e/global.setup.ts`), or a real sale/restock
  against Store 2 (ruled out by this task's no-destructive-writes
  constraint). Recommend seeding fixture rows in a follow-up.

### e2e suite: `products.spec.ts` and shared `login()` fixture had drifted out of sync with the current UI

- **Found while running this task's Step 3/6 verification:**
  `e2e/fixtures.ts`'s `login()` helper used
  `page.getByPlaceholder('••••')` for the PIN field, but
  `components/auth/traditional-login-form.tsx` now uses an `InputOTP`
  component with no such placeholder — every spec using `login()` (i.e.
  every spec in the suite) was silently timing out at login.
- **Fixed** (necessary to run this task's own required Playwright
  verification): `e2e/fixtures.ts` now selects
  `input[data-input-otp="true"]`, the same selector `global.setup.ts`
  already used for the equivalent field on `/setup`.
- **Found, not fixed:** once login was unblocked, two further stale
  assertions in `e2e/products.spec.ts` surfaced: it expects `/inventory` to
  redirect to `/inventory/overview` (it doesn't — `app/(dashboard)/
  inventory/page.tsx` renders the Overview tab directly without changing
  the URL, though this may be a legitimately stale test rather than a
  product bug), and it expects the `/inventory/ledger` header text "Stock
  Ledger" (the real title, per `lib/constants/dashboard-page-routes.ts`, is
  "Stock Movements"). Both predate this task and are out of scope to fix
  here.
- **Found, not fixed (larger, suite-wide issue):** `e2e/global.setup.ts` —
  which builds the `.auth/test-db.bin` fixture every spec's `login()`
  restores — is itself broken against the current `/setup` wizard: it
  clicks a "Create New Store" button that no longer exists (now "Set Up
  New Business"), and even past that, `register-step.tsx` now requires
  Email/Phone/Password/Confirm Password fields the setup script never
  fills. This affects every spec in the e2e suite, not just Inventory;
  fixing it needs a product decision on test credentials and was left out
  of scope. This task's own verification reused the already-committed
  `e2e/.auth/test-db.bin` fixture directly via `--no-deps` instead.

### e2e suite: `sales-lifecycle.spec.ts`'s Cycle Count steps are stale (second instance of the drift above)

- **Found while writing `e2e/pos-held-transaction.spec.ts`:** that new spec
  needed real stock, so it followed `sales-lifecycle.spec.ts`'s
  select-a-category → "Start count" → per-product count screen → "Save
  count" pattern for Cycle Count. Live in Chrome, "Start Audit" instead goes
  straight to a single "Physical inventory" screen: a search box + one flat
  grid of every product with an inline editable "Counted Qty" cell per row —
  no per-category "Start count" step at all. `sales-lifecycle.spec.ts` (and
  this task's first draft of `pos-held-transaction.spec.ts`) hang forever
  waiting for a "Start count" button that no longer exists.
- **Not fixed:** out of scope for Task 3 (POS); `sales-lifecycle.spec.ts`
  predates this task. `pos-held-transaction.spec.ts` was written against the
  current UI instead of copying the stale pattern, so it isn't affected.
  Recommend updating `sales-lifecycle.spec.ts`'s Cycle Count section next
  time that spec is touched.
