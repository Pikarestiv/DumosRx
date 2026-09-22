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

### `sync-engine/pull.ts` stock-quantity correctness gaps (partially fixed)

- **Where:** `client/lib/db/sync-engine/pull.ts`.
- **Fixed (2026-09-21):** the two confirmed-live, non-theoretical gaps —
  a UNIQUE-constraint-skipped INSERT/UPDATE no longer advances that table's
  sync cursor (it's retried on the next pull, up to `MAX_UNIQUE_SKIP_RETRIES`
  = 5 attempts — an Opus-dispatched review of the first pass caught that an
  unbounded retry permanently stalls that *entire table's* cursor on a
  genuinely non-self-resolving collision, e.g. a duplicate email; after the
  cap, the cursor is allowed to advance past that one record, which stays
  visible via `skippedRecords`/`logCrash` rather than silently blocking
  every other row in the table forever), and a `stock_movements` row whose
  referenced `stock_batches` row hasn't arrived yet (paginated
  independently, so it can land on a later page) now defers its delta
  application until every page has been pulled, instead of silently
  no-op'ing the UPDATE. Covered by
  `client/__tests__/pull-unique-skip-and-cross-page-ordering.test.ts`.
- **Known residual gap (accepted, not fixed):** the deferred
  `stock_movements` delta is applied in a separate transaction *after* the
  page loop's cursor commit — a crash in that narrow window between commit
  and the deferred-delta transaction would still lose the delta, the same
  failure mode as before just in a much smaller window. Not fixed in this
  pass; would need the deferred deltas applied inside the same transaction
  as the cursor stamp that unblocks them.
- **Still open, deliberately not fixed:**
  - Delta applied only on INSERT, never reversed on a later soft-delete
    UPDATE — theoretical only, not currently reachable (nothing in the
    current client or server code ever soft-deletes or updates an existing
    `stock_movements` row; movements are immutable in practice today).
  - Transaction wraps one page, not the whole multi-page pull — a separate,
    larger design question (wrapping a whole multi-page pull in one
    transaction changes failure/retry semantics considerably).

## Low

### `LOYALTY_RULES` constants (min redemption, points expiry) are defined but never used

- **Where:** `client/lib/utils/loyalty-calculator.ts:62-65`.
- **Effect:** points never expire and there's no redemption floor — a policy
  the constant's existence implies should exist but isn't implemented
  anywhere.
- **Fix scope (not implemented):** either wire these into the redemption/
  accrual logic, or remove them if the policy was abandoned (confirm which
  with product before doing either).

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
