# Known Bugs — Pre-Launch Correctness Audit

Tracking file for the pre-launch sweep of calculation/correctness bugs across the app.
Modules are audited one at a time; this file is updated as each module is checked so
nothing found gets lost between sessions. Status values: `open`, `fixed`, `flagged`
(product decision needed, not a clear bug).

## Audited modules

- [x] Procurement — audited & fixed (see git history: cost scale mismatch, stale subtotal)
- [x] POS / Sales
- [x] Inventory / Stock valuation
- [x] Returns / Refunds
- [x] Loyalty
- [x] Billing / Subscriptions
- [x] Expenses (no clear bugs; two flagged items below)
- [x] Prescriptions (no bugs found)
- [x] Reports / Analytics / Dashboard aggregates
- [x] Customers (debt/credit/stats aggregates)
- [x] Demo account seeding (`lib/demo/`)
- [x] Activity log
- [x] Settings / multi-store

## Open bugs

### Critical

1. **Returns: no cap on total returned quantity vs. remaining un-returned balance.**
   `components/pos/return-dialog.tsx` reads `getSaleItems()` for the max returnable
   quantity, which returns the *original* sold quantity — not remaining after prior
   returns. `getTransactionDetails()` in `lib/db/queries/sales.ts` already computes a
   correct `returned_quantity` subquery but isn't the data source used here. Nothing
   gates the return flow on prior return history.
   Repro: sale of 5 units @ ₦100 (₦500 total). Return 3 (refund ₦300). Reopen return
   dialog on the same sale — `item.quantity` is still 5, so up to 5 more can be
   selected. Returning all 5 again refunds another ₦500. Total refunded: ₦800 against
   a ₦500 sale; stock restored twice.
   Also: `allItemsReturned` check in `return-dialog.tsx` compares against original
   quantity, so a sale fully returned across multiple partial returns never flips
   `payment_status` to `"refunded"`.
   Status: **fixed** — `return-dialog.tsx` now sources items from
   `getTransactionDetails()` (which already computed `returned_quantity`
   correctly) instead of `getSaleItems()`. Extracted the max-returnable and
   fully-returned logic into a pure, tested module
   (`lib/utils/returns-calculations.ts`: `getMaxReturnable`/`isFullyReturned`)
   rather than leaving it ad hoc in the dialog component, per the audit's
   flagged suggestion. `ReturnItemRow` now disables/grays out line items with
   nothing left to return and shows an "N already returned" hint. Regression
   tests: `__tests__/returns-calculations.test.ts`,
   `__tests__/sales-returned-quantity.test.ts` (new).

2. **POS: holding a transaction silently drops the discount.**
   `use-pos-held-transactions.ts`'s `handleHoldTransaction` persists `items_json`/
   `total_amount` but not `discount`/`discountType`, then calls `clearCart()` which
   resets live discount state to 0. `handleRecallTransaction` restores items and
   recomputes subtotals from **current** catalog prices, never restoring the discount.
   Repro: cart total ₦1000, ₦200 fixed discount applied → total ₦800. Hold, then
   recall later → total recomputes to ₦1000, discount gone.
   Status: **fixed** — added `discount`/`discount_type` columns to
   `held_transactions` (schema.ts + the additive-migration `syncColumns` list
   in `core.ts`, so existing local databases pick it up via `ALTER TABLE ...
   ADD COLUMN`). `handleHoldTransaction` now persists both; `restoreCart()`
   (in `use-pos-cart.ts`) takes optional discount/discountType args and
   `handleRecallTransaction` passes the held values through. Verified live:
   held a ₦200 fixed discount, recalled it, discount and ₦1,300 total both
   correctly restored. **Not changed:** items still reprice from current
   catalog prices on recall (flagged separately below as a product decision,
   not resolved here — only the discount-loss bug itself was fixed).

3. **POS: discount type switch reinterprets the same typed number.**
   `components/pos/pos-cart.tsx` — the discount amount input and the fixed/percentage
   type selector are independent; switching type doesn't clear or re-validate the
   existing value.
   Repro: cashier types `50` meaning ₦50 fixed, switches dropdown to "percentage" —
   same `50` is now read as 50% off, silently multiplying the discount.
   Status: **fixed** — switching the type selector now resets the discount
   value to 0 instead of reinterpreting it, forcing re-entry in the new
   type's terms. Also added `min={0}`/clamping and a `max={100}` cap when
   type is "percentage", to prevent a >100% discount. Verified live: entered
   ₦200 fixed, switched to %, discount reset to 0 and total returned to full
   price.

### Medium

4. **Inventory: cycle-count adjustments don't record `unit_cost`/`total_cost` on their `stock_movements` rows.**
   `submitStockAudit()` in `lib/db/queries/inventory.ts` inserts adjustment movements
   without `unit_cost`/`total_cost` (unlike procurement/sale movement inserts, which
   always set both). `getStockMoM()`'s 30-day added/removed value sums do
   `SUM(ABS(quantity) * IFNULL(unit_cost, 0))`, so every cycle-count write-off
   contributes ₦0 to that metric regardless of real value, which also corrupts the
   derived `previousVal`/`percentChange`.
   Status: **fixed** — all three `stock_movements` inserts in
   `submitStockAudit()` (found-stock-into-existing-batch, found-stock-new-
   batch, shrinkage-deduction) now set `unit_cost`/`total_cost` from
   `countedCostPrice ?? systemCostPrice ?? 0`. Regression tests added to
   `__tests__/stock-audit.test.ts`.

5. **[ESCALATED — see #8] Inventory: per-product "cost price" shown on Cycle Count / Stock Overview is a plain average across batches, not quantity-weighted.**
   `lib/db/queries/products.ts` (two call sites) and `getStockOverviewData` in
   `lib/db/queries/inventory.ts` use `AVG(cost_price)` across batches.
   Repro: Batch A 500 units @ ₦10, Batch B 5 units @ ₦1000 (one spot-price restock).
   True weighted cost ≈ ₦19.80; `AVG()` reports ₦505 — 25x too high. Note: aggregate
   valuation totals elsewhere (`getStockBatchStats`, `getStockMoM.currentValue`)
   already do `SUM(quantity * cost_price)` correctly — only this per-product display
   number is wrong. **Update:** this same `cost_price` also feeds POS and reports —
   see #8, the same root cause, worse impact.
   Status: **fixed** — all `AVG(cost_price)` call sites (`products.ts`,
   `inventory.ts`, `procurement.ts`, `reports.ts`, `sales.ts`) now use
   `SUM(cost_price * quantity) / NULLIF(SUM(quantity), 0)`. Also deleted the
   dead-code `getProductsForAudit()` which had the same bug and zero callers.
   Regression tests: `__tests__/products-cost-price.test.ts` (new),
   `__tests__/procurement-products.test.ts` (updated to expect the correct
   weighted value instead of the old plain average).

### Customers

6. **Mixed-payment sales with a credit split are marked fully "completed"/paid, disconnecting the debt from the sale it came from.**
   `lib/hooks/use-pos-payment.ts` — for `paymentMethod === "mixed"`, `amount_paid` sums
   *all* payment splits including the `credit` one, and `payment_status` is always
   `"completed"` for mixed sales regardless of an unpaid credit portion. The customer's
   aggregate `outstanding_balance` scalar is still correctly incremented separately, so
   the top-line debt number isn't wrong — but `applyCreditPaymentFIFO()` in
   `lib/db/queries/customers.ts` only targets sales with `payment_status IN ('pending',
   'partial')`, so a mixed sale's unpaid portion is invisible to debt-payment
   allocation forever, and any view keyed off that sale's own `amount_paid`/
   `payment_status` (receipt, sale detail) shows it as fully paid when it wasn't.
   Repro: ₦1000 sale, mixed payment split cash ₦600 / credit ₦400 → `sales.amount_paid
   = 1000`, `payment_status = "completed"`, but `customers.outstanding_balance += 400`.
   Status: **fixed** — extracted `calculateMixedAmountPaid()` (excludes the
   credit split) and `calculateSalePaymentStatus()` (returns `"partial"` for
   a mixed sale with a nonzero credit split) into `pos-calculations.ts`, and
   used them in `use-pos-payment.ts`'s sale insert. Also consolidated the
   mixed-payment shortage check in the same file to call the existing
   `calculateSplitShortage()` helper instead of reimplementing it inline
   (previously-flagged duplication risk). Regression tests added to
   `__tests__/pos-calculations.test.ts`.

7. **`getCustomers()`'s `total_spent` doesn't subtract refunds.**
   `lib/db/queries/customers.ts` sums `sales.total_amount` only — `sales.total_amount`
   is deliberately never mutated on return (net figures are meant to be derived as
   `sales.total_amount - returns.total_refunded`, per the comment in
   `return-dialog.tsx`), but `getCustomers()` doesn't do that subtraction, so a
   customer's displayed total spent overstates by the sum of their refunds. Same root
   cause likely affects `getCustomerRetentionMetrics()`'s `total_revenue`/
   `avgTransactionValue` — full impact on reporting is the Reports/Analytics audit's
   territory.
   Status: **fixed** — both `getCustomers()` and
   `getCustomerRetentionMetrics()` now subtract a per-sale correlated
   subquery summing `returns.total_refunded` (excluding soft-deleted
   returns) before summing across sales. `sales.total_amount` itself is
   left untouched, matching the existing convention documented in
   `return-dialog.tsx`. Regression tests:
   `__tests__/customers-total-spent.test.ts` (new).

### Reports / Analytics / Dashboard

8. **[CRITICAL, root cause of #5] The unweighted `AVG(cost_price)` bug doesn't just mis-display — it's permanently baked into every sale's recorded COGS.**
   `getProductsWithStock()` (`lib/db/queries/products.ts`) — the live POS
   product-catalog source — uses the same unweighted `AVG(sb.cost_price)` as bug #5.
   This becomes `item.cost_price` in the POS cart and is **persisted permanently**
   into `sale_items.cost_price` at sale time (`lib/hooks/use-pos-payment.ts`).
   `getCurrentMonthCOGS()`/`fetchProfitLossReportData()` then sum this stored value
   directly — the P&L report's COGS, Gross Profit, and Margin % are silently wrong
   for any product with batches at different costs, using the same 25x-off example
   as #5 (₦505/unit recorded instead of the true ₦19.80). Unlike #5 (a live display
   you can refresh away), this bakes the wrong number into historical sale records —
   fixing the query later does NOT retroactively correct sales already recorded.
   This is the single highest-leverage fix in the whole sweep: one root cause feeding
   Inventory display (#5), POS sale-time cost snapshot, and P&L reports.
   A second instance of the same pattern: `getBIMetrics`'s `returnedCogsData` query
   (`lib/db/queries/reports.ts`) does the same unweighted `AVG(cost_price)` for the
   BI dashboard's "returned COGS" figure, and also omits the `_deleted = 0` filter
   its sibling queries include (soft-deleted batches can pollute it).
   Status: **fixed** (query-level) — see #5's fix, applied to every call site
   including `returnedCogsData`/`med_cost_price` (`reports.ts`/`sales.ts`),
   which also got the missing `_deleted = 0` filter added.
   **Not retroactively fixed:** `sale_items.cost_price` already recorded on
   past sales keeps whatever wrong value was baked in before this fix; only
   new sales get the correct weighted cost going forward. No data migration
   was performed — flag if backfilling historical sales matters for
   past-period reports.
   **Also noted, not fixed:** `returnedCogsData`/`med_cost_price` still derive
   COGS from *current* stock batch costs rather than the original sale item's
   recorded `cost_price` — `return_items` has no `sale_item_id` to look that
   up (schema gap, not addressed here). Correct only if costs haven't changed
   since the original sale.

9. **Dashboard "Sales Today"/"Refunds Today"/"Sales Yesterday" misattribute transactions near local midnight for any store not in UTC+0.**
   `getDashboardOverviewData()` (`lib/db/queries/reports.ts`) filters with
   `date(transaction_date) = ?` against `getLocalTodayDate()` (local calendar date),
   but `transaction_date`/`created_at` are stored as UTC ISO strings and SQLite's
   `date()` extracts the UTC calendar date with no `'localtime'` modifier.
   Repro (UTC+1 store): a sale at 00:30 local is 23:30 UTC the *previous* day —
   `getLocalTodayDate()` says "today", the UTC-based query says "yesterday", so the
   sale vanishes from both "Sales Today" and "Sales Yesterday". Window size scales
   with distance from UTC. The `salesToday - refundsToday` net-today math itself
   (`use-dashboard-overview.ts`) is correct; it just runs on inputs that already
   excluded some of today's real sales.
   Minor sibling of the same root cause: `fetchSalesReportData`'s "Date" column and
   `fetchCustomerReportData`'s "Last Purchase" (`date(s.transaction_date)`,
   `MAX(date(...))`) can display the wrong calendar day for a near-midnight sale —
   display-only, not a sum/total, lower severity.
   Fixing the query is sufficient — stored UTC timestamps are correct as-is; no data
   migration needed once comparisons use `'localtime'`.
   Status: **fixed** — added the `'localtime'` modifier to all 5 affected
   `date(...)` comparisons in `reports.ts` (Sales Today, Refunds Today, Sales
   Yesterday, and the two display-only date columns). Verified sql.js (the
   browser-side SQLite engine) actually honors `'localtime'` based on the
   environment's real timezone (tested with `TZ=Africa/Lagos`), so this isn't
   a no-op in the WASM build. Regression test:
   `__tests__/reports-timezone.test.ts` (new) — confirmed it fails without
   the fix and passes with it, using a sale timestamped to cross the
   UTC/Lagos-local midnight boundary. `getBIMetrics`'s `dateFilter`/
   `prevDateFilter` (rolling N-day windows, not exact-date equality) were
   checked and don't have this bug — a rolling window's hour-or-two skew at
   the boundary doesn't misattribute individual transactions the way exact
   date matching does.

### Demo account seeding

10. **Demo refund simulation omits tax from the refund total, unlike the real `calculateProportionalRefund`.**
    `lib/demo/loader.ts`'s `sale.refund` block sums item subtotals only
    (`items.reduce((sum, i) => sum + i.total_price, 0)`) instead of calling the real,
    tested `calculateProportionalRefund` from `lib/utils/pos-calculations.ts`. Today's
    single seeded `refund: true` sale (`template-activity.ts`, zyrtec) happens to have
    `taxPercentage: 0` so it's coincidentally correct — but seeding a refunded sale
    with nonzero tax would understate `returns.total_refunded` by the tax portion,
    leaving a "fully refunded" demo sale showing a nonzero net amount.
    Status: **open** (low severity — demo data only, not a real customer's money)

11. **Seeded tax uses `Math.round()`; the real `calculateTax()` doesn't round.**
    `lib/demo/loader.ts` computes `Math.round((subtotal * taxPercentage) / 100)`,
    while `pos-calculations.ts`'s `calculateTax()` returns the raw unrounded float.
    Sub-kobo drift, same "two formulas for one concept" pattern as elsewhere in this
    file — seeded sales won't bit-for-bit match what real checkout would compute for
    identical inputs.
    Status: **open** (cosmetic/low severity)

12. **Demo seeding safety is enforced only at the UI layer (`DemoDataSettings` checking `storeProfile?.is_demo`), not re-checked inside `runDemoSeed`/`isStoreSeedable` themselves.**
    `runDemoSeed` takes no store-identity parameter to validate against and trusts
    `getActiveStoreId()` unconditionally — if ever invoked from a second surface
    (future admin tool, dev script) without replicating the UI's `is_demo` gate, it
    would seed fabricated data directly into a real paying customer's store. Not a
    bug in current behavior (today there's exactly one call site and it is gated) —
    flagged as missing defense-in-depth given the blast radius.
    Status: **flagged**

### Activity Log & Settings/Multi-Store

13. **Activity Log leaked every store's entries into every other store's view — `audit_logs` had no store scoping at all.**
    `audit_logs` was the only real data table absent from `STORE_SCOPED_TABLES`
    (`lib/db/core.ts`) and had no `store_id` column; `getActivityLog()`/
    `getDistinctActivityActions()`/`getDistinctActivityUsers()`
    (`lib/db/queries/activity-log.ts`) had no store-filter condition at all.
    Repro: an owner/admin with access to Store A and Store B — switching to
    Store A's Activity Log page showed every mutation from Store B too
    (product edits, stock adjustments, returns, user names). Cross-store
    data leak, not a money bug, but the same "missing from the scoping list"
    class of oversight as the historical `getSuppliers()` bug documented in
    `__tests__/procurement.test.ts`.
    Status: **fixed** — added `store_id` to the `audit_logs` schema (+
    additive migration), added `audit_logs` to `STORE_SCOPED_TABLES`, added
    `getActiveStoreId()` to the raw `logAction()` insert in `core.ts` (it
    bypasses the generic `insert()` helper, so needed the column set
    explicitly), and added the store filter to all three read functions.
    `getProductCreator()`/`getProductHistory()` in `products.ts` were
    checked and don't need this fix — they're already scoped by a specific
    (globally-unique) `productId`, so they can't leak cross-store.
    Regression tests: `__tests__/activity-log-store-scoping.test.ts` (new).

14. **Loyalty tiers and redemption options had zero store scoping — worse than #13, since it's live configuration, not just history.**
    `lib/db/queries/loyalty.ts`'s `getLoyaltyTiers()`/
    `getLoyaltyRedemptionOptions()` had no `store_id`/`user_id` filter at
    all, and neither table had a `store_id` column — rows were only ever
    keyed by `user_id`. In a multi-store account, every store shared the
    exact same tiers/rewards catalog. Worse: `ensureLoyaltyDefaultsSeeded()`'s
    "has this store been seeded yet" check (`tiers.length === 0`) was
    evaluated globally, so only the very first store ever created received
    default tiers/options — every other store saw store A's live,
    editable config with no boundary at all (not "wrong store's data mixed
    in" but "no store boundary exists for this feature").
    Status: **fixed** — added `store_id` to both table schemas (+ additive
    migration), added both tables to `STORE_SCOPED_TABLES` (so the existing
    `insert()`/`update()`/`softDelete()` calls in the settings dialogs
    auto-scope with no changes needed there), and added the store filter to
    both read functions. `ensureLoyaltyDefaultsSeeded()` needed no direct
    change — its emptiness check now naturally operates per-store since
    `getLoyaltyTiers()` itself is scoped. Regression tests:
    `__tests__/loyalty-store-scoping.test.ts` (new), including a test
    proving each store now seeds its own defaults independently.

**Follow-up checked, not a bug:** `payment_accounts` also has a `store_id`
column but is absent from `STORE_SCOPED_TABLES` (flagged by the audit as
worth a quick check). Confirmed its one insert call site
(`components/settings/store/payment-accounts-card.tsx`) sets `store_id:
activeStoreId` explicitly, so it never depended on `insert()`'s
auto-injection in the first place — no fix needed.

## Flagged — product decisions, not bugs

- Loyalty point redemption is fully unwired (`calculateRedemptionValue()` defined,
  never called; `points_redeemed` hardcoded to 0 everywhere). Staff can configure a
  rewards catalog but nothing ever spends a customer's points. Decide: is redemption
  in scope for launch, or intentionally deferred?
- Returns don't claw back loyalty points earned on the original (now returned) sale.
  Depends on the intended loyalty program rules.
- Recalling a held transaction reprices items at current catalog prices rather than a
  snapshot of prices when held — compounds bug #2 above if a price changed meanwhile.
- Split-payment shortage check in `use-pos-payment.ts` reimplements the same logic as
  the tested `calculateSplitShortage` helper inline instead of calling it. No current
  drift, but worth consolidating defensively (this exact pattern is how the
  procurement bug happened).
- `getProductsForAudit()` in `lib/db/queries/inventory.ts` is dead code (zero
  callers) with the same unweighted-AVG issue as bug #5 — candidate for deletion.
- Several `stock_movements` movement-type filters (`'addition'`, `'IN'`, `'OUT'`,
  `'deduction'`, `'expired'`, `'damaged'`) are read-side dead code — never written by
  any current flow.
- Should a mixed-payment sale's credit split get its own trackable status (e.g. a
  `partial` sale status) so it can be reconciled the same way a pure-credit sale is?
- Whether "total spent" should be gross or net-of-returns is a product call — flagging
  the gap (bug #7 above), not asserting which is correct.
- P&L report's expense category breakdown (`getCurrentMonthExpensesByCategory`, raw
  unsmoothed monthly sum) doesn't reconcile with the report's own headline expense
  total (`getSmoothedExpensesTotal`, which amortizes prepaid/multi-month expenses).
  Explicitly commented as intentional in `use-finance-data.ts`, but worth deciding
  whether the breakdown should also be smoothed per-category so it sums to the total.
- "Current month" is computed via UTC (`strftime('%Y-%m','now')`) in
  `getCurrentMonthExpensesByCategory`/`getCurrentMonthRevenue`/`getCurrentMonthCOGS`,
  but via local device timezone (`date-fns startOfMonth`) in the smoothed-expense
  helpers and the Expenses page. Narrow edge case near month boundaries for
  non-UTC stores; same "two formulas, one concept" shape as other findings.
- Prescriptions: each medication's `cost` field is a free-typed number with no
  visible `unit_cost × quantity` relationship — a data-entry ambiguity (staff must
  know to type the line total, not a per-unit price), though nothing downstream
  currently miscomputes from it.
- Once bug #9 is fixed, should sales already recorded near local midnight be
  reconsidered for past reports? No data migration is needed (stored timestamps are
  correct UTC; only the comparison logic is wrong), but flagging in case historical
  report re-runs matter for the business.
- Not fully verified: whether `dateFilter`/`prevDateFilter` passed into `getBIMetrics`
  by its caller (constructed outside `reports.ts`) are subject to the same
  local/UTC mismatch as bug #9 — needs a follow-up check of that call site.
- Re-seeding demo data with `force: true` doesn't dedupe products/suppliers/customers
  by name (only the demo cashier user is deduped) — running "Seed Demo Data" twice
  layers a second full catalog/customer set on top of the first. Comment in the code
  suggests this is intentional ("if the operator really wants to layer on more");
  confirm that's really the intended demo experience.
- No "clear/reset demo data" path exists in this codebase — only additive seeding.
  Worth confirming whether resets happen via some other mechanism (backend/admin
  store-recreation) or are genuinely missing.
- The one seeded "mixed" payment demo sale has no real payment-split records behind
  it (fully paid via `amount_paid: totalAmount`, cosmetically labeled mixed) — fine
  today since nothing reads split data from it, but worth deciding if demo realism
  wants fabricated splits.

### UX/Clarity pass (targeted code-level sweep, not a full agent-per-module audit)

15. **Entire Analytics/BI dashboard hardcoded the Naira symbol regardless of the store's configured currency.**
    Settings has a real, user-facing Currency selector
    (`components/settings/regional-settings-card.tsx`), but `formatCurrency()`
    (default arg `"NGN"`) was called with no currency code anywhere in
    `components/analytics/`: `bi-key-metrics.tsx`, `profit-loss-tab.tsx`
    (7 call sites), `product-performance-table.tsx`,
    `staff-performance-tab.tsx`, plus two chart-axis tick formatters
    (`profit-loss-tab.tsx`, `sales-analytics-tab.tsx`) and one metric string
    in `lib/hooks/use-bi-data.ts` that hardcoded the `₦` character directly
    instead of using `formatCurrency()` at all. Any store that changed its
    currency away from NGN in Settings would still see every figure on the
    entire BI dashboard silently mislabeled as Naira.
    Status: **fixed** — every `formatCurrency()` call in `components/analytics/`
    now threads `storeProfile?.currency` through via `useStore()`. Added a new
    `getCurrencySymbol()` helper to `lib/utils.ts` (derived from the same
    `Intl.NumberFormat` as `formatCurrency()`, so the two can't disagree) for
    the two compact chart-tick labels that need just the symbol, not a full
    formatted amount. Regression tests added to `__tests__/utils.test.ts`.
    **Not touched:** `components/settings/billing/subscription-plans.tsx`
    also hardcodes NGN for its own price display — left alone since that's
    plausibly intentional (the SaaS vendor's own subscription charge
    currency, via Nigerian billing infra, independent of what currency a
    given store operates in for its own sales). Flagging as a product
    decision, not fixing without confirmation. Same reasoning applied to
    `components/settings/billing/referral-tab.tsx` (referral credits) and
    the coupon-applied toast/credits badge in `subscription-plans.tsx` —
    all part of the vendor's own billing system, not a store's sales.

    **Second pass found the same pattern outside analytics, now also fixed:**
    - `components/customers/overview-tab.tsx` — "Average Transaction Value"
      built a manual `₦{...toLocaleString(...)}` string instead of using
      `formatCurrency()`.
    - `components/expenses/add-expense-dialog.tsx` — the "Reports will count
      ₦X/month for N months" smoothing preview hardcoded ₦.
    - `components/pos/online-orders-modal.tsx` — real order/item amounts
      (`item.subtotal`, `order.total_amount`) shown to staff fulfilling
      online orders, hardcoded ₦.
    - `components/products/product-basic-info-fields.tsx` — the "Selling
      Price (₦)" field label on every product's catalog entry form.
    - `components/prescriptions/new-prescription/prescription-medications.tsx`
      — the "Total Cost (₦)" field label (the cost *values* already used a
      currency-aware `formatCurrency` prop from the parent; only the label
      was hardcoded).
    All five now derive the symbol/formatting from `storeProfile.currency`
    via `useStore()`.

    **Flagged, not fixed (cosmetic, not a live-data bug):** the default
    loyalty redemption options seeded for a new store
    (`lib/db/queries/loyalty.ts`'s `DEFAULT_REDEMPTION_OPTIONS`) have
    hardcoded labels like `"₦500 Discount"`. Low priority since these are
    just starting defaults in a fully editable rewards catalog — a store can
    rename them immediately — but a non-Naira store's first-run defaults
    will show the wrong currency in the label text until edited.

## Fixed

_(none yet from this sweep — Procurement's fixes predate this file; see git log)_
