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

## 2. Loyalty points have no redemption UI anywhere in the app

- **Status:** Open
- **Found:** Task 5 (Customers)
- **Where:** `loyalty_redemption_options` and `loyalty_transactions` tables
  and their Loyalty Settings config UI exist and work, but no screen
  (Directory, customer detail, POS checkout) lets a customer actually redeem
  earned points.
- **Risk:** none (not a regression) — but it's advertised functionality (in
  the pre-existing `docs/SYSTEM_FEATURES_DOCUMENTATION.md`) that doesn't
  exist. Marketing docs already avoid claiming it works.
- **Why not fixed yet:** this is a missing feature (a real redemption flow),
  not a bug fix — out of proportion to build during a smoke-test pass.

## 3. Prescriptions: unresolved "-5/142" stock-batch display anomaly

- **Status:** Open
- **Found:** Task 4 (Prescriptions)
- **Where:** dispensing a prescription against a stock batch showed a
  batch's remaining quantity as "-5" in one place while the same batch
  showed "142" (the correct post-dispense count) elsewhere on the same
  screen.
- **Investigated:** the write path itself was confirmed correct
  (`recordSaleItemStock` → Activity Log → 142 is right). Leading candidate:
  `getStockBatchesForProductDetails` may be rendering a different,
  pre-existing batch row for the same product, not the one actually
  touched by the dispense — but this was never confirmed.
- **Why not fixed yet:** root cause genuinely not found after one dedicated
  investigation round; needs a fresh, focused debugging pass (reproduce,
  log both the touched batch ID and the ID of whichever batch shows "-5").

## 4. `recordSaleItemStock`'s fallback batch has no floor

- **Status:** Open
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

- **Status:** Open
- **Found:** final whole-branch review (post Task 11)
- **Where:** `client/lib/db/requested-products-queries.ts` — de-dupes
  incoming product requests by `String.includes()` on the customer-name /
  note fields, so e.g. a customer named "Ann" can get silently
  merged/attributed into an existing "Joanna" request.
- **Risk:** low blast radius (only affects the POS empty-state "customer
  wants this" wishlist log), but a real correctness bug.
- **Why not fixed yet:** found late (final review), not in original scope;
  needs an exact-match or normalized-match rewrite of the dedupe key.

## 6. `recordSaleItemStock`'s partial-shortfall fallback can double-write a row

- **Status:** Open
- **Found:** final whole-branch review (post Task 11)
- **Where:** `client/lib/db/queries/inventory.ts:~212-218` — the
  fallback-batch lookup (`getAnyActiveBatchForProduct()`, ordered by
  `updated_at DESC`) can return the same batch the main loop just partially
  deducted, producing a second `sale_item_batches` row and a second
  `stock_movements` row for one `(sale_item, batch)` pair.
- **Risk:** the arithmetic still sums correctly (not a data-loss bug), but
  any consumer assuming one row per batch per sale item will double-count.
- **Why not fixed yet:** found in the final review, needs a small, carefully
  tested change (track already-deducted batch IDs and merge/skip).

## 7. Account/store-switch shows a stale dashboard for ~1 second (user-reported, not yet investigated)

- **Status:** Open — reported by the user, not yet reproduced/root-caused
- **Reported:** "a small lag when one switches account or something where
  for a second or so, after switching, the old account's dashboard is shown"
- **Where (candidate):** `client/lib/context/store-context.tsx`'s
  `switchStore()` — it does synchronously set a module-scope store
  resolver, cancel in-flight queries, and call `queryClient.invalidateQueries()`
  (broad, deliberately not table-filtered), each with a detailed comment
  explaining why. `invalidateQueries()` marks queries stale and triggers a
  background refetch, but by default still renders the previous (stale)
  cached data until the refetch resolves — which would produce exactly the
  symptom described, as expected React Query behavior rather than a bug in
  the switch logic itself. Not yet confirmed live.
- **Needs:** live reproduction (multi-store or multi-staff-PIN account, on
  Pikarestiv Stores 2 or a second store on the same account), a screen
  recording/timing of the flash, and a decision on whether the fix is
  code (e.g. a loading skeleton during the transition, or `placeholderData`
  tuning) or this is expected/acceptable UX.

---

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

- **Authentication / Login flow** was never smoke-tested as its own
  section. It was used as a means to reach every other section (via the
  shared `login()` test helper and manual PIN entry), but PIN-entry
  edge cases, wrong-PIN handling, session/logout, and account/store
  switching were never walked and documented as their own feature area.
  This is where item #7 above should be investigated from.
