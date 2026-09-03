# Prescriptions

Route: `app/(dashboard)/prescriptions/page.tsx` → `components/prescriptions/`
(`PrescriptionManagement`), orchestrated by
`lib/hooks/use-prescription-management.ts` (queue/detail/dispense wiring) and
`components/prescriptions/new-prescription/use-new-prescription.ts` (the
create/edit form). Wrapped in a `LockedModuleOverlay` at the page level.

Walked live against the "Pikarestiv Stores 2" store on 2026-09-02, including
a real prescription creation and a real dispense-through-POS checkout — this
store is the plan's designated real-write sandbox.

## Module gate

`app/(dashboard)/prescriptions/page.tsx` renders `PrescriptionManagement`
underneath a `LockedModuleOverlay` (`components/dashboard/locked-module-
overlay.tsx`) with `featureKey="prescriptions"`. The overlay reads
`canUsePrescriptions` from `lib/hooks/use-feature-gate.ts`:

```ts
canUsePrescriptions: storeProfile?.store_type === 'pharmacy'
  ? getFeature('prescriptions', 'prescriptions', true)
  : false,
```

Two independent conditions must both hold:

1. **`store_type === 'pharmacy'`** — set on Settings → Business Info →
   "Business Vertical" (`Pharmacy` / `Grocery` / `Supermarket` / `General`).
   This check is unconditional: even an Enterprise-tier store on the
   "General" vertical is locked out, regardless of the plan's feature flags.
2. **The `prescriptions` feature flag** for the store's subscription tier
   (`subscriptionPlans.tiers[tier].features.prescriptions`), defaulting to
   `true` for every tier if the flag is unset.

**Confirmed live:** Pikarestiv Stores 2 started on the "General" vertical (on
a Pro trial), which locked the module with "This feature is available on the
Starter plan and above" — a slightly misleading message, since the real
blocker for a General-vertical store is the vertical, not the plan tier;
switching tiers alone would not unlock it. Switching Business Vertical to
"Pharmacy" (Settings → Business Info) immediately unlocked the module with no
reload needed. Both `Overview` (Business Vertical selector) and `Billing`
(the "Prescriptions, Procurement & Expenses" bullet on the Starter card) hint
at this feature, but neither surfaces the vertical requirement explicitly.

## Prescription queue (`PrescriptionManagement` / `PrescriptionList`)

- **Status filter chips**: All / Needs verification / Refills due / Ready for
  pickup / History (`PrescriptionStatusFilter`).
- **Search bar** — filters by patient name or medication; falls back to fuzzy
  matching (`isFuzzyFallback`) when no exact substring match is found.
- **List rows** show patient name, medication summary, and a priority badge.
  Selecting a row opens `PrescriptionDetailPanel` (a responsive side panel /
  full-screen sheet on mobile).
- **Create Prescription** button opens a full-screen overlay
  (`NewPrescription`) driven by the `?action=add` (or `?edit_rx=<id>` for
  editing) URL param.

## Create/Edit Prescription form (`NewPrescription` / `use-new-prescription.ts`)

Required fields: **Patient Name**, **Phone Number**, **Doctor Name**,
**License Number**, and at least one medication. Age, Priority (Normal by
default), and Insurance are optional.

Per medication (Add Medication panel): **Product Name** (combobox sourced
from `getAvailableStockBatches()` — i.e. only products with a stock batch
`quantity > 0` are selectable), **Strength** (a second combobox populated
from that same product's distinct non-empty `strength` values), **Quantity**,
**Dosage** (free text, required), Unit Cost (optional — defaults to the
product's catalog selling price), Refills Authorized, Refill Interval (Days,
defaults to 30), and Instructions.

**Confirmed live:** created a prescription for "Smoke Test Patient" /
Dr. Smoke Tester (MD-99999), medication TRAMADOL 100MG × 5 ("Take 1 tablet
twice daily"), no refills. Saved successfully and appeared in the queue with
status **Needs verification**.

**No real customer link.** Despite "Patient Name"/"Phone Number" looking like
customer fields, the form only writes free-text `patient_name`/`patient_phone`
columns onto the `prescriptions` row — there is no combobox or lookup against
the actual `customers` table, and no `customer_id` foreign key. A prescription
for a patient who is already a saved customer creates no relationship between
the two records; the plan's Step 1 instruction to "link it to a customer" is
not achievable in the current UI. Worth a follow-up if two-way
prescription↔customer history is a desired feature.

**Strength selector can go unusable per-product without blocking the form.**
`PrescriptionMedications`' strength dropdown is populated from
`availableProducts.filter(m => m.name === productName).map(m => m.strength)`
— i.e. sourced from `products.strength`. For TRAMADOL 100MG (and apparently
other products in this store's imported catalog), `products.strength` is
blank, so once that product is chosen the Strength dropdown renders with zero
options and cannot be interacted with, despite being marked required (`*`).
This did **not** block adding the medication in practice: `newMedication`'s
`strength` state defaults to `""` and is never touched, and the product
lookup (`m.name === productName && m.strength === newMedication.strength`)
still matches because the underlying batch's `strength` is also `""`. Net
effect: a cosmetically-required field that silently no-ops for any product
with a blank `strength` column. Logged as a UX/data-quality finding, not
fixed — the underlying data-quality issue (blank `strength` on imported
products) is out of this task's scope, and the matching logic already
degrades safely.

## Detail panel & status flow (`PrescriptionDetailPanel`)

Status progression exposed via one contextual action button, driven by
`updatePrescriptionStatus` (`lib/db/queries/prescriptions.ts`):

`Needs verification` → **Process** → `In progress` → **Mark Ready** →
`Ready for pickup` → **Dispense** → (hands off to POS; see below).

**Confirmed live:** stepped a real prescription through Process → Mark Ready
→ Dispense.

- **Edit** — routes to the same New Prescription overlay pre-filled via
  `?action=add&edit_rx=<id>`.
- **Dispense / Dispense Refill** — routes to `/pos?dispense_rx=<id>` (refill
  adds `&refill=1`). Does **not** deduct stock or complete the sale itself;
  it only marks the hand-off. See "Dispense → stock deduction" below.
- **Process Return** — looks up the prescription's linked sale
  (`getSaleForPrescription`) and routes to `/pos?tab=history&return_sale=<id>`
  so the real Return flow (which reverses stock/payment) handles it, rather
  than the prescription independently relabeling its own status.

## Dispense → stock deduction (the Step 1 focus check)

Dispensing a prescription does **not** have its own stock-deduction logic.
`handleDispense` (`lib/hooks/use-prescription-management.ts`) simply
navigates to `/pos?dispense_rx=<id>`. On the POS page,
`lib/hooks/use-pos-prescription.ts` (`usePOSPrescription`) watches for that
query param and, once the cart is empty and products are loaded, fetches the
prescription's items (`getPrescriptionItems`) and matches each one to a POS
product by `name` + `strength`, loading matched items into the cart and
locking it to the prescription (`Cart locked to this prescription`).

Checkout then proceeds through the **normal POS payment path**
(`lib/hooks/use-pos-payment.ts`), which:

1. Calls the shared `recordSaleItemStock()` (`lib/db/queries/inventory.ts`)
   for every cart line — the exact same function POS walk-in sales use — to
   deduct stock (FEFO batch picking, with the zero-batch/partial-shortfall
   fallbacks already fixed in this same function during the POS and
   online-order smoke-test tasks).
2. On success, if `dispensedRxId` is set: calls
   `dispensePrescriptionRefill(dispensedRxId)` for a refill dispense, or
   `updatePrescriptionStatus(dispensedRxId, "completed")` for a first-time
   dispense.

**Finding: prescription dispensing does *not* have a third independent
reimplementation of the stock-deduction logic.** Unlike POS checkout
(originally its own copy) and online-order fulfillment (originally its own
copy) — both independently found to have the same zero-batch/partial-
shortfall gaps in earlier tasks and since fixed by routing through
`recordSaleItemStock()` — prescription dispensing was already built by
routing entirely through the POS payment path, so it inherits
`recordSaleItemStock()`'s fix automatically with zero prescription-specific
code to fix. **No fix needed here.**

**Confirmed live end-to-end:** dispensed the "Smoke Test Patient" TRAMADOL
100MG × 5 prescription — Ready for pickup → Dispense → POS cart auto-loaded
and locked → Cash checkout for ₦1,500 → sale completed. The Activity Log
confirmed the expected chain of writes for a prescription-linked sale
(`Created a sale` → `Created a sale item` → `Updated a stock batch` →
`Created a sale item batch` → `Created a stock movement` →
`Updated a prescription`), and the "Updated a stock batch" entry recorded the
correct post-sale quantity (147 → 142 for a batch that started at 147).

**Caveat on Inventory's displayed stock for this same batch:** immediately
after the above, the Inventory > Catalog list and the product's Batches tab
showed TRAMADOL 100MG at **-5 units** instead of 142, even after a full page
reload. The Activity Log entry for the same `stock_batches` record
unambiguously recorded the write as "Quantity: 142", and Stock Movements
lists only the one `-5` sale movement for this product with no earlier
movement explaining how it reached 147 in the first place (consistent with
that starting quantity being seeded directly by a bulk import, bypassing the
movements ledger, as documented in `docs/features/inventory.md`'s import
finding).

A follow-up pass (fix round 1, see the task report) re-examined this and
**retracted the original "cross-task interference" explanation** — the
smoke-test harness that ran this task executes exactly one implementer at a
time, so no second task's process could have been concurrently writing to
this store; that mechanism does not exist and should never have been cited.
What the follow-up actually checked and ruled out instead:

- **Not a rendering bug.** `product-batch-history.tsx` and
  `use-product-details.tsx` (`client/components/products/product-details/`)
  render `batch.quantity` straight from `getStockBatchesForProductDetails()`
  (`SELECT * FROM stock_batches WHERE product_id = ? AND _deleted = 0`,
  `client/lib/db/queries/inventory.ts`) — there is no code path that
  substitutes a stock movement's signed delta (e.g. the `-5` sale movement)
  for the batch's own stored `quantity` column.
- **Not a double-deduction.** `recordSaleItemStock()` writes an absolute
  `quantity: batch.quantity - deduction` via the shared `update()` helper
  (`client/lib/db/base-helpers.ts`), which issues a plain `SET quantity = ?`
  (not an increment/delta). The only delta-based writer,
  `updateStockBatchQuantity()`, is used solely by procurement/cycle-count
  adjustment code — never reached from POS or prescription checkout — so it
  cannot be the second write.
- **Not a cache-invalidation gap.** `queryKeys.products.batches` is tagged
  `meta.tables: ["stock_batches"]`, and every `update("stock_batches", ...)`
  call synchronously invalidates any query carrying that tag, so a stale
  cached pre-sale read is not the explanation either.
- **Not the sync engine.** `pushChanges()` never writes sale/stock data back
  into local SQLite (it only marks queue items synced or records failures),
  and `pullChanges()` explicitly skips overwriting a record that still has a
  pending entry in `_sync_queue` — which the just-made dispense update is,
  until it's pushed — so a pull reverting the fresh 142 is also ruled out.

**Second investigation round — resolved with batch-id-level evidence.** A
follow-up pass re-opened this with direct access to the live sql.js database
(via the dev-only `window.getDatabaseBinary()` hook in `client/lib/db/core.ts`,
loaded into a fresh in-page `sql.js` instance so the binary could be queried
directly — see `docs/features/_findings-log.md`'s entry for the exact
technique). This gives batch-id, product-id, and store-id ground truth the
original observation never captured.

- **The leading hypothesis (multiple `stock_batches` rows on one product,
  one stale/negative masking the correctly-dispensed one) is ruled out.**
  Direct SQL against the live store confirmed that, at the time of this
  round, *every* product in the account — including both products named
  "TRAMADOL 100MG" (see below) — has exactly one non-deleted `stock_batches`
  row. There is no case of one product with a correct batch and a second,
  stale, negative batch both rendering as cards. `getStockBatchesForProductDetails`,
  `product-batch-history.tsx`, and `use-product-details.tsx` were re-confirmed
  to do exactly what the first round found (one card per row, `batch.quantity`
  rendered verbatim, no aggregation) — that code was never the problem.
- **The actual mechanism: two different products, in two different stores,
  share the exact same name "TRAMADOL 100MG".** This account's Pika Restiv
  user has two stores — "Pikarestiv Stores" and "Pikarestiv Stores 2" — and
  each has its own, completely independent product also named
  "TRAMADOL 100MG":
  - `products.id = baa87d56-5c5f-4e8e-8971-6fef38360f1c` (store
    "Pikarestiv Stores") owns `stock_batches.id = 86c3da7b-2108-4721-b497-4320a35ed728`,
    quantity **147**, with **zero** `stock_movements` rows ever recorded
    against it (consistent with the earlier note that it was seeded directly
    by bulk import, bypassing the movements ledger). This is the batch
    referenced by the original "147 → 142" Activity Log claim.
  - `products.id = 6992c53b-c17b-4870-b2f1-628f995fdc7e` (store
    "Pikarestiv Stores 2") owns `stock_batches.id = 73a4ded2-7776-4225-b5c6-04e98dc6a9d3`
    ("Opening Stock"), quantity **-5**, with exactly **one**
    `stock_movements` row: a `sale` of `-5` at `2026-09-02T19:47:15Z`, tied
    to a completed prescription ("Smoke Test Patient," `prescriptions.id =
    451d3866-83e2-4a66-84f5-fdcca6136358`, `store_id` = Pikarestiv Stores 2).
    Because this movement is the *only* one this batch ever had, and the
    write is absolute (not delta), the batch's quantity immediately before
    the sale was **0**, not 147 — this dispense oversold a batch that had no
    stock, and (before bug #4's fix landed — see below) nothing floored the
    result, so it was correctly written and correctly displayed as `-5`.

  These are two unrelated products in two unrelated stores that merely
  happen to share a display name. The "147 → 142" Activity Log entry and the
  "-5" Inventory display documented in the first round were **never the same
  batch, product, or store** — there is no batch that was simultaneously 142
  and -5. The most likely explanation for how the original round conflated
  them: this is a shared, cumulative-history test account with a store
  switcher defaulting to whichever store was last active, and PIN-based login
  in this second round itself landed on "Pikarestiv Stores" (no "2") by
  default rather than "Pikarestiv Stores 2" — it is easy to compare an
  Activity Log entry captured in one store's context against an Inventory
  view captured in the other's without noticing the store had changed,
  producing an apples-to-oranges "same product name, different numbers"
  illusion. This is a documentation/process pitfall of testing on a shared
  multi-store account with duplicate product names, not a code defect in any
  read, write, cache, or sync path.
- **The "-5" itself is real, and is now explained by (and was already
  tracked as) bug #4** (`recordSaleItemStock`'s fallback batch had no floor
  on oversell, `docs/features/_known-bugs.md`). The sale that produced it
  (`2026-09-02T19:47:15Z`) predates the commit that fixed bug #4
  (`2ed46c9e`, landed `2026-09-03T13:29`), so this negative batch is a
  pre-fix artifact still sitting in the local database — new oversells after
  that fix floor at 0 instead. This -5 row was not re-verified against the
  post-fix code path, since it was written before the fix existed.
- **Clean reproduction confirms the display/write path is correct under
  normal conditions.** A fresh, single-store, single-batch product ("ZZ BUG3
  TEST DRUG") was created, stocked to 20 units via Cycle Count (batch id
  `7f98464f-9adf-4dee-849b-2e275feaa061`), then dispensed against via a real
  prescription (5 units). Direct SQL confirmed one continuous batch id
  throughout: `0 →(cycle-count adjustment, movement `dc02d09c`)→ 20
  →(prescription sale, movement `037740c1`)→ 15`. The Catalog list, the
  product's Batches tab card, and the raw `stock_batches.quantity` all
  agreed on **15** with no negative figure, no phantom card, and no
  cross-batch confusion anywhere.

**Conclusion:** the original "-5/142" observation is fully explained and the
leading hypothesis from round one is ruled out. There is no display bug to
fix in the batch-details read path. The negative number itself is a known,
already-fixed issue (bug #4) whose fix simply hadn't been applied yet to
that particular pre-existing row when the first round observed it.

## Test coverage

- **Unit**: `client/__tests__/prescription-calculations.test.ts` covers
  `calculatePrescriptionItemCost` only.
- **E2E**: none existed before this task. Added
  `client/e2e/prescriptions.spec.ts` (login → switch Business Vertical to
  Pharmacy → create a product and stock it via a Cycle Count → navigate to
  Prescriptions → create a prescription → confirm it appears in the queue as
  "Needs verification"), modeled on `e2e/customers.spec.ts`. The seeded
  Playwright fixture store defaults to the "General" vertical with zero
  products, so the spec has to do both of this doc's real setup steps itself
  (switch vertical to unlock the module gate; grant a product real stock via
  Cycle Count, the only stock-granting path a fresh free-tier store can reach
  — Procurement is gated behind a paid tier) before it can exercise
  Prescriptions at all. This is baseline flow coverage only; follow-up
  candidates include the Process → Mark Ready → Dispense → POS handoff chain
  and the refill/return flows.
