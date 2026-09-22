# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings. Fixed entries are removed outright rather than marked — this file is a to-do list, not a changelog (git history is the changelog).

Open items below are grouped by severity (Critical → High → Medium → Low), then a `client/`-area miscellaneous section for older/unlabeled entries, then the separate `web/` pre-launch review section.

## Decided — accepted as-is (not a bug)

### Plaintext PINs stored and synced

- **Where:** `client/lib/db/queries/auth.ts:9,32,36`,
  `client/lib/context/auth-context.tsx:183,436`.
- **Context:** `users.pin` is stored and compared in plaintext, and carried
  in sync payloads for the `users` table.
- **Effect:** a `.drx` backup file, an IndexedDB dump, or a server-side DB
  read exposes every staff PIN in the clear. Compounds the admin-backdoor
  and no-lockout findings above.
- **Decision (2026-09-22):** kept as plaintext, deliberately. This is a
  known tradeoff of the offline-first architecture — PIN unlock must work
  with zero network round-trip, and every avenue for real hashing here
  (bcrypt/argon2/scrypt at interactive-unlock speed, purely client-side,
  no server call) was judged not worth the added complexity and offline-
  verification cost for what this PIN actually gates (device-local staff
  unlock, not the cloud account credential). Not revisited unless the
  threat model changes.

## High

### Hard deletes (`remove()`) never reach the sync queue, so they only ever happen on one device

- **Where:** `client/lib/db/base-helpers.ts:266-289`; callers
  `client/lib/hooks/use-pos-held-transactions.ts:146`,
  `client/lib/hooks/use-sales-data.ts:27`,
  `client/lib/hooks/use-payment-accounts.ts:71`.
- **Context:** `insert()`, `update()` and `softDelete()` all call
  `addToSyncQueue()`; `remove()` is the one helper that doesn't. It runs the
  local `DELETE`, then deletes any *pending* `_sync_queue` rows for that
  record and writes an audit entry — but never queues a `DELETE` operation of
  its own. `client/AGENTS.md` describes all four helpers as queueing their
  write, so this reads as an oversight rather than a decision. Both tables it
  is used on (`held_transactions`, `payment_accounts`) are fully synced in
  both directions — they're in the server's push *and* pull table lists
  (`laravel-server/.../SyncController.php:618`).
- **Effect:** once a held transaction or payment account has been pushed, a
  hard delete is purely local. The server keeps the row, every other terminal
  that already pulled it keeps showing it, and a fresh install or a DB restore
  pulls it back onto this device too. For held transactions that also means a
  recalled cart stays recallable on a second terminal — the same held sale can
  be rung up twice. (Related, same table: `getHeldTransactions()` /
  `getHeldTransactionCount()` in `client/lib/db/queries/sales.ts:93-108` also
  filter only on `store_id`, never `_deleted = 0`, so a `_deleted = 1` row
  arriving from a pull — `pull.ts` writes that flag straight into the local
  row — would be listed as an active held sale.)

## Medium

### Stock transfers are invisible to the "Total stock value" month-over-month figure

- **Where:** `client/lib/db/queries/inventory.ts:779-833` (`getStockMoM`), the
  `added30` / `removed30` / `positiveAdjustments` queries at lines 787-805.
- **Context:** the MoM percentage is derived by reconstructing last month's
  value: `previousValue = currentValue - netChange30`, where `netChange30`
  sums `stock_movements` of type `purchase`/`return` (added) and
  `sale`/`adjustment` (removed). The transfer feature
  (`client/lib/db/queries/stock-transfers.ts`) writes `transfer_out` /
  `transfer_in` movement types, which appear in neither list.
- **Effect:** on a multi-store account that moves stock between branches, the
  destination store's valuation rises (a real new batch) with no matching
  entry in `netChange30`, so the reconstructed "previous value" absorbs the
  whole transfer and the card reports roughly no change; the source store gets
  the mirror-image error. The larger the transfer, the more wrong the
  percentage.

### Low-stock alerts silently omit every product that has no stock rows at all

- **Where:** `client/lib/db/queries/inventory.ts:312-334` (`getLowStockAlerts`),
  consumed by `client/lib/hooks/use-stock-batch-alerts.ts:13`.
- **Context:** the query is `FROM stock_batches inv JOIN products m ...`. An
  inner join means a product only produces a row if it has at least one
  non-deleted `stock_batches` row. Its sibling aggregate,
  `getStockBatchStats()` (same file, line 406), uses a `LEFT JOIN` and counts
  exactly those products in `critical_stock_count`.
- **Effect:** a product that has genuinely run out — every batch deleted, or
  one never stocked since being created — never appears in the Action
  Center/dashboard alert list, even though the hook has a dedicated
  `severity: "critical"` branch for `quantity === 0` that only ever fires for
  products that still have (zeroed) batch rows. The dashboard's low-stock
  *count* tile (from `getStockBatchStats`) and the alert *list* therefore
  disagree, and the most urgent products are the ones missing from the list.

### Daily Close values returned goods at today's stock cost, not the cost recorded at sale time

- **Where:** `client/lib/db/queries/sales.ts:322-325`
  (`getDailyCloseData`'s `returnItemsToday`),
  `client/lib/hooks/use-daily-close-data.ts:179-182`.
- **Context:** the query derives `med_cost_price` as
  `IFNULL((SELECT SUM(cost_price * quantity)/SUM(quantity) FROM stock_batches
  WHERE product_id = ri.product_id AND is_active = 1 AND _deleted = 0), 0)`,
  and the hook subtracts `item.cost_price || item.med_cost_price` from the
  day's COGS. `return_items` has no `cost_price` column at all (schema.ts:238,
  plus its only migration adds just `store_id`), so the `||` always falls
  through to the recomputed current-stock average. This is the same bug class
  already fixed for `getBIMetrics.returnedCogsData` and
  `getAdvancedMonthlySalesData.rawMonthlyReturns` (commits `0a0d515e` /
  `f2f822a0`), which now read `sale_items.cost_price` instead; Daily Close was
  missed. The subquery is also not store-scoped.
- **Effect:** any cost change between the sale and the return misstates the
  day's "Total Profit (Est.)", and once a product has no active batches left
  the `IFNULL(..., 0)` reports the returned COGS as zero — so a return of
  expensive stock reduces revenue while crediting back nothing on the cost
  side, understating profit by the full cost of the returned goods.

### Tax collected is counted as profit in the Daily Close and the P&L report, but not in the BI dashboard

- **Where:** `client/lib/hooks/use-daily-close-data.ts:198-199`,
  `client/lib/db/queries/reports.ts:541-600`
  (`fetchProfitLossReportData`), versus
  `client/lib/hooks/use-bi-data.ts:48`.
- **Context:** `total_amount = subtotal + tax_amount - discount_total` (see
  `pos-calculations.ts`). `useBIData` deliberately backs tax out
  (`netSales = revenue - totalTax - totalRefunds`, with an explicit comment
  that tax is pass-through, not revenue). Daily Close computes
  `totals.total - totalCostPrice - redeemedResellerPayouts` straight off
  `sale.total_amount`, and the P&L report's `Revenue` is
  `SUM(s.total_amount)`, feeding `Gross Profit`, `Net Profit` and `Margin %`.
- **Effect:** for any store with a non-zero VAT rate configured, the Daily
  Close "Total Profit (Est.)" and the P&L report's profit/margin columns are
  inflated by the VAT collected, and disagree with the Analytics dashboard's
  numbers for the same period — three surfaces, two definitions of revenue.

### Expired stock counts as sellable in the POS, and the oversell fallback dispenses it

- **Where:** `client/lib/db/queries/products.ts:96-107`
  (`getProductsWithStock`), `client/lib/db/queries/inventory.ts:93-101`
  (`getBatchesForProduct`), `:132-137` (`getAnyActiveBatchForProduct`),
  `:259-265` (the shortfall fallback in `recordSaleItemStock`).
- **Context:** commit `0a6fe75d` added the expiry filter to
  `getBatchesForProduct` so FEFO can never pick expired stock. But the number
  the POS shows and enforces against (`stock_quantity` from
  `getProductsWithStock`, used by `usePOSCart`'s `addToCart`/`updateQuantity`
  stock guard) sums every non-deleted `is_active = 1` batch with no expiry
  filter, and the fallback `getAnyActiveBatchForProduct` has no expiry filter
  either.
- **Effect:** a product whose remaining stock is entirely expired still shows
  a positive, addable quantity in the POS. Ringing it up finds no eligible
  FEFO batch, falls through to the fallback, and deducts from the expired
  batch — the expired units are dispensed and recorded as an ordinary sale
  (tagged "oversold" only if the batch's own quantity couldn't cover it), with
  nothing shown to the cashier.

### A return against a credit sale drops that sale out of the FIFO debt-settlement ledger

- **Where:** `client/lib/hooks/use-process-return-mutation.ts:82-84`,
  `client/lib/db/queries/customers.ts:143-151` (`applyCreditPaymentFIFO`).
- **Context:** a credit sale is created with `payment_status: "pending"` and a
  mixed sale with a credit split as `"partial"`
  (`pos-calculations.ts:145-157`); `applyCreditPaymentFIFO` settles
  `payment_status IN ('pending', 'partial')` oldest-first. Processing a return
  overwrites `payment_status` with `"refunded"` / `"partially_refunded"` —
  the column carries both the collection state and the refund state, and the
  refund state wins.
- **Effect:** after any partial return on an unpaid credit sale, that sale is
  invisible to every subsequent `recordCustomerPayment()`. The customer's
  `outstanding_balance` is still reduced (and the debtors list still behaves),
  but the sale's `amount_paid` is frozen forever and the payment is instead
  applied to *other* pending sales — the per-sale ledger and the customer
  balance permanently disagree about which sales are actually settled.

### The product import's duplicate pre-flight ignores barcode, the dedupe it warns about doesn't

- **Where:** `client/lib/db/queries/product-import.ts:13-25`
  (`findInFileDuplicates`) versus `:43-70` (`findExistingProductId`);
  caller `client/components/stock-batch/import-mapping-dialog.tsx:109-115`.
- **Context:** `findInFileDuplicates` groups rows on
  `name + category` only, and its own doc comment claims it uses "the same
  dedupe key as importProductRows". It doesn't: `findExistingProductId`
  matches **barcode first**, falling back to name+category and then name.
- **Effect:** two rows in one file carrying the same barcode under different
  names pass the pre-flight silently, and then collide anyway during the
  import — the second row matches the product the first row just created and
  overwrites its name, price and reorder level, and is reported as "updated".
  This is exactly the silent merge the confirm-duplicates step exists to
  surface.

## Low

### "Total Spent" means net-of-refunds on the Customers page and gross in the Customers report

- **Where:** `client/lib/db/queries/reports.ts:603-623`
  (`fetchCustomerReportData`) versus
  `client/lib/db/queries/customers.ts:5-25` (`getCustomers`).
- **Context:** `getCustomers()` (and `getCustomerTotalSpent()`, which drives
  loyalty-tier selection) subtracts each sale's `returns.total_refunded`
  before summing. The exported Customers report sums raw
  `SUM(s.total_amount)` and counts `COUNT(s.id)` with no refund netting, under
  the same "Total Spent"/"Total Purchases" labels.
- **Effect:** a customer who returned goods is listed with a higher lifetime
  spend in the exported report than the app shows on the Customers page, and
  the report's ordering (`ORDER BY SUM(s.total_amount) DESC`) ranks top
  customers on the gross figure.

### Catalog "nearest expiry" / batch number can come from a deactivated batch its own stock figure excludes

- **Where:** `client/lib/db/queries/products.ts:13-14`
  (`getProductsWithDetails`).
- **Context:** in the same SELECT, the `stock_quantity` and `cost_price`
  subqueries filter `_deleted = 0 AND is_active = 1`, while the `expiry_date`
  and `batch_number` subqueries filter only `_deleted = 0 AND quantity > 0`.
- **Effect:** a deactivated batch contributes nothing to the product's
  displayed stock or cost, but can still supply the expiry date and batch
  number shown on the catalog row and product detail panel — including
  driving the "expired"/"expiring soon" catalog filters off a batch that is
  not part of sellable stock.

### "Recently sold" POS suggestions can omit the most recently sold product

- **Where:** `client/lib/db/queries/sales.ts:283-290`
  (`getRecentlySoldProductIds`).
- **Context:** `SELECT DISTINCT product_id FROM sale_items ... ORDER BY
  created_at DESC LIMIT 5` orders by a column that isn't in the result set of
  a `DISTINCT` query, so the ordering is applied to an arbitrary representative
  row per product, not its latest sale. Verified against SQLite directly: with
  rows `(A, 2020-01-01)`, `(A, 2026-06-01)`, `(B, 2026-01-01)`, `(C…F, older)`,
  the query returns `B, F, E, D, C` — product A, the most recently sold of all,
  is dropped entirely.
- **Effect:** the POS "recently sold" group is built from a partly arbitrary
  set of products rather than the five most recent. Cosmetic only — the ids
  are used to re-order an already-fetched, already-filtered product list
  (`components/pos/pos-product-list.tsx:163-180`), never to fetch or display a
  product in their own right.

### `promoteDraftPurchaseOrdersToPending()` isn't store-scoped, so it throws on every other store's rows at boot

- **Where:** `client/lib/db/queries/procurement.ts:50-61`.
- **Context:** the boot-time migration selects every `status = 'draft'`
  purchase order on the device with no `store_id` filter (every sibling query
  in the same file scopes to the active store), then calls `update()` on each.
  `update()` runs `assertStoreOwnership()`, which throws "Cannot modify a
  record owned by a different store" for any row belonging to another store.
- **Effect:** on a multi-store device only the active store's legacy drafts are
  ever promoted; the rest log an error on every app boot and stay `draft`
  forever — a status the rest of the app no longer handles — unless the user
  happens to boot with that store active.

## `client/` — older/unlabeled entries

### Account/store switch may briefly show the previous store's stale dashboard data (unreproduced)

- **Where:** `client/lib/context/store-context.tsx`'s `switchStore()` calls
  `queryClient.cancelQueries()` then a broad, deliberately untargeted
  `queryClient.invalidateQueries()`. React Query's default behavior for
  `invalidateQueries()` is to mark queries stale and refetch in the
  background *without* clearing what's currently rendered — a component
  keeps showing its last-known (now-stale) data until the refetch resolves.
- **Reported:** a user-reported "a small lag when one switches account or
  something where for a second or so, after switching, the old account's
  dashboard is shown."
- **Investigated, not reproduced:** the store-switcher path was exercised 6
  times alternating between two real stores with meaningfully different
  data, using rapid back-to-back screenshots with no manual delay; a second,
  structurally different switching mechanism (multi-staff PIN "Switch
  Account," which goes through `login()`'s `queryClient.clear()` instead —
  clears outright rather than marking stale-but-displayable) was also
  exercised. Every trial's very first screenshot after the switch already
  showed the fully correct destination data; no stale frame was ever caught,
  and no console errors appeared.
- **Status:** the stale-render window is real by design in this app's
  local-first architecture (sql.js reads, no network round-trip), but
  apparently resolves fast enough on this test device/data volume to be
  imperceptible. Never reproduced. A slower device, a much larger local DB,
  or sync contention during the switch could plausibly still hit the window.
- **Mitigated, not root-fixed (defense in depth):** `switchStore()` now
  holds an `isSwitchingStore` flag (exposed from the store context) for the
  duration of its `cancelQueries()`/`invalidateQueries()` round trip, and
  `LicenseGuard` — which already gates the whole app on its own `loading`
  splash — renders `SplashScreen` while it's set. So a switch can no longer
  paint the outgoing store's data even if the window does open on a slower
  device. Capped at `SWITCH_STORE_MAX_WAIT_MS` (5s) so a query that never
  settles falls back to the (at worst briefly stale) UI rather than
  stranding the app on the splash. The underlying behavior is unchanged:
  React Query's `invalidateQueries()` still refetches stale-while-revalidate
  by design — it's just covered by a loading state now. If this is reported
  again despite that, get a screen recording (polled screenshots could miss
  a sub-second flash).

### `SyncController::push()`'s `stale_timestamp` conflict-fallback branch — corrected: NOT dead code

- **Where:** `laravel-server/app/Http/Controllers/Api/App/SyncController.php`, `push()`'s UPDATE handling — the `elseif (!$isCommutativeTable && $model->updated_at && isset($payload['updated_at']))` branch, guarding the case where `$payloadVersion !== null && $modelVersion !== null` is false.
- **This entry previously claimed the branch was unreachable dead code**, reasoning that `$modelVersion` (`$model->_version`) can never be `null` since every `_version` column is `integer default(1)` NOT NULL. That half of the reasoning is correct — confirmed both from every migration and git history, and directly against the production DB (a full `SELECT ... WHERE _version IS NULL` sweep across all 31 tables with a `_version` column returned zero rows).
- **What the original analysis missed:** the guard is `$payloadVersion !== null && $modelVersion !== null` — it's false whenever *either* side is null, not just when `$modelVersion` is. `$payloadVersion` genuinely can be null: a payload can simply omit the `_version` key. `tests/Feature/SyncEndpointTest.php::test_push_sync_handles_soft_deletes` does exactly this (an `UPDATE` with `_deleted: 1` and no `_version` field) and relies on the timestamp-fallback branch to accept it. Removing the branch broke that test (and `test_push_sync_generates_a_stable_device_id_when_store_insert_omits_one`) immediately.
- **Status:** left in place, confirmed live. Do not remove without also confirming no real caller ever sends an `UPDATE` payload without `_version` — today's client (`base-helpers.ts`'s `update()`) always includes it, but this legacy fallback protects against payloads that don't (whether from an older client version, or a hand-built payload like the soft-delete test above).
- **Now directly covered**, rather than only incidentally via the soft-delete test: `SyncEndpointTest.php`'s `test_push_sync_rejects_an_older_update_with_no_version_via_the_timestamp_fallback` and `..._accepts_a_newer_update_...` pin both outcomes of the branch (rejection reported as `stale_timestamp` in `failed` with the row untouched; acceptance applying the write while leaving `_version` alone and reporting nothing in `versions`). The stale "this branch is unreachable dead code" comment that sat above these tests has been replaced accordingly. The branch's logic now lives in `resolveUpdateConflict()` — same code, just extracted.

## Pre-launch review findings (web/)

Read-only review pass over `web/` (Next.js superadmin panel + marketing
site), area by area. Same convention as the earlier `client/` pass: grouped
by area, one entry per finding, removed outright once fixed. Every area,
including auth, is now fixed and moved to `FIXED_BUGS.md`.
