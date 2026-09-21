# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings. Fixed entries are removed outright rather than marked — this file is a to-do list, not a changelog (git history is the changelog).

Open items below are grouped by severity (Critical → High → Medium → Low), then a `client/`-area miscellaneous section for older/unlabeled entries, then the separate `web/` pre-launch review section.

## Critical

### `getUserByUsernameOrEmail` has no store scoping

- **Where:** `client/lib/db/queries/auth.ts:9`.
- **Status:** partially fixed — now filters `_deleted = 0` (a soft-deleted
  user can no longer log in). The store-scoping half is still open: in a
  multi-store local DB, any store's user can still authenticate regardless
  of which store is active. Left open deliberately: it's unclear whether
  scoping login itself to the active store is even correct (an owner/admin
  isn't tied to one store, and login precedes store selection in the normal
  flow), so this needs a design decision, not a blind filter addition.
- **Fix scope (not implemented):** needs a decision on what "scoped login"
  should even mean for owner/admin vs. store-pinned staff before
  implementing.

## High

### `sync-engine/pull.ts` stock-quantity correctness gaps

- **Where:** `client/lib/db/sync-engine/pull.ts` (421 lines — file has
  changed shape since the original audit; line numbers below are current).
- **Server-side verification (Opus-dispatched, 2026-09-21):**
  - **Pruning: ruled out conclusively from code.** Nothing server-side ever
    deletes/archives `stock_movements` — no scheduled job, console command,
    queue job, or migration touches it. `App\Models\StockMovement` doesn't
    even use `SoftDeletes` despite a migration having added a `deleted_at`
    column to the table, so the server's generic sync soft-delete/restore
    handling is a no-op for this table regardless; `StockMovementController`
    only exposes read routes. Movements are genuinely append-only today, both
    client- and server-side.
  - **Real-store scale: no production DB access from this session — estimate
    only.** Local dev DB has 487 seed rows (not representative). Based on
    which client code paths insert `stock_movements` (sales, adjustments,
    transfers, returns, receiving, imports), a moderately busy pharmacy could
    plausibly reach the 100k-row cap in roughly 1-3 years of continuous
    operation — a real, not purely academic, risk window for an app already
    live, but this is a code-derived estimate, not a measurement.
- **Per-finding status after verification:**
  - `:253-283` (delta applied only on INSERT, never reversed on a later
    soft-delete UPDATE) — **theoretical only, not currently reachable**:
    nothing in the current client or server code ever soft-deletes or
    updates an existing `stock_movements` row (matches the pruning finding
    above; movements are immutable in practice today). Worth a defensive fix
    eventually, not urgent.
  - `:215-230` / `:284-297` (a UNIQUE-constraint-skipped INSERT is still
    marked "seen" for cursor purposes, so it's never retried) — **confirmed
    still live**, unchanged from the original audit.
  - `:101-113` (cross-page "batches before movements" ordering isn't
    guaranteed) — **confirmed still live**.
  - `MAX_PULL_PAGES = 200` × 500-row pages (`:12`, server page size
    confirmed at `SyncController.php:704`) — **100,000-row cap figure
    confirmed accurate**.
  - `:115` (transaction wraps one page, not the whole multi-page pull) —
    **confirmed still live**.
- **Fix scope (not implemented):** prioritize the two confirmed-live,
  non-theoretical gaps — the UNIQUE-constraint-skip-not-retried case and the
  cross-page batch/movement ordering — over the soft-delete-reversal case,
  which has no current trigger. The single-page transaction scope is a
  separate, larger design question (wrapping a whole multi-page pull in one
  transaction changes failure/retry semantics considerably).

## Medium

### Notification bell: not store-scoped, not React Query, dismissed state doesn't persist

- **Where:** `client/components/dashboard/notification-bell.tsx:80,91-106,127`.
- **Effect:** cloud notifications fetched via `useState`/`setInterval(60s)`
  keyed only on `[user, isCloudLinked]` — switching stores leaves the
  previous store's notifications rendered (and counted in the unread badge)
  for up to a minute. `readBroadcastIds` is plain component state with no
  persistence, so every dismissed broadcast reappears as unread on reload.
- **Fix scope (not implemented):** convert to store-scoped React Query;
  persist dismissed-broadcast ids (localStorage or a synced field).

### PO edit form: useState/useEffect fetch, no cancellation, not store-scoped (recurrence of an already-fixed pattern)

- **Where:** `client/app/(dashboard)/procurement/edit/page.tsx:58-82`.
- **Effect:** same class as `use-procurement-data.ts` (already fixed) and
  the dashboard detail dialogs (already logged) — navigating between two
  POs can let a slower response overwrite the newer form; doesn't refetch
  on store switch.
- **Fix scope (not implemented):** convert to store-scoped React Query.

### `storeProfile` query function has side effects that can double-fire on retry

- **Where:** `client/lib/context/store-context.tsx:164-187`.
- **Effect:** the `queryFn` calls `setActiveStoreId(null)` and
  `localStorage.removeItem(...)` as side effects inside itself. A React
  Query retry re-fires the clearing side effect, and the resulting state
  change flips `targetId` mid-fetch, producing a key change and a second
  fetch on every miss.
- **Fix scope (not implemented):** move the clearing side effect out of the
  query function into the caller/an effect that runs once on a confirmed
  empty result, not on every invocation.

### Loyalty defaults re-seed on every settings-dialog open (check-then-act, no transaction)

- **Where:** `client/lib/db/queries/loyalty.ts:122-139`
  (`ensureLoyaltyDefaultsSeeded`), called from
  `loyalty-settings-dialog.tsx:108`.
- **Effect:** a store that deliberately deleted all its loyalty tiers gets
  them silently re-seeded the next time the dialog opens; two rapid opens
  (or two devices) can double-seed since the check isn't transactional.
- **Fix scope (not implemented):** wrap check+seed in a transaction, or move
  the seed to a one-time migration instead of a per-open check.

### `getUsers` leaks admins/owners across every store on a fleet account

- **Where:** `client/lib/db/local-database.ts:239-243`.
- **Effect:** ORs in `role = 'admin' OR role = 'store_owner' OR store_id IS NULL`
  alongside the store filter — every store's admins/owners appear in every
  other store's staff directory (and anything derived from that list) on a
  multi-store account.
- **Fix scope (not implemented):** needs a product decision first (is
  cross-store admin visibility intended for a fleet account?) before
  deciding whether this is a bug or working-as-intended; if unintended,
  scope the OR condition to the current store's own owner/admins only.

### Receipt print relies on iframe `onload` + a fixed delay, no fallback

- **Where:** `client/lib/utils/print-node.ts:60-66`.
- **Effect:** driven off `onload` for an iframe populated via `doc.write()`
  plus a fixed 300ms delay — in browsers where `onload` already fired for
  the initial `about:blank`, or never fires for the written document, the
  receipt either prints blank or never prints, with the iframe leaking and
  no error surfaced.
- **Fix scope (not implemented):** needs a more robust ready-signal than
  `onload` + fixed delay, plus a visible failure path.

### Reports use UTC day/month boundaries while the dashboard/daily-close use local time

- **Where:** `client/lib/utils/date-range.ts:12-14` (UTC
  `T00:00:00.000Z`/`T23:59:59.999Z` boundaries) vs.
  `client/lib/db/queries/sales.ts:129-130` (daily-close, correct
  local→UTC conversion) and `client/lib/db/queries/reports.ts:477,483,495`
  (`strftime('%Y-%m', …)` on UTC) vs.
  `getDashboardOverviewData:62` (`date(transaction_date, 'localtime')`).
- **Effect:** every report is shifted by the store's UTC offset relative to
  the dashboard; daily close and the Sales report can disagree about which
  day a sale belongs to, and a late-evening sale on month-end can land in
  the wrong month in the P&L relative to the dashboard.
- **Fix scope (not implemented):** standardize report date bucketing on the
  same local-time conversion the dashboard/daily-close already use.

### Prepaid-expense amortization double-counts across a rolling window, and can shift a month under UTC parsing

- **Where:** `client/lib/db/queries/finance.ts:88` (installment counted for
  any month a rolling window merely overlaps — `getBIMetrics:337`'s 30-day
  window straddles two months) and `:76` (`new Date(expense.date)` parses a
  date-only string as UTC midnight while `startOfMonth`/`endOfMonth` work in
  local time, shifting the first installment a month early in negative-UTC
  timezones).
- **Effect:** the same prepaid expense totals differently depending on
  whether a calendar-month or rolling-window period preset is selected; in
  the wrong timezone, amortization starts a month off.
- **Fix scope (not implemented):** not yet designed.

### Several dashboard detail dialogs fetch with unguarded useState/useEffect (no cancellation)

- **Where:** `client/components/dashboard/modals/procurement-details-dialog.tsx:44-49`,
  `dashboard-prescription-details-dialog.tsx:46-51`,
  `stock-movement-details-dialog.tsx:34-40` — all `.catch(() => {})`.
- **Effect:** switching directly between two rows without closing the dialog
  lets a slower, now-stale response render on top of the newer row's data; a
  failed fetch is indistinguishable from "this record has no line items."
- **Fix scope (not implemented):** convert to React Query (same fix pattern
  applied elsewhere in this audit) for built-in request cancellation/
  race-safety.

### Sync push: a response lost after server commit produces a misleading "changed since this edit" toast

- **Where:** `client/lib/db/sync-engine/push.ts:573-586`.
- **Effect:** if the server commits but the response is lost (timeout,
  dropped connection), the retried UPDATE collides with the server's own
  version bump and is dropped as non-retryable `version_conflict` — harmless
  data-wise (the write already landed), but the user sees a misleading
  "record changed since this edit" toast for a change that actually
  succeeded.
- **Fix scope (not implemented):** not yet designed; may be acceptable to
  leave as a UX rough edge if fixing risks false negatives elsewhere.

### Hand-rolled query keys bypass the `queryKeys` factory (store/user cache collisions)

- **Where:** `client/components/reports/reseller-commission/reseller-commission-panel.tsx:52,57`
  (`queryKey: ["resellerCommission", ...]`) and
  `client/components/pos/transaction-details-dialog.tsx:55,87`
  (`queryKey: ["customerById", sale?.customer_id]`).
- **Context:** every entry in `client/lib/query-keys.ts`'s `queryKeys` factory
  auto-suffixes the key with the active store id and current user id
  (`resource()` helper) specifically so a store/user switch can never read or
  write a cache slot the previous store/user's queries own. These two spots
  write their `queryKey` by hand instead, so they carry no such suffix even
  though their query functions resolve the store at call time.
- **Effect:** the reseller-commission list/pending-total and a customer
  looked up by id can be served from the wrong store's (or wrong user's)
  cached data after a switch. Currently masked in practice only by
  `switchStore()`'s broad `invalidateQueries()` sweep, not by any structural
  guarantee — found via an Opus-dispatched audit pass, not reproduced live.
- **Fix scope (not implemented):** route both through `queryKeys` (add a
  `queryKeys.reseller.commission*()`/`queryKeys.customers.byId()` entry with
  the right `meta.tables`) instead of a literal array.

### `stock-movements.tsx` doesn't refetch on store switch (useState, not React Query)

- **Where:** `client/components/stock-batch/stock-movements.tsx:97-100`.
- **Context:** plain `useState`/`useEffect` fetch with `deps: [dateRange]`
  only — the same pattern already found and fixed in
  `use-procurement-data.ts` earlier in this audit.
- **Effect:** switching stores (or recording a sale) leaves the stock-movement
  log showing the previous store's / stale rows until the date filter is
  touched.
- **Fix scope (not implemented):** convert to `useQuery` with a store-scoped
  `queryKeys` entry, mirroring `use-procurement-data.ts`'s fix.

### Refunding a credit sale doesn't reverse loyalty points or the customer's balance

- **Where:** `client/lib/db/queries/returns.ts` (whole module) +
  `client/lib/hooks/use-process-return-mutation.ts:38`.
- **Effect:** the return transaction restores stock and flips
  `sales.payment_status`, but never reverses `points_earned` or
  `outstanding_balance` for a credit sale — refunding a credit sale leaves
  the customer's debt and loyalty points as if the sale still stood.
- **Fix scope (not implemented):** not yet designed.

### Onboarding's first-admin insert has no `_sync_queue` row

- **Where:** `client/app/setup/use-onboarding.ts:139-183`.
- **Effect:** the offline branch (`_synced = 0`, lines 169-183) inserts
  `stores`/`users` via raw `execute()` with no matching `_sync_queue` entry,
  relying entirely on a separate "mark everything dirty" path
  (`local-database.ts:390-395`) to ever reach the server. If that path is
  ever missed, the very first admin account on a device never syncs.
- **Fix scope (not implemented):** not yet designed.

## Low

### `recordSyncFailure` can be called twice for the same queue item in one push run, overwriting the specific rejection reason

- **Where:** `client/lib/db/sync-engine/push.ts` — the rejected-items block
  (`recordSyncFailure(r.id, r.reason, true)`, pre-network-call) followed
  later by either the `else` branch (`response.success === false`) or the
  `catch` block, both of which iterate the *full* `batch` (not the
  filtered `changes`) and call `recordSyncFailure` again on every item.
- **Context:** found via an Opus-dispatched review of the `success: false`
  handling fix (see FIXED_BUGS.md) — pre-existing in the `catch` block's
  already-shipped pattern, not introduced by that fix.
- **Effect:** only when one batch mixes some client-side-validation-rejected
  items (bad UUID, missing `stock_batch_id`, etc.) with a whole-batch
  server-level failure (either a thrown exception or `success: false`): the
  second `recordSyncFailure` call overwrites the specific, useful rejection
  reason (e.g. "Invalid category_id (not a UUID)") with the generic
  batch-failure message, and bumps `retry_count` one extra, unwarranted
  step. Not data-lossy — cosmetic (wrong error text) and narrow (requires
  that specific overlap).
- **Fix scope (not implemented):** skip items already recorded via the
  pre-network-call rejected-items block when iterating `batch` in the
  `else`/`catch` paths, e.g. by tracking their ids in a `Set` and filtering
  them out before the second pass.

### `checkIsAdmin` uses substring match instead of exact role comparison

- **Where:** `client/lib/context/auth-context.tsx:84-88`.
- **Effect:** `normalizedRole.includes("admin")` while every sibling check
  (`checkCanManageStockBatch`, `checkCanProcessSales`,
  `checkCanViewAllActivity`, `checkCanFactoryReset`) uses exact array
  membership. Any future role whose name merely contains "admin"/"manager"
  silently inherits full admin UI privileges.
- **Fix scope (not implemented):** switch to exact membership, matching the
  sibling checks.

### Staff created with no active store become invisible in staff lists while still able to log in

- **Where:** `client/components/settings/staff/staff-form-dialog.tsx:37,62,128`.
- **Effect:** `store_id: activeStoreId || ""` writes an empty string rather
  than `NULL` when no store is active — such a row matches neither
  `store_id = ?` nor the `store_id IS NULL` fallback `getUsers` checks for,
  so the account is invisible in every staff list while still able to log
  in.
- **Fix scope (not implemented):** write `null`, not `""`, when no active
  store.

### Lock screen keeps the dashboard mounted and polling underneath

- **Where:** `client/components/dashboard/dashboard-layout.tsx:240-249`.
- **Effect:** the lock screen is a `fixed inset-0` overlay rendered over
  `children` — the dashboard (and the prior user's data) stays mounted,
  rendered, and refetching in the DOM while the device is "locked."
- **Fix scope (not implemented):** unmount or blank the dashboard content
  while locked, not just overlay it.

### Fuzzy search fallback matches arbitrary rows on short terms

- **Where:** `client/lib/utils/search.ts:114-171` (`searchProducts`),
  `:237-283` (`genericFuzzySearch`).
- **Effect:** the fuzzy fallback (Levenshtein distance ≤ 3) fires for terms
  as short as 3 characters, and `searchProducts`' fallback never scores
  `barcode` at all — a scanned barcode with no exact match returns up to
  five unrelated products as "suggestions" instead of an empty result.
- **Fix scope (not implemented):** raise the minimum term length for the
  fuzzy fallback, or scale the allowed distance by term length; include
  barcode in the scored fields.

### Prescription line totals aren't rounded to the cent

- **Where:** `client/lib/utils/prescription-calculations.ts:9-15`.
- **Effect:** `unitCost * quantity` with no rounding — float drift
  accumulates into a `REAL` money column, inconsistent with the rounding
  already applied in the POS money-math path (fixed earlier this session).
- **Fix scope (not implemented):** apply the same `roundMoney` pattern used
  in `pos-calculations.ts`.

### Editable number cell can clobber a leading-zero decimal mid-entry

- **Where:** `client/components/ui/editable-number-cell.tsx:44-46,60-66`.
- **Effect:** commits on every keystroke, and the `[value]` effect
  immediately rewrites the displayed text to `String(value)` — typing a
  leading-zero decimal (`0.05`) can have the `0.` clobbered back to `0`
  mid-entry, making sub-unit prices awkward or impossible to type directly.
- **Fix scope (not implemented):** don't resync displayed text from
  `value` while the field is actively focused/being edited.

### A couple of fire-and-forget writes report success without awaiting

- **Where:** `client/components/customers/loyalty-settings-dialog.tsx:96-97`,
  `client/lib/context/store-context.tsx:409` (`setTheme`).
- **Effect:** `void updateStoreProfile(...)` immediately followed by a
  success toast — a failed write still reports success to the user.
- **Fix scope (not implemented):** await the write before toasting success,
  or catch and show an error toast on failure.

### Currency-code sanitization silently blanks lowercase codes and can crash on an invalid one

- **Where:** `client/lib/utils.ts:32-44,52,70`.
- **Effect:** `currencyCode.replace(/[^A-Z]/g, "")` maps any lowercase code
  (`"usd"`) to `""` → falls back to `"NGN"` silently; an invalid residual
  code makes `Intl.NumberFormat` throw uncaught, crashing the render tree of
  any money-displaying screen.
- **Fix scope (not implemented):** normalize case before sanitizing;
  wrap the formatter construction in a try/catch with a safe fallback.

### Stock batch report missing a store_id filter on the joined stock_batches side (mostly latent)

- **Where:** `client/lib/db/queries/reports.ts:261-263`
  (`fetchStockBatchReportData` filters `m.store_id` but never `inv.store_id`
  on the join).
- **Effect:** mostly latent today (transfers mint a per-store product row),
  but legacy `store_id IS NULL` batches get summed into the active store's
  valuation.
- **Fix scope (not implemented):** add the missing filter.

### Expense amount has no numeric validation

- **Where:** `client/lib/hooks/use-expense-mutations.ts:25`
  (`parseFloat(formData.amount)`) + `add-expense-dialog.tsx:81` (only a
  truthiness check upstream).
- **Effect:** a non-numeric amount stores `NaN`; nothing rounds to 2dp or
  rejects a negative amount into a `REAL` money column.
- **Fix scope (not implemented):** validate numeric + non-negative before
  submit, round to the cent on write (same pattern as the earlier POS
  money-math fix).

### `LOYALTY_RULES` constants (min redemption, points expiry) are defined but never used

- **Where:** `client/lib/utils/loyalty-calculator.ts:62-65`.
- **Effect:** points never expire and there's no redemption floor — a policy
  the constant's existence implies should exist but isn't implemented
  anywhere.
- **Fix scope (not implemented):** either wire these into the redemption/
  accrual logic, or remove them if the policy was abandoned (confirm which
  with product before doing either).

### Sync push: duplicate-remap leaves the old id's still-pending queue rows dangling

- **Where:** `client/lib/db/sync-engine/push.ts:516`.
- **Effect:** the `id_map` duplicate-remap marks the old local row
  `_deleted = 1` but leaves any still-pending `_sync_queue` rows for that old
  id in place — they now target a record the server has no copy of and fail
  on every retry until the backoff cap.
- **Fix scope (not implemented):** when remapping an id, also remap or drop
  any other pending `_sync_queue` rows still referencing the old id.

### Prescription edit-form load is useState/useEffect with a console.error-only failure path

- **Where:** `client/components/prescriptions/new-prescription/use-new-prescription.ts:104-151`.
- **Effect:** if the load fails, `isEditing` stays true against a blank
  form — required-field validation (`:270`) prevents silently saving over
  the real record, but the practical impact is a confusing empty edit form
  with no visible error.
- **Fix scope (not implemented):** surface the fetch error to the user
  (toast/inline message) instead of console-only.

### P&L current-period revenue window is open-ended while the expense window is capped

- **Where:** `client/lib/db/queries/reports.ts:321-346` vs `:337` — revenue/
  COGS/transaction queries use `transaction_date >= ?` with no upper bound,
  while the expense side is explicitly capped at
  `new Date().toISOString()`.
- **Effect:** a future-dated or clock-skewed sale counts toward revenue in a
  window that excludes the matching expenses, skewing the reported margin.
- **Fix scope (not implemented):** cap the revenue/COGS window the same way
  the expense side already is.

### Activity log misattributes stock-transfer writes to whatever store is globally active

- **Where:** `client/lib/db/core.ts:1013,1026` (`logAction()`), called from
  inside `update()`/`insert()` for every write `stock-transfers.ts`'s
  `transferStock()` makes.
- **Context:** found while an Opus-dispatched pass vetted the stock-transfer
  race fix (see git log "fix: stock-transfer cross-store write race via
  explicit store override"). `logAction()` still reads the global active-
  store resolver directly, which that fix deliberately stopped touching -
  before the fix it read `null` during a transfer, now it reads whatever the
  UI actually has active (a third store, or the source/dest by coincidence).
- **Effect:** an activity-log row for a transfer's writes is attributed to
  the UI's currently-active store rather than the source or destination
  store the write actually belongs to. Cosmetic (audit-trail attribution),
  not a data-scoping bug — the writes themselves are correctly scoped.
- **Fix scope (not implemented):** `logAction()` would need the same
  `overrideStoreId` plumbing `assertStoreOwnership()` already has, threaded
  through from `update()`/`insert()`'s `options`.

## Process / methodology gaps (not a single bug)

### Financial calculations/reports lack reconciliation tests against an independent raw sum

- **Where:** broad — dashboard aggregates (`getDashboardOverviewData`),
  `reports.ts` P&L/margin/COGS queries, inventory valuation. Currently
  covered by unit tests on individual functions, but nothing cross-checks a
  rolled-up dashboard/report number against an independently computed raw
  query sum over the same underlying rows.
- **Context:** raised by an external review (someone with a BI/financial-
  dashboarding background) asking whether the calculation engine behind
  inventory/dashboard reporting is proven enough to trust without further
  verification. This app uses custom calculations (not a third-party
  analytics module), verified so far via unit tests plus Opus review passes.
  Several real bugs already found in exactly this area — the date-range
  boundary mismatch (`eb80ac3a`), UTC-vs-local report bucketing, prepaid
  amortization double-counting across a rolling window (all above, High/
  Medium) — are drift/reconciliation-class bugs: none would be caught by a
  unit test on one isolated function, because the defect is in how numbers
  get combined *across* date/store boundaries, not in any single
  calculation's arithmetic.
- **Effect:** without reconciliation tests, a future regression of this same
  class (report/dashboard totals silently diverging from the underlying
  ledger) would surface only via a customer noticing a wrong P&L number —
  these are customers who, per the reviewer, "live and die by their P&L."
- **Fix scope (not implemented):** add integration-level tests that compute
  an independent raw-SQL sum for a date range and assert it matches the
  corresponding dashboard/report figure, at minimum for revenue, COGS, and
  inventory valuation, run against shared fixtures.

### Dashboard ratio metrics haven't had a numerator/denominator definition review

- **Where:** ratio-style dashboard tiles across `client/components/dashboard/`
  (anything expressed as a rate/percentage/turnover rather than a raw sum).
- **Context:** same external review — a ratio metric can be arithmetically
  correct and still misrepresent the business if the denominator's
  population isn't the one the label implies (e.g. averaging over all SKUs
  vs. only active ones). Not yet audited; no specific metric confirmed wrong.
- **Effect:** unknown — flagged as a methodology gap, not a confirmed bug.
- **Fix scope (not implemented):** for each ratio-style dashboard metric,
  document what the denominator actually is and confirm it matches what the
  label claims.

## Needs a product decision (not a straightforward bug)

### Plaintext PINs stored and synced

- **Where:** `client/lib/db/queries/auth.ts:9,32,36`,
  `client/lib/context/auth-context.tsx:183,436`.
- **Context:** `users.pin` is stored and compared in plaintext, and carried
  in sync payloads for the `users` table. This may be a deliberate
  offline-first architecture decision (PIN unlock needs to work fully
  offline) rather than an oversight — flagged for an explicit call, not
  filed as a straightforward bug.
- **Effect:** a `.drx` backup file, an IndexedDB dump, or a server-side DB
  read exposes every staff PIN in the clear. Compounds the admin-backdoor
  and no-lockout findings above.
- **Fix scope (not implemented):** needs a product decision (hash+salt the
  PIN, accept the offline-verification cost) before any code change.

## `client/` — older/unlabeled entries

### `discount_amount` coupons cannot be created against a SQLite-backed database

- **Where:** `laravel-server/database/migrations/2026_06_14_085200_update_coupon_type_enum.php`
  widens the `coupons.type` enum to add `discount_amount` via a raw
  `ALTER TABLE ... MODIFY COLUMN`, guarded by
  `if (DB::connection()->getDriverName() === 'mysql')` — it's a no-op on
  every other driver, including SQLite.
- **Found while:** writing `laravel-server/tests/Feature/Admin/AdminMoneyValidationTest.php::test_non_percentage_coupon_above_100_is_still_accepted`,
  which had to use `trial_extension` instead of `discount_amount` as its
  "non-percentage" coupon type specifically to avoid this — `discount_amount`
  fails a `CHECK` constraint left over from `2026_05_29_164200_create_coupons_tables.php`'s
  original (narrower) enum on the SQLite connection the test suite runs
  against.
- **Effect:** any environment backed by SQLite — the test suite, and any
  local dev setup that doesn't run MySQL — cannot create a `discount_amount`
  coupon at all; `CouponController::store`'s own validation accepts the
  value, and the insert then fails at the database layer. Production is
  presumably MySQL, so this may be purely a test/dev-parity gap rather than
  a production-reachable bug, but that should be confirmed rather than
  assumed.
- **Fix scope (not implemented):** either make the migration driver-agnostic
  (SQLite has no native enum; the original column was almost certainly a
  `CHECK` constraint Laravel generates from `->enum()`, which needs a
  SQLite-specific rebuild — recreate the column/constraint rather than
  `MODIFY COLUMN` — for that branch), or confirm production never runs
  SQLite and downgrade this to a documented test-environment limitation
  instead of a bug.

### Impersonation return-hop still passes its handoff code via query string

- **Where:** `client/components/dashboard/impersonation-banner.tsx:39` —
  `window.location.href = \`${WEB_APP_URL}/admin/handoff?code=${code}\``,
  navigating back from an impersonated store to the admin panel.
- **Context:** found while fixing the matching outbound-leg issue (starting
  an impersonation session, `web/app/admin/stores/page.tsx`), which now
  passes its handoff codes via the URL fragment instead of the query string
  specifically so they never reach a server's access logs or `Referer`
  header. This return leg still uses the query string.
- **Effect:** the code minted for this return hop lands in `web/admin/handoff`'s
  server access logs and any `Referer` header sent from that page for the
  remainder of its TTL. Same class of exposure as the outbound leg, on the
  side that hands back to the *admin's own* session rather than the
  impersonated store's.
- **Fix scope (not implemented):** apply the same fragment-based approach
  here — pass `code` via `#code=...` and update `web/app/admin/handoff`'s
  receiving side to read `window.location.hash` instead of a query param,
  mirroring `client/app/auth/callback/page.tsx`'s `readHandoffCodes()`.

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

### Detailed Sales Report PDF: Transaction # cell overflows into the next column

- **Where:** `client/components/reports/pdf/report-pdf-document.tsx`'s table
  cell rendering (react-pdf `<Text>` inside a flex `View`), fed by
  `client/lib/hooks/use-report-export.ts`'s `sales` report config.
- **Reported:** visually confirmed on a generated Sales Report PDF — the
  Transaction # column's value bleeds past its cell's right border into the
  Date column.
- **Attempted fix (unverified — reporter says it didn't resolve it):** added
  `overflow: "hidden"` to `styles.cell` and gave the sales report an explicit
  `columnFlex` (`[1.8, 1.3, 1.3, 1, 1, 0.8, 1, 1, 1, 1, 1]`) to widen the
  Transaction # column. react-pdf's `overflow` support and flex-basis
  interaction with long unbroken tokens (no spaces to wrap on, e.g. a
  `TXN...`/`RCT-...` id) may behave differently than standard CSS — needs
  visual re-verification against an actual rendered PDF (Chrome's built-in
  PDF viewer isn't screenshottable via this project's browser-automation
  tooling, which blocked confirming the fix in this pass).
- **Fix scope (not fully verified):** re-check rendered PDF output directly
  (e.g. via a local PDF renderer/CLI, not just the browser tab) after the
  above change; if still overflowing, consider shrinking `fontSize` for that
  column specifically, or truncating the id (e.g. last 8 chars only, matching
  what the receipt dialog already shows) rather than relying on wrap/hide.

## Pre-launch review findings (web/)

Read-only review pass over `web/` (Next.js superadmin panel + marketing
site), area by area. Nothing here was fixed — each entry is open. Same
convention as the earlier `client/` pass: grouped by area, one entry per
finding, removed outright once fixed.

**impersonation / handoff**

Verified correct and deliberately *not* listed as findings: `POST /admin/stores/{id}/impersonate` is `role:super_admin` server-side (`laravel-server/routes/api.php:180`), and handoff codes are genuinely single-use (`Cache::pull` get-and-delete) with a 60s TTL in `AuthHandoffController`. The findings that were here were around that core, not in it; all are now fixed.

**billing / plans / coupons (money)**

All findings in this area are now fixed. `getSystemConfig` rejects on failure instead of resolving `null`, and each consuming config tab (subscription/security/suggestions/integrations) shows a real error-with-retry state rather than editing — and then saving — bundled defaults. Plan prices are validated client-side and behind a confirmation step, and `SystemConfigController::update` now schema-checks the `subscription_plans` price fields. Coupon percentages are capped at 100 on both layers, `max_uses` no longer turns a cleared field into unlimited, the coupon list has a distinct error state, and Target Plan is a slug dropdown.

**referrals / marketing**

All findings in this area are now fixed. `ReferralController::adjustCredits` validates `amount` as `min:0.01`, so a negative amount can never reach the balance-check logic; the adjust dialog validates before submitting, adds an explicit confirmation step naming the wallet and direction, and resets on every close. The target-user picker is a search-driven single-select over the full user base, every query's error is surfaced in a retry banner, and both referral tables paginate through the server's `{ data, meta }` envelope.

**landing / public pages**

All findings in this area are now fixed. The public pricing page shows an explicit unavailable-with-retry state instead of quoting bundled ₦3,000/₦8,000/₦15,000 tiers when config fails to load, `web_dashboard` is a real feature key end to end (`TierFeatures`, the plan editor's toggle list and the bundled defaults), and `calculateDiscountPercent` clamps at 0 so a misconfigured yearly price can no longer render a negative "Save -20%" badge.

**auth (public register/login)**

## Can-wait — deliberately not fixed (explicit scope decision, 2026-09)
- **File:** web/components/auth/hooks/use-register-form.ts:87 (with web/lib/api/base-client.ts:57)
- **Issue:** the store-owner access token lives in `localStorage["drx_token"]`, read back by `base-client.ts`'s request interceptor for every non-`/admin` request. This is the storage pattern the admin side was deliberately migrated away from on 2026-08-26 (see `web/AGENTS.md`, "Admin auth architecture").
- **Risk:** any XSS foothold on a store-owner page, a malicious browser extension, or a "paste this in the console" support scam reads the token directly and replays it as a bearer from anywhere, for the token's full lifetime. There is no `HttpOnly` boundary, nothing binds the token to the browser that minted it, and `logout()` clearing the key does not revoke anything already exfiltrated. The storefront pages also load third-party JS (`smartsupp-widget.tsx`) into the same origin, which widens the window.
- **Why not fixed in this pass:** this is an architectural migration, not a bug fix. It changes how *every* authenticated store-owner request obtains its credential and requires coordinated backend work (a refresh-ability-scoped cookie token, a `/session/refresh` endpoint for the store-owner audience, revocation on logout). The admin migration that did this needed changes across the auth store, the login form, the API interceptors, the handoff flow, `AuthController`, `routes/api.php` and `bootstrap/app.php`, plus deletion of a global middleware. Attempting the same inside a pre-launch review pass would mean a large, under-tested change to the login path of every paying customer. The narrow correctness bug at the same line (storing a missing token as the literal string `"undefined"`) **was** fixed; the storage location was not.
- **What a future migration must consider:** follow the admin-side precedent in `web/AGENTS.md` — access token held in memory only (zustand, excluded from `persist`'s `partialize`), refresh token in an `HttpOnly`, `SameSite=Strict` cookie that never appears in a JSON response, and a cookie-only refresh endpoint registered outside the `auth:sanctum` group, called on mount to re-establish the session after a reload. Note the store-owner case has constraints the admin case did not: `client/`'s desktop app authenticates against the same `/login` with a bearer token and its own `refreshTokenSilently` flow (`client/lib/api/token-manager.ts`) and must not be broken — the admin migration handled this by minting the cookie only when `device_name === 'web'`, and the same discriminator applies here. The public storefront routes are unauthenticated and are unaffected either way.
- **Status:** open — accepted risk, revisit as a standalone piece of work
