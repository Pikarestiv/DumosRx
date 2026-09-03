# Known Bugs

Tracker for real, open issues found during the smoke-test effort (see
`_findings-log.md` for the full narrative) plus anything found since. As
each is fixed, this file is updated with a link to the fix commit, and the
relevant `docs/features/<section>.md` + `_findings-log.md` get updated too.

Status values: **Open** (not started) → **In Progress** → **Fixed**.

---

## 1. Multi-tenancy leak in `getCategoryList()`

- **Status:** Fixed (`be38864e`)
- **Found:** Task 2 (Inventory)
- **Where:** category-list query has no `store_id` filter. Used by the
  Manage Categories dialog and `components/settings/store/categories-card.tsx`.
- **Risk:** a store could see (or collide with) another store's categories.
- **Fix:** `getCategoryList()` now filters on `store_id` (NULL rows from
  before the fix stay visible everywhere, so no existing data disappears);
  `createCategory()` now explicitly sets `store_id`. See `### 12.` in
  `_findings-log.md` for full detail, including a flagged-but-not-fixed
  follow-up: `update()`/`softDelete()` in `base-helpers.ts` do no `store_id`
  check at all, a latent cross-tenant risk across every domain table.

## 2. Loyalty Program redemption: corrected record, plus two real gaps found and fixed

- **Status:** Fixed (`5f6d794c`)
- **Found:** Task 5 (Customers); corrected and fixed in the loyalty-toggle task.
- **The original entry here was wrong.** It claimed "no screen (Directory,
  customer detail, POS checkout) lets a customer actually redeem earned
  points" and that redemption was "not wired up anywhere in the app." That
  is false: **POS checkout has a fully working redemption UI**
  (`POSRedeemReward`, wired into `pos-cart.tsx`) that predates this whole
  smoke-test session (commit `2f1abfd7`) — it lets a cashier spend a
  customer's points against an active redemption option as a line discount
  at checkout. The Task 5 finding that produced this entry only checked the
  Customers module (Directory, customer detail, the Loyalty tab's own
  screens — which genuinely have no redeem action, that part was correct)
  and never checked POS. See `docs/features/customers.md`'s Loyalty Program
  section and `docs/features/pos.md`'s Cart section for the corrected
  record.
- **Two real gaps *were* found in the existing redemption feature**, and are
  fixed by this entry's commit:
  1. **POS redemption bypassed the plan-tier gate.**
     `useFeatureGate().canUseLoyaltyProgram` was wired into the Loyalty tab
     (see the fix history above this entry) but `pos-redeem-reward.tsx`
     never checked it at all — a Free-tier store could redeem points at
     checkout. Fixed: `POSRedeemReward` now hides its entire UI (trigger and
     the "Redeeming: X" display) when the gate is closed, `usePOSCart`
     clears any already-staged redemption if the gate flips off mid-session
     (plan downgrade, or the toggle below being flipped in another tab),
     and `usePOSPayment` refuses to write earned/redeemed
     `loyalty_transactions` rows (or `sales.points_earned`/
     `points_redeemed`) when the gate is closed, as defense-in-depth against
     a stale UI state.
  2. **No independent on/off switch.** The only gate was plan tier — an
     entitled Pro/Enterprise store had no way to pause the program if it
     didn't want it running. Fixed: new `stores.loyalty_program_enabled`
     column (DEFAULT `1`/ON, so no existing Pro/Enterprise store's behavior
     changed), ANDed into `canUseLoyaltyProgram`, with an "Enable Loyalty
     Program" switch in both Settings → Business Info and the Loyalty
     Settings dialog's new Program Status section (same field, same
     `updateStoreProfile()` mutation).
- **Risk:** POS gating leak was real revenue/entitlement risk (a Free-tier
  store getting a paid feature for free); the missing toggle was a product
  gap, not a security issue. Both closed by this fix.

## 3. Prescriptions: "-5/142" stock-batch display anomaly (investigated — not a bug, two unrelated products share a name)

- **Status:** Investigated — closed, no fix needed. See
  `docs/features/prescriptions.md`'s "Caveat on Inventory's displayed stock"
  section for full detail and evidence.
- **Found:** Task 4 (Prescriptions)
- **Original report:** dispensing a prescription against a stock batch
  showed a batch's remaining quantity as "-5" in one place while "the same
  batch" showed "142" (the correct post-dispense count) elsewhere.
- **Round 1 (inconclusive):** confirmed the write path itself was correct
  (`recordSaleItemStock` → Activity Log → 142 is right) but could not
  determine why Inventory showed -5, since neither batch's `id` was
  recorded at the time.
- **Round 2 (resolved, with batch-id-level evidence via direct sql.js
  queries against the live database):** the leading hypothesis — one
  product with two `stock_batches` rows, a stale negative one masking the
  correct one — is ruled out; every product, including both involved here,
  had exactly one non-deleted batch row. The actual mechanism: **two
  different products, in two different stores on this shared test account,
  are both literally named "TRAMADOL 100MG"** — `baa87d56-...` in store
  "Pikarestiv Stores" (batch `86c3da7b-...`, quantity 147, never touched by
  any `stock_movements` row — a bulk-import artifact) and `6992c53b-...` in
  store "Pikarestiv Stores 2" (batch `73a4ded2-...`, quantity -5, with
  exactly one `stock_movements` row: a real prescription sale that oversold
  a batch which had 0 stock). These were never the same batch, product, or
  store — the "147 → 142" and "-5" figures being compared in round 1 came
  from two unrelated products that merely share a display name, almost
  certainly cross-referenced across two different active-store contexts
  without that being noticed. No read, write, cache, or sync-path code was
  at fault.
- **The "-5" itself is real and is bug #4** (below): the sale that produced
  it (`2026-09-02T19:47:15Z`) predates bug #4's fix (`2ed46c9e`,
  `2026-09-03T13:29`), so it's a pre-fix artifact still sitting in the local
  database from before floor-at-0 landed.
- **Confirmed clean via fresh reproduction:** a new single-store,
  single-batch product, stocked and dispensed against, showed one
  continuous batch id from creation through dispense with no anomaly at any
  point (Catalog, Batches tab, and raw `stock_batches.quantity` all agreed).

## 4. `recordSaleItemStock`'s fallback batch has no floor

- **Status:** Fixed (`2ed46c9e`) — this was a user-directed product
  decision, not just a bug squash: asked how an oversell should be
  handled, the user chose **"floor + alert"** — let the sale complete
  (don't block checkout over a stale on-screen stock count), but never
  let the batch's stored `stock_batches.quantity` go below zero, and
  surface it for staff to reconcile. `deductFromBatch` now writes
  `Math.max(0, batch.quantity - deduction)` to `stock_batches`, while
  `sale_item_batches`/`stock_movements` still record the true, unfloored
  deduction amount (accurate sales/audit-trail accounting is preserved
  even when the batch's own running balance gets floored). A deduction
  that exceeded the batch's available quantity at the time (the only way
  that can happen given the existing branching) gets its
  `stock_movements.reason` tagged `"Customer sale (oversold — insufficient
  batch stock)"` instead of the plain `"Customer sale"`. A new
  `getOversoldAlerts()` query (modeled on `getLowStockAlerts()`/
  `getExpiryAlerts()`, 30-day recency window) feeds a new "Oversold" /
  `critical` category into `useStockBatchAlerts()`, alongside the existing
  Low Stock and Expiring Soon categories — no UI component changes needed,
  since both consumers (`business-intelligence-dashboard.tsx` via
  `use-bi-data.ts`, rendered by `stock-batch-insights-tab.tsx`) already
  render whatever `useStockBatchAlerts()` returns generically. No schema
  migration was needed: `stock_movements.reason` is already a plain `TEXT`
  column. See `### 16.` in `_findings-log.md` for full detail.
- **Found:** Task 3 (POS)
- **Where:** `client/lib/db/queries/inventory.ts` — when a sale's quantity
  exceeds all available batch stock, the fallback batch absorbs the
  shortfall and can go arbitrarily negative.
- **Risk:** silently wrong (very negative) stock numbers with no alert to
  surface it, though it's a deliberate improvement over the old
  silently-vanishing behavior.
- **Why not fixed yet:** accepted as "better than the old bug" at the time;
  a proper fix needs either a floor + alert, or a UX decision on what
  should happen when a sale legitimately oversells (block it? warn first?).

## 5. `logRequestedProduct()`'s substring-based dedupe can misfire

- **Status:** Fixed (`58205f26`) — replaced `String.includes()` on the whole
  accumulated string with a split-on-separator, case-insensitive exact
  match per segment, for both customer names and notes.
- **Found:** final whole-branch review (post Task 11)
- **Where:** `client/lib/db/requested-products-queries.ts` — de-dupes
  incoming product requests by `String.includes()` on the customer-name /
  note fields, so e.g. a customer named "Ann" can get silently
  merged/attributed into an existing "Joanna" request.
- **Risk:** low blast radius (only affects the POS empty-state "customer
  wants this" wishlist log), but a real correctness bug.

## 6. `recordSaleItemStock`'s partial-shortfall fallback can double-write a row

- **Status:** Fixed (`53b4d5c5`) — `sale_item_batches` and
  `stock_movements` inserts are now deferred until every batch touched by
  the call (across both the main FEFO loop and the partial-shortfall
  fallback loop) is known, keyed and summed by batch id, so each unique
  batch gets exactly one row of each with the correctly summed quantity.
  The per-touch `stock_batches` `update()` (and its `updated_at` bump)
  still happens immediately and unchanged, so FEFO ordering and the
  fallback's batch-selection behavior are unaffected. See `### 15.` in
  `_findings-log.md` for full detail.
- **Found:** final whole-branch review (post Task 11)
- **Where:** `client/lib/db/queries/inventory.ts:~212-218` — the
  fallback-batch lookup (`getAnyActiveBatchForProduct()`, ordered by
  `updated_at DESC`) can return the same batch the main loop just partially
  deducted, producing a second `sale_item_batches` row and a second
  `stock_movements` row for one `(sale_item, batch)` pair.
- **Risk:** the arithmetic still sums correctly (not a data-loss bug), but
  any consumer assuming one row per batch per sale item will double-count.

## 7. Account/store-switch shows a stale dashboard for ~1 second (investigated — could not reproduce; reads as expected React Query behavior)

- **Status:** Open — investigated live (Task: Authentication), not
  reproduced as an observable defect; see `docs/features/auth.md`'s "Item
  #7 investigation" section for full detail and evidence.
- **Reported:** "a small lag when one switches account or something where
  for a second or so, after switching, the old account's dashboard is shown"
- **Candidate mechanism (confirmed real by reading the code, but not
  observed live):** `client/lib/context/store-context.tsx`'s
  `switchStore()` calls `queryClient.cancelQueries()` then
  `queryClient.invalidateQueries()` (broad, deliberately not table-filtered).
  `invalidateQueries()` marks queries stale and triggers a background
  refetch, but by default still renders the previous (stale) cached data
  until the refetch resolves — which would produce exactly the symptom
  described, as expected React Query stale-while-revalidate behavior rather
  than a bug in the switch logic itself.
- **What was tested live:** the store switcher (`switchStore()`'s exact
  code path) was exercised 6 times alternating between two real stores on
  the account, using rapid back-to-back screenshots with no manual delay;
  a second, structurally different switching mechanism (multi-staff-PIN
  "Switch Account," which goes through `login()`'s `queryClient.clear()`
  instead) was also exercised. In every trial, the very first screenshot
  taken immediately after the switch already showed the fully correct new
  data — no stale old-store/old-user frame was ever caught, and no console
  errors appeared during any switch.
- **Conclusion:** could not reproduce the reported flash. The
  `invalidateQueries()` stale-render window is real by design, but in this
  app's local-first architecture (sql.js reads, no network round-trip for
  dashboard/store data) it appears to resolve fast enough to be
  imperceptible on this test device and data volume. This reads as
  "working as designed, not currently a visible bug" rather than a
  confirmed data-correctness defect — see auth.md for the explicit caveats
  on what a slower device, a much larger local DB, or network-sync
  contention could still change.
- **Suggested follow-up (not implemented, per this task's investigate-only
  scope):** a screen recording on the reporter's own device (screenshots
  polled between tool calls could miss a sub-second flash), and/or adding a
  dedicated loading/placeholder state to the store-switch transition itself
  (distinct from `DashboardOverview`'s existing initial-load skeleton) so
  that if a slower environment ever does hit the stale window, the user
  sees a neutral loading state instead of a jarring pop-in either way.

## 8. `update()`/`softDelete()` have zero store-ownership check — cross-tenant write risk (Important, trending Critical)

- **Status:** Fixed (`cd1b267d`, simplified in `057ad2ed`, extended to
  `remove()` in `90a1ec82` after code review caught the gap below) —
  `update()`, `softDelete()`, AND `remove()` (hard delete) in
  `base-helpers.ts` now all call a shared `assertStoreOwnership()` check
  before any write to a `STORE_SCOPED_TABLES` table: a row owned by the
  active store writes normally; a legacy `store_id IS NULL` row is allowed
  through — for `update()`/`softDelete()`, claimed for the active store as
  part of that same call (so it stops being editable by every store after
  its first edit); for `remove()`, deleted outright with no claim step,
  since claiming a row immediately before hard-deleting it protects
  nothing; a row owned by a different, known store throws
  `Error("Cannot modify a record owned by a different store")` instead of
  silently succeeding. No active store resolved (`getActiveStoreId()`
  returns null) fails open, matching `insert()`'s existing behavior for
  that edge case. No call site needed a bypass — this includes the initial
  fix's audit AND a second, `remove()`-specific audit that first-round code
  review demanded after catching that the original grep pattern
  (`"update(\|softDelete("`) never searched for `remove(` calls at all.
  `manage-categories-dialog.tsx` needed no UI guard — `getCategoryList()`'s
  filter (`store_id = ? OR store_id IS NULL`) already makes a different
  known store's row un-renderable there. See `### 13.` in
  `_findings-log.md` for full detail, including the fix-round-two note on
  what the first pass missed and why.
- **Found:** review of bug #1's fix (2026-09-03)
- **Where:** `client/lib/db/base-helpers.ts` — `update()` (writes
  `UPDATE ${table} ... WHERE id = ?`), `softDelete()` (same shape), and
  `remove()` (hard `DELETE FROM ${table} WHERE id = ?`) all took only a row
  `id`, with no `store_id` check anywhere. These are the shared helpers used
  by every domain table's edit/delete path, not just categories.
- **Confirmed UI-reachable today, no tooling required:** bug #1's fix
  correctly keeps legacy (pre-migration) `store_id IS NULL` categories
  visible to every store (so old data doesn't vanish for anyone). But
  `components/products/manage-categories-dialog.tsx` renders every visible
  row — including those shared legacy ones — with a fully-enabled rename
  field and delete button. A staff member on ANY store can rename or
  soft-delete a legacy category that other stores are actively using, via a
  completely ordinary blur-to-save edit or delete click. No devtools, no id
  guessing.
- **Broader exposure:** this is a local-first app — tenant isolation lives
  only in each *read* query's `WHERE store_id = ?` clause. There is no
  server-side authorization layer enforcing it on the write path. Anyone
  with browser devtools on a device (e.g. a multi-store device, or a
  store-switcher session) could call `update()`/`softDelete()` directly
  with any row id present in the local database, bypassing UI-level
  scoping entirely. This is now closed by the fix above: `update()`/
  `softDelete()`/`remove()` all reject a devtools-driven cross-store write
  against a known other store's row the same way the UI path does. (The
  `remove()` gap specifically was real, not hypothetical: `remove()` is
  called on `held_transactions` — a `STORE_SCOPED_TABLES` member — from
  `use-pos-held-transactions.ts` and `use-sales-data.ts`; it was not
  UI-reachable, since `getHeldTransactions()`'s read-side filter has no
  `OR store_id IS NULL` fallback the way categories' read side does, but a
  direct devtools call to `remove("held_transactions", <other store's id>)`
  would have succeeded before the fix-round-two commit above.)

---

## 9. Dashboard's Action Center has zero signal for an oversold/floored product

- **Status:** Fixed (`b92a2ecd`) — added a new, separate "Oversold" card
  to the Dashboard's Action Center (additive only — `getStockBatchStats()`'s
  existing `low_stock_count`/`critical_stock_count` SQL and its
  `total_qty > 0` guard are untouched). `use-dashboard-overview.ts` now
  sources `stats.oversoldCount` from `getOversoldAlerts()` directly (same
  query bug #4's fix added); `dashboard-overview.tsx` threads it into
  `DashboardActionCenter` as a new `oversoldCount` prop, the same way
  `lowStockCount` is threaded; `dashboard-action-center.tsx` renders a new
  conditional card (`id: "oversold"`, `priority: "critical"`, a new
  `AlertOctagon` icon distinct from Low Stock's `PackageX`) only when
  `oversoldCount > 0`, routed to `/inventory/catalog?status=out_of_stock` —
  a real working destination: the catalog tab's own status classification
  already computes `"out_of_stock"` for `stock <= 0` (the same
  floored-to-0 condition), and its `status` query param is already a live
  filter chip. See `### 17.` in `_findings-log.md` for full detail,
  including why `/reports?tab=analytics` (the Business Intelligence tab)
  was considered and rejected, and a known limitation (`oversoldCount` is
  capped by `getOversoldAlerts()`'s existing `LIMIT 5`).
- **Found:** review of bug #4's fix (2026-09-03)
- **Where:** `dashboard-overview.tsx` → `useDashboardOverview` →
  `use-stock-batch-stats.ts` → `getStockBatchStats()`
  (`client/lib/db/queries/inventory.ts:391-392`) computes both
  `low_stock_count` (`total_qty > 0 AND total_qty <= reorder_level`) and
  `critical_stock_count` in one query — but a product floored to exactly
  `0` (bug #4's fix) fails the `total_qty > 0` guard, so it's excluded from
  `low_stock_count`. It falls into `critical_stock_count` instead, but
  nothing in the codebase actually reads that field (confirmed via grep —
  only the hook that computes it references the name). Net effect: a fully
  depleted/oversold product produces **no signal at all** on the Dashboard's
  Action Center, only on Inventory's "Needs attention" panel (which sources
  its data differently — `stock-overview.tsx`'s `getStatus()` correctly
  classifies a `quantity=0` batch as `"critical"`).
- **Risk:** the surface most staff/owners check first (Dashboard) is blind
  to exactly the situation bug #4's alert was meant to make visible.
  Pre-existing dead-field gap, not introduced by bug #4's diff, but bug
  #4's floor makes hitting this dead field the *normal* outcome of an
  oversell rather than an edge case.
- **Why not fixed yet:** found during bug #4's review, scoped out of that
  diff to keep it focused. Needs either: (a) fix `low_stock_count`'s SQL to
  include `total_qty = 0` (simplest, but changes existing dashboard
  numbers/behavior for a case that may currently read as "not counted"
  intentionally — worth confirming that wasn't deliberate), or (b) wire
  `criticalStockCount`/the new `getOversoldAlerts()` into
  `dashboard-action-center.tsx` as its own card, matching the existing
  "Low Stock" card's pattern.

## Known limitations (not bugs — honestly labeled, not silently broken)

- **Settings "Roles & Permissions" tab** is a static "coming soon"
  placeholder (`RolesPermissionsPlaceholder`) — the nav already shows a
  "Soon" badge. Real role assignment (Admin/Manager/Specialist/Cashier/
  Auditor) works; granular custom permissions do not exist yet.
- **Full Playwright suite is not reliably green under concurrent/sequential
  load** — every individual spec passes in isolation (verified per-task),
  but the full suite run together shows different failures each run. Scoped
  out as a dedicated e2e-infrastructure investigation, not a per-feature bug.

## Audit gaps (not bugs — surface never got a dedicated walkthrough)

- ~~**Authentication / Login flow** was never smoke-tested as its own
  section.~~ **Closed** — walked live and documented in
  `docs/features/auth.md` (PIN-entry edge cases, wrong-PIN handling,
  logout/"Switch Account", auto-lock, protected-route behavior when logged
  out, and the multi-store/multi-staff switching mechanisms). This is also
  where item #7 above was investigated from.
