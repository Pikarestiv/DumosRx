# Dashboard

Route: `app/(dashboard)/dashboard/page.tsx` → `components/dashboard/dashboard-overview.tsx`.
Business logic lives in `lib/hooks/use-dashboard-overview.ts` (stats, sales
comparison, recent-activity feed) and `lib/hooks/use-stock-batch-stats.ts`
(inventory-derived counts).

Walked live against the "Pikarestiv Stores 2" store on 2026-09-02.

## Today's Sales stat card

Shows the store's net revenue for the current calendar day
(`todayRevenue = salesToday.total - refundsToday.total`, computed in
`useDashboardOverview`), formatted with `formatMetricCurrency` (rounds to
whole Naira — no kobo). Backed by `getDashboardOverviewData()`
(`lib/db/queries/reports.ts`) via `useQuery(queryKeys.dashboard.overview(viewerId))`.
Below the figure, `renderSalesComparison()` shows "X% vs yesterday" (up/down
arrow) or "No sales yesterday" when `salesYesterday` is 0 — this store showed
₦0 today and "No sales yesterday", correctly rendering the `state: "none"`
branch. Non-admin roles are scoped to their own sales only
(`viewerId` is set unless `checkCanViewAllActivity(user.role)`).

## Total Products stat card

Shows `stock_batchStats.activeProducts` and, in the caption, "Across N
categories" (`activeCategories`). Backed by `useStockBatchStats()` →
`getStockBatchStats(expiryDays)` (`lib/db/queries/inventory.ts`), the single
source of truth the hook's own doc-comment says all inventory stat cards
across the app should use. Live: 1,513 products across 10 categories.

## Inventory Value stat card

Shows `stock_batchStats.totalStockBatchValue`, formatted with
`formatMetricCurrency` — same query as Total Products
(`getStockBatchStats`). Caption is a static "Calculated stock value" (not a
comparison). Live: ₦1,929,051.

## Orders Today stat card

Shows `salesToday[0]?.count || 0` — completed-transaction count for today,
from the same `getDashboardOverviewData()` payload as the Today's Sales
card. Live: 0 (matches ₦0 in Today's Sales).

## Action Center

`components/dashboard/dashboard-action-center.tsx`. Renders only for admin
roles (`isAdmin`), and only when at least one alert applies — it's absent
entirely for a fully-configured store with no admin, and it auto-scrolls
horizontally every 5s (paused on hover/touch) when there's more than one
card. Alerts observed live, each a clickable card that `router.push()`s to
`actionRoute`:
- **Trial (N Days Left)** — from `checkLicenseStatus()`
  (`lib/licensing/licensing-manager.ts`), links to `/settings/billing`.
- **N Items Low Stock** — from `lowStockCount` (passed down from
  `stock_batchStats`), links to `/inventory/catalog?status=low_stock` (see
  Resolved bug below — the catalog tab genuinely honors the `status`
  query param and pre-filters to the "Low Stock" chip).
- **N Items Oversold** — from `oversoldCount` (sourced from
  `getOversoldAlerts()` directly in `useDashboardOverview`, not from
  `stock_batchStats`), links to `/inventory/catalog?status=out_of_stock`.
  `priority: "critical"` (destructive/red styling, distinct `AlertOctagon`
  icon) — separate from and additive to the Low Stock card; fixes bug #9
  (see Resolved below).
- **N Batches Missing Expiry** — from `missingExpiryCount`, links to
  `/inventory/overview` (confirmed working live).
- **Profile N% Complete** — from how many of
  `name/address/phone/email/logo_url` (+`pcn_license` for pharmacies) are
  filled on `storeProfile`, links to `/settings/store`.
- **Get the App** — shown to store owners not already on Tauri/PWA, links
  to `/settings/system`.
Other possible alerts not observed live (conditions weren't met on this
store): No Cloud Account, Subscription Expired/Expiring, No Staff Accounts,
N Changes Unsynced (`getSyncQueueCount()`, `queryKeys.sync.queueCount()`,
polled every 5s).

## Recent Activity

`components/dashboard/dashboard-recent-activity.tsx`. Shows the 5 most
recent entries from `dashboardData.recentActivities` (part of the same
`getDashboardOverviewData()` query as the sales stat cards). Each row is
clickable and opens a details dialog scoped to its `activity_type`: sale →
`TransactionDetailsDialog`, expense → `ExpenseDetailsDialog`, purchase_order
→ `ProcurementDetailsDialog`, prescription →
`DashboardPrescriptionDetailsDialog`, stock_movement →
`StockMovementDetailsDialog`. **Caveat observed live:** all 5 rows on this
store were "Product added" (`activity_type: "product"`) entries, and
clicking any of them does nothing — `dashboard-overview.tsx` never renders
a dialog for `selectedActivity?.type === "product"`, so the click sets
state but no UI reacts. Not fixed as part of this task (a `product` details
dialog would be new UI, not a broken-link/wrong-number regression), but
worth a follow-up ticket. "View All" (top-right) navigates to `/reports`
(confirmed live) — not to an activity-log filtered view.

## Quick Actions

`components/dashboard/dashboard-quick-actions.tsx`. Static, role-filtered
link grid (`adminOnly` actions hidden unless `isAdmin || canManageStockBatch`):
New Sale → `/pos`, Add Stock → `/procurement/new` (admin-only), Close
Register → `/reports?tab=daily_close`, Scan Barcode → `/pos?action=scan`,
Customers → `/customers`, View Reports → `/reports` (admin-only), Reorder
Stock → `/procurement` (admin-only). "New Sale" confirmed live to navigate
to `/pos`; the rest are plain `next/link` hrefs to existing routes, not
independently re-verified.

## Notifications bell

Top-right bell icon opens a dropdown titled "Notifications" listing recent
activity-log entries (e.g. "LOGIN — Action: LOGIN on users",
"INSERT — Action: INSERT on products") with relative timestamps. This is a
raw audit-log feed, not the same data as the Recent Activity card (which is
curated by business activity type, not raw DB action).

## Loading state

`DashboardOverview` renders a skeleton grid (4 stat-card skeletons + 2 large
panel skeletons) while `isLoading` — defined as
`stock_batchStats.loading && !salesToday.length`. Not independently
reproduced live (data loaded before a screenshot could be taken), but
confirmed by reading the component.

## Resolved

### "N Items Low Stock" Action Center card crashed the whole app
- **Found:** clicking the "473 Items Low Stock" card navigated to
  `/inventory/products?status=low_stock`. `/inventory/[tab]/page.tsx`
  only pre-renders `overview`, `catalog`, `batches`, `ledger`, `audits` via
  `generateStaticParams()` (required because the app builds with
  `output: export`); `products` isn't one of them, so Next.js threw a
  full-page "Runtime Error: Page ... is missing param ... in
  generateStaticParams()" instead of navigating. The same dead route is
  also referenced from `components/stock-batch/needs-attention.tsx`'s
  "View all" link (out of scope for this Dashboard task — not fixed, flagged
  here for a future Inventory-section pass).
- **Fix:** `components/dashboard/dashboard-action-center.tsx` now points the
  low-stock alert at `/inventory/catalog?status=low_stock` — the "catalog"
  tab is the actual product list, and it turns out it already reads and
  applies the `status=low_stock` query param (shows the "Low Stock" filter
  chip pre-applied), so the fix restores the intended filtered view, not
  just a non-crashing page.
- **Verified by:** `client/__tests__/dashboard-action-center-routes.test.ts`
  — parses `dashboard-action-center.tsx` and `inventory/[tab]/page.tsx`,
  asserts every `/inventory/<tab>` actionRoute names a tab that actually
  exists. Confirmed to fail (`references unknown inventory tab "products"`)
  against the original code, pass after the fix. Also re-clicked the card
  live post-fix: lands on the Catalog tab with the Low Stock chip active,
  no error overlay.

### Dashboard's Action Center had zero signal for an oversold/floored product (bug #9)
- **Found:** review of bug #4's fix — a product floored to `quantity=0`
  (bug #4's "floor + alert" fix) failed `getStockBatchStats()`'s
  `low_stock_count` SQL's `total_qty > 0` guard, so it produced no signal
  anywhere on the Dashboard.
- **Fix:** added a new, separate "Oversold" card (see the "N Items Oversold"
  entry above) rather than changing `low_stock_count`'s existing SQL/guard,
  to avoid any silent behavior shift for other consumers of that boundary.
- **Verified by:** `client/__tests__/dashboard-action-center-routes.test.ts`
  — new case asserting `oversoldCount` is threaded through
  `dashboard-overview.tsx`, the card is conditional on `oversoldCount > 0`,
  and its route is `/inventory/catalog?status=out_of_stock`. See `### 17.`
  in `_findings-log.md` for full detail.
