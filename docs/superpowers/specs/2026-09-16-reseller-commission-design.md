# Reseller Commission Sales

**Date:** 2026-09-16
**Status:** Approved design, pending implementation plan

## Background

Cynthia referred a construction-materials store in Cameroon (see
`memory/project_cynthia_referral_cameroon_client.md`). One of the requested
items was originally described as "over-invoicing receipt plus percentage of
how much to remit to the over-invoicer" — flagged as ethically/legally risky
on first read, since it could describe fabricating a receipt for a sale the
store was never actually party to (invoice fraud).

Clarified with the user: the real scenario is an independent reseller with no
storefront of their own. They find their own client, quote that client a
price (marked up from the store's normal price), and bring the sale to the
store. **The money for the marked-up price flows through the store** — the
store is the actual seller of record, at the price the reseller quoted. The
store then owes the reseller a cut of that markup as commission. This is a
standard consignment/agent-sale arrangement, not fraud, provided the store's
books reflect the real (marked-up) transaction amount.

Key constraints from the clarifying conversation:
- Commission is a single store-wide percentage of the markup (not
  per-reseller, not a flat rate on the whole sale) — "Store sets a percentage
  figure of markup to give reseller in any of such scenario."
- The sale should look completely normal — same receipt, no reseller
  labeling visible to the end customer.
- No reseller identity/CRM is needed — "just a flag, no identity."
- Commission is not paid out immediately at checkout. It sits as a pending,
  redeemable amount tied to that specific sale, and "the reseller can come at
  any point and redeem their cut" — this is closer to an unclaimed voucher
  than a running ledger balance.
- Redemption happens by looking up the sale via its receipt/transaction
  number.
- A running total of unredeemed commissions should be visible somewhere
  (the redemption screen itself).

## Existing patterns this builds on

- `stores.vat_percentage` (`client/lib/db/schema.ts:292`) is the existing
  precedent for a store-wide percentage setting read via `useStore()` and
  applied at checkout (`client/lib/hooks/use-pos-cart.ts`). The new
  `reseller_commission_percentage` column follows the same shape.
- Cart line item prices are **not editable today** — `unit_price` is taken
  as-is from the product record (`use-pos-cart.ts` `addToCart`/
  `updateQuantity`); `POSCartItem` renders it as plain text. Per-item price
  override for reseller mode is new.
- `use-pos-payment.ts`'s `handlePayment` (`insert("sales", {...})`, lines
  155-209) is where new sale-level columns get written.
- The Returns flow (`lib/hooks/use-process-return-mutation.ts`) is the
  existing pattern for "mutate a completed sale after the fact" — wraps in
  `transaction()`, updates the `sales` row, and is the model for how
  redemption should update `reseller_commission_redeemed`.
- No till/cash-drawer subsystem exists anywhere in this app. Redemption is
  therefore bookkeeping only (can't be claimed twice, has an audit trail) —
  it does not simulate removing cash from a drawer, since there's no drawer
  model to remove it from.
- Nav placement follows the existing `isAdmin || canManageStockBatch`-gated
  section in `dashboard-sidebar.tsx` (same gate as Expenses/Reports/Activity
  Log).

## Goals

- Let a cashier mark a sale as a reseller sale and enter the reseller's
  quoted price per line item — never below that item's normal selling price.
- Compute and store the commission (store-wide % of the markup) on that sale
  at checkout time, as a snapshot — immune to the store's commission % or the
  product's price changing later.
- Let staff look up any past sale by receipt/transaction number and, if it
  has an unredeemed commission, mark it redeemed.
- Show a running total of all unredeemed commission amounts.
- Change nothing about what the end customer sees — receipt stays exactly as
  it is today.

## Non-goals

- No reseller identity/profile/CRM. No per-reseller commission rate. No
  per-reseller sales history.
- No cash-drawer/till simulation. Redemption is a status flag + audit trail,
  not a money-movement ledger.
- No automatic payout mechanism (bank transfer, etc.) — redemption is a
  manual "staff confirms this was paid out in person" action.
- No change to the customer-facing receipt.

## Data model

New columns on `stores` (mirrors `vat_percentage`):
```sql
reseller_commission_percentage REAL DEFAULT 0
```

New columns on `sales`:
```sql
is_reseller_sale INTEGER DEFAULT 0,
reseller_commission_percentage REAL DEFAULT 0,  -- snapshot of the store setting at sale time
reseller_commission_amount REAL DEFAULT 0,      -- computed once at checkout, never recalculated
reseller_commission_redeemed INTEGER DEFAULT 0,
reseller_commission_redeemed_at TEXT,
reseller_commission_redeemed_by TEXT            -- user id of the staff member who redeemed it
```

Both additions follow the existing idempotent `ALTER TABLE ... ADD COLUMN`
migration pattern already used in `lib/db/core.ts` (see the
`loyalty_program_enabled`/`tax_number` precedents), plus the corresponding
`CREATE TABLE` DDL in `schema.ts` for fresh installs.

No new columns on `sale_items`: the commission amount is computed once from
the cart at checkout (markup = sum of `(entered_price - product.unit_price) *
quantity` across items) and stored directly on the `sales` row. This avoids
needing a price-snapshot column on `sale_items` and avoids any ambiguity from
the product's price drifting after the sale — the stored
`reseller_commission_amount` is the single source of truth from that point
on.

## Settings

New field in the same settings area as VAT % (`components/settings/store/
regional-settings-card.tsx` or wherever `vat_percentage` is edited) —
"Reseller Commission %", plain percentage input, saved via
`updateStoreProfile`.

## POS checkout flow

1. A "Reseller Sale" toggle in the cart panel (`components/pos/pos-cart.tsx`),
   near the discount UI. Off by default.
2. When on, each cart line's price (`components/pos/pos-cart-item.tsx`)
   becomes an editable input instead of plain text. A new `updateUnitPrice(id,
   newPrice)` action is added to `usePOSCart` (`lib/hooks/use-pos-cart.ts`),
   mirroring `updateQuantity`'s pattern: map over `cart`, replace the item's
   `unit_price`, recompute `subtotal`.
3. Cashier enters the price the reseller quoted their client for each item
   they're marking up (items left alone keep the normal price). The input is
   floored at the item's normal selling price (`min={item.original_unit_price}`,
   plus a clamp in `updateUnitPrice` itself so a pasted/typed value below that
   floor can't get through either) — a reseller sale can only mark price up,
   never down. This also keeps the markup calculation in step 4 always
   non-negative by construction, so the `Math.max(0, ...)` there is a second
   layer of defense, not the only one.
4. At checkout (`use-pos-payment.ts`), if the toggle is on:
   - `markup = cart.reduce((sum, item) => sum + Math.max(0, item.unit_price - item.originalUnitPrice) * item.quantity, 0)`
     — needs the cart item's original (product) price retained alongside the
     overridden one, so `CartItem` gains an `original_unit_price` field set
     once in `addToCart` and never touched by `updateUnitPrice`.
   - `commission_amount = markup * (reseller_commission_percentage / 100)`.
   - These plus `is_reseller_sale: 1` and the % snapshot go into the existing
     `insert("sales", {...})` call.
5. If the toggle is off, none of these fields are written (default `0`/`NULL`
   values from the schema apply) — behaves exactly as today.

## Receipt

No changes. `ReceiptView`/`saleToReceiptTransaction` are untouched — the
sale's `total_amount` already reflects whatever price was actually charged,
so the printed receipt is correct and unremarkable either way.

## Redemption screen

New page, admin/manager-gated the same way Expenses/Reports are
(`isAdmin || canManageStockBatch` in `dashboard-sidebar.tsx`, plus mirrored
entries in the mobile nav and `dashboard-page-routes.ts`).

- A summary card at the top: total unredeemed commission across all sales —
  new query `getPendingResellerCommissionTotal()`
  (`SUM(reseller_commission_amount) WHERE is_reseller_sale = 1 AND
  reseller_commission_redeemed = 0 AND _deleted = 0`, store-scoped like every
  other query in `sales.ts`).
- A lookup field: staff type/scan a transaction number. New query
  `getSaleByTransactionNumber(transactionNumber)` in `lib/db/queries/sales.ts`
  (modeled on `getSaleById`, `WHERE s.transaction_number = ?`).
- If found and it has `is_reseller_sale = 1`:
  - Already redeemed → show when/by whom, no action available.
  - Not yet redeemed → show the sale total, the commission amount, and a
    "Mark as Redeemed" button.
- "Mark as Redeemed" is a mutation wrapped in `transaction()` (mirroring
  `use-process-return-mutation.ts`'s pattern): `update("sales", saleId, {
  reseller_commission_redeemed: 1, reseller_commission_redeemed_at: ...,
  reseller_commission_redeemed_by: currentUserId })`, plus an
  `AUDIT_ACTIONS`-tagged log entry for the paper trail (new action constant,
  e.g. `RESELLER_COMMISSION_REDEEMED`).
- If found but not a reseller sale, or not found at all: clear "not
  applicable" / "no sale found" messaging — no dead ends.

## Testing

- Unit: commission math (markup calculation with mixed marked-up/normal
  items, zero/negative markup guarded to 0 via `Math.max`).
- Unit: `getSaleByTransactionNumber`/`getPendingResellerCommissionTotal`
  against a seeded in-memory DB, same style as existing `__tests__/*.test.ts`
  DB-backed tests (e.g. `loyalty-store-scoping.test.ts`).
- Manual/browser: full checkout with reseller toggle on, verify receipt is
  unremarkable, verify redemption screen finds the sale, verify double-redeem
  is blocked, verify the running total updates.
