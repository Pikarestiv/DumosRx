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
