# Smoke-Test Findings Log

Running log of every bug/UX issue found while walking the app section by
section (see docs/superpowers/plans/2026-09-02-full-app-smoke-test-and-docs.md).
Newest entries at the bottom of each section.

## Summary (close-out)

Walked all 10 app sections (Dashboard, Inventory, POS, Prescriptions,
Customers, Procurement, Expenses, Reports, Activity Log, Settings — 21
sub-tabs) against real seeded data on Pikarestiv Stores 2.

- **11 real bugs found and fixed** (numbered #1–#11 under "Resolved" below),
  each with a root-cause writeup and a regression test that was verified to
  fail before the fix and pass after. Two (#1, #2) were found and fixed
  during the Product Catalog import that preceded this plan; the other nine
  were found during the section-by-section walkthrough itself.
- **Several "checked, confirmed no bug" investigations** are logged under
  "Open" alongside the real findings — these are just as valuable as the
  bugs: each is a place where this codebase's two recurring bug shapes
  (overly-broad query invalidation; quantity-accumulation loops that drop
  data past some threshold) were specifically checked for and ruled out with
  evidence, not assumed absent (see e.g. prescriptions dispensing,
  `recordCustomerPayment`, `receivePurchaseOrder`).
- **A handful of real gaps were found and deliberately left open**, each
  with a stated reason rather than a silent skip: loyalty-points redemption
  has no consuming UI anywhere in the app; the Settings `roles` tab is an
  unimplemented placeholder; a multi-tenancy gap in `getCategoryList()` (no
  `store_id` filter) was found but not fixed (needs a scoped follow-up, not
  a smoke-test-scale change); an unresolved "-5/142" stock-batch display
  anomaly in Prescriptions remains genuinely unresolved after investigation
  (candidate causes documented, root cause not found).
- **Test suite growth:** Vitest went from 323 tests (pre-plan baseline, per
  finding #1's note) to **346 passing tests** — 23 new unit/integration
  tests added across the plan. Playwright e2e coverage went from 8 spec
  files (baseline, per `git ls-tree` at the plan's starting commit
  `bb6b2723`) with partial coverage to the current 14 spec files (**29
  individual test cases**, confirmed via `npx playwright test --project=chromium
  --no-deps --list`), adding first-ever e2e coverage for Prescriptions,
  Reports, Activity Log, Settings, and the product-import sheet-picker
  dialog, plus extending Procurement (full receive cycle) and Expenses
  (edit/delete). Every task's own new/changed spec was verified passing in
  isolation as part of that task's own review — see the SDD ledger
  (`.superpowers/sdd/2026-09-02-full-app-smoke-test-and-docs/progress.md`)
  for each task's specific pass count.
- **Full-suite health (found during close-out, not fixed here):** running
  the entire Playwright suite together (`npx playwright test --project=chromium
  --no-deps`) is NOT reliably green — repeated runs showed different failure
  sets (8–17 of 29 tests, varying by run and by parallel-vs-serial worker
  count), on top of two already-known, already-logged pre-existing issues
  (`e2e/global.setup.ts`'s stale selectors — see the "e2e suite:
  `products.spec.ts` and shared `login()` fixture had drifted out of sync
  with the current UI" entry below, not finding #8 — and
  `e2e/procurement.spec.ts`'s first test). That first Procurement test *was*
  previously fixed for selector drift, exactly as finding #8 describes, and
  that fix holds. What was independently found broken again against `dev`
  HEAD during this close-out wasn't a selector regression: it was the same
  free-tier-fixture `LockedModuleOverlay` mount race documented in finding
  #9 (Expenses) — Procurement, like Expenses, is paid-tier-gated and shares
  the deliberately free-tier fixture DB. This final fix wave applied
  finding #9's same `elevateToPaidTier`/`loginAsPaidTier` fix to
  `e2e/procurement.spec.ts` (both tests), consolidating the helper into
  `e2e/fixtures.ts` in the process — see that commit for details.
  `e2e/auth.spec.ts` in particular fails consistently (not just
  flakily) across every full-suite run tried — it duplicates the same stale
  `getByPlaceholder('admin')`/`getByPlaceholder('••••')` login pattern that
  was already fixed inside the shared `login()` helper in `fixtures.ts`, but
  never itself switched to use that helper. Beyond `auth.spec.ts`, the
  remaining failures were inconsistent between runs (different specs failed
  each time), which points at shared dev-server/backend load or state
  bleeding between specs run back-to-back, not a single fixable defect.
  **This needed its own dedicated e2e-infrastructure investigation, out of
  proportion to this close-out task** — logged here as the single largest
  remaining piece of work, not fixed as part of this plan. Every individual
  task's own spec is confirmed reliable in isolation; it's specifically
  the full-suite run, under real concurrent/sequential load, that is not
  yet green.

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

### 7. Customers: Loyalty Program tab was never gated by plan tier
- **Found:** `lib/hooks/use-feature-gate.ts` defines
  `canUseLoyaltyProgram` (meant to restrict the module to Pro/Enterprise,
  mirroring `canUsePrescriptions`/`canUseProcurement`/`canUseExpenses`/
  `canUseAuditMode`) but it had **zero call sites** anywhere else in the
  codebase. The Loyalty Program tab in `CustomerManagement` — including full
  tier and points-redemption CRUD via `LoyaltySettingsDialog` — rendered
  unconditionally for every plan tier, with no lock overlay and no upgrade
  prompt.
- **Fix:** extended `LockedModuleOverlay`'s `featureKey` union with
  `"loyalty_program"` and wrapped the Loyalty Program `TabsContent` in
  `client/components/customers/customer-management.tsx` with it, matching
  the existing pattern used by every other gated module.
- **Verified:** `npx tsc --noEmit -p .` clean; full `vitest run` (340 tests)
  still passes; live-confirmed on this task's Pro-tier test store that the
  tab still renders fully unlocked post-fix (no regression). A live
  Free/Starter "before" repro would have required changing this shared test
  store's subscription tier via Settings → Billing, which was intentionally
  not done; the bug is instead confirmed by direct code inspection (a dead
  feature flag, identical in kind to the pattern every other gated module
  relies on to actually enforce its lock).
- See `docs/features/customers.md` for full detail.

### 8. Procurement: pre-existing `e2e/procurement.spec.ts` test was already broken by unrelated UI drift
- **Found:** running `npx playwright test --project=chromium
  e2e/procurement.spec.ts --no-deps` before making any changes failed
  outright: `expect(locator).toBeVisible() failed ... locator('text="Add
  Items to Order"')`. Commit `113a368c` ("add POItemBuilder search-to-add-row
  component for PO item entry") replaced the old one-item-at-a-time item
  entry form (a section labelled "Add Items to Order", a combobox with
  placeholder `"e.g. Amoxicillin 500mg"`, and a separate "Add" button) with
  `components/procurement/po-item-builder.tsx` — a single search box
  (placeholder `"Search item by name, SKU or barcode"`) that adds a row the
  instant a product is picked, no "Add" click needed. The old test's
  selectors for that removed UI never matched anything again after that
  refactor landed, and nothing had run/noticed since.
- **Fix:** updated the existing test's selectors in
  `client/e2e/procurement.spec.ts` to match the current UI. No application
  code changed — this was a test-only regression.
- **Verified:** both `e2e/procurement.spec.ts` tests (the fixed original
  plus a new one added for this task, covering the full standard PO
  create → send → receive → stock-increase cycle) pass repeatedly, both
  serially and with the default 2 parallel workers.
- See `docs/features/procurement.md` for full detail.

### 9. Expenses e2e: new edit/delete test flaked against `LockedModuleOverlay` (shared free-tier fixture race, not an invalidation bug)

- **Found:** the Expenses task's own commit (`4a2b4dcb`) added
  `e2e/expenses.spec.ts`'s "should edit an existing expense and then delete
  it" test but was never verified against Step 6 before landing (implementer
  session crashed). Running it revealed a real, reproducible failure: the
  second test's `originalRow.click()` timed out after 30s, intercepted by
  `LockedModuleOverlay`'s "Upgrade Plan" backdrop
  (`components/dashboard/locked-module-overlay.tsx`).
- **Investigated (and ruled out) the invalidation-storm pattern** this
  codebase has a history of (findings #1/#2 above): traced every mutation in
  the expense-save path (`useSaveExpenseMutation` →
  `lib/db/local-database.ts`'s `insert`/`update` → `lib/db/base-helpers.ts`)
  through to `invalidateQueriesForTable()`. It's correctly table-scoped via
  each query's `meta.tables` (`lib/query-keys.ts`); the `stores.profile`
  query is tagged `meta.tables: ["stores"]`, so an expense insert/update
  never invalidates it. `store-context.tsx`'s unfiltered
  `queryClient.invalidateQueries()` only runs from `switchStore()`, never
  called in this flow. `storeProfile.subscription_tier` itself never changed
  during the test session (confirmed via an instrumented run: `rawTier`
  stayed `"free"` from the first render to the last).
- **Actual root cause:** the e2e fixture DB (`e2e/.auth/test-db.bin`) is a
  free-tier store, correctly and *deliberately* free-tier — other specs
  (`prescriptions.spec.ts`, `pos-held-transaction.spec.ts`) rely on it to
  test `LockedModuleOverlay` itself. Expenses, like Procurement, is
  paid-tier-gated (`!isFree` fallback in `use-feature-gate.ts`, and
  `"expenses": false` explicitly for the free tier in both the local fixture's
  own `system_configs` row and the remote subscription-plans config — they
  agree). `LockedModuleOverlay` correctly locks the module, but only *after*
  the page has been interactive for a moment: an instrumented probe showed
  the overlay isn't in the DOM for roughly the first second after navigating
  to `/expenses`, even though `canUseExpenses` is `false` for the entire
  session from the very first render. The original "add an expense" test
  (a single click before the overlay's first paint) reliably won that race;
  the new, slower edit-then-delete flow (create → wait → click again to open
  the detail dialog) reliably lost it once the overlay finally mounted.
  This is fixture/test-infrastructure fragility, not a data bug: a real
  free-tier user sees the module consistently locked, same as this fixture
  does once the page settles — the "unlocked" window on this fixture is a
  narrow, incidental startup race in the overlay's own mount timing, not
  anything this task's mutation code caused or can fix from the Expenses
  side. (In fact `e2e/procurement.spec.ts` — a paid-tier-gated module
  sharing the same free-tier fixture — was independently found broken
  outright, not just flaky, against current `dev` HEAD for what looks like
  the same reason; that's a pre-existing issue on a different spec, out of
  scope here, not introduced by this fix.)
- **Fix:** rather than mutate the shared fixture (would break
  `prescriptions.spec.ts`/`pos-held-transaction.spec.ts`'s free-tier-gating
  assertions) or paper over the race with a `waitForTimeout`, added a
  dev-only hook (`window.__e2eSetSubscriptionTier`, gated to
  `process.env.NODE_ENV === "development"`, alongside the existing
  `getDatabaseBinary`/`restoreDatabase` dev hooks in `lib/db/core.ts`) that
  `e2e/expenses.spec.ts` now calls right after login, followed by a
  `page.reload()`, to elevate its own isolated per-test copy of the local DB
  to a paid tier before ever touching the Expenses page. The checked-in
  fixture file itself is untouched (confirmed via `git status` after every
  run); every other spec's free-tier assumptions are unaffected.
- **Regression test:** `e2e/expenses.spec.ts`'s existing "should edit an
  existing expense and then delete it" test *is* the regression test —
  confirmed it fails with the pre-fix code (`git stash` of the three changed
  files reproduces the original `originalRow.click()` timeout exactly) and
  passes reliably post-fix (2 consecutive full runs, both tests, 2 parallel
  workers).
- See `docs/features/expenses.md` for full detail.

### 10. Reports: Profit & Loss tab showed decimal kobo precision for the same aggregate figures BIKeyMetrics rounds to whole Naira, on the same page

- **Found:** while walking Reports > Analytics & Insights > Profit & Loss.
  The `BIKeyMetrics` cards at the top of the Analytics & Insights page (Net
  Sales, Net Profit, ...) render via `formatMetricCurrency()` — rounded to a
  whole NGN unit, per its own doc comment in `lib/utils.ts` ("for dashboard/
  report metric cards where a rounded headline figure reads cleaner than an
  exact-to-the-kobo total"). `components/analytics/profit-loss-tab.tsx`'s
  "Financial Performance Statement" panel a few rows below it renders the
  *same* aggregate totals — Gross Sales, Discounts/Tax/Refunds, Net Sales,
  COGS, Gross Profit, Total Operational Expenses, Final Net Income — via
  `formatCurrency()` instead, which keeps decimal precision. Live-reproduced
  on Store 2 real data: the "Net Profit" metric card read "₦1,420" while
  "Final Net Income (Take Home)" a few rows down showed "₦1,420.25" for the
  literal same underlying number, on the same page render.
- **Fix:** `client/components/analytics/profit-loss-tab.tsx` — swapped the
  import and all 7 call sites from `formatCurrency` to `formatMetricCurrency`,
  matching the convention `BIKeyMetrics`/`DailyCloseMetrics` already use for
  aggregate metric cards (line-item/detail tables elsewhere in Reports
  correctly keep `formatCurrency`'s precision, e.g. `SalesListModal`,
  `StaffPerformanceTab`'s per-cashier Avg Transaction — those weren't
  touched).
- **Verified by:** `client/__tests__/profit-loss-tab-currency-formatting.test.ts`
  (source-inspection style, matching `dashboard-action-center-routes.test.ts`'s
  established pattern — no component-rendering test harness exists in this
  repo yet) — confirmed to fail pre-fix (`formatCurrency(` present in the
  source) via `git stash`, pass post-fix. Live re-verified in Chrome:
  post-fix, COGS/Gross Profit/Final Net Income all render as whole numbers
  matching the BIKeyMetrics cards above them exactly.
- **Coverage gap also closed:** zero e2e coverage existed for the whole
  Reports section before this task (confirmed via the brief's own
  `grep -rln "formatMetricCurrency" __tests__/ lib/ components/reports/`,
  which matched only the function's definition and one pre-existing, partial
  unit test). Added `client/e2e/reports.spec.ts` (Daily Close, Operational
  Reports, and Analytics & Insights all render real Store 2 data) and
  extended `formatMetricCurrency`'s existing unit test in
  `client/__tests__/utils.test.ts` with negative-number, zero, and
  large-value cases, plus a non-NGN-negative case, per the brief.
- See `docs/features/reports.md` for full detail.

### 11. Settings: `/settings/cloud`'s Link-Cloud dialog could never be dismissed on a non-linked store

- **Found:** while writing `client/e2e/settings.spec.ts` for the Data/Cloud
  tab (Task 10, Settings). The live walkthrough of Settings didn't catch this
  — that store was already cloud-linked, so the dialog never opened at all.
  The e2e spec's fixture store isn't linked, and hit it immediately: on
  `/settings/cloud` with `isCloudLinked === false`, the "Link DumosRx Cloud"
  dialog reopened on its own right after being closed (Escape or the Close
  button), every single time, with no way to dismiss it short of navigating
  off the page.
- **Root cause:** `hooks/use-settings.ts`'s tab-resolution `useEffect`
  depended on the whole `syncState` object returned by
  `useSettingsSync(isCloudLinked, refetchStore)` — a plain object literal
  recreated on every render, never referentially stable — instead of the one
  setter it actually calls, `syncState.setIsCloudLinkOpen`. With the whole
  object in the dependency array, the effect reran on every render of
  `useSettings()`, and its body unconditionally calls
  `syncState.setIsCloudLinkOpen(true)` whenever
  `internalTab === "cloud" && !isCloudLinked` — which stays true for as long
  as the route remains on the alias, regardless of whether the user just
  manually dismissed the dialog a render ago. Same general bug shape as
  finding #1 above (an unstable dependency/reference driving an effect to
  refire far more than intended), just in a `useEffect` deps array rather
  than a query-invalidation call site.
- **Fix:** `client/hooks/use-settings.ts` — narrowed the effect's dependency
  from the bare `syncState` object to `syncState.setIsCloudLinkOpen`, the
  specific `useState` setter it calls (referentially stable across renders
  by React's own guarantee). The effect now only reruns when
  `tabParam`/`isCloudLinked`/`isAdmin`/`activeTab` genuinely change, so a
  user-initiated close sticks.
- **Verified by:** `client/__tests__/settings-cloud-link-dialog-loop.test.ts`
  (source-inspection style, matching `dashboard-action-center-routes.test.ts`
  / `profit-loss-tab-currency-formatting.test.ts`'s established pattern — no
  component-rendering harness exists in this repo yet) — confirmed RED
  pre-fix (dependency array literally contained bare `syncState`), GREEN
  post-fix. Re-verified live via `e2e/settings.spec.ts`'s data/cloud test,
  which opens the dialog via the `cloud` alias, closes it, and asserts it
  stays closed on a subsequent render before continuing — this assertion
  would have failed against the pre-fix code.
- See `docs/features/settings.md`'s "Data" and "Cloud" sections for full
  detail, including the cross-reference to Task 0's separate sync-queue
  transaction race fix (a different bug, on the same tab, in the read path
  this dialog's underlying auto-sync setting triggers).

### 12. Multi-tenancy leak in `getCategoryList()`

- **Found:** while walking Inventory > Catalog (Task 2) — the Category
  filter pill and the "Manage Categories" dialog showed disagreeing, wrong
  category lists for Store 2. Tracked as bug #1 in `_known-bugs.md`, fixed
  in a dedicated follow-up pass since it was flagged as out-of-scope for a
  smoke-test-only task.
- **Root cause:** `getCategoryList()` (`client/lib/db/queries/categories.ts`)
  had no `store_id` filter at all, so every store on a device (or in the
  sql.js DB) saw every other store's categories — used by the Manage
  Categories dialog and `components/settings/store/categories-card.tsx`.
  The `categories` table already carries a `store_id` column: the backend
  added it in `laravel-server/database/migrations/2026_08_14_164310_add_store_id_to_domain_tables.php`,
  and the client's own runtime migration (`client/lib/db/core.ts`'s
  `syncColumns`/`STORE_SCOPED_TABLES`) already adds and backfills it on
  every device. So this wasn't a missing-column problem — it was a query
  that never caught up to what the schema already supported. `insert()` in
  `base-helpers.ts` already auto-scopes new rows on any `STORE_SCOPED_TABLES`
  table to the active store, so `createCategory()`'s new-row scoping was
  also already working implicitly; it just wasn't explicit.
- **Fix:** `client/lib/db/queries/categories.ts` — `getCategoryList()` now
  filters `WHERE ... AND (store_id = ? OR store_id IS NULL)` when a store is
  active, matching the `customers.ts`/`products.ts` store-scoping pattern
  with one deliberate difference: rows with a NULL `store_id` (categories
  that predate this fix, or a device with an unresolved active store) stay
  visible to every store instead of being hidden, so no device silently
  loses access to categories it's already using. `createCategory()` now
  explicitly sets `store_id: getActiveStoreId()` rather than relying only on
  `insert()`'s implicit auto-scoping. `renameCategory()`/`deleteCategory()`
  were left unchanged — they operate on `id` directly, which is unique
  per-row — but the investigation found `update()`/`softDelete()` in
  `base-helpers.ts` do no `store_id` ownership check at all before writing.
  That's a latent cross-tenant risk shared by every domain table using those
  two helpers (not category-specific), most exposed for exactly the
  NULL-`store_id` rows this fix intentionally keeps visible across stores:
  a store operator could rename or soft-delete a shared legacy category and
  silently affect every other store still using it. Flagged as a follow-up
  concern, not fixed here — fixing it would mean auditing every caller of
  `update()`/`softDelete()` across the whole app, well beyond this bug.
- **Verified by:** `client/__tests__/multi-store-scoping.test.ts` — three
  new cases added to the existing real-sql.js store-scoping suite (the same
  file/pattern used for `getProductList`/`getProductsWithStock`/`insert()`):
  `getCategoryList` returns only the active store's rows; a legacy
  NULL-`store_id` category surfaces to every store; `createCategory`
  auto-scopes the new row's `store_id`. Confirmed RED pre-fix (both
  read-side cases failed — one store saw the other's category, and the
  NULL-store category test failed the same way) and GREEN post-fix, with
  the full suite (`npx vitest run`, 66 files / 349 tests) and
  `npx tsc --noEmit -p .` both clean.
- See `docs/features/inventory.md`'s Catalog section for the original
  live-reproduced symptom (the Category filter pill and Manage Categories
  dialog disagreeing) and its cross-link to this fix.

### 13. `update()`/`softDelete()`/`remove()` had zero store-ownership check — cross-tenant write risk

- **Found:** flagged as a follow-up concern while fixing bug #12/#1 above
  (`getCategoryList()`'s multi-tenancy leak): that fix correctly keeps
  legacy, pre-migration `store_id IS NULL` rows visible to every store so
  no device silently loses data it's already using — but nothing stopped
  ANY store from then editing or deleting one of those shared rows via a
  completely ordinary UI action. Concretely,
  `components/products/manage-categories-dialog.tsx` renders every row
  `getCategoryList()` returns — including shared legacy ones — with a
  fully-enabled rename field and delete button, no visual distinction. A
  staff member on any store could blur-to-save a rename, or click delete,
  on a legacy category another store was actively using. No devtools, no
  id guessing — just the ordinary dialog. Tracked as bug #8 in
  `_known-bugs.md`.
- **Root cause:** `update()` and `softDelete()` in `client/lib/db/base-helpers.ts`
  — the shared write helpers used by every domain table's edit/delete path,
  not just categories — built `UPDATE ${table} SET ... WHERE id = ?` (and
  the `_deleted = 1` equivalent) from only a row `id`, with no `store_id`
  check anywhere. Tenant isolation in this local-first app lives entirely
  in each *read* query's `WHERE store_id = ?` clause; there was no
  equivalent enforcement on the write path. Anyone with browser devtools on
  a device (e.g. a multi-store device, or a store-switcher session) could
  also call `update()`/`softDelete()` directly with any row id present in
  the local database, bypassing UI-level scoping entirely — a broader
  exposure than just the categories dialog.
- **Fix:** added `assertStoreOwnership()`, a private helper in
  `base-helpers.ts` called at the top of both `update()` and `softDelete()`
  before any write, reusing the same `STORE_SCOPED_TABLES` list and
  `getActiveStoreId()` resolver `insert()` already uses for its own
  `store_id` auto-injection (so the two mechanisms can't drift apart) —
  implemented once, so every table gets it automatically instead of
  per-caller. Three outcomes:
  - the row's `store_id` matches the active store → write proceeds
    normally;
  - the row's `store_id` is `NULL` (a legacy, pre-migration row) → the
    write proceeds AND the row is claimed for the active store as part of
    the same call (a separate, immediate `UPDATE ... SET store_id = ?`
    ahead of the caller's own write), so after this first edit by any
    store the row is exclusively that store's — a second store touching it
    afterward now hits the reject case instead of clobbering it forever;
  - the row's `store_id` is a different, known store → the write is
    rejected with a thrown `Error("Cannot modify a record owned by a
    different store")`, not a silent no-op, so a caller that doesn't
    explicitly handle it fails loudly instead of appearing to succeed.
  Deliberately fails OPEN (skips the check) when `getActiveStoreId()`
  returns null/undefined, matching `insert()`'s existing "only auto-scope
  when a store is resolved" behavior for the same early-boot/unresolved
  edge case — a narrow allowance tied to the local module-scope resolver
  having nothing set, not something a caller can trigger from outside.
- **Audit performed (no bypass mechanism was added):** grepped every
  `update()`/`softDelete()` call site across `client/lib` and
  `client/components` (not just the known importers of `base-helpers.ts`,
  to catch anything reached only via re-export) — `lib/db/queries/
  prescriptions.ts`, `lib/db/queries/categories.ts`,
  `lib/db/procurement-receiving.ts`, `lib/db/procurement.ts`,
  `lib/db/local-database.ts`, `lib/db/requested-products-queries.ts`, and
  three hook files not on the original 8-file list
  (`lib/hooks/use-fleet-mutations.ts`, `lib/hooks/use-supplier-mutations.ts`,
  `lib/hooks/use-fulfill-online-order-mutation.ts`, the last of which only
  calls `insert()`, unaffected by this fix). Every real call site operates
  on a row the active store is expected to own (its own PO, product,
  category, supplier, requested-product, etc.) — none needed cross-store
  write access, so no `bypassOwnershipCheck` opt-out was added anywhere.
  Two things confirmed this explicitly rather than by assumption:
  `lib/hooks/use-fleet-mutations.ts`'s `update("stores", ...)` looked like
  a plausible admin/system-level candidate (a store-owner editing a
  *different* store's fleet entry) but needs no special-casing at all,
  since `"stores"` was never a member of `STORE_SCOPED_TABLES` to begin
  with — the check only applies to tables in that list. Separately,
  `lib/db/sync-engine/{index,pull,push}.ts` (which applies incoming server
  rows to the local DB) was grepped directly and confirmed to write only
  through `query()`/`execute()`/`transaction()` from `core.ts`, never
  through `update()`/`softDelete()` — so the sync path is untouched by this
  fix and needed no bypass either.
- **UI-guard check (none needed):** `manage-categories-dialog.tsx`'s rows
  come solely from `getCategoryList()`, whose filter is
  `(store_id = ? OR store_id IS NULL)` — it can never return a row owned by
  a different, known store, only the active store's own rows or shared
  legacy ones. So the dialog can never reach the "reject" case in the first
  place; editing a legacy row now silently claims it for the active store
  (the intended case-2 behavior), which is a usability improvement, not a
  new failure mode — no UI change was needed there.
- **Verified by:** new `client/__tests__/store-ownership.test.ts`, against
  a real in-memory sql.js database (same pattern as
  `multi-store-scoping.test.ts`), covering both `update()` and
  `softDelete()` on the `categories` table for all three ownership outcomes
  (own-store row succeeds; NULL-`store_id` row succeeds and is claimed,
  verified via a follow-up `SELECT store_id`; a different known store's row
  throws `"Cannot modify a record owned by a different store"` and leaves
  the row byte-for-byte unmodified) plus the fail-open no-active-store
  case. Confirmed RED pre-fix (4 of 7 new tests failed: both reject cases
  resolved instead of throwing, both claim cases left `store_id` unset) and
  GREEN post-fix. Full suite (`npx vitest run`) passed 356/356 across 67
  files (up from 349/66 pre-fix), and `npx tsc --noEmit -p .` was clean —
  run in full, not just the new/targeted test, since this change touches a
  helper shared by every domain table. `e2e/settings.spec.ts` and
  `e2e/expenses.spec.ts` (both exercise edit/delete flows through this
  helper — staff role edit, expense edit/delete) passed 6/6 when run
  serially (`--workers=1`); running them in parallel reproduced this repo's
  known cross-spec Playwright flakiness (a fixture-restore timing race,
  already logged in `_known-bugs.md`'s "Known limitations" section) rather
  than any failure caused by this fix — both specs were also confirmed
  green individually before this change.
- **Not done, deliberately:** no `bypassOwnershipCheck`-style opt-out was
  added to `update()`/`softDelete()` — the audit above found no genuinely
  system-level caller that needs cross-store write access, so the escape
  hatch wasn't pre-built on spec. If one is ever found, it should be added
  narrowly at that point, not reachable from UI code.

#### Fix-round two: code review caught `remove()` was missed entirely

- **Found:** code review of the fix above. The original audit's grep
  pattern was literally `"update(\|softDelete("` — it searched for exactly
  those two function names and never once searched for `remove(` calls, so
  `remove()` (the third write helper in `base-helpers.ts`, used for hard,
  unrecoverable deletes) wasn't evaluated-and-cleared, it was simply never
  looked at. That mattered: `remove()` IS called on a `STORE_SCOPED_TABLES`
  table. `lib/hooks/use-sales-data.ts` and
  `lib/hooks/use-pos-held-transactions.ts` both call
  `remove("held_transactions", id)`, and `held_transactions` is in
  `STORE_SCOPED_TABLES` (`core.ts`). Until this second pass, the exact
  devtools/direct-call threat model this bug's own writeup describes —
  "Anyone with browser devtools... could call `update()`/`softDelete()`
  directly with any row id... bypassing UI-level scoping entirely" — still
  applied to `remove()`: a hard, unrecoverable cross-tenant delete of
  another store's held transaction, callable directly by id from devtools
  on any multi-store device. Not UI-reachable (`getHeldTransactions()`'s
  read filter is a plain `WHERE store_id = ?`, with no `OR store_id IS
  NULL` fallback the way `getCategoryList()` has), but the direct-call path
  was real, and the tracking docs' "Fixed"/"closed" language for this bug
  had overclaimed given the gap.
- **Re-audit performed:** re-grepped comprehensively this time —
  `grep -rn "\bremove(" client/lib client/components client/app`, plus a
  separate pass for every `import { ... remove ... } from` across the same
  three directories (to catch `remove` reached only via
  `local-database.ts`'s `export * from "./base-helpers"` re-export, not
  just direct `base-helpers` imports). Exactly three real callers of
  `remove()` exist in the whole app:
  - `lib/hooks/use-sales-data.ts` and
    `lib/hooks/use-pos-held-transactions.ts` — both
    `remove("held_transactions", id)`. `held_transactions` IS
    store-scoped; both are now protected by this fix.
  - `lib/hooks/use-payment-accounts.ts` — `remove("payment_accounts", id)`.
    `"payment_accounts"` was never a member of `STORE_SCOPED_TABLES` (the
    same pre-existing exemption `"users"` and `"stores"` have), so the
    check is a no-op here by construction — no special-casing needed.
  No caller needs a cross-store bypass; the "no bypass mechanism added"
  conclusion from the first pass still holds after this second pass.
- **Fix:** `assertStoreOwnership()` gained a third parameter,
  `claimLegacyRow` (default `true`, so `update()`/`softDelete()`'s call
  sites and behavior are unchanged). `remove()` now calls it with
  `claimLegacyRow: false`. Reasoning for the difference: for
  `update()`/`softDelete()`, claiming a legacy NULL-`store_id` row makes
  sense because the row keeps existing afterward — the claim is what
  prevents a second store from touching it later. For `remove()`, the row
  is about to be hard-deleted in the very next statement; claiming it
  first (an extra `UPDATE ... SET store_id = ?`) would protect nothing,
  since there's no row left afterward for the claim to matter to — it
  would be a pointless extra write on the way to destroying the row
  anyway. So a legacy row is simply deletable outright by whichever store
  touches it first, same effective behavior as before this fix, while a
  different *known* store's row now correctly rejects, exactly like
  `update()`/`softDelete()`.
- **Verified by:** extended `client/__tests__/store-ownership.test.ts` with
  a `remove()` describe block against `held_transactions` (the real
  affected table, not `categories` again, so the test matches an actual
  call site's shape) covering all four cases: own-store row deletes;
  legacy NULL-`store_id` row deletes outright with no claim step (asserted
  via non-existence after the call, since there's no row left to check a
  `store_id` on); different known store's row rejects with the same thrown
  `Error` and is confirmed byte-for-byte unmodified (`heldTransactionExists`
  still true, `store_id` still the other store's); no-active-store fails
  open. Confirmed RED pre-fix (10/11 passed trivially since the bug was an
  *absence* of a check — only the reject case, which needs an actual
  throw, failed: "promise resolved undefined instead of rejecting") and
  GREEN post-fix (11/11). Full suite re-verified: `npx tsc --noEmit -p .`
  clean, `npx vitest run` 360/360 across 67 files (up from 356/67 after
  the first bug #8 commit) — the 4-test delta is exactly the new
  `remove()` coverage, confirming nothing else in the suite relied on
  `remove()`'s old no-check behavior.
- **Tracking-doc correction:** `_known-bugs.md`'s bug #8 entry and this
  entry's own "Not done, deliberately" note above were written after the
  first pass and described the fix as covering `update()`/`softDelete()`
  only, which was accurate then but became stale/overclaiming once
  `remove()`'s gap was found. Both docs have been updated in this same fix
  round to describe all three helpers.
- **e2e confirmed post-fix:** `e2e/pos-held-transaction.spec.ts`'s recall
  flow exercises `remove()` on `held_transactions` end-to-end through the
  real UI (`handleRecallTransaction` → `remove("held_transactions", ...)`,
  `lib/hooks/use-pos-held-transactions.ts:113`) — this was initially missed
  during the fix round's own verification pass and confirmed separately:
  `npx playwright test --project=chromium e2e/pos-held-transaction.spec.ts
  --no-deps` → 1 passed.

### 14. `logRequestedProduct()`'s substring-based dedupe could misfire

- **Found:** final whole-branch review (post Task 11), tracked as bug #5 in
  `_known-bugs.md`.
- **Root cause:** `logRequestedProduct()`
  (`client/lib/db/requested-products-queries.ts`) deduped accumulated
  customer names and notes with `String.includes(newValue)` against the
  *whole* accumulated string, not a match against its individual
  comma/pipe-separated segments. That's a substring check, not an
  exact-match check: once a request had accumulated a customer name like
  "Anna", a genuinely different, later customer named "Ann" would never be
  appended (`"Anna".includes("Ann")` is `true`), silently dropping a real
  customer from the record. Same risk on the notes field, separated by
  `" | "` instead of `", "`.
- **Fix:** both accumulation blocks now split the existing accumulated
  string on its separator (`", "` for names, `" | "` for notes) into
  segments, then check the incoming value against those segments with an
  exact, case-insensitive match (`.toLowerCase()` on each side) before
  appending — matching the case-insensitive dedupe convention already used
  elsewhere in the codebase (`categories.ts`, `product-import.ts`,
  `setup.ts` all normalize names with `.toLowerCase()` before comparing).
  Everything else in the function (separators, append order, the
  insert()/update() split for new-vs-existing pending requests) is
  unchanged.
- **Verified by:** `client/__tests__/requested-products.test.ts` — four new
  cases added to the existing real-sql.js suite: a substring-name case
  ("Anna" then "Ann" — both must appear, previously only "Anna" would);
  an exact-duplicate-name case (case-insensitive "ann" after "Ann" must
  not duplicate); and the same two cases for notes. Confirmed RED pre-fix
  (4/4 new tests failed — the substring cases failed by silently dropping
  the new segment, the exact-duplicate cases failed because the
  case-insensitive check didn't exist yet) and GREEN post-fix (10/10 in
  the file). Full suite re-verified: `npx tsc --noEmit -p .` clean,
  `npx vitest run` 364/364 across 67 files.

### 15. `recordSaleItemStock`'s partial-shortfall fallback could double-write a row

- **Found:** final whole-branch review (post Task 11), tracked as bug #6 in
  `_known-bugs.md`.
- **Root cause:** `recordSaleItemStock()`
  (`client/lib/db/queries/inventory.ts`) deducted stock in two passes: a
  main FEFO loop over batches with positive stock, then — if that loop
  didn't cover the full sale quantity — a fallback to
  `getAnyActiveBatchForProduct()` (ordered by `updated_at DESC`) to attach
  the leftover somewhere rather than leave it untracked. Each pass called
  the same `deductFromBatch()` helper, which unconditionally inserted a new
  `sale_item_batches` row and a new `stock_movements` row on every call.
  Because `deductFromBatch()` also bumps the touched batch's `updated_at`,
  the fallback query was very likely to re-select the exact batch the main
  loop just partially deducted from (trivially guaranteed when it's the
  product's only batch), so that batch got deducted from twice — once via
  the main loop, once via the fallback — producing two `sale_item_batches`
  rows and two `stock_movements` rows for the same `(sale_item, batch)`
  pair, with the true deduction split across them. The summed quantity was
  still correct (not a data-loss bug), but the one-row-per-batch invariant
  any future consumer might assume was silently violated.
- **Fix:** `sale_item_batches` and `stock_movements` inserts are no longer
  written inline inside `deductFromBatch()`. Instead, each call accumulates
  its deduction into a `Map<batchId, totalDeduction>` keyed by batch id;
  after both loops finish, exactly one `sale_item_batches` insert and one
  `stock_movements` insert are made per unique batch id, using its summed
  deduction. The `stock_batches` `update()` (and the `updated_at` bump that
  drives fallback selection) still happens immediately inside
  `deductFromBatch()` on every touch, unchanged — so FEFO ordering, the
  clamp-vs-absorb-fully logic, the zero-batches-at-all fallback, and which
  batch the fallback query picks are all untouched by this fix; only the
  row-writing was deferred and deduplicated.
- **Verified by:** `client/__tests__/record-sale-item-stock-depleted-batch.test.ts`
  — two new cases added to the existing real-sql.js suite. (1) Reproduces
  the exact bug: a single batch with 1 unit of stock, a sale of 3 —
  confirmed RED pre-fix (`sale_item_batches` had 2 rows instead of 1 for
  the same batch); GREEN post-fix (exactly 1 `sale_item_batches` row with
  `quantity = 3`, exactly 1 `stock_movements` row with `quantity = -3`, and
  the batch's final `stock_batches.quantity` correctly at `-2`). (2) Guards
  against the fix over-merging: a sale spanning two genuinely different
  positive-stock batches (2 units + 5 units, sale of 5) still produces two
  separate `sale_item_batches` rows, one per batch, with the correct
  per-batch split (2 and 3) — confirmed this case passed both before and
  after the fix. Full suite re-verified: `npx tsc --noEmit -p .` clean,
  `npx vitest run` 366/366 across 67 files.

### 16. `recordSaleItemStock`'s fallback batch had no floor on oversell

- **Found:** Task 3 (POS), tracked as bug #4 in `_known-bugs.md`.
- **Nature of this fix:** a user-directed product decision, not just a bug
  squash. The fallback deduction path (`deductFromBatch`, inside
  `recordSaleItemStock()` in `client/lib/db/queries/inventory.ts`) let a
  batch's `stock_batches.quantity` go arbitrarily negative whenever a sale
  oversold past what was actually available (e.g. a stale on-screen stock
  count let a cashier ring up more units than a batch had left). Left open
  at the time pending a UX decision: block the oversell, warn first, or
  something else. Asked directly, the user chose **"floor + alert"**: let
  the sale complete — don't block checkout over a stale count — but never
  let the batch's own stored quantity go below zero, and surface an alert
  so staff can reconcile the divergence.
- **Root cause / mechanism:** `deductFromBatch()` computed `deduction` as
  `Math.min(batch.quantity, remainingToDeduct)` when the batch still had
  positive stock, or `remainingToDeduct` unconditionally when it didn't
  (`batch.quantity <= 0`) — the latter is the only branch where `deduction`
  can exceed `batch.quantity`, i.e. the only place an oversell can occur.
  It then wrote `batch.quantity - deduction` straight to `stock_batches`
  with no floor.
- **Fix:**
  1. The `stock_batches` `update()` now writes
     `Math.max(0, batch.quantity - deduction)` instead of
     `batch.quantity - deduction`. `deduction` itself — and therefore what
     gets written to `sale_item_batches`/`stock_movements` — is completely
     unchanged, so sales and inventory-consumed accounting stay accurate
     even when the batch's own running balance gets floored.
  2. A new `oversoldBatchIds` `Set<string>` records any batch id where
     `deduction > batch.quantity` was true at the moment `deductFromBatch`
     ran (a batch can be touched twice across the main FEFO loop and the
     partial-shortfall fallback loop, per finding #15, so this is a set
     rather than a single flag). When the deferred `stock_movements` insert
     runs for a batch in that set, its `reason` is written as
     `"Customer sale (oversold — insufficient batch stock)"` instead of the
     plain `"Customer sale"` — confirmed against
     `components/stock-batch/stock-movements.tsx` that `reason` is exactly
     what the Movements/Ledger tab's "Reference/Reason" column renders, so
     the new text reads sensibly there.
  3. New `getOversoldAlerts()` query in the same file, modeled directly on
     the existing `getLowStockAlerts()`/`getExpiryAlerts()`: store-scoped
     via `getActiveStoreId()`, and windowed to `stock_movements` rows from
     the last 30 days (same date-window pattern as `getExpiryAlerts()`) so
     a long-since-reconciled oversell doesn't linger in the alerts list
     indefinitely.
  4. `useStockBatchAlerts()` (`client/lib/hooks/use-stock-batch-alerts.ts`)
     now also queries `getOversoldAlerts()` and folds it into the combined
     alerts array as a third category: `issue: "Oversold"`,
     `severity: "critical"` (always critical — it means recorded and real
     stock have already diverged, not merely that stock is running low).
     No schema migration was needed — `stock_movements.reason` is already a
     plain `TEXT` column, so no `ALTER TABLE` was added to `core.ts`.
- **UI wiring — no component changes needed:** the only current consumer of
  `useStockBatchAlerts()` is `use-bi-data.ts` → `stock_batchAlerts`, passed
  into `business-intelligence-dashboard.tsx` → rendered generically by
  `components/analytics/stock-batch-insights-tab.tsx` (which maps
  `product`/`issue`/`severity`/optional `quantity`/`threshold`/
  `expiryDate`/`daysLeft` fields with no per-category branching). The new
  "Oversold" objects (`product`, `issue`, `severity`, `quantity`) fit that
  shape without any edits to the rendering component. Note:
  `components/stock-batch/needs-attention.tsx` and
  `components/dashboard/dashboard-action-center.tsx` do **not** actually
  consume `useStockBatchAlerts()` — they build their own attention lists
  directly from `getExpiringBatches()`/stock-overview data — so the new
  alert does not appear there; it appears wherever
  `stock-batch-insights-tab.tsx` is rendered (the Business Intelligence /
  Analytics dashboard).
- **Verified by:** `client/__tests__/record-sale-item-stock-depleted-batch.test.ts`
  (three existing cases updated for the new floor-at-0 expectation, one
  case's `reason` assertion added, one new plain-`"Customer sale"`
  regression assertion added for the non-oversold FEFO case) plus a new
  `client/__tests__/get-oversold-alerts.test.ts` (oversold product surfaced;
  a normally-sold product not surfaced; an oversold movement outside the
  30-day window not surfaced). Confirmed RED before each implementation
  step, GREEN after. Full suite re-verified: `npx tsc --noEmit -p .` clean,
  `npx vitest run` 369/369 across 68 files.

### 17. Dashboard's Action Center had zero signal for an oversold/floored product

- **Found:** review of bug #4's fix (finding #16), tracked as bug #9 in
  `_known-bugs.md`.
- **Nature of this fix:** a controller-ruled scoping decision, not just a bug
  squash. `getStockBatchStats()`'s `low_stock_count` SQL requires
  `total_qty > 0`, so a batch floored to exactly `0` by finding #16's fix
  falls into a `critical_stock_count` field nothing in the codebase reads —
  net effect, the Dashboard (the surface most staff/owners check first) was
  blind to exactly the situation finding #16's alert was meant to surface.
  Ruled out as the fix: changing `low_stock_count`'s `total_qty > 0` guard to
  include `0` — that risks a silent behavior/number shift for any other
  consumer relying on the existing boundary. Chosen instead: add a new,
  separate "Oversold" card to the Action Center, additive only.
- **Fix:**
  1. `client/lib/hooks/use-dashboard-overview.ts` now also queries
     `getOversoldAlerts()` (the same query finding #16 added) directly via
     `useQuery(queryKeys.stockBatches.oversoldAlerts())`, and exposes
     `stats.oversoldCount` as `oversoldAlerts?.length || 0`.
  2. `client/components/dashboard/dashboard-overview.tsx` passes
     `oversoldCount={stats.oversoldCount}` into `DashboardActionCenter`,
     the same way `lowStockCount` is threaded.
  3. `client/components/dashboard/dashboard-action-center.tsx` gained a new
     `oversoldCount: number` prop and a new conditional card
     (`if (oversoldCount > 0) { ... }`, modeled directly on the existing
     Low Stock card): `id: "oversold"`, title
     `` `${oversoldCount} ${pluralize(oversoldCount, "Item")} Oversold` ``,
     `priority: "critical"` (destructive/red styling — visually distinct
     from Low Stock's `"warning"`/orange), a new `AlertOctagon` icon (not
     used elsewhere in this component, distinct from Low Stock's
     `PackageX`), and `actionRoute: "/inventory/catalog?status=out_of_stock"`.
- **actionRoute choice:** the catalog tab's own status classification
  (`components/products/types.ts`) independently computes `"out_of_stock"`
  for `stock <= 0` — the same floored-to-0 condition that produces an
  oversold alert — and `product-database.tsx` already reads and applies a
  `status` query param as a real, working filter chip (confirmed by reading
  the code, same mechanism finding #16's sibling fix documented for
  `status=low_stock`). This is a genuinely working destination, not an
  invented/dead route. The alternative considered — deep-linking to the
  Business Intelligence tab where `getOversoldAlerts()` is already surfaced
  (`/reports?tab=analytics`) — was rejected: that page's inner
  `stock_batches` tab (`business-intelligence-dashboard.tsx`) uses
  `<Tabs defaultValue="sales">` with no URL-param wiring to select it, so a
  link there would land on the wrong sub-tab (Sales) with no way to land
  precisely on the stock-batch-insights view without also changing that
  page's own tab-selection logic — out of scope for this fix.
- **Known limitation, not fixed:** `getOversoldAlerts()` is `LIMIT 5`
  (finding #16's design, matching `getLowStockAlerts()`/`getExpiryAlerts()`),
  so `oversoldCount` (its `.length`) undercounts past 5 distinct oversold
  products in the same 30-day window. Same cap already existed for the
  Business Intelligence "Oversold" alert list; not a regression introduced
  here, but worth a dedicated count query if this ever needs to be exact.
- **Verified by:** `client/__tests__/dashboard-action-center-routes.test.ts`
  — new case asserting the `oversoldCount` prop is threaded through
  `dashboard-overview.tsx`, the card is conditional on `oversoldCount > 0`,
  and its `id: "oversold"` card's `actionRoute` is exactly
  `/inventory/catalog?status=out_of_stock`. Confirmed RED (failed on the
  first two assertions) before implementation, GREEN after. Full suite
  re-verified: `npx tsc --noEmit -p .` clean, `npx vitest run` 370/370
  across 68 files.

### 18. Loyalty Program redemption: corrected a wrong "no redemption UI" claim, fixed two real gaps found in the existing feature

- **Found:** review that traced bug #2 in `_known-bugs.md` before acting on
  it.
- **The correction:** bug #2's original entry (from Task 5, Customers) said
  no screen in the app — including POS checkout — let a customer redeem
  earned points, and that redemption was "not wired up anywhere in the
  app." That was wrong. **POS checkout already has a fully working
  redemption UI** (`components/pos/pos-redeem-reward.tsx`, wired into
  `pos-cart.tsx`'s cart summary) that predates this entire smoke-test
  session — traceable to commit `2f1abfd7`. It lets a cashier, once a
  customer is selected, pick from that customer's affordable active
  redemption options and apply the option's naira `discount_value` as the
  cart's discount, showing "Redeeming: <label> (N pts)" with a clear
  button. Task 5's finding was accurate about the *Customers* module
  (Directory, customer detail panel, and the Loyalty tab's own screens
  genuinely have no redeem action) but never checked POS before generalizing
  to "anywhere in the app."
- **Two real gaps were found in the existing, working feature** while
  verifying the correction above — grepped `pos-redeem-reward.tsx`,
  `pos-cart.tsx`, `use-pos-cart.ts`, and `use-pos-payment.ts` for
  `canUseLoyaltyProgram`/`useFeatureGate` and found zero references in any
  of them:
  1. **POS redemption bypassed the plan-tier gate entirely.**
     `useFeatureGate().canUseLoyaltyProgram` (previously
     `getFeature('loyalty_program', 'loyalty_program', isPro ||
     isEnterprise)`) was wired into the Loyalty tab itself by an earlier fix
     this session, but nothing gated the POS redemption path — a Free-tier
     store could redeem points at checkout same as a Pro/Enterprise one.
  2. **No independent on/off switch.** The only gate was plan tier; an
     entitled Pro/Enterprise store had no way to pause the whole program
     (e.g. while reconfiguring rewards, or a seasonal decision to suspend
     it) without downgrading its plan.
- **Fix:**
  1. New `stores.loyalty_program_enabled INTEGER DEFAULT 1` column — added
     to `lib/db/schema.ts`'s `CREATE TABLE stores` for fresh installs, and
     as an `ALTER TABLE stores ADD COLUMN ...` data migration in
     `lib/db/core.ts` for existing installs. **DEFAULT 1 (ON)**, not 0 — an
     existing Pro/Enterprise store already using the loyalty program must
     see zero behavior change from this migration; only a store that
     explicitly flips the new switch off gets paused.
  2. `useFeatureGate().canUseLoyaltyProgram` now ANDs the plan-tier
     entitlement with the store's toggle: `isLoyaltyProgramEnabled(tierAllows,
     storeProfile?.loyalty_program_enabled)`, a pure function (`!==
     0`, so undefined/null pre-migration rows read as "on") extracted into
     `lib/hooks/use-feature-gate.ts` so the AND logic is unit-testable
     without a StoreContext/useSystemConfigStore render harness. A second,
     tier-only value — `canAccessLoyaltyProgramPlan` — was added alongside
     it specifically so Settings UI could decide whether to *show* the
     toggle without a chicken-and-egg bug: gating the switch's own
     visibility on the combined `canUseLoyaltyProgram` would hide it the
     instant it's turned off, making it impossible to turn back on.
  3. `components/pos/pos-redeem-reward.tsx` now calls `useFeatureGate()`
     directly and adds `!canUseLoyaltyProgram` to its early-return
     condition — the entire control (trigger and the active "Redeeming: X"
     display) disappears completely when gated, matching how gated features
     elsewhere hide rather than merely disable (though this component
     doesn't use `LockedModuleOverlay` itself, since it's an inline
     cart-line-item, not a full-page module).
  4. **Mid-session gate-flip handling:** `lib/hooks/use-pos-cart.ts` now
     also calls `useFeatureGate()` and runs a `useEffect` that calls
     `clearRedemption()` whenever `canUseLoyaltyProgram` is false and a
     `redeemedOption` is still staged — covering a plan downgrade or an
     admin flipping the store's toggle in another tab while this one has a
     redemption already picked. Without this, a gated-off session could
     still complete a checkout with a stale redemption's discount applied
     (the UI hides the *control* to start a new redemption, but doesn't by
     itself un-stage one already in cart state).
  5. **Backend defense-in-depth:** `lib/hooks/use-pos-payment.ts` gained a
     `canUseLoyaltyProgram` param (fails closed — defaults to `false`, so a
     caller that forgets to pass it gets no loyalty writes rather than
     silently bypassing the gate) threaded from `use-pos-system.ts`'s
     `useFeatureGate()` call. When it's false: `earnedPoints` is forced to
     `0`, `sales.points_redeemed` is forced to `0`, and the whole
     `loyalty_transactions` insert block (both `earned` and `redeemed` rows,
     plus the `customers.loyalty_points` balance update) is skipped — even
     if a customer and a staged redemption both somehow reach this function,
     e.g. via a stale UI state.
  6. **Settings UI, both places, one mutation:** an "Enable Loyalty
     Program" switch was added to Settings → Business Info's Store Profile
     section (`components/settings/store/store-profile-section.tsx`, next
     to the existing "Enable Online Store" switch, same visual pattern and
     same "always show; click-blocked with an upgrade toast if
     `!canAccessLoyaltyProgramPlan`" convention `canUseEcommerce`/`onlineStoreEnabled`
     already used) and to the Loyalty Settings dialog
     (`components/customers/loyalty-settings-dialog.tsx`) as a
     clearly-separated "Program Status" section above the Tiers/Redemption
     Options tabs. Both read/write the exact same
     `stores.loyalty_program_enabled` field through the exact same
     mechanism — `useStore().updateStoreProfile()`, which is a direct
     `update("stores", storeId, {...})` (confirmed `stores` is not one of
     `STORE_SCOPED_TABLES`'s per-tenant-scoped domain tables — it *is* the
     tenant) — so there is only one persistence path, never two that could
     drift.
- **Testing:**
  - `client/__tests__/use-feature-gate-loyalty.test.ts` — unit tests for
    `isLoyaltyProgramEnabled()`'s AND logic (tier-only, toggle-only,
    both-off, undefined/null-toggle-treated-as-on). RED (function didn't
    exist) confirmed before implementation, GREEN after.
  - `client/__tests__/use-pos-payment-loyalty-gate.test.ts` — the most
    important test in this fix: a real sql.js-backed `usePOSPayment()`
    render (via a minimal `react-dom/client` + React 19 `act()` harness,
    since this repo has no `@testing-library/react`), asserting zero
    `loyalty_transactions` rows are written — earn or redeem — when
    `canUseLoyaltyProgram: false`, with a customer selected and a
    redemption staged, plus a control case confirming both rows are still
    written when the gate is open. RED (control-case assertions passed
    unconditionally pre-fix, i.e. the gate-off case wrote both rows exactly
    like the control) confirmed before the fix, GREEN after.
  - `client/__tests__/init-database-migrations.test.ts` — new case
    confirming the `ALTER TABLE stores ADD COLUMN loyalty_program_enabled`
    migration, run against a legacy store row that predates the column,
    lands on `1` (not `0`), following the existing
    `relaxPurchaseOrdersSupplierIdNullable`-style migration test pattern in
    this file. RED (`no such column`) before, GREEN after.
  - Full suite re-verified after all changes: `npx tsc --noEmit -p .`
    clean, `npx vitest run` 378/378 across 70 files.
- **Docs updated:** `docs/features/customers.md` (Loyalty Program section —
  correction plus the new toggle), `docs/features/pos.md` (Cart section —
  Redeem Reward control documented for the first time, with its gating),
  `docs/features/settings.md` (Business Info section — new switch),
  `docs/features/_known-bugs.md` (bug #2 rewritten from "Open, missing
  feature" to "Fixed" with the corrected record and both real gaps).

### 19. Four independent, previously-logged findings fixed in one round: Dashboard dead-click, Catalog category filter, Prescriptions strength selector, Customers redemption-options fallback

- **Bug A — Dashboard "Product added" activity rows were dead clicks.**
  Originally logged above under "Dashboard: 'Product added' activity rows
  are dead clicks." `dashboard-overview.tsx` had no dialog wired for
  `type === "product"`, so clicking one set `selectedActivity` and nothing
  opened.
  - **Fix:** rather than build a new standalone dialog for a data shape
    that's just a product row, clicking a "product" activity now navigates
    to Inventory > Catalog and opens that product's *current* record —
    `handleActivityClick()` (`components/dashboard/dashboard-overview.tsx`)
    routes `router.push(`/inventory/catalog?productId=${activity.id}`)` for
    `type === "product"` (every other type's existing dialog behavior is
    unchanged). `components/products/product-database.tsx` gained a second
    `useEffect` reading `?productId=`, resolving it against the already-
    loaded product list, calling `setSelectedProduct()` to open the existing
    `CatalogDetailPanel`, then cleaning up the URL — the exact same
    deep-link/cleanup mechanism the component's pre-existing `?action=add`
    handling already used, not a new one. This lands the user on the real,
    live product record (name/price/stock as of now) instead of a frozen
    `rawActivity` snapshot from when the dashboard feed was built.
  - **Verified by:** `client/__tests__/dashboard-product-activity-click.test.ts`
    (new, 4 tests) — source-inspection style (no render harness, matching
    `dashboard-action-center-routes.test.ts`'s convention, since both
    components pull in heavy DB-backed hooks): asserts the product-click
    handler exists, routes to a real `/inventory/<tab>` (validated against
    `app/(dashboard)/inventory/[tab]/page.tsx`'s `allowedTabs`), passes the
    activity's own `id` as `productId`, that Catalog reads/consumes/cleans
    up that param, and that every other activity type's existing dialog
    wiring is untouched. RED (3/4 failing) confirmed by stashing both
    source files before the fix; GREEN after.

- **Bug B — Inventory > Catalog's category filter didn't match the real
  store's categories.** Originally logged above under "Inventory > Catalog:
  Category filter pill and 'Manage Categories' dialog disagree...".
  `getCategoriesList()` (`lib/db/queries/products.ts`) used a strict `AND
  store_id = ?`, excluding this store's legacy bulk-imported categories
  (`store_id IS NULL`, predating the `store_id` backfill — same root cause
  as known-bug #1's fix), so it returned zero rows and the UI silently fell
  back to a hardcoded, wrong generic category list.
  - **Fix:** changed the query to `WHERE _deleted = 0 AND (store_id = ? OR
    store_id IS NULL)`, the exact NULL-inclusive pattern already
    established (and reviewed) in `getCategoryList()`
    (`lib/db/queries/categories.ts`, fixed for known-bug #1). One-line
    change; `getCategoryByName()` in the same file was deliberately left
    untouched (it has a separate, different lack of store-scoping — noted
    as a possible follow-up, not fixed here, per this task's explicit
    scope).
  - **Verified by:** a new case added to
    `client/__tests__/multi-store-scoping.test.ts` — real in-memory sql.js,
    mirroring the exact shape of the sibling `getCategoryList` bug #1 test:
    seeds a NULL-`store_id` legacy category alongside two store-owned ones
    and asserts `getCategoriesList()` surfaces the legacy row to every
    store. RED confirmed by stashing the query fix; GREEN after.

- **Bug C — Prescriptions Strength selector was empty/unusable for products
  with a blank `strength` column.** Originally logged above under
  "Prescriptions: Strength selector is unusable (but harmless)...". The New
  Prescription form's "Strength *" combobox
  (`components/prescriptions/new-prescription/prescription-medications.tsx`)
  was populated only from the selected product's own non-empty `strength`
  values, so a product with a blank `products.strength` rendered a
  required-looking dropdown with zero options.
  - **Fix (chose free-text fallback over hide/optional):** when the
    selected product has zero non-empty strength options
    (`noStrengthOptionsAvailable`), the field now renders a plain text
    `Input` instead of the `Combobox`, so the user can still type a
    strength value; when options exist, the original `Combobox` renders
    unchanged. Free text was chosen over hiding/making the field optional
    because this form has no existing precedent for silently dropping a
    labeled "*" required field when its backing data is empty — a visible,
    still-fillable input keeps the field's contract ("Strength *" is always
    present and always usable) consistent, and costs nothing since
    `newMedication.strength` was already a plain string with no format
    validation. Root cause (blank imported `strength` data) is unchanged —
    this is a rendering fix only, per scope.
  - **Verified by:** `client/__tests__/prescription-strength-fallback.test.ts`
    (new, 3 tests) — a real component render via the manual
    `react-dom/client` + React 19 `act()` harness this repo already uses
    (no `@testing-library/react` installed; `useStore()` mocked since the
    component only reads `storeProfile.currency`). Asserts: the free-text
    input renders (and the combobox's "Select strength" text does not) for
    a product with only a blank strength; the normal combobox still renders
    for a product with real strength options; and the pre-selection
    (disabled) state is unaffected. RED (blank-strength case only)
    confirmed by stashing the component fix; GREEN after.

- **Bug D — Customers' "Points Redemption Options" section was empty until
  Loyalty Settings was opened once.** Originally logged above under
  "Customers: Points Redemption Options section is empty until Loyalty
  Settings is opened once". `ensureLoyaltyDefaultsSeeded()`
  (`lib/db/queries/loyalty.ts`) only runs as a side effect of the Loyalty
  Settings dialog's `open` `useEffect`; tiers already had a client-side
  fallback (`buildFallbackTiers()`,
  `lib/hooks/use-customer-management.ts`) for exactly this first-run gap,
  but redemption options had none.
  - **Fix:** added `buildFallbackRedemptionOptions()` to
    `lib/hooks/use-customer-management.ts`, mirroring
    `buildFallbackTiers()`'s shape/mechanism and mirroring
    `DEFAULT_REDEMPTION_OPTIONS`'s actual seed content (`lib/db/queries/
    loyalty.ts`) exactly (₦500 Discount / ₦1,000 Discount / Free Delivery,
    same points costs and descriptions) so the pre-seed preview matches
    what a user gets once `ensureLoyaltyDefaultsSeeded()` really runs.
    `components/customers/loyalty-tab.tsx` now applies the same
    real-data-wins precedence tiers already follow: `activeOptions.length >
    0 ? activeOptions : buildFallbackRedemptionOptions()` (tiers'
    equivalent is `dbTiers && dbTiers.length > 0 ? ... :
    buildFallbackTiers(isStore)`), so any real, active redemption option
    row immediately takes over from the fallback the moment one exists.
  - **Verified by:** `client/__tests__/loyalty-redemption-fallback.test.ts`
    (new, 4 tests) — a pure unit test on `buildFallbackRedemptionOptions()`
    asserting it mirrors `DEFAULT_REDEMPTION_OPTIONS` field-for-field and
    every row has a unique, stable id (used as the React list key), plus
    source-inspection tests asserting `loyalty-tab.tsx`'s precedence
    expression gates on `.length > 0` before falling back (not
    unconditionally preferring the fallback). RED confirmed by stashing
    both source files; GREEN after.

- **Full-suite verification (all 4 bugs together):** `npx tsc --noEmit -p .`
  clean; `npx vitest run` 390/390 passing across 73 files (up from 378/378
  across 70 files at entry #18 — 3 new test files plus the extended
  `multi-store-scoping.test.ts`).
- **Docs updated:** `docs/features/dashboard.md`, `docs/features/
  inventory.md`, `docs/features/prescriptions.md`, `docs/features/
  customers.md` — each corrected to reflect its respective fix in place of
  the prior stale/dead-click/empty-state claim.

### 20. `sales-lifecycle.spec.ts`'s Cycle Count steps updated to match the current single-screen ledger flow

- **Found:** see the "Open" entry above (now marked fixed) — the spec's
  Cycle Count section still expected the old select-a-category → "Start
  count" → per-product count screen → "Save count" flow. That flow doesn't
  exist anymore; `StockAudits` (`client/components/stock-batch/stock-audits.tsx`)
  opens directly onto a single "ledger" step
  (`client/components/stock-batch/audit-ledger-step.tsx`) with a search box,
  a `FilterPill`-based Category selector (`selectedCategory`/
  `setSelectedCategory`, defaulting to the `ALL_CATEGORIES` sentinel), and a
  flat grid of every product with an inline editable "Counted Qty" cell
  (`EditableNumberCell`) per row, followed by a "Review & submit" step and a
  "done" step.
- **Fix:** rewrote the spec's Cycle Count section
  (`client/e2e/sales-lifecycle.spec.ts`) to match: click "Start Audit" →
  create the target product with a real category ("Antibiotics", typed into
  the freeform category `SearchableInput`) plus a second, decoy product in a
  different real category ("Vitamins") → open the Category `FilterPill` and
  pick the target's category → search for the target product by name → fill
  its inline "Counted Qty" cell directly (no separate per-product screen) →
  "Review & submit" → confirm the item and its qty change appear on the
  review step → "Submit audit" → confirm "Audit submitted" → "Close Audit".
  All locators scoped to the audit overlay's root panel
  (`div.fixed.inset-0.z-50`) after discovering live that unscoped
  `getByPlaceholder`/`getByRole('button', { name: /^Category:/ })` locators
  ambiguously matched the *Catalog* page's own identically-labeled
  search/filter controls still mounted underneath the full-screen overlay.
- **Fix-round correction (code review):** the first pass of this fix picked
  "Uncategorized" as the filter target because the product created above
  never had a category set. Review correctly flagged that this didn't prove
  the filter actually *narrows* anything — finding the row afterward by its
  unique `Date.now()`-suffixed name would have passed identically even if
  category selection were a complete no-op silently showing every product.
  Fixed by adding the second, differently-categorized decoy product and
  asserting, right after selecting the category filter, that the decoy is
  now hidden (`not.toBeVisible()`) while the target product stays visible —
  a real before/after check that only passes if the selected category
  genuinely filtered the grid.
- **Verified live in Chrome** before writing selectors: logged in as PIN
  1111 on Pikarestiv Stores 2, opened Inventory → Start Audit, confirmed the
  "Physical inventory" ledger screen, exercised the Category filter pill
  (`Category: Drugs (689)` etc.), searched for TRAMADOL 100MG, edited its
  Counted Qty inline (diff qty updated live), went through Review & submit
  (showed "Total Counted"/"Adjusted" tiles and a "Qty: -5 → 25" line), and
  submitted — got "Audit submitted", and the resulting stock adjustment
  appeared correctly in Recent Activity. (Also discovered, via a failing
  first-draft assertion against this e2e fixture rather than live Chrome,
  that the isolated Playwright fixture DB starts with zero pre-existing
  products — unlike the real Pikarestiv Stores 2 data browsed above — which
  is what made the decoy-product approach necessary.)
- **Verified by:** `npx playwright test --project=chromium
  e2e/sales-lifecycle.spec.ts --no-deps`, run 3 times in isolation both
  before and after the fix-round correction (6 runs total), all green
  (~12-40s each). One earlier run failed only when launched concurrently
  with a separate full `e2e/auth.spec.ts` run against the same dev
  server/backend — the shared `login()` helper timed out waiting for the
  login page under that concurrent load, unrelated to this spec's own
  changes; re-run alone, it passed immediately. `npx tsc --noEmit -p .`
  clean both rounds; `npx vitest run` 390/390 passing both rounds
  (unchanged — e2e-only change).

### 21. `auth.spec.ts` switched off its stale inline login pattern

- **Found:** see the Summary section above — `e2e/auth.spec.ts` duplicated
  the old `getByPlaceholder('admin')`/`getByPlaceholder('••••')` login
  pattern inline in 3 of its 4 tests instead of using the shared, already-
  fixed `login()` helper in `e2e/fixtures.ts` (which uses the current
  `InputOTP`-based PIN entry, `input[data-input-otp="true"]`, not a
  placeholder-based text input).
- **Fix (`client/e2e/auth.spec.ts`):**
  - "should redirect unauthenticated users to login" — unchanged, never used
    `login()` and doesn't need to.
  - "login page should have expected fields from seeded DB" — kept as a
    direct field-assertion test (its whole point is checking the login
    page's real fields, so calling `login()` would defeat the purpose), but
    swapped the stale `getByPlaceholder('••••')` PIN assertion for
    `page.locator('input[data-input-otp="true"]').first()`, matching
    `components/auth/traditional-login-form.tsx`'s real `InputOTP` field.
    The username field's placeholder assertion (`getByPlaceholder('admin')`)
    was still correct and left as-is.
  - "rejects an incorrect PIN" — same swap applied to the fill step (fills
    the real `InputOTP` field with `'0000'` instead of the nonexistent
    `'••••'`-placeholder input); still doesn't use the shared `login()`
    helper, since that helper is built to succeed, not to test rejection.
  - "logs in successfully with the seeded admin credentials" — simplified to
    call the shared `login(page)` helper directly. This test never needed to
    inspect the login form's own fields (test 2 already covers that) — it
    only needed to end up authenticated and check the dashboard result, so
    routing it through the shared helper removes the duplicated fill-in
    steps without changing what the test actually verifies.
- **Verified live / by reading source:** `components/auth/traditional-login-form.tsx`
  confirmed directly — username is still a placeholder-based `Input`
  (`placeholder="admin"`), PIN is an `InputOTP` with 4 `InputOTPSlot`s and no
  `'••••'` placeholder anywhere. Also confirmed via Claude-in-Chrome: logged
  in with PIN 1111 on Pikarestiv Stores 2 through the same PIN-unlock
  `InputOTP` pattern.
- **Verified by:** `npx playwright test --project=chromium e2e/auth.spec.ts
  --no-deps`, run 3 times, all 4 tests green every time (~9-10s each run).
  `npx tsc --noEmit -p .` clean; `npx vitest run` 390/390 passing.

## Open

(Sections below add entries here as they're walked.)

### Prescriptions: "-5/142" stock-batch display anomaly (bug #3) re-investigated — explained, not a bug

- **Found:** re-investigation of bug #3 in `_known-bugs.md` (originally
  Task 4, Prescriptions), requested specifically because the first round's
  investigation was inconclusive — it never recorded either batch's `id`.
- **Technique used:** the app's dev-only `window.getDatabaseBinary()` hook
  (`client/lib/db/core.ts`, gated on `NODE_ENV === "development"`) exports
  the live sql.js database as a `Uint8Array`. Loading a matching-version
  `sql.js` (`1.13.0`, matching `client/package.json`) via a `<script>` tag
  into the same page and opening a fresh `SQL.Database(binary)` instance
  from it gives direct, authoritative SQL access to whatever the running
  app currently has in local storage — far more conclusive than reading
  rendered UI cards, and doesn't require any app code changes. (An `esm.sh`
  ESM import of `sql.js` was tried first and failed on both a version
  mismatch against the locally-served `.wasm` and, at a matching version, an
  unrelated `unenv`/`fs.readFileSync` polyfill gap in that bundler's build —
  the plain UMD `<script>` tag from jsdelivr's `dist/sql-wasm.js` worked
  cleanly instead.)
- **Root cause found:** not a display, cache, or write-path bug at all. Two
  different products, in two different stores on this account (Pikarestiv
  Stores and Pikarestiv Stores 2), are both named "TRAMADOL 100MG" — the
  147 (Activity Log) and -5 (Inventory) figures the first round compared
  belonged to two entirely different `products.id`/`stock_batches.id`/
  `store_id` combinations that happen to share a display name, not to one
  batch being shown two ways. See `docs/features/prescriptions.md`'s
  "Caveat on Inventory's displayed stock" section for the full batch-id
  trail, and `_known-bugs.md`'s bug #3 entry for the closing summary.
- **Bonus finding:** the -5 batch's one `stock_movements` row is a real
  oversell (a batch with 0 stock, dispensed 5 units against) written
  *before* bug #4's floor-at-0 fix (`2ed46c9e`) landed — i.e. it's a
  pre-fix artifact, not evidence the fix doesn't work. A fresh, clean
  reproduction (new single-store single-batch product, stocked via Cycle
  Count, dispensed via a real prescription) showed correct behavior
  throughout with one continuous batch id and no negative anywhere.
- **No code changed.** Investigation-only, per task scope.

### Expenses: walkthrough found no bugs; e2e coverage gap closed

- **Checked:** categories (Rent/Utilities/Salaries/Maintenance/Marketing/
  Other) via both the category filter tabs and the Add/Edit form; the
  `covers_months` "spread over how many months?" field — the schema's actual
  substitute for a recurring/one-off distinction (there is no
  `is_recurring`/cadence column) — on both create and edit, confirming its
  smoothing math (`getSmoothedAmountInWindow()`) live-updates the "This
  month"/"Top category" Insights cards correctly; the `notes` column (added
  per the migration comment in `core.ts`) on create, edit, and the detail
  dialog; edit of an existing expense (full dialog); delete of an existing
  expense (with its `ConfirmDialog`); and the desktop table's inline
  "quick edit" pencil (category + amount only) including Cancel leaving the
  row unmodified.
- **Finding:** no bugs. Everything behaved as the code predicts, including
  the smoothing math staying in sync across an edit (₦12,000/12mo → ₦1,000
  "This month"; edited to ₦15,000/12mo → ₦1,250 live, no reload).
- **Coverage gap confirmed (Step 3):** `e2e/expenses.spec.ts` had exactly one
  test (add only) — edit and delete of an existing expense had zero e2e
  coverage.
- **Closed (Step 4):** added "should edit an existing expense and then delete
  it" to `e2e/expenses.spec.ts` — creates its own fixture expense, edits its
  description/amount via the full Edit dialog, asserts the update stuck, then
  deletes it via the detail dialog's Delete → Confirm flow and asserts the
  row is gone.
- See `docs/features/expenses.md` for full detail.

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
- **Fixed** — see "Resolved" #19 (Bug A) above: clicking a "product"
  activity row now navigates to Inventory > Catalog and opens that
  product's real, current record via a `?productId=` deep link, instead of
  building a new dialog for a frozen `rawActivity` snapshot.

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
- **Fixed** — see "Resolved" #19 (Bug B) above: `getCategoriesList()` now
  uses the same NULL-inclusive `(store_id = ? OR store_id IS NULL)` pattern
  already established in `getCategoryList()`'s known-bug #1 fix, so this
  store's legacy bulk-imported categories (Drugs, Cosmetics, etc.) surface
  correctly instead of falling back to a hardcoded generic list.
  `manage-categories-dialog.tsx`'s separate lack of `store_id` scoping in
  `getCategoryList()` was already fixed under known-bug #1, prior to this
  task. See `docs/features/inventory.md` for full detail.

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

### e2e suite: `sales-lifecycle.spec.ts`'s Cycle Count steps are stale (second instance of the drift above) — fixed, see "Resolved" #20

- **Found while writing `e2e/pos-held-transaction.spec.ts`:** that new spec
  needed real stock, so it followed `sales-lifecycle.spec.ts`'s
  select-a-category → "Start count" → per-product count screen → "Save
  count" pattern for Cycle Count. Live in Chrome, "Start Audit" instead goes
  straight to a single "Physical inventory" screen: a search box + one flat
  grid of every product with an inline editable "Counted Qty" cell per row —
  no per-category "Start count" step at all. `sales-lifecycle.spec.ts` (and
  this task's first draft of `pos-held-transaction.spec.ts`) hang forever
  waiting for a "Start count" button that no longer exists.
- **Not fixed at the time:** out of scope for Task 3 (POS); `sales-lifecycle.spec.ts`
  predates this task. `pos-held-transaction.spec.ts` was written against the
  current UI instead of copying the stale pattern, so it isn't affected.
  **Fixed in a later pass** — see "Resolved" #20 below.

### Prescriptions: dispensing does *not* have a third copy of the stock-deduction bug — confirmed, no fix needed

- **Checked:** whether prescription dispensing (Task 4) independently
  reimplemented the "fetch positive-stock batches, loop, deduct" pattern
  that was found duplicated (and separately fixed) in POS checkout and
  online-order fulfillment.
- **Finding:** it does not. `handleDispense`
  (`client/lib/hooks/use-prescription-management.ts`) only navigates to
  `/pos?dispense_rx=<id>`; `usePOSPrescription`
  (`client/lib/hooks/use-pos-prescription.ts`) loads the prescription's
  items into the POS cart; checkout then runs through the normal POS
  payment path (`client/lib/hooks/use-pos-payment.ts`), which calls the
  shared, already-fixed `recordSaleItemStock()`
  (`client/lib/db/queries/inventory.ts`) for every line, then marks the
  prescription completed/refilled on success. No prescription-specific
  stock-deduction code exists at all.
- **Verified live:** dispensed a real prescription (TRAMADOL 100MG × 5)
  through Ready for pickup → Dispense → POS cash checkout. Activity Log
  confirmed the full write chain (sale → sale item → stock batch update →
  sale item batch → stock movement → prescription status), and the stock
  batch's logged post-sale quantity was correct (147 → 142).
- **Not a bug; no fix applied.**
- See `docs/features/prescriptions.md` for full detail, including a
  separately-flagged (not fixed) display discrepancy where Inventory's
  Catalog/Batches UI showed -5 units for that same batch after the sale,
  despite the Activity Log recording the write as 142. A fix-round-1
  follow-up retracted the original "cross-task interference" theory (the
  harness runs one implementer subagent at a time, so no second task could
  have been writing concurrently) and instead ruled out, by reading the
  code: a rendering bug substituting a movement's delta for the stored
  quantity, a double-deduction write, a cache-invalidation gap, and a sync
  pull/push reconciliation overwrite. The leading unverified candidate is
  that the "-5" card belongs to a different, pre-existing `stock_batches`
  row for the same product than the one the dispense actually updated to
  142 — unconfirmed since the original observation didn't record batch IDs.
  Left as an open question, not attributed to concurrency.

### Prescriptions: Strength selector is unusable (but harmless) for any product with a blank `strength` column

- **Found while walking:** the New Prescription form's "Strength *" combobox
  for a chosen medication is populated only from that product's non-empty
  `strength` values. TRAMADOL 100MG (and apparently other imported products
  on this store) has a blank `products.strength`, so the dropdown renders
  with zero options once selected — a required-looking field the user
  cannot interact with.
- **Not a blocking bug:** `newMedication.strength` defaults to `""` and the
  product-lookup match (`name && strength` equality) still succeeds against
  the batch's own blank `strength`, so "Add Medication" works anyway.
  Confirmed live — added TRAMADOL 100MG to a prescription without ever
  touching the Strength field.
- **Fixed** — see "Resolved" #19 (Bug C) above: the Strength field now
  falls back to a free-text `Input` when the selected product has zero
  non-empty strength options, instead of rendering an unselectable empty
  combobox. Root cause (blank imported `strength` data) is unchanged — this
  was a rendering fix only.
- **Coverage:** `client/__tests__/prescription-strength-fallback.test.ts`
  (new).

### Customers: points redemption is configurable but not actually redeemable anywhere

- **Found while walking:** the `loyalty_redemption_options` table and its
  Loyalty Settings UI let an owner define rewards (e.g. "₦500 Discount" for
  500 points), but no surface in the app — Directory, customer detail panel,
  or POS checkout — has a "redeem points" action against them. They're
  purely configuration with no consuming feature. The `loyalty_transactions`
  table (a ledger of points earned/redeemed) similarly has no dedicated UI;
  points only ever show as a running balance.
- **Not fixed:** this is a missing feature, not a regression — nothing was
  broken by this task's changes. Out of scope to build a full redemption
  flow during a smoke-test pass.

### Customers: Points Redemption Options section is empty until Loyalty Settings is opened once

- **Found while walking:** `LoyaltyTab` shows "No redemption options
  configured yet." on a store that has never opened **Loyalty Program →
  Edit Settings**, because `ensureLoyaltyDefaultsSeeded()` only runs as a
  side effect of that dialog's `open` useEffect — there is no fallback list
  for redemption options the way tiers have `buildFallbackTiers()`. Opening
  Edit Settings once seeds the defaults and the main tab then shows them
  correctly.
- **Fixed** — see "Resolved" #19 (Bug D) above: added
  `buildFallbackRedemptionOptions()` (mirroring `buildFallbackTiers()`'s
  mechanism and `DEFAULT_REDEMPTION_OPTIONS`'s actual seed content) to
  `use-customer-management.ts`; `loyalty-tab.tsx` now shows it whenever the
  real, active redemption-options list is empty, with real data always
  taking precedence once it exists — same precedence rule tiers already
  followed.

### Customers: `recordCustomerPayment` checked for the recurring accumulation-bug pattern — confirmed no bug

- **Checked:** per this task's brief, whether recording a customer payment
  independently reimplemented the same category of edge-case bug found
  duplicated elsewhere in this codebase (a `quantity > 0`-filtered batch loop
  that silently drops/mis-attributes writes once a resource is exhausted —
  found in POS checkout and online-order fulfillment, confirmed absent in
  prescription dispensing).
- **Finding:** it does not have that bug. `recordCustomerPayment`
  (`client/lib/db/queries/customers.ts`) clamps the resulting balance to
  `max(0, currentBalance - amount)` rather than going negative on
  overpayment, and its FIFO sale-allocation loop (`applyCreditPaymentFIFO`)
  stops once `remaining <= 0`, so it never over-allocates past a sale's own
  total even when the payment exceeds everything owed. Confirmed by
  `client/__tests__/customer-payments.test.ts` (new, 4 tests, all pass
  against the existing implementation unmodified).
- **Not a bug; no fix applied.**
- See `docs/features/prescriptions.md` for full detail.

### Procurement: `receivePurchaseOrder` checked for the recurring accumulation-bug pattern — confirmed no bug, opposite failure mode

- **Checked:** per this task's brief, whether a purchase order's "received"
  status flows into `stock_batches` via the same category of edge-case bug
  found duplicated elsewhere in this codebase (independently reimplemented
  quantity-accumulation logic, sometimes buggy — found and fixed in POS
  checkout / online-order fulfillment stock *deduction*, confirmed absent in
  prescription dispensing), and specifically whether a **partial receive**
  (less than ordered) is handled correctly.
- **Finding:** it does not have that bug, and structurally can't have the
  same shape of bug. `receivePurchaseOrder()`
  (`client/lib/db/procurement-receiving.ts`) always `insert()`s a brand-new
  `stock_batches` row per line item — a product's total stock is
  `SUM(quantity) FROM stock_batches`, never a single mutable counter — so
  there is no shared running total an insert could double-apply to or
  clobber. This is the opposite failure mode from the deduction bugs found
  elsewhere. Partial receive is honored correctly: the "Receive Goods" form
  lets the user override `bulk_quantity` per line, and the batch/movement
  math is entirely driven by that override, not the PO's original ordered
  quantity — confirmed both by reading the code and live, on
  "Pikarestiv Stores 2": ordered 3 Cartons, received 2, catalog showed
  exactly 2 Units afterward (not 3).
- **Not a bug; no fix applied.** New e2e coverage added instead (see
  "Resolved" #8 above) since this path — Standard PO receiving — had zero
  automated coverage before this task.
- See `docs/features/procurement.md` for full detail.

### Activity Log: cross-task audit trail confirmed intact; zero e2e coverage gap closed

- **Checked (Step 1, per the brief's own elevated priority):** whether three
  already-completed actions from earlier tasks — the product import (Task 1),
  the purchase-order create/receive cycle (Task 6), and the expense
  add/update/delete (Task 7) — each left a correct, traceable entry in the
  Activity Log. This was the whole point of walking this section last.
- **Finding:** all three were present and correct. Searching `products`
  surfaced one "Created a product" row per imported product (1,132 rows for
  this store, confirming the import path logs per-row through the shared
  `insert()` helper rather than skipping audit logging for bulk operations).
  The full PO create → update → receive-goods cycle from Task 6 appears with
  the right named action (`RECEIVE_PO` → "Received goods for a purchase
  order") and the right table (`purchase_orders`); filtering Action to it
  narrowed to exactly the 3 real receive events on this store. The expense
  create/update/delete from Task 7 all appear (`Created a expense` / `Updated
  a expense` / `Removed a expense`), and opening the "Created" entry's detail
  panel showed the exact Category/Amount/Description/Notes/Covers Months
  entered at creation time. No missing entries, no silent audit-trail gap.
- **Filters exercised live:** Search (text, matches `action`/`table_name`/
  `user_name` only, not `details`), Date range (presets + calendar), Action
  (dropdown populated from distinct actions present), Role and Staff
  (owner-only, per `checkCanViewAllActivity`). All behaved correctly. Note:
  there is no discrete "Table" filter pill in the UI despite the query layer
  supporting a `tableName` param — the closest equivalent is typing the table
  name into Search, since `table_name` is one of the three fuzzy-search
  fields.
- **Also confirmed:** Activity Log itself is not plan-gated (no
  `LockedModuleOverlay` on its page, no `featureKey` entry for it — the
  `"audit"` key in that union is `canUseAuditMode`, a separate stock
  cycle-count feature, not this page).
- **Coverage gap confirmed (Step 3):** `grep -rln "activity.log\|audit_logs"
  __tests__/ e2e/` found existing unit coverage of the query layer
  (`activity-log-store-scoping.test.ts`, `activity-log-filters.test.ts`) but
  zero e2e/UI-level coverage before this task.
- **Closed (Step 4):** added `client/e2e/activity-log.spec.ts` — adds a
  uniquely-named expense (the traceable action; Expenses itself is
  paid-tier-gated so the test uses the same `__e2eSetSubscriptionTier`
  dev-only escape hatch `expenses.spec.ts` established), navigates to
  Activity Log, and asserts the newest row is "Created a expense" /
  `expenses`, then opens the detail panel and confirms the Description/Amount
  match what was just entered and the actor is a real user, not "System".
- **Not fixed:** no bug found — Step 5 required no action.
- See `docs/features/activity-log.md` for full detail.

### Settings: 21-tab coverage gap closed; `roles` tab confirmed to be an unimplemented placeholder

- **Coverage gap confirmed (Step 3):** `grep -rl "settings" e2e/ __tests__/`
  found exactly one incidental hit (`prescriptions.spec.ts`'s
  `page.goto('/settings/business-info')`, used only to seed a PCN license
  number for an unrelated test — it exercises no Settings behavior itself).
  **Zero dedicated e2e or unit coverage existed for any of the 21 Settings
  tabs before this task** — the single biggest, and only fully-empty,
  coverage gap found across the whole smoke-test project.
- **Also found (Step 1):** the `roles` tab (`Roles & Permissions` in the nav,
  shown with a disabled "Soon" badge) is not a real settings panel at all —
  it renders `RolesPermissionsPlaceholder`, a static "coming soon" card with
  no fields, toggles, or forms of any kind. Not a bug (the nav badge already
  advertises this honestly), but it meant the brief's Step 4 instruction to
  cover `roles` alongside `staff`/`security`/`data` with a "change one real
  setting, reload, assert it persisted" test couldn't be followed literally
  — there is no real setting on that page. `e2e/settings.spec.ts` instead
  asserts the placeholder renders correctly, and this fact is documented
  explicitly (both here and in `docs/features/settings.md`) rather than
  silently adapting the test to fake a persistence assertion.
- **Also confirmed:** most of the brief's 21 listed tab names are not 21
  distinct panels — `general`/`account`/`store`/`alerts`/`cloud` are URL
  aliases (`TAB_ALIASES` in `hooks/use-settings.ts`, plus two special-cased
  renames) that resolve to `appearance`/`personal-info`/`business-info`/
  `notifications`/`data` respectively. `docs/features/settings.md` gives
  each brief-listed name its own `##` heading as requested, with the aliased
  ones pointing at their canonical section instead of duplicating content.
- **Closed (Step 4):** added `client/e2e/settings.spec.ts`, prioritized by
  blast radius per the brief: `staff` (create a fixture account, edit its
  System Role, reload, assert persisted), `security` (Auto-Lock interval,
  reload, assert persisted), `data`/`cloud` (Sync Interval — directly tied
  to Task 0's sync-queue transaction race fix — reload, assert persisted;
  also smoke-tests the `cloud` alias route itself), and `roles` (placeholder
  assertion, per the note above). Auto-Lock and Auto-Sync are both paid-tier
  features and Staff account creation is capped at 0 seats on the free tier,
  so the spec elevates its own per-test tier via the same dev-only
  `window.__e2eSetSubscriptionTier` hook `expenses.spec.ts` established —
  the shared fixture DB stays free-tier on purpose for other specs.
- **Deliberately scoped out, and stated here rather than silently skipped:**
  purely cosmetic tabs (`appearance`/`general` — device-local theme/color/
  sidebar preferences with no business-state impact) and the read-only/
  informational `system` tab. Matches the brief's explicit instruction to
  prioritize by blast radius, not tab count.
- **Fixed as part of Step 5:** see finding #11 above (the cloud-link dialog
  loop), found while writing this spec's `data`/`cloud` test.
- **Also confirmed live (Data tab cross-reference):** the auto-sync interval
  UI is exactly the surface for Task 0's Finding #2 fix. This store's
  pre-existing Sync Interval was "Every 30 Minutes" (the Pro-tier
  `minimumSyncIntervalMinutes`, not a flat 15), and changing it to "Every 1
  Hour" persisted correctly across a reload. The brief's claimed literal
  `|| 15` fallback does exist in the code, but in `handleSaveAutoSyncSettings`
  (`hooks/use-settings.ts`), not the initial-state default the brief's
  phrasing suggested — see `docs/features/settings.md`'s Data section for
  the full breakdown of the two separate `15`-related fallbacks.
- See `docs/features/settings.md` for full detail.

### Task 6 correction: `logRequestedProduct()` does not share the fixed deduction bugs' bug shape, but has a real, different, minor substring-matching issue

Task 6 flagged `logRequestedProduct()`'s de-dupe-by-name update path
(`lib/db/requested-products-queries.ts`) as having the same
"quantity-accumulation bug shape" as the fixed stock-deduction bugs
(findings #6 above etc.) — on final review this is a misdiagnosis: it's
purely additive demand-tracking (never deducts anything), structurally
different from the deduction bugs. It does have a real, different, minor
issue instead: its de-dupe of an existing row's `requested_by_customer`/
`note` fields uses plain `String.includes()` (lines ~32 and ~42), so a
customer named "Ann" is silently treated as already-present (and not
appended) if the field already contains "Joanna" — a substring
false-positive, same for note-text matching. Low blast radius (only affects
the wishlist/requested-products feature), pre-existing (not introduced by
this plan), and the function already has some test coverage — left open
rather than fixed in this pass.

### Authentication: dedicated walkthrough closes the audit gap; item #7 (account/store-switch stale-dashboard report) investigated, not reproduced

- **Walked live** (Pika Restiv / Store Owner, PIN `1111`, on "Pikarestiv
  Stores 2" / "Pikarestiv Stores"): the clock-in/account-tile PIN screen
  (`UserSelection`/`PinEntry`), correct-PIN login (from both the tile
  picker and the "Someone else" traditional username+PIN form),
  incorrect-PIN handling (shake animation, toast, `LOGIN_FAILED` audit log,
  no lockout), "Switch Account" (non-destructive, reuses the lock screen),
  "Log out completely" (destructive — clears `dumos_recent_users`, shows an
  "Unsynced Changes Detected" confirmation when offline transactions are
  pending), protected-route behavior when logged out (a stripped Settings
  shell briefly renders before the client-side redirect to `/login`
  completes — no real data exposed, since this app's `output: export` build
  has no server-side auth gate to begin with), the store switcher
  (`HeaderStoreSwitcher`, 2 stores on this account), the multi-staff-PIN
  switch (3 real accounts on this device, including two Sales-Staff
  fixtures from the Settings task), and the Ctrl/Cmd+L auto-lock trigger
  (a faithful stand-in for the real 5-minute idle timer, since both call the
  same `lock()` action) — confirmed a quick PIN re-entry unlock, not a full
  logout.
- **Item #7 investigation (this task's main focus):** exercised the store
  switcher 6 times and the multi-staff account switch (a structurally
  different code path — `login()`'s `queryClient.clear()` vs.
  `switchStore()`'s `invalidateQueries()`) at least once, each time firing
  the switch and capturing rapid back-to-back screenshots with no manual
  delay via `browser_batch`. **Could not reproduce the reported "old
  dashboard shown for ~1 second" flash** — every screenshot, including the
  very first one taken immediately post-switch, already showed fully
  correct new-store/new-user data (stat cards, Action Center contents,
  Recent Activity rows all matched the destination context), and
  `read_console_messages` showed no errors during any switch. The candidate
  root cause (`switchStore()`'s untargeted `invalidateQueries()`, which by
  React Query design renders stale cached data until a background refetch
  resolves) is confirmed real by reading the code, but in this app's
  local-first architecture (dashboard/store data is read from on-device
  sql.js, not fetched over the network) the refetch appears to resolve fast
  enough to be imperceptible on this test device/data volume. **Conclusion:
  investigated, not confirmed as a live data-correctness bug** — reads as
  expected React-Query stale-while-revalidate behavior that happens to be
  fast enough here not to matter, not "working as intended and therefore
  untouchable": a slower device, a much larger local database, or
  network-sync contention during the switch could plausibly still surface
  the reported symptom, which this session's environment couldn't test.
  Suggested (not implemented) follow-up: a real screen recording on the
  reporter's device next time it's seen, and/or a dedicated
  loading/placeholder state on the store-switch transition itself as
  defense-in-depth regardless of whether the report reproduces again.
- **Not fixed; no application code changed** — this task was investigation
  and documentation only, per its brief.
- See `docs/features/auth.md` for full detail and
  `docs/features/_known-bugs.md` item #7 for the tracker update.
