# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings. Fixed entries are removed outright rather than marked — this file is a to-do list, not a changelog (git history is the changelog).

## Open items

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

### Receipt/id collisions from time-based, non-unique identifiers

- **Where:** `client/lib/hooks/use-pos-payment.ts:128` —
  `` transaction_number = `TXN${Date.now()}` `` against a
  `sales.transaction_number TEXT UNIQUE NOT NULL` column
  (`client/lib/db/schema.ts:103`); `client/lib/hooks/use-pos-held-transactions.ts:47`
  — `` id = `held_${Date.now()}` `` as an explicit primary key;
  `client/lib/hooks/use-fulfill-online-order-mutation.ts:33` —
  `` receipt_number: `ONL-${order.id.split("-")[0]}` `` (only the first UUID
  segment).
- **Effect:** two terminals in the same store checking out (or holding a
  sale) in the same millisecond, or with clock skew, produce the same id —
  the losing row hits a UNIQUE violation server-side and never syncs (sales),
  or one held cart silently overwrites the other on sync (held transactions).
  The online-order receipt number isn't unique by construction at all.
- **Fix scope (not implemented):** generate these with the same collision-safe
  id generator already used elsewhere (`generateId()`, `lib/db/core.ts`)
  instead of a bare timestamp/id-prefix.

### `sync-engine/pull.ts` stock-quantity correctness gaps

- **Where:** `client/lib/db/sync-engine/pull.ts`.
- **Findings from an Opus-dispatched audit pass (unverified against server
  behavior — see specifics below):**
  - `:273-283` — a pulled `stock_movements` row applies its quantity delta to
    `stock_batches` only in the INSERT branch; a movement later soft-deleted
    server-side arrives via the UPDATE branch (`:203-213`), which sets
    `_deleted = 1` but never reverses the delta — permanent drift.
  - `:284-297` — a UNIQUE-constraint error on that INSERT is caught/logged
    and skipped, but the row is still treated as "seen" for cursor purposes,
    so the missed delta is never retried.
  - `:108-113` — the "stock_batches before stock_movements" ordering only
    holds within one page; a movement arriving on page N whose batch only
    arrives on page N+1 makes the batch UPDATE a silent no-op (the code's own
    comment already says this loses the increment permanently).
  - `:164-166` / `:47-48` — `stock_batches.quantity` is rebuilt purely by
    replaying `stock_movements`, itself capped at `MAX_PULL_PAGES = 200` × 500
    rows — a store with more history than that (or one the server ever
    prunes) can never reach the correct quantity.
  - `:115` — the transaction wraps one page, not the whole pull; a
    multi-page pull that throws on page 3 can leave page 1's store-prune/
    duplicate-remap already committed against data that was never fully
    applied.
- **Fix scope (not implemented):** needs verifying against the server first
  (does it ever prune `stock_movements`? does a real store exceed ~100k
  historical movements?) before deciding whether this is theoretical or
  live-reachable — flagged, not yet investigated further.

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
