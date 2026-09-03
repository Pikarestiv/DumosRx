# Reports

Route: `app/(dashboard)/reports/page.tsx`. Three tabs, driven by a `?tab=`
URL param (`reports` | `daily_close` | `analytics`) via `useSearchParams`/
`useRouter`: **Operational Reports** and **Analytics & Insights** are
admin-only (`isAdmin` from `useAuth()`); non-admins land on **Daily Close**,
the only tab they can see at all. Switching tabs pushes
`/reports?tab=<value>` (`{ scroll: false }`) so the tab survives a refresh.
Unlike Expenses/Procurement/Loyalty, **Reports has no `LockedModuleOverlay`/
`canUse*` plan-tier gate anywhere** — confirmed by reading both the page and
`lib/hooks/use-feature-gate.ts` (whose `featureKey` union doesn't include
`reports`/`analytics`/`daily_close` at all). Access is role-gated only
(admin vs. non-admin), not tier-gated.

## Operational Reports (admin only) — `components/reports/report-center.tsx`

A grid of 6 report types, each a card with **Export** (dropdown: Download
PDF / Download CSV) and **Print** buttons:

- **Detailed Sales Report** (Financial) — itemized transactions with tax/
  discount breakdown. Date-ranged, staff/payment-method filterable.
- **Inventory Valuation** (Operations) — current stock levels, cost value,
  potential selling value. *Not* date-ranged (`takesDateRange: false`) —
  it's a point-in-time snapshot regardless of the filter bar's date range.
- **Profit & Loss Summary** (Financial) — revenue vs. expenses. Date-ranged.
- **Customer Loyalty Report** (CRM) — top customers, points, outstanding
  balances. Not date-ranged.
- **Expense Categories** (Financial) — operating costs by category.
  Date-ranged, no staff/payment filter (`takesSalesFilters: false`).
- **Top Sellers** (Operations) — best-performing products by revenue.
  Date-ranged, staff/payment filterable.

All six are driven by one config table (`REPORT_CONFIG` in
`lib/hooks/use-report-export.ts`) mapping each `ReportId` to its fetcher
(`lib/db/queries/reports.ts`), CSV/PDF headers, and whether it takes a date
range / staff+payment filter. Date columns in the exported rows (e.g. a
sale's `Date`, a batch's `Nearest Expiry`) are reformatted to `dd/mm/yyyy`
via `formatDateToDDMMYYYY` before export — the raw DB value (which can be a
full ISO timestamp) never leaks into the CSV/PDF as-is.

**Filter bar** (`ReportFiltersBar`, shared with Analytics & Insights):
- **Date range** — `DateRangePicker`: dual-month calendar + 8 presets
  (Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, Year
  to date, Last year) + editable `DD/MM/YYYY` text inputs. Defaults to the
  last 30 days on mount. Live-verified: "This month" preset correctly set
  the range to 1 Sep 2026 – 3 Sep 2026 (today, per the environment's clock).
- **Staff** — `StaffSelect`, sourced from `useUsers()` filtered to
  `is_active`, not a bespoke query — always matches the same list Settings
  > Staff shows.
- **Payment method** — `PaymentMethodSelect`: All methods / Cash / POS
  Card / Transfer / Credit / Mixed.

**Export/Print, live-verified:** clicked Export → Download CSV on Detailed
Sales Report; a toast confirmed ("Export successful — Your CSV has been
downloaded") and the file (`Sales_Report_2026-09-03.csv`) immediately
appeared in the **Recent Downloads** panel with name, report type, a
human-readable timestamp, and a size label (KB/MB, `localStorage`-backed via
`drx_recent_downloads`, capped at the 10 most recent, scoped to this browser
— not synced/shared across devices). Print opens the same generated PDF via
`openBlobForPrint()` (same `generateReportPdfBlob()` the PDF download path
uses) rather than a separate print-only code path, so Print and Download PDF
can never drift out of sync with each other.

## Daily Close — `components/reports/daily-close-report.tsx`

Visible to every role, not just admin. A single-day reconciliation view for
`reportDate` (defaults to today, via a `DatePickerInput` in the page header —
`disableFuture`, capped to the last 5 years — that only renders while this
tab is active). Backed by `useDailyCloseData(reportDate)`
(`lib/hooks/use-daily-close-data.ts`), which reads `getDailyCloseData()`
(`lib/db/queries/sales.ts`) for that date's sales/returns and aggregates
locally.

**Four metric cards** (`DailyCloseMetrics`, via `formatMetricCurrency` — see
below): Total Sales, Cash Expected, Transfer/Mobile, Total Refunds, plus a
fifth full-width **Total Profit (Est.)** card (`totals.total` minus summed
`cost_price × quantity` across the day's line items, minus returned items'
cost). Live-verified against real Store 2 data (2 Sep 2026, 3 real sales):
Total Sales ₦2,950, Cash Expected ₦2,850, Transfer/Mobile ₦100, Total
Refunds ₦0, Total Profit ₦1,420 — all rendered as clean whole numbers.

**Payment Breakdown card** — Cash / Card-POS / Transfer-Mobile / Credit
Sales, each a `formatCurrency()` (not rounded) line; Card and Transfer each
expand into a per-account sub-list (e.g. "Zenith Bank POS: ₦100") built from
`aggregatedTotals.cardAccounts`/`transferAccounts`, keyed off the sale's
parsed `payment_details.accountId` (falls back to an "Uncategorized
Card/Transfer" bucket). A `payment_method: "mixed"` sale is split across its
own `payment_details.splits[]` array instead of being counted once under one
method — same for a `"mobile"` method value, folded into `transfer`.

**Highest Selling Products card** — top 5 products by quantity sold that
day (not revenue-sorted), with Qty Sold and Revenue (`formatCurrency`)
columns. Live-verified: TRAMADOL 100MG (qty 5, ₦1,500), 10ML SYRINGE (qty 3,
₦300), 2ML SYRINGE (qty 1, ₦50), ABONIKI BALM 25G (qty 1, ₦1,200) — matches
the three real transactions on that date exactly.

**Clicking Total Sales (or any payment-method card) opens a Sales List
modal** (`SalesListModal`) — a payment-method-filterable, searchable table
of every transaction that date (time, receipt #, method, total via
`formatCurrency`). Clicking a row opens the same `TransactionDetailsDialog`
POS/Prescriptions use (Total Sale, Total Profit, per-line item/qty/price/
total, Print Receipt) — live-verified: reference `TXN1788373024876`, 3 line
items, ₦1,350 total / ₦299 profit, both figures matched the daily aggregate.

**Actions** (`DailyCloseActions`, bottom of page): **Print** (browser print
of the `printRef`-wrapped metrics+breakdown+top-sellers section only, not
the whole page), **Export** dropdown (Download PDF via
`generateReportPdfBlob`, or Download CSV via a bespoke
`exportToCSV()` in the hook — a flat key/value CSV, not the same
`REPORT_CONFIG` machinery Operational Reports uses), and **Cloud Sync Now**/
**Download Local Backup** in the "Daily Close Ready" banner up top (a backup
of the whole local DB, not scoped to this one day — same
`getDatabaseBinary()` dev/export path used elsewhere in Settings).

## Analytics & Insights (admin only) — `components/analytics/`

`BusinessIntelligenceDashboard`, backed by `useBusinessIntelligenceDashboard()`
→ `useBIData(dateRange, { staffId, paymentMethod })`. Shares the same
`ReportFiltersBar` as Operational Reports but with its own independent
filter state (defaults: last 30 days, no staff/payment filter) — changing
one tab's filters does not affect the other's. An **Export Reports** button
runs `exportReportCsv("profit-loss", ...)` under the current filters (with
its own success/failure toast), reusing the exact same CSV path Operational
Reports' Profit & Loss Summary card uses.

**5 key-metric cards** (`BIKeyMetrics`, `formatMetricCurrency` for the 3
currency ones): Net Sales, Net Profit, Transactions (plain count), Stock
Batch Value (cost-basis, not selling price), Customers (active count).
Live-verified (last-30-days default range, same 3 real sales): Net Sales
₦2,950, Net Profit ₦1,420, Transactions 3, Stock Batch Value ₦1,932,908,
Customers 1 — Net Sales/Net Profit exactly match the Daily Close numbers for
the one day with data in range, as expected.

Five sub-tabs:

- **Sales Analytics** (default) — Revenue Trend area chart (monthly,
  y-axis in `₦Nk` short form via `getCurrencySymbol` + manual `/1000`, not
  `formatMetricCurrency`), a Product Performance table (sortable columns,
  `formatCurrency` per-row revenue), and a Sales by Category bar chart.
- **Profit & Loss** — a "Financial Performance Statement" walking Gross
  Sales → Discounts/Tax/Refunds → Net Sales → COGS → Gross Profit → Total
  Operational Expenses → Final Net Income (Take Home), plus Net Margin %,
  a Burn Distribution donut (COGS / Operating Exp. / Net Profit as % of net
  sales), and a Financial Health Over Time area chart. **See "Bugs found"
  below** — this panel's currency formatting was inconsistent with the
  BIKeyMetrics cards immediately above it until this task's fix.
- **Stock Batch Insights** — Critical Stock Batch Alerts (low-stock items,
  HIGH/MEDIUM severity chips) and a Sales by Category chart. Live-verified
  showing TRAMADOL 100MG at -5 units (min 10) — the same negative-stock
  display already flagged, not re-attributed to this task, in
  `docs/features/prescriptions.md` / finding log entry "Prescriptions:
  dispensing does *not* have a third copy of the stock-deduction bug".
- **Customer Behaviour** — Total Customers / Loyalty Members / Avg.
  Transaction / Customer Retention cards, plus a Customer Purchase Patterns
  table (peak hours, `Math.round(avgValue).toLocaleString()` — whole-number
  by construction, just not routed through `formatMetricCurrency`).
- **Staff Performance** — one row per cashier (Transactions, Total Sales
  via `formatCurrency`, Avg Transaction via `formatCurrency` — decimals
  intentionally kept here, e.g. "₦983.33", since this is a per-row detail
  table rather than a duplicated headline figure; see the currency-
  formatting convention note below).

## `formatMetricCurrency` vs. `formatCurrency` convention

Per the comment on `formatMetricCurrency` in `lib/utils.ts`: it exists so
**headline/aggregate metric cards** read as clean whole numbers for NGN
(kobo has fallen out of everyday use), while **line-item and per-row detail
figures** (a single sale's total, a single product's revenue row, a
per-account payment sub-total) keep `formatCurrency`'s full precision so
accounting detail isn't lost. Confirmed consistent across every report this
task exercised:

- Metric/stat cards → `formatMetricCurrency`: `DailyCloseMetrics` (all 5),
  `BIKeyMetrics` (all 3 currency cards).
- Line items/detail tables → `formatCurrency` (intentionally, per the above):
  `PaymentBreakdownCard`, `SalesListModal`, `TransactionDetailsDialog`,
  `HighestSellingProductsCard`, `ProductPerformanceTable`,
  `StaffPerformanceTab`, chart axis labels.

## Bugs found

**Profit & Loss tab: "Financial Performance Statement" showed decimal
kobo precision for the same aggregate figures BIKeyMetrics rounds to whole
Naira, on the same page.** `components/analytics/profit-loss-tab.tsx` used
`formatCurrency()` for Gross Sales, Discounts/Tax/Refunds, Net Sales, COGS,
Gross Profit, Total Operational Expenses, and Final Net Income — all
aggregate totals, several of them (Net Sales, Net Profit/Final Net Income)
the *literal same number* already shown rounded in the `BIKeyMetrics` cards
a few rows above. Live-reproduced: Net Profit read "₦1,420" in the metric
card and "₦1,420.25" a few rows down in "Final Net Income (Take Home)" for
the identical value, on the identical page render. This is exactly the kind
of inconsistency Task 8's brief flagged (`formatMetricCurrency` "applied
consistently across every report, not just dashboard/one report") — this
panel was the one report where it wasn't. **Fix:** switched
`profit-loss-tab.tsx`'s import and all 7 call sites from `formatCurrency`
to `formatMetricCurrency`. Live-verified post-fix: COGS now shows "₦1,530"
(was "₦1,529.75"), Gross Profit and Final Net Income both now show "₦1,420"
— exactly matching the Net Profit metric card above them. Regression test:
`client/__tests__/profit-loss-tab-currency-formatting.test.ts` (source-
inspection style, matching `dashboard-action-center-routes.test.ts`'s
pattern — no component-rendering test harness exists in this repo yet).
Confirmed to fail pre-fix (`formatCurrency(` present) and pass post-fix
(`git stash` of the one changed file reproduces the failure).

No other bugs found. Every date-range preset, the custom `DD/MM/YYYY` text
inputs, both export paths (Operational Reports' per-report `REPORT_CONFIG`
CSV/PDF, and Daily Close's bespoke `exportToCSV()`), Print, and every
sub-tab's data rendered correctly against live Store 2 data.

## Test coverage

**Before this task: zero.** No `e2e/reports.spec.ts` existed, and
`formatMetricCurrency` itself had a unit test (`__tests__/utils.test.ts`,
pre-existing) but it didn't cover negative numbers, zero, or large values —
confirmed via the brief's own gap-check command:
`grep -rln "formatMetricCurrency" __tests__/ lib/ components/reports/`
matched only `lib/utils.ts` (the definition) and `__tests__/utils.test.ts`
(the existing, partial test) — no test under `components/reports/` at all,
and no e2e coverage of any kind for this whole section.

**Closed this task:**
- Extended `__tests__/utils.test.ts`'s existing `formatMetricCurrency`
  `describe` block with negative-number, zero, and large-value cases (the
  brief's specifically-requested gap), plus one case documenting that a
  non-NGN currency's negative amount still keeps its own decimal precision
  (the function's `noDecimalCurrencies` set only special-cases NGN).
- Added `client/e2e/reports.spec.ts` — logs in, navigates to `/reports`,
  confirms the default Daily Close view renders for a non-explicit-tab
  visit, then switches to Operational Reports and Analytics & Insights and
  confirms each renders real Store 2 data (a report card grid; the BI key
  metric cards with a non-zero Net Sales figure) rather than an empty/error
  state.
- Added `client/__tests__/profit-loss-tab-currency-formatting.test.ts` (see
  "Bugs found" above) as the regression test for the fix.
