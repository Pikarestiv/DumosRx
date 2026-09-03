# Point of Sale (POS)

Route: `app/(dashboard)/pos/page.tsx` → `components/pos/pos-system.tsx`
(`POSSystem`), orchestrated by `lib/hooks/use-pos-system.ts` and its
sub-hooks (`use-pos-cart.ts`, `use-pos-payment.ts`,
`use-pos-held-transactions.ts`, `use-pos-data.ts`, etc.).

Walked live against the "Pikarestiv Stores 2" store on 2026-09-02, including
real checkouts (cash + transfer) and a real hold/recall cycle — this store is
the plan's designated real-write sandbox for POS, unlike the read-only
walkthroughs of prior tasks.

## Layout

Two-pane desktop layout (`POSLayoutHeader` + product grid on the left,
`POSCartPanels` cart on the right; collapses to a bottom drawer on mobile via
`POSMobileCartDrawer`). Two main tabs: **Products** and **Recent Sales**
(`POSMainTabNav` / `POSTransactionHistory`).

## Product search & selection

- **Search box** (`POSLayoutHeader`, header + a duplicate mobile-row input) —
  live-filters by name/SKU as you type. Confirmed live: searching "syringe"
  correctly narrowed the grid to the three syringe SKUs (10ML/2ML/5ML) and
  showed the 5ML one as "Out of stock" (correctly not addable to cart).
- **Category filter pills** (`POSCategoryFilter`) — All + one pill per
  category present in this store's catalog (Beverages, BUSICUIT, Cosmetics,
  CREAMS, Drugs, machine, PERFUME, PROVISION, System, Toiletries, …).
- **"Goes well with cart" smart suggestions** — appears once the cart has at
  least one item; suggests related/frequently-co-purchased products. Confirmed
  live: adding a syringe surfaced other syringe sizes and creams as suggestions.
- **"Recently sold" row** — appears on the Products tab once at least one sale
  has completed this session, showing the just-sold products with an updated
  stock badge.
- **Scan** button opens `CameraScannerDialog` for barcode scanning (device
  camera; not exercised in this walkthrough — no physical/virtual barcode
  available in this environment).
- Clicking a product card adds 1 unit to the cart; clicking again increments
  the existing line by 1 (`use-pos-cart.ts`). An out-of-stock card is inert —
  clicking it shows an "out of stock" toast and does not touch the cart.

## Cart (`POSCartPanels` / `POSCartItem`)

- **Line items** — each row shows name, unit price, a quantity stepper
  (Minus/Plus buttons + the qty itself, both real `<button>`s), and the line
  subtotal. Swipe-left-to-delete on touch devices; a trash icon does the same
  on desktop. Confirmed live: added 3 distinct products across two sales,
  incremented one line to quantity 2 via the stepper, all totals recalculated
  correctly.
- **Customer selector** — defaults to "Walk-in customer"; clicking it opens a
  search/add-new picker (`POSCustomerSelector`). Confirmed live: created a new
  customer ("SmokeTest Customer") inline and it became the active customer for
  the sale (required for Credit payment — see below).
- **Discount** — "+ Add discount" reveals an amount input + Fixed/% selector.
  Confirmed live: a ₦100 fixed discount on a ₦1,450 subtotal correctly
  produced a ₦1,350 total, and the discount amount and type both survived a
  hold/recall round-trip (see Held Transactions below).
- **Hold Sale** — parks the current cart (see Held Transactions).
- **Clear cart** — confirmation dialog before wiping the current cart.
- **Charge** button opens the Payment dialog; disabled with `₦0` label when
  the cart is empty.

## Held transactions (park & resume)

Real, working feature — not a stub. Backed by the `held_transactions` table
(`lib/db/schema.ts`), `usePOSHeldTransactions`
(`lib/hooks/use-pos-held-transactions.ts`), and `HeldTransactionsDialog`
(`components/pos/held-transactions-dialog.tsx`).

- **Hold Sale** → `handleHoldTransaction`: serializes the current cart
  (`items_json`), the discount/discount_type, and the customer, inserts a row,
  clears the live cart, and shows "Transaction held successfully". The
  cart-panel header then shows an amber "N on hold" badge with a "View" link.
- **View** opens `HeldTransactionsDialog`: lists every held sale with
  customer name, held-at time, item count, and total; each row has **Recall**
  and a destructive delete (with its own pending-state spinner).
- **Recall** → `handleRecallTransaction`: clears whatever's in the cart right
  now, re-hydrates every line item by looking its `product_id` up in the live
  product list (carrying over the held quantity), restores the discount and
  discount_type, restores the customer if one was set, and deletes the held
  row.
- Confirmed live end-to-end: held a 3-line cart (10ML SYRINGE ×2, 2ML SYRINGE
  ×1, ABONIKI BALM 25G ×1, ₦100 fixed discount, total ₦1,350) → cart emptied,
  "1 on hold" appeared → opened the dialog, saw "3 Items" / ₦1,350 → Recall →
  all 3 lines, quantities, and the ₦1,350 total came back exactly. Then
  completed the sale for cash.
- **Coverage gap found and closed this task** — see Testing section below:
  zero existing tests touched this feature before this task.

## Payment (`POSPaymentDialog` / `payment-method-selector.tsx`)

Five payment methods, individually toggleable in Settings → Payment Methods:
**Cash**, **Card**, **Transfer**, **Credit**, **Mixed**. All five were enabled
for this store.

- **Cash** — Amount Paid input, pre-filled with the exact total; shows
  "Change: ₦X" once the amount is ≥ total. Confirmed live: paid exact amount,
  sale completed, receipt showed the paid/change lines.
- **Card** / **Transfer** — when "Require Payment Destination Account" is on
  (it was, for this store), a Destination Account dropdown appears, filtered
  by account type: Card only shows accounts of type `pos_terminal`; Transfer
  shows every other type (bank/mobile money). This store had zero
  `pos_terminal` accounts configured, so Card's dropdown was legitimately
  empty (not a bug — confirmed by adding a "Smoke Test POS Account" of type
  Bank and seeing it appear under **Transfer**, not Card). Added a Payment
  Account via Settings, then completed a real Transfer sale against
  "Zenith Bank POS" — receipt correctly showed `Payment type: TRANSFER`.
  A "Set as default for Card/Transfer on this device" checkbox appears once an
  account is picked.
- **Credit** — requires a selected customer first (blocked with a toast
  otherwise: "Please select a customer for credit sales"); on success, adds
  the sale total to that customer's `outstanding_balance`.
- **Mixed** — `PaymentSplits`: split the total across multiple
  method+amount(+account) rows; must fully cover the total before Process
  Payment is enabled.
- **Sale Note** — optional (or required, per a store setting) free-text note
  attached to the sale.
- **Process Payment** inserts the `sales` row, one `sale_items` row per cart
  line, deducts/logs stock per item (see Testing → bug fixed, below), applies
  loyalty points and redemption if a customer/reward was involved, then shows
  the receipt dialog and clears the cart.

## Receipt (`ReceiptView` / `POSReceiptDialog`)

Shows store name, invoice number, customer, date, cashier, a line per item
(qty/price/total), subtotal, discount (if any), tax (if any), grand total,
and payment type/change. **Print Receipt** and **Close** buttons. Confirmed
live for both a cash sale (with discount) and a transfer sale.

## Product-request empty state (`RequestItemDialog`)

Mentioned in recent commit history (`cf4964fa`). `RequestItemDialog`
(`components/pos/request-item-dialog.tsx`) is reachable from the cart panel's
**Request Item** button at any time (not only on a true empty-cart state) —
it seeds its product-name field from the current search term
(`initialProductName`), lets the cashier pick/search a customer, set a
quantity and notes, and calls `logRequestedProduct()`
(`lib/db/requested-products-queries.ts`), writing to the `requested_products`
table for the store to review later (e.g. "customer asked for a product we
don't stock"). Data-layer coverage already exists in
`__tests__/requested-products.test.ts`; the dialog's UI itself has no
dedicated e2e coverage (not addressed this task — see Testing below for what
was prioritized instead).

## Testing

### Coverage gap found

```
$ grep -rln "held_transaction\|hold\b" __tests__/ e2e/ components/pos/
__tests__/date-utils.test.ts   # unrelated match on the word "hold"
components/pos/pos-system.tsx
components/pos/pos-cart.tsx
components/pos/transaction-item.tsx
```

Zero test files (Vitest or Playwright) exercised held transactions before
this task, despite it being a real, wired-up feature. The product-request
dialog had data-layer coverage (`requested-products.test.ts`) but no e2e
coverage of the dialog itself.

### Test added: `client/e2e/pos-held-transaction.spec.ts`

Targets the riskiest untested failure mode: `handleRecallTransaction`
rebuilds cart lines from the held row's `items_json` by looking each item back
up in the *live* products list, silently dropping any item it can't find via
`.filter((item): item is CartItem => item !== null)`. A renamed/deactivated
product, or one not yet loaded into that list, would shrink the cart on
recall with no error — the cashier would see a smaller total, not a warning.

The test creates two fresh products, gives them stock via a real Cycle Count,
builds a 2-line/3-unit cart with a fixed discount, holds it, reopens the held
list, recalls it, and asserts every line item, quantity, and the discount all
survived byte-for-byte (matching totals before/after), then completes the
sale. Passed twice in a row against `--project=chromium --no-deps`.

While writing it, confirmed live that the Cycle Count screen's current UI
(inline "Counted Qty" cells in a search+grid layout, "Review & submit" →
"Submit audit") differs from the older select-a-category-then-"Start count"
flow `e2e/sales-lifecycle.spec.ts` still asserts against — that flow no
longer exists in the app. This is a second instance of the same
pre-existing/unrelated e2e-suite drift already logged in
`docs/features/_findings-log.md` (`products.spec.ts`, `global.setup.ts`);
not fixed here (out of this task's scope), but logged as a new entry.

### Bug found and fixed: saving a product without a category always failed

Found while creating the two test-fixture products above (Category has no
"*" in the Add Product dialog — it's documented as optional) and reproduced
independently, live, via Chrome DevTools console:

```
Failed to save Product: Wrong API use : tried to bind a value of an unknown type (undefined).
```

**Root cause:** `useSaveProductMutation`
(`lib/hooks/use-save-product-mutation.ts`) set
`localPayload.category_id = undefined` when no category was chosen.
`base-helpers.ts`'s `insert()`/`update()` bind every payload value straight
into a sql.js prepared statement with no null-coalescing, and sql.js's
`bind()` throws on a JS `undefined` — it only accepts `null` for an absent
column. Every product ever saved without a category (the common case for a
retail/pharmacy store that hasn't set up categories yet) silently failed to
save, with no created row and only a generic toast.

**Fix:** `localPayload.category_id = null` instead. The mutation's async body
was extracted to a standalone `saveProductToLocalDb()` export so it's
directly unit-testable without a React/QueryClient tree.

**Verified:**
- `client/__tests__/save-product-no-category.test.ts` — real in-memory
  SQLite against the app's actual `SCHEMA_SQL` (not a mocked insert),
  confirmed to fail with the exact same `sql.js` error against the pre-fix
  code, pass after.
- Live re-test in Chrome: created "Manual UI Test Product XYZ2" with no
  category selected → "Product added successfully", row appeared in the
  catalog tagged "Uncategorized".
- `client/e2e/sales-lifecycle.spec.ts` (pre-existing, previously blocked at
  this exact step) now gets past product creation; it still fails further
  along at the stale Cycle Count assertions described above — unrelated,
  pre-existing, not addressed here.

### Second bug found and fixed: a completed sale could leave zero trace in the stock ledger

Found while investigating unexpectedly negative stock counts during the live
walkthrough (10ML SYRINGE and others went negative after ordinary test
sales). Traced via direct inspection of the synced MySQL data: a sale's
`sale_items` row existed with no matching `stock_movements` row at all for
one of its lines.

**Root cause:** in `use-pos-payment.ts`'s `handlePayment`, `getBatchesForProduct()`
filters to `quantity > 0` (correct for FEFO picking). If a product's real
stock was already fully depleted, that filter returns an empty list — and the
payment loop then had **no batch to attribute the sale to at all**: no
`stock_batches` update, no `sale_item_batches` row, no `stock_movements` row.
The sale still completed and was recorded as revenue; the unit(s) sold simply
vanished from the inventory ledger with no error or warning anywhere.

**Fix:** extracted the per-item batch-deduction logic into
`recordSaleItemStock()` (`lib/db/queries/inventory.ts`), which now falls back
to `getAnyActiveBatchForProduct()` (the product's most-recently-touched active
batch, regardless of quantity) when no batch has positive stock, so the
deduction is still attributed and logged — the batch goes further negative
(same as an already-negative batch does today) instead of the sale leaving no
trace at all.

**Verified:** `client/__tests__/record-sale-item-stock-depleted-batch.test.ts`
(3 tests, real in-memory SQLite against `SCHEMA_SQL`) — confirmed to fail
(`recordSaleItemStock is not a function` pre-refactor; the underlying
zero-batches case reproduced separately) against the pre-fix code, pass after;
also covers that FEFO picking among genuinely positive-stock batches, and the
true-zero-batches edge case (nothing to attribute to at all), are unaffected.

## Findings log

See `docs/features/_findings-log.md` for the running cross-task log; this
task's two fixes and the stale-cycle-count-flow finding were appended there.
