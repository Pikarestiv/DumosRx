# Stock Loss (Damage / Write-offs) metric

Closes the gap logged as `A-112`: stock adjustments could already be tagged
`Damage` or `Loss`, but no report, dashboard or admin metric ever valued them.

## Where it lives

- **Query:** `getStockLossTotal({ from, to })` in
  `client/lib/db/queries/finance.ts`.
- **Wiring:** called from `getBIMetrics` (`client/lib/db/queries/reports.ts`)
  in the same `Promise.all` as `getSmoothedExpensesTotal`, returned as
  `stockLossData`, exposed by `useBIData` as `stockLoss`.
- **UI:** the "Financial Performance Statement" card of the Analytics →
  Profit & Loss tab (`client/components/analytics/profit-loss-tab.tsx`),
  as a line below Total Operational Expenses.

## How the figure is computed

`SUM(ABS(quantity) * IFNULL(unit_cost, 0))` over `stock_movements` rows where
`movement_type = 'adjustment'` and the reason is one of
`STOCK_LOSS_REASON_LABELS`.

Three decisions worth knowing:

1. **Matched on reason *labels*, not the form's `value` keys.**
   `buildAdjustmentReason` persists the human label ("Damage"), optionally
   followed by `ADJUSTMENT_REASON_NOTE_SEPARATOR` and a free-text note, because
   `stock_movements` has no note column. So the query matches each label either
   exactly or as the note's prefix. `STOCK_LOSS_REASON_LABELS` lives in
   `client/lib/constants/stock-adjustments.ts` (not in
   `adjustment-derivations.ts`, which would make `lib/db/queries` import from
   `components/`), and `adjustment-derivations.test.ts` pins it to every
   `direction: "decrease"` entry of `ADJUSTMENT_REASONS` so the two can't drift.
2. **`to` is inclusive**, matching `getSmoothedExpensesTotal` and every
   `getBIMetrics` query — *not* the `[from, to)` window
   `getCurrentMonthRevenue`/`getCurrentMonthCOGS` take. Windowed on
   `COALESCE(movement_date, created_at)`, the same basis the Adjustments ledger
   sorts on.
3. **Not staff/payment-method filterable**, for the same reason expenses aren't
   (see the "JUDGEMENT CALL" note on `fetchProfitLossReportData`): a write-off
   carries no attribution that means the same thing as the sales filter.

## Why it is reported beside the P&L and not subtracted into Net Profit

COGS is derived from `sale_items.cost_price`, so stock that was written off
never entered it — the loss is a genuine, currently unreported cost, not a
double count. Subtracting it into Net Profit would, however, silently redefine
Net Profit, Net Margin and the Burn Distribution chart, and would disagree with
every other surface that reports the same figures (the P&L CSV export, the
Daily Close report, `fetchProfitLossReportData`). So the minimum viable version
reports it for visibility, with the line's own caption saying it is not
deducted. Folding it into the P&L proper is a product decision that should
change all of those surfaces at once.

## Not done

No platform-wide equivalent on the `laravel-server` admin side
(`AdminStoreMetricsService`, `AdminPlatformService`, `DashboardService` still
compute no shrinkage figure). Deliberately out of scope: the store-side figure
is the one a pharmacy owner acts on, and the admin version needs its own
product decision about whether it is a fleet health signal or a per-store
drill-down.
