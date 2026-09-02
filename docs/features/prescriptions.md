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
finding). Given this store is being smoke-tested by multiple tasks
concurrently and other unrelated concurrent writes to the same shared batch
were visible in the Activity Log during this walkthrough (a "Manual UI Test
Product XYZ2" +20 adjustment, other products' sales), this reads as
cross-task interference on shared store state rather than a defect in the
dispense/stock-deduction code path itself — the code-level chain
(`recordSaleItemStock` → activity log → 142) was independently verified
correct. Flagged here rather than fixed, since reproducing it in isolation
(a fresh, uncontended batch) did not show the discrepancy.

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
