# Customers

Route: `app/(dashboard)/customers/page.tsx` → `components/customers/`
(`CustomerManagement`), orchestrated by `lib/hooks/use-customer-management.ts`
(tab/URL sync, search, modal state) and `lib/hooks/use-customer-data.ts`
(fetching, tier derivation, metrics, mutations).

Walked live against the "Pikarestiv Stores 2" store on 2026-09-02 — this
store is the plan's designated real-write sandbox. It currently has one
pre-existing test customer ("SmokeTest Customer", Bronze tier, no balance)
left over from a prior task, and is on the **Pro** subscription tier.

## Tabs

`CustomerTabNav` / `CustomerManagement` render four tabs, synced to the
`?tab=` URL param (`handleTabChange` in `use-customer-management.ts`):
Overview, Directory, Activity, Loyalty Program.

### Overview (`OverviewTab`, `InsightsStrip`)

- **Insights strip**: Total Customers, Loyalty Members (customers with
  `points > 0`), Total Points, Avg Points/Member.
- **Customer Segmentation**: a stacked bar + legend showing what percentage
  of customers fall in each loyalty tier (Bronze/Silver/Gold/Platinum),
  derived from each customer's lifetime spend vs. the tier thresholds.
- **Retention & Engagement**: Retention Rate, Avg Visits/Mo, Average
  Transaction Value — all computed by `getCustomerRetentionMetrics()`
  (`lib/db/queries/customers.ts`) over the last 30 days, netting refunds out
  of revenue.
- **Add Customer** (top-right, page-level) opens `AddCustomerModal`; creating
  from here auto-switches to Directory and selects the new customer
  (`handleAddCustomer`, covered by `e2e/customers.spec.ts`).

### Directory (`DirectoryTab`, virtualized with `useVirtualizer`)

- **Search** — fuzzy match (`genericFuzzySearch`) across name/email/phone.
  Confirmed live: a substring match ("smoke") returns the customer; a
  no-match query ("zzz-no-match") renders "No customers found." rather than
  an empty table.
- **Filter chips**: All / Has debt (`outstanding_balance > 0`) / Loyalty
  members (`points > 0`). Confirmed live: both narrow correctly, and both
  correctly return "No customers found." for a customer with neither debt
  nor points.
- Selecting a row opens `CustomerDetailPanel` (a responsive side panel /
  full-screen sheet on mobile), showing phone, address, DOB, joined date,
  total spent, loyalty points, last visit, and current tier badge.
  - If `outstanding_balance > 0`, an "Outstanding balance" banner appears
    with a **Record Payment** button (opens `RecordPaymentModal`,
    pre-filled with the full balance). There is no way to reach Record
    Payment when the balance is 0 — it's only ever exposed once a customer
    actually owes money, which is correct (confirmed by reading
    `customer-detail-panel.tsx`; not independently exercisable live since
    the one seeded customer has no balance and this store's product catalog
    is currently fully out of stock from prior tasks' smoke testing, so a
    fresh credit sale couldn't be rung up through POS to generate one).
  - **Edit Profile** opens `EditCustomerModal` (name/email/phone/address/DOB
    only — no way to edit outstanding balance or loyalty points directly).
  - **View History** switches to the Activity tab, pre-filtered to that
    customer (`handleViewHistory` → `activityFilterCustomer`).

### Activity (`ActivityTab`, virtualized on desktop)

- Search by customer or transaction ID; a date-range picker.
- Defaults to a rolling 30-day window ("Showing last 30 days...") unless a
  customer filter, a search term, or an explicit date range is active, in
  which case it loads full history instead of silently truncating it.
- A customer filter (arrived via "View History") renders as a removable
  chip ("Showing history for X" with an ✕); confirmed live that clearing it
  removes the scoping.
- Each row: transaction number, customer, amount, points earned, date, and
  the item names on that sale (truncated with "+N more").

### Loyalty Program (`LoyaltyTab`, `LoyaltySettingsDialog`)

Schema-backed (`loyalty_tiers`, `loyalty_redemption_options`,
`loyalty_transactions` tables in `lib/db/schema.ts`) and **is** UI-visible —
confirmed live on this Pro-tier store.

- **Loyalty Tiers Configuration**: a card per tier (Bronze/Silver/Gold/
  Platinum by default) showing min. spend, points multiplier, and benefits
  list. `getLoyaltyTiers()` falls back to a hardcoded 4-tier default
  (`buildFallbackTiers` in `use-customer-management.ts`) if the store has no
  rows yet, so this section is never empty.
- **Points Redemption Options**: cards for each active reward (e.g. "₦500
  Discount" for 500 points, "Free Delivery" for 200 points). Like tiers, this
  section now has a client-side fallback — `buildFallbackRedemptionOptions()`
  (`use-customer-management.ts`), mirroring `buildFallbackTiers()`'s
  mechanism and `DEFAULT_REDEMPTION_OPTIONS`'s actual seed content — so a
  brand-new store previews the same rewards it'll get once
  `ensureLoyaltyDefaultsSeeded()` actually runs (still only triggered by
  opening **Edit Settings**, see below), instead of "No redemption options
  configured yet." Any real, active redemption-option row always takes
  precedence over the fallback the moment one exists. See
  `docs/features/_findings-log.md` entry #19 (Bug D).
- **Edit Settings** (visible only when `canManageStockBatch`, i.e. owner/
  manager roles) opens `LoyaltySettingsDialog`, with two sections:
  - **Tiers**: add/edit/delete tiers (name, min spend, points multiplier,
    color, benefits). Deleting a tier warns that customers in it "fall back
    to the next matching tier."
  - **Redemption Options**: add/edit/delete rewards (label, points cost,
    icon, optional monetary discount value). Inactive options show an
    "inactive" badge here but are hidden entirely from the main tab's public
    list (`redemptionOptions.filter(o => o.is_active)`).
  - **Program Status**: a top, clearly-separated "Enable Loyalty Program"
    switch, backed by `stores.loyalty_program_enabled` (DEFAULT `1`/ON).
    Turning it off pauses the whole program — POS checkout stops earning
    points and the Redeem Reward control disappears — without touching any
    tier/reward configuration below it. The same switch (same field, same
    `updateStoreProfile()` mutation) also appears in Settings → Business
    Info, next to "Enable Online Store."

**Correction (this task):** an earlier finding in this file (and in
`docs/features/_known-bugs.md` #2) claimed no screen in the app lets a
customer redeem earned points, including POS. That was wrong — it only
checked the Customers module. **POS checkout is where redemption actually
happens**: the cart's Redeem Reward control (`POSRedeemReward`, see
`docs/features/pos.md`'s Cart section) lets the cashier spend a customer's
points against an active redemption option as a line discount, and predates
this whole smoke-test session (commit `2f1abfd7`). Directory, the customer
detail panel, and this tab's own screens genuinely have no redeem action —
that part of the original finding was correct — but the wider "no consuming
UI anywhere in the app" claim was not.

**Loyalty transactions** (the `loyalty_transactions` table, i.e. a ledger of
points earned/redeemed) still has no dedicated UI surface in this module —
points are shown only as a running balance (`customer.loyalty_points`) on
the detail panel and Directory table, not as a per-event history. That part
of the original observation stands; only the "no redemption anywhere"
framing was corrected.

## Customer payments (`customer_payments` table)

`recordCustomerPayment()` (`lib/db/queries/customers.ts`) is the single
source of truth for logging a debt payment, used by both the Record Payment
button on a customer (Directory) and on a specific sale's transaction
details page. For each call it:

1. Inserts a `customer_payments` row (amount, method, notes, timestamp).
2. Re-reads the customer's current `outstanding_balance` from the DB (does
   not trust caller-held state, since it's called from more than one page)
   and updates it to `max(0, currentBalance - amount)`.
3. Applies the payment **FIFO** across the customer's `pending`/`partial`
   sales (`applyCreditPaymentFIFO`), oldest first by `created_at`: each
   sale's `amount_paid` is bumped and its `payment_status` flips to
   `completed` once fully covered, otherwise stays `partial`.

Per this task's brief, this was checked for the same class of edge-case bug
found elsewhere in this codebase (a `quantity > 0`-filtered batch loop
duplicated across POS checkout and online-order fulfillment): **no bug
found**. Overpayment (paying more than the outstanding balance, or more than
the sum of pending sales) is handled correctly — the balance clamps to 0
rather than going negative, and the FIFO loop stops allocating once
`remaining <= 0` rather than over-crediting a sale past its own total. See
"Coverage gap closed" below for the test that verifies this.

The `RecordPaymentModal` UI additionally caps the amount input at
`customer.outstanding_balance` via the input's `max` attribute (native HTML5
constraint validation blocks submission above it), so overpayment via this
modal specifically shouldn't happen in practice — the server-side clamp in
`recordCustomerPayment` is a correct defense-in-depth for the other entry
point (the sale-detail page's payment button) regardless.

## Coverage gap closed

```bash
$ grep -rln "loyalty\|customer_payment" __tests__/ e2e/
__tests__/loyalty-calculator.test.ts
__tests__/loyalty-store-scoping.test.ts
__tests__/iif-parser.test.ts
```

Loyalty had two existing test files (points-multiplier math, and store
scoping of tiers/redemption options). **`customer_payments` / the payment
recording flow had zero coverage anywhere** — no unit test, no e2e test —
despite being money-accumulation logic touching three tables. Added
`__tests__/customer-payments.test.ts` (4 tests, against a real
`sql.js`-backed schema, same pattern as `customers-total-spent.test.ts` and
`loyalty-store-scoping.test.ts`): partial payment deducts correctly, an
overpayment clamps the balance to 0 instead of going negative, FIFO
allocation across two pending sales, and FIFO not over-allocating when the
payment exceeds the total owed across all pending sales. All 4 pass against
the existing (correct) implementation.

## Bug found and fixed: Loyalty Program tab was never gated by plan tier

`lib/hooks/use-feature-gate.ts` defines
`canUseLoyaltyProgram: getFeature('loyalty_program', 'loyalty_program', isPro || isEnterprise)`
— intended to restrict the Loyalty Program module to Pro/Enterprise stores,
the same way `canUsePrescriptions`/`canUseProcurement`/`canUseExpenses`/
`canUseAuditMode` restrict their modules via `LockedModuleOverlay`. But
`canUseLoyaltyProgram` was **never referenced anywhere else in the
codebase** (confirmed via `grep -rn "canUseLoyaltyProgram"`) — the Loyalty
Program tab in `CustomerManagement` rendered unconditionally for every plan
tier, including Free/Starter, with no lock overlay and no upgrade prompt.
Full tier/redemption CRUD (`LoyaltySettingsDialog`) was reachable by any
owner/manager on any plan.

**Fix**: extended `LockedModuleOverlay`'s `featureKey` union with
`"loyalty_program"` (mapped to `!canUseLoyaltyProgram`), and wrapped the
Loyalty Program `TabsContent` in `customer-management.tsx` with it, matching
the existing pattern used for Prescriptions/Procurement/Expenses:

```tsx
<TabsContent value="loyalty" className="relative flex-1 min-h-0 mt-0 border-none p-0">
  <LockedModuleOverlay featureName="Loyalty Program" featureKey="loyalty_program" />
  <LoyaltyTab tiers={loyaltyTiers} currencyCode={storeProfile?.currency} />
</TabsContent>
```

**Verification**: `npx tsc --noEmit -p .` is clean and the full `vitest run`
suite (340 tests) still passes. Live-verified on this task's test store
(Pikarestiv Stores 2, Pro tier): the Loyalty Program tab still renders fully
unlocked after the fix — no regression for tiers that should have access.
A live "before" repro on a Free/Starter tier would have required changing
this store's subscription tier via Settings → Billing; that was intentionally
not done, since changing billing/plan settings on a shared test store falls
outside a routine code-verification step. The bug is confirmed instead by
direct code inspection: `canUseLoyaltyProgram` had zero call sites before
this fix, identical in kind to the already-established pattern (compare
`canUsePrescriptions` etc., which are each read by exactly one
`LockedModuleOverlay` call) that every other gated module relies on to
actually enforce its lock.
