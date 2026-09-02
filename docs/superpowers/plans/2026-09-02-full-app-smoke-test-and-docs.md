# Full-App Smoke Test, Feature Documentation & Coverage Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walk every section of the DumosRx app against real seeded data, produce a feature doc per section, close real test-coverage gaps, and fix any bug/UX issue found — landing in a state ready for a client-facing walkthrough with Cynthia.

**Architecture:** This is an audit plan, not a feature-build plan: the "bugs to fix" and "tests to add" are not knowable up front, so unlike a normal implementation plan this one cannot pre-write the fix code — each task instead specifies the exact procedure (which URL to open, which files back that screen, which existing test files already cover it, where to write findings) so an executor with zero context can run the same repeatable process per section. Two real bugs were already found and fixed via this exact process during the Product Catalog import (see Task 0); every other section gets the same treatment. Findings that turn into actual code changes must still go through superpowers:systematic-debugging (for bugs) and superpowers:test-driven-development (for new tests) — this plan sequences *where* to look, not a substitute for those skills once something concrete is found.

**Tech Stack:** Next.js (client/), sql.js (in-browser SQLite) with a Laravel/MySQL sync backend, Vitest for unit/logic tests (`client/__tests__/`), Playwright for e2e (`client/e2e/`), Claude-in-Chrome for manual walkthroughs against the running dev server (`npm run dev`, port 3000).

**Spec:** None pre-exists for this effort; this plan doubles as the spec. Prior related design doc: `docs/superpowers/specs/2026-08-31-stock-import-export-design.md`.

## Global Constraints

- Use the **Pikarestiv Stores 2** account/store for all manual walkthroughs (seeded via Sheet1 of `refs/client-requirement-meeting-with-ada-27082026/exports/QB-export-POS-Inventory-Items-Export.xls`, 1,513 real products, confirmed synced). Never run destructive test flows (bulk delete, "wipe data") against **Pikarestiv Stores** (the original/primary account) — that data is not disposable.
- Every section's feature doc goes to `docs/features/<section-slug>.md` (new directory — does not exist yet, create it in Task 1).
- Every new automated test must go in the existing `client/__tests__/` (Vitest, logic/data-layer) or `client/e2e/` (Playwright, full-flow UI) — match whichever an existing sibling test in that area already uses; don't introduce a third test runner or location.
- Before marking any task done: `npx tsc --noEmit -p .` and `npx vitest run` must both be clean (client/ directory). If the task touched e2e specs, also run the specific new/changed spec via `npx playwright test e2e/<file>.spec.ts`.
- Commit after each task (not each step) with a message describing what was audited/fixed/documented — this plan generates many small, independent commits, not one giant one.
- Every UI walkthrough step uses Claude-in-Chrome tools (`tabs_context_mcp`, `navigate`, `computer`, `read_page`, `read_console_messages`) against `http://localhost:3000`, logged in as the Store Owner PIN account on Pikarestiv Stores 2. If the dev server (port 3000) or Laravel backend (port 8000, `php artisan serve` from `laravel-server/`) aren't already running, start them before Task 1.

---

## Task 0: Baseline — confirm the import and prior fixes are solid (no new work, verification only)

**Files:** None modified. Read-only verification.

- [ ] **Step 1: Confirm Store 2 product count matches the source file**

```bash
cd /Users/admin/Documents/Projects/DumosRx/laravel-server
php artisan tinker --execute="echo App\Models\Product::where('store_id','41f6c73a-14ec-4b1c-b62d-c2652de3c3c9')->count();"
```

Expected: `1513` (matches Sheet1's row count from the earlier import).

- [ ] **Step 2: Confirm the two prior fixes are present and tested**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -n "queueTableInvalidation\|awaitSettledTransactions" lib/db/core.ts lib/db/base-helpers.ts
npx vitest run __tests__/sync-queue-transaction-race.test.ts __tests__/db-transaction.test.ts
```

Expected: both fixes present, both test files pass (2 + 6 tests).

- [ ] **Step 3: Record the two fixed issues as "resolved" findings**

Create `docs/features/_findings-log.md` (this is the running findings log every later task appends to, so start it now):

```markdown
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

## Open

(Sections below add entries here as they're walked.)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/_findings-log.md
git commit -m "docs: start smoke-test findings log, record the two import-time fixes"
```

---

## Task 1: Dashboard

**Files:**
- Walkthrough target: `app/(dashboard)/dashboard/page.tsx` → `components/dashboard/dashboard-overview.tsx`
- Existing e2e coverage: `client/e2e/dashboard.spec.ts` (login renders stat cards; "New Sale" button navigates to POS; sidebar links navigate)
- New doc: `docs/features/dashboard.md`
- New/updated tests: `client/e2e/dashboard.spec.ts` or a new `client/__tests__/` file, depending on what gap is found (see Step 3)

- [ ] **Step 1: Walk the section live**

Using Claude-in-Chrome, log into Pikarestiv Stores 2 and open `http://localhost:3000/dashboard`. Exercise every visible control: stat cards, date range picker (if present), any charts, "New Sale" button, alerts/notifications bell, sync indicator. Note exact behavior of each (what data it shows, what it links to, any loading/error states you can trigger by e.g. toggling network offline via devtools).

- [ ] **Step 2: Write `docs/features/dashboard.md`**

One `##` heading per distinct feature/control found in Step 1. For each: what it does, what data source backs it (name the query/hook, e.g. grep `components/dashboard/dashboard-overview.tsx` for its `useQuery` calls), and any caveat observed live (e.g. "stat cards show 0 units for products imported with no quantity mapped").

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -rn "dashboard" __tests__/ | grep -iv "sync\|import" 
cat e2e/dashboard.spec.ts
```

List, in the findings log's Open section, any control exercised in Step 1 that has zero coverage in either file. Prioritize business-logic gaps (a stat card computing a wrong number) over pure-UI gaps (a button's hover state) — the latter isn't worth a new test.

- [ ] **Step 4: Add the highest-value missing test**

Follow superpowers:test-driven-development: write the failing test first, run it, then confirm it passes against current behavior (this is coverage for existing behavior, not a bug fix, so it should pass immediately — if it doesn't, that's a bug, go to Step 5).

- [ ] **Step 5: Fix any bug found in Step 1**

If Step 1 surfaced an actual defect (wrong number, broken link, console error), follow superpowers:systematic-debugging: reproduce, find root cause, write a regression test that fails before the fix and passes after (same verify-it-actually-catches-the-bug discipline used for the sync-queue fix — temporarily revert your fix, confirm the test fails, restore it). Log it under "Resolved" in the findings log with the same structure as Task 0's two entries.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/dashboard.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test Dashboard, document features, close coverage gap"
```

---

## Task 2: Inventory (Overview / Catalog / Movements / Batches / Ledger / Audits tabs)

**Files:**
- Walkthrough target: `app/(dashboard)/inventory/page.tsx`, `app/(dashboard)/inventory/[tab]/page.tsx` (tabs: `overview`, `catalog`, `batches`, `ledger`, `audits`)
- Key components: `components/products/product-database.tsx`, `components/products/catalog-list.tsx`, `components/stock-batch/*` (import/export toolbar, mapping dialog, stock audits, stock movements)
- Existing e2e coverage: `client/e2e/products.spec.ts` (login+navigate, Overview/Ledger "Add Product" action, quick-add dialog open/close from Catalog) — **no e2e coverage for Batches, Movements, or Audits tabs, and no e2e coverage at all for Import/Export**, which is exactly the flow that had two bugs.
- New doc: `docs/features/inventory.md`

- [ ] **Step 1: Walk every tab live**

Open each of Overview, Catalog, Movements, Batches (if present as its own tab vs. under a product), Ledger, Audits against the 1,513-product Store 2 dataset. For Catalog specifically: search, category filter, inventory filter, sort by each column, "Manage" button, "Export" (both CSV and XLSX), and re-run the multi-sheet Import flow described in this session (confirm the sheet-picker still works post-fix). For Audits: start a stock audit and check its flow end to end (this is new, untested surface per the file list above).

- [ ] **Step 2: Write `docs/features/inventory.md`**

Document every tab and control, same format as Task 1 Step 2. Explicitly note the multi-sheet import behavior (sheet picker, auto-mapping, dedupe-by-name-and-category warning) since that's now a documented, user-facing feature with real production usage (1,513-row import).

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
ls __tests__ | grep -i "product\|stock\|batch\|audit\|ledger"
cat e2e/products.spec.ts
```

The known gap: no e2e spec exercises Batches, Movements, or Audits tabs, and no e2e spec touches the Import dialog (only Vitest-level logic tests exist for `parseWorkbookSheet`/`importProductRows`, not the actual dialog UI/sheet-picker interaction). Log these gaps in the findings log.

- [ ] **Step 4: Add e2e coverage for the Import dialog's sheet picker**

This is the highest-value gap: two real bugs shipped through this exact flow with zero UI-level test coverage. Add a new Playwright spec `client/e2e/product-import.spec.ts` following `client/e2e/products.spec.ts`'s login/navigation pattern, that: uploads a small multi-sheet fixture `.xlsx` (add one to `client/e2e/fixtures/` if no small fixture exists — 3 sheets, a handful of rows each, is enough; do not use the 232KB real QuickBooks export), asserts the "This file has N sheets" picker appears, selects a sheet, and asserts the column-mapping step shows the right row count.

- [ ] **Step 5: Fix any bug found in Step 1**

Same procedure as Task 1 Step 5.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
npx playwright test e2e/product-import.spec.ts
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/inventory.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test Inventory, document features, add import e2e coverage"
```

---

## Task 3: Point of Sale (POS)

**Files:**
- Walkthrough target: `app/(dashboard)/pos/page.tsx` → `components/pos/` (POSSystem)
- Existing e2e coverage: `client/e2e/sales.spec.ts` (navigate to POS; out-of-stock product can't be sold), `client/e2e/sales-lifecycle.spec.ts` (cycle count → sell with discount → log expense, a full cross-section flow)
- New doc: `docs/features/pos.md`

- [ ] **Step 1: Walk the section live**

Run a full sale against real imported products: search/scan a product, add multiple line items, apply a discount, test a held-transaction (park and resume, if the feature exists — check `held_transactions` table usage in `lib/db/schema.ts` first to confirm this is a real feature), checkout with each available payment method, print/view receipt. Also test the empty-state product-request dialog mentioned in recent commit history (`cf4964fa feat: integrate product request dialog into POS empty state`).

- [ ] **Step 2: Write `docs/features/pos.md`**

Document each control found, same format as prior tasks.

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -rln "held_transaction\|hold\b" __tests__/ e2e/ components/pos/ | head -20
```

Confirm whether held-transactions and the product-request-dialog empty state have any test coverage; log gaps.

- [ ] **Step 4: Add the highest-value missing test**

Same TDD procedure as Task 1 Step 4, targeting whichever gap from Step 3 is most likely to break silently (held-transaction resume losing line items is a good candidate if untested).

- [ ] **Step 5: Fix any bug found in Step 1**

Same procedure as Task 1 Step 5.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/pos.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test POS, document features, close coverage gap"
```

---

## Task 4: Prescriptions

**Files:**
- Walkthrough target: `app/(dashboard)/prescriptions/page.tsx` → `components/prescriptions/` (PrescriptionManagement); note the `LockedModuleOverlay` wrapper — confirm what plan tier gates this module and that Pikarestiv Stores 2's tier doesn't block the walkthrough.
- Existing e2e coverage: **none** — no `prescriptions.spec.ts` exists.
- New doc: `docs/features/prescriptions.md`

- [ ] **Step 1: Walk the section live**

If `LockedModuleOverlay` blocks access, first check `components/dashboard/locked-module-overlay.tsx` and the store's `subscription_tier` field to understand the gate, and document that gate itself as a feature. If accessible: create a prescription against an imported product, fill required fields (dosage, prescriber, etc. — read the form to find them), link it to a customer, and check how it interacts with stock (does dispensing a prescription deduct stock the same way a POS sale does?).

- [ ] **Step 2: Write `docs/features/prescriptions.md`**

Document the module gate (if any) plus every control found.

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -rln "prescription" __tests__/ | head -20
```

This module has zero e2e coverage — log that as a gap regardless of what else is found.

- [ ] **Step 4: Add the highest-value missing test**

Given zero existing e2e coverage, add a first Playwright spec `client/e2e/prescriptions.spec.ts` modeled on `client/e2e/customers.spec.ts`'s structure (login, navigate, create-record happy path) rather than a narrow Vitest unit test — this section needs baseline flow coverage before finer-grained logic tests are worth adding.

- [ ] **Step 5: Fix any bug found in Step 1**

Same procedure as Task 1 Step 5.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
npx playwright test e2e/prescriptions.spec.ts
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/prescriptions.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test Prescriptions, add first e2e coverage"
```

---

## Task 5: Customers

**Files:**
- Walkthrough target: `app/(dashboard)/customers/page.tsx` → `components/customers/` (CustomerManagement; note `directory-tab.tsx` and `activity-tab.tsx` both already use `useVirtualizer`, confirmed during the earlier freeze investigation)
- Existing e2e coverage: `client/e2e/customers.spec.ts` (add a customer; creating from Overview auto-switches to Directory and selects it)
- New doc: `docs/features/customers.md`

- [ ] **Step 1: Walk the section live**

Exercise customer directory search/filter, customer detail view, purchase/activity history tab, loyalty points or tiers if present (check `loyalty_tiers`/`loyalty_transactions`/`loyalty_redemption_options` tables in `lib/db/schema.ts` — these exist in the schema, confirm whether the UI surfaces them), and customer payments (`customer_payments` table).

- [ ] **Step 2: Write `docs/features/customers.md`**

Document every control, explicitly covering the loyalty system if it's UI-visible (schema support for it exists; confirm whether it's reachable from this account's plan tier).

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -rln "loyalty\|customer_payment" __tests__/ e2e/ | head -20
```

Log whether loyalty/payments have any coverage at all.

- [ ] **Step 4: Add the highest-value missing test**

Same TDD procedure as Task 1 Step 4.

- [ ] **Step 5: Fix any bug found in Step 1**

Same procedure as Task 1 Step 5.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/customers.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test Customers, document features, close coverage gap"
```

---

## Task 6: Procurement

**Files:**
- Walkthrough target: `app/(dashboard)/procurement/page.tsx`, `.../procurement/new`, `.../procurement/edit`, `.../procurement/vendors`, `.../procurement/requests` → `components/procurement/` (ProcurementManagement, gated by `RequireRole`)
- Existing e2e coverage: `client/e2e/procurement.spec.ts` (navigate to procurement, open create-order flow — does not complete/submit an order per the test name)
- New doc: `docs/features/procurement.md`

- [ ] **Step 1: Walk the section live**

Confirm which role(s) `RequireRole` requires and that the Store Owner PIN account has it. Walk: vendor/supplier management, creating a full purchase order end to end (not just opening the dialog, since the existing test stops there), receiving a purchase order (does it create `stock_batches` and increment quantity?), and the "requests" sub-page (likely tied to `requested_products` table and the POS empty-state product-request dialog from Task 3 — confirm the link between the two).

- [ ] **Step 2: Write `docs/features/procurement.md`**

Document every control, explicitly tracing how a purchase order's "received" status flows into `stock_batches` (name the query/mutation responsible).

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -n "test(" e2e/procurement.spec.ts
grep -rln "purchase_order\|PurchaseOrder" __tests__/ | head -20
```

The existing e2e test only opens the create-order flow — log "PO submission and receiving has no e2e coverage" as a gap if confirmed.

- [ ] **Step 4: Extend `e2e/procurement.spec.ts` to complete a full order**

Add a test that creates a PO, submits it, and marks it received, then asserts the ordered product's stock increased by the ordered quantity — this closes the exact gap identified in Step 3.

- [ ] **Step 5: Fix any bug found in Step 1**

Same procedure as Task 1 Step 5.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
npx playwright test e2e/procurement.spec.ts
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/procurement.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test Procurement, extend e2e to full PO receive flow"
```

---

## Task 7: Expenses

**Files:**
- Walkthrough target: `app/(dashboard)/expenses/page.tsx` → `components/expenses/` (ExpenseList, AddExpenseDialog; note `expense-list.tsx` already uses `useVirtualizer`)
- Existing e2e coverage: `client/e2e/expenses.spec.ts` (add an expense)
- New doc: `docs/features/expenses.md`

- [ ] **Step 1: Walk the section live**

Exercise expense categories, recurring vs one-off (if that distinction exists — check the `expenses` table's columns in `lib/db/schema.ts`), the `notes` column added per the migration comment seen earlier in `core.ts` (`ALTER TABLE expenses ADD COLUMN notes`), edit and delete of an existing expense.

- [ ] **Step 2: Write `docs/features/expenses.md`**

Document every control.

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -n "test(" e2e/expenses.spec.ts
```

Edit/delete of an existing expense is likely untested (only "add" is covered) — confirm and log.

- [ ] **Step 4: Add the highest-value missing test**

Extend `e2e/expenses.spec.ts` with an edit-then-delete flow if confirmed missing.

- [ ] **Step 5: Fix any bug found in Step 1**

Same procedure as Task 1 Step 5.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
npx playwright test e2e/expenses.spec.ts
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/expenses.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test Expenses, extend e2e to edit/delete flow"
```

---

## Task 8: Reports

**Files:**
- Walkthrough target: `app/(dashboard)/reports/page.tsx` (uses `useSearchParams`/`useRouter` for report-type/date-range state — check the URL params it reads)
- Existing e2e coverage: **none** — no `reports.spec.ts` exists.
- New doc: `docs/features/reports.md`

- [ ] **Step 1: Walk the section live**

Exercise every report type available, each date-range preset and a custom range, export/print if present, and the `formatMetricCurrency` whole-number currency formatting mentioned in recent commit history (`f10c187c refactor: introduce formatMetricCurrency`) — confirm it's applied consistently across every report, not just dashboard/one report.

- [ ] **Step 2: Write `docs/features/reports.md`**

Document every report type and filter control.

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -rln "formatMetricCurrency" __tests__/ lib/ components/reports/ 2>/dev/null | head -20
```

Zero e2e coverage exists for this whole section — log that gap regardless of what else is found. Also confirm whether `formatMetricCurrency` itself has a unit test (it's a pure formatting function — cheap, high-value to test directly).

- [ ] **Step 4: Add the highest-value missing test**

If `formatMetricCurrency` has no direct unit test, add one in `client/__tests__/` (a pure function — no sql.js/transaction setup needed, should be a handful of `expect(formatMetricCurrency(x)).toBe(y)` cases including negative numbers, zero, and large values). Additionally add a first `client/e2e/reports.spec.ts` for the happy-path (login, navigate, one report renders with real Store 2 data).

- [ ] **Step 5: Fix any bug found in Step 1**

Same procedure as Task 1 Step 5.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
npx playwright test e2e/reports.spec.ts
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/reports.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test Reports, add formatMetricCurrency unit tests + first e2e"
```

---

## Task 9: Activity Log

**Files:**
- Walkthrough target: `app/(dashboard)/activity-log/page.tsx` → `components/activity-log/activity-log-page.tsx` (per the recent refactor commit `7e28c577 refactor: extract activity log components into dedicated filter and table modules`, check the new `filter`/`table` module files under `components/activity-log/`)
- Existing e2e coverage: **none**.
- New doc: `docs/features/activity-log.md`

- [ ] **Step 1: Walk the section live**

Confirm every action taken in earlier tasks (product import, PO creation, expense add/edit) actually produced an entry here — this section is effectively a live audit trail of everything else in the plan, so walking it last (after Tasks 1–8) is deliberate: verify entries exist for the import (`logAction` calls seen in `core.ts`/`base-helpers.ts` earlier), the PO from Task 6, and the expense edits from Task 7. Exercise every filter (by table, by user, by date range, per the recent filter-module refactor).

- [ ] **Step 2: Write `docs/features/activity-log.md`**

Document every filter and the exact set of actions that generate log entries (cross-reference `logAction()` call sites: `grep -rn "logAction(" client/lib client/components`).

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -rln "activity.log\|audit_logs" __tests__/ e2e/ | head -20
```

Zero e2e coverage — log the gap.

- [ ] **Step 4: Add a first e2e spec**

Add `client/e2e/activity-log.spec.ts`: perform one traceable action (e.g. add an expense, matching Task 7's fixture), navigate to Activity Log, and assert an entry for it appears with the right actor/table/action.

- [ ] **Step 5: Fix any bug found in Step 1**

If any action from Tasks 1–8 is missing its expected log entry, that's a real bug (a silent audit-trail gap) — treat it with full priority under systematic-debugging, not as a documentation footnote.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
npx playwright test e2e/activity-log.spec.ts
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/activity-log.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test Activity Log, add first e2e coverage"
```

---

## Task 10: Settings (21 sub-tabs)

**Files:**
- Walkthrough target: `app/(dashboard)/settings/[tab]/page.tsx` — tabs: `general, appearance, account, store, alerts, notifications, data, security, staff, system, cloud, billing, personal-info, business-info, branches, payment-methods, receipt-settings, register-configs, product-units, categories, roles`
- Key components: `components/settings/*.tsx` (one file per concern — `staff-management.tsx`, `security-settings.tsx`, `data-settings.tsx`, `data-settings-auto-sync.tsx` (relevant to the sync-race fix from Task 0!), `quickbooks-import-dialog.tsx`, `regional-settings-card.tsx`, `system-settings.tsx`, `alert-settings.tsx`, etc.)
- Existing e2e/unit coverage: **none dedicated to Settings** — confirm with `grep -rl settings client/e2e/ client/__tests__/` before starting.
- New doc: `docs/features/settings.md` (one `##` per tab, given the count)

- [ ] **Step 1: Walk every tab live**

Given 21 tabs, batch this realistically: for each tab, open it, note every field/toggle, and change at least one setting per tab to confirm it persists (reload the page, check it stuck). Pay specific attention to `data` / `cloud` tabs (`data-settings-auto-sync.tsx`) — confirm the auto-sync interval setting from Task 0's Finding #2 is user-configurable here, and note the exact default interval shown in the UI (the code showed a 15-minute default via `storeProfile?.auto_sync_interval || 15`).

- [ ] **Step 2: Write `docs/features/settings.md`**

One `##` per tab. For `data`/`cloud`, explicitly cross-reference Finding #2 in the findings log (this is the UI surface for the setting whose backend race was just fixed).

- [ ] **Step 3: Check test coverage gaps**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
grep -rl "settings" e2e/ __tests__/ 2>/dev/null
```

Given zero dedicated coverage across 21 tabs, this is the single biggest gap in the whole app — log it prominently.

- [ ] **Step 4: Add e2e coverage for the highest-risk tabs**

Prioritize by blast radius, not tab count: `staff` (permission/role changes), `security`, `data`/`cloud` (sync settings — directly tied to Task 0's fix), and `roles`. Add `client/e2e/settings.spec.ts` covering: navigate to each of these four tabs, change one real setting, reload, assert it persisted. Leave purely cosmetic tabs (`appearance`) undocumented-by-test for now — note that explicitly as a scoped-out decision in the findings log rather than silently skipping it.

- [ ] **Step 5: Fix any bug found in Step 1**

Same procedure as Task 1 Step 5.

- [ ] **Step 6: Verify and commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p . && npx vitest run
npx playwright test e2e/settings.spec.ts
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/settings.md docs/features/_findings-log.md client/
git commit -m "docs+test: smoke-test Settings, add e2e for staff/security/data/roles tabs"
```

---

## Task 11: Close-out — findings summary for the Cynthia meeting

**Files:**
- Read: `docs/features/_findings-log.md` (fully populated by now)
- Create: `docs/features/README.md` (index) and, if the user wants a shareable version, a published Artifact (ask before publishing — see below)

- [ ] **Step 1: Write the features index**

Create `docs/features/README.md` linking every doc produced in Tasks 1–10, one line each, in nav order (Dashboard, Inventory, POS, Prescriptions, Customers, Procurement, Expenses, Reports, Activity Log, Settings).

- [ ] **Step 2: Summarize the findings log**

At the top of `docs/features/_findings-log.md`, add a one-paragraph summary: total issues found, how many fixed vs. deliberately scoped out (e.g. the `appearance` tab decision from Task 10), and total new tests added across the whole effort (sum the counts from each task's commit).

- [ ] **Step 3: Full-suite verification**

```bash
cd /Users/admin/Documents/Projects/DumosRx/client
npx tsc --noEmit -p .
npx vitest run
npx playwright test
```

All must be green before calling this done — this is the last gate before the client meeting.

- [ ] **Step 4: Ask the user how they want this presented to Cynthia**

Don't unilaterally decide the deliverable format — ask whether they want the findings summary as a published Artifact (private link, shareable at their discretion), a plain file to bring into the meeting, or both. Do not publish anything without that confirmation, per this session's standing rule on third-party-facing content.

- [ ] **Step 5: Commit**

```bash
cd /Users/admin/Documents/Projects/DumosRx
git add docs/features/README.md docs/features/_findings-log.md
git commit -m "docs: close out smoke-test with features index and findings summary"
```
