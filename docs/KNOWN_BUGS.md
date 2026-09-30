# DumosRx — Known Bugs & Engineering Audit

## Audit Information

- **Date of this pass:** 2026-09-30 (supersedes and extends the 2026-09-28 whole-monorepo pass, the 2026-09-27 payment-gateway pass and the 2026-09-26 pass, all of whose still-open findings are preserved below under their original IDs).
- **Scope:** Whole monorepo, swept in three parallel package-scoped passes — `client/` (Next.js 16 / React 19 offline-first Tauri POS app, sql.js in the browser, native SQLite via the vendored `@tauri-apps/plugin-sql` fork on desktop/Android), `laravel-server/` (Laravel 12 / PHP 8.2 API, MySQL on shared hosting), `web/` (static-export marketing site, store-owner dashboard stubs, platform admin panel, public storefront) — each walked category by category against `docs/BUG_REVIEW_PROMPT.md`'s checklist.
- **Methodology:** critical flows were traced end to end rather than pattern-searched, following `docs/BUG_REVIEW_PROMPT.md`'s checklist categories: POS sale → FEFO deduction → sync push → server apply → pull on a second device; stock adjustments and cycle counts; PO create/receive (standard and immediate); CSV/XLSX import; offline writes and reconnect; multi-tab writer election and promotion; multi-store scoping (client resolver and server `applyPullTenantScope`/`authorizeChangeTarget`); PIN login, permission groups, Sanctum token lifecycle; the licensing/clock-tamper guard; database init, migrations, backup/restore; PWA service worker; Tauri startup and updater; returns, loyalty, credit/debt; reports/BI queries over a synthetic mature dataset; store suspension/archival enforcement; admin revenue reporting; storefront checkout failure paths; admin nav role-filtering.
- **Validation performed (read-only):** `npx tsc --noEmit` in `client/` — clean; `npx vitest run` in `client/` — 346 files / 2255 tests passing (one known non-fatal vitest teardown flake, exit 0); `npm run test:schema` in `client/` — completes with warnings (see `A-58`); `php artisan test` in `laravel-server/` — 581 passed / 1890 assertions, 0 failures; `npx tsc --noEmit` in `web/` — clean; `npx vitest run` in `web/` — 9 files / 35 tests passing; `npx eslint` in `web/` — 0 errors, 16 warnings. A synthetic-dataset query benchmark from the 2026-09-28 pass, run against the app's own `SCHEMA_SQL` in sql.js (the exact engine the web/PWA build runs on), remains the current measurement — see the Performance section for the numbers and the caveat that a desktop Node run is 5–20× faster than the low-end Android hardware this product targets.
- **Excluded:** `node_modules/`, `.git/`, `.claude/worktrees/`, `.worktrees/`, `brag-output/`, `refs/`, `client/out/` (inspected only for export size), `client/playwright-report/`, `client/test-results/`, `laravel-server/vendor/`, `laravel-server/public/build/`, generated Tauri bindings under `src-tauri/gen/android/.../generated/`, lockfiles, the `dumosrx-release-key.jks`/keystore files (present in the working tree, flagged below), and `docs/superpowers/` plan/spec history. Areas covered exhaustively by previous passes and re-verified without re-derivation: payment webhook signature/idempotency, `SyncController` role/field allow-lists, handoff-code TTL, CORS allowlist, admin token storage, PIN lockout, and the writer-lock architecture documented in `docs/DATABASE_CONCURRENCY.md` (whose short-term recommendations were checked against current code — see §6).

This file holds **open** items only. Fixed entries move to `docs/FIXED_BUGS.md` and are removed here outright, per `.agents/AGENTS.md` §2.

---

## Executive Summary

**Overall health.** The codebase is unusually well-defended for its size: the sync engine's conflict model, the single-writer tab lock, tenant scoping on the server and the money math have all been through several review-and-fix cycles, and all three packages' test suites pass cleanly. The 2026-09-28 pass's own remediation is complete (nothing from `A-1`…`A-25` is still open). This 2026-09-30 pass is a fresh whole-monorepo sweep, split into three parallel package-scoped reviews (`client/`, `laravel-server/`, `web/`). Its most severe cluster — store suspension being a case-sensitivity no-op on the one surface that moves customer money, `stores.status` being writable through the generic sync push, and the sync push's INSERT branch having no cross-tenant write authorization — was remediated on 2026-09-30 and moved to `docs/FIXED_BUGS.md` (`A-74`, `A-75`, `A-77`), along with the referral-credit reservation gap that could permanently strand a paid subscription (`A-79`). `A-76`, the P2 that makes suspension a coin flip for a multi-store owner, is still open below.

**Findings this pass, by severity:** 0 **P0**, 3 **P1**, 19 **P2**, 18 **P3** — 44 new findings from the 2026-09-30 three-package sweep (`A-54`…`A-110`, non-contiguous; see each section for the exact IDs), plus the still-open carried findings below: `A-26`, `A-28`, `A-30`, `A-40`, `A-41`, `A-48`, `A-49`, `A-53` from the 2026-09-28/29 passes, and `P2-1`, `P3-1`, `P3-2`, `P3-5`, `PG-1`…`PG-10` from the two earliest passes — all preserved verbatim below.

**Most important risks, in order:**

1. **`A-54` (P1, client)** — a deferred `stock_movements` quantity delta (the batch it applies to hasn't arrived in the same pull round) is lost forever if any later page of that pull fails — the movement row itself is already committed, but its delta is never re-applied by any code path, permanently understating on-hand stock.
2. **`A-94` / `A-95` (P1, web)** — the public Downloads marketing page calls a `super_admin`-only API and gets redirected off the site by the 401 interceptor (killing the product's install-conversion page); and a failed Paystack confirmation on storefront checkout falls back to a live, fully-armed order form, inviting a customer who already paid to place — and pay for — a second order.
3. **`A-76` (P2, laravel-server)** — `CheckAccountStatus` only ever inspects one of a multi-store owner's stores, so suspending or archiving one store of several enforces nothing. The two P1s it used to compound (`A-74`, `A-75`) are fixed; this one is what still stands between an admin suspension and it actually biting for a multi-store account.
4. **PG-2 / PG-1 (carried)** — storefront online payments still have no webhook/reconciliation path and can settle via the wrong gateway; still the largest deferred, user-acknowledged body of work in this document (see `A-95`/`A-105` above for the two newly found `web/`-side behaviours immediately around this same hole).

**The major performance concern** that remains is the whole-blob `db.export()` persistence model already analysed in `docs/DATABASE_CONCURRENCY.md`; the rest of §5's list (boot-time scans, the license-guard sync gate on launch, the 5-second sync-queue poll) is fixed.

---

## 1. Critical findings (P0)

None found this pass. No cross-tenant read/write path, payment double-charge, or unguarded data-destroying path was identified beyond what previous passes closed. (The storefront pass's `SF-P0-1` remains fixed.)

---

## 2. High-priority findings (P1)

`A-1` (the pull page cap that made a >100,000-row table un-syncable) and `A-3` (the server's materialised id lists and offset paging behind it) were fixed together — see `docs/FIXED_BUGS.md` and `docs/SYNC_PULL_PAGINATION.md`. `A-27` (the crash-log amplification loop that was live in production on 2026-09-29, Sentry `DUMOSRX-CLIENT-1B`/`17`/`19`/`1A`/`1G`/`1M`) was found and fixed in the same pass — see `docs/FIXED_BUGS.md`. Four of this pass's own P1s — `A-74`, `A-75`, `A-77` and `A-79` — were remediated on 2026-09-30 and moved to `docs/FIXED_BUGS.md`. Three findings remain open:

#### A-54. `client/` — a deferred `stock_movements` quantity delta is lost forever if any later page of the same pull round fails
- **Category:** Offline Sync & Conflict Resolution / Data Integrity — confirmed by trace
- **Location:** `client/lib/db/sync-engine/pull.ts` — the `deferredMovementDeltas` push at `:382-386`, the per-page `transaction()` boundary at `:216`/`:505`, the cursor suppression at `:486-492` and `:498-500`, and the end-of-round application block at `:521-545`. The delta is only ever applied inside the `exists.length === 0` (INSERT) branch, `:364-387`.
- **Problem:** When a pulled `stock_movements` row references a `stock_batches` row that has not arrived yet, its quantity delta is pushed onto an in-memory `deferredMovementDeltas` array and applied only *after the whole page loop finishes*. The movement row's own `INSERT` has already committed with its page's transaction. Both of that table's cursors are also held back (`deferredMovementPageCursor` / `deferredMovementCursor` are set in memory instead of written to `_sync_state`), so nothing in `_sync_state` records the page either.

  Now let any later page fail — `apiClient.pullChanges()` at `:191` throwing on a network drop is the ordinary case, and it is outside the transaction. The outer `catch` at `:556` rethrows, so the block at `:521` never runs and the array is discarded with the function. Local state afterwards: the movement rows exist and are marked `_synced = 1`, `stock_batches.quantity` was never adjusted, and the cursor is where it was.

  The next pull re-offers those same movement records, but they now exist locally, so pull takes the `UPDATE` branch at `:295-339` — which contains **no delta application at all**. The delta is never applied again, by any code path.

  A second, independent loss in the same block: if a deferred batch still does not exist when `:526-545` runs (hard-deleted server-side, or out of the pull's tenant scope), `UPDATE stock_batches ... WHERE id = ?` matches zero rows, the delta is silently dropped, and `PULL_PROGRESS.completeWindow` stamps the `stock_movements` window in the same transaction — declaring the round complete over a lost delta.
- **Why it matters:** pull deletes the server's authoritative `quantity` for `stock_batches` (`:265-267`, `delete data.quantity`) and `stock_batches.quantity` has schema default `0`, so on the web/PWA build a batch's on-hand figure is reconstructed *entirely* from these movement deltas. Losing them understates on-hand stock permanently, with no reconciliation pass anywhere in `lib/db/` to recompute `quantity` from `stock_movements`. Downstream: FEFO refuses to dispense stock that is physically on the shelf, `getOversoldAlerts()` fires on phantom oversells, and inventory valuation is wrong. Deferral is not rare — `stock_batches` is ordered by `updated_at`, and a batch whose quantity was touched recently sorts to the *end* of its window while its older movements sit at the *start* of theirs, so a fresh device's initial sync defers a large share of deltas. A mid-sync network failure on the low-end Android hardware this product targets is the normal case, not the exotic one.
- **Not a regression of the 2026-09-22 fix** (`docs/FIXED_BUGS.md`, "sync pull's deferred stock_movements delta could still be lost on crash", commit `16ef5bc9`). That fix made the delta application atomic with the **cursor stamp**, and that guarantee still holds. The surviving gap is between the movement row's own INSERT and its delta, which are in different transactions by construction.
- **Recommended fix:** make the delta recoverable rather than in-memory. Either (a) persist deferred deltas to a small local table inside the same page transaction that inserts the movement, and drain that table at the start of every pull, or (b) drop the `exists.length === 0` gate: on the `UPDATE` path, compare the incoming `quantity` against the stored row's and apply the difference, so a re-offered movement heals itself. (b) is smaller but needs care with the `_deleted` transition. A cheap belt-and-braces addition either way: a one-off reconciliation that recomputes `stock_batches.quantity` from `SUM(stock_movements.quantity)` for batches the deferral path touched.
- **Confidence:** High on the mechanics (the trace is fully in-file). **Status:** Open.

#### A-94. `web/` — the public Downloads page calls a `super_admin`-only API, and the 401 interceptor then redirects every anonymous visitor to the login page
- **Category:** Auth & Access Control / Error Handling — confirmed by tracing, not by running
- **Location:** `web/app/downloads/page.tsx:26` (`useLatestRelease()`), `web/lib/api/release-hooks.ts:58-65` (`webApiClient.request("admin/downloads/manifest")`), `web/lib/api/base-client.ts:261-291` (the 401 branch), `laravel-server/routes/api.php:203` (`GET /admin/downloads/manifest` → `auth:sanctum` + `permission:manage_platform` + `role:super_admin`)
- **Problem:** `useLatestRelease()` is shared by the admin Downloads page and the **public** marketing Downloads page. `base-client.ts`'s request interceptor only attaches the admin bearer token when `window.location.pathname.startsWith('/admin')` (`:78-86`), so on `/downloads/` the call goes out unauthenticated and the route answers `401`. The response interceptor's 401 branch fires (the URL contains neither `/login` nor `/refresh`, so nothing exempts it): it calls `refreshSession(isAdminPath = false)`, which POSTs `/refresh` — itself inside the `auth:sanctum` group (`routes/api.php:116`) — which also 401s for an anonymous visitor. The refresh throws, and the catch executes `window.location.href = "/login?redirect=%2Fdownloads%2F"`. `web/app/login/page.tsx:9` then immediately does `window.location.href = ${getAppURL()}/login`.
- **Concrete failure scenario:** a visitor opens `https://dumosrx.com/downloads/`, and within one request round-trip is thrown off the marketing site onto `https://app.dumosrx.com/login`. The `try/catch` inside `queryFn` (`release-hooks.ts:87-105`) does **not** save it: it catches the rejection *after* the interceptor has already started the navigation.
- **Why it matters:** P1. The Downloads page is the install/conversion path for the whole product, and it is unreachable for the exact audience it exists for. It also means an unauthenticated 401 anywhere on a public page turns into a forced redirect — the interceptor's redirect has no "this is a public page" guard.
- **Recommended fix:** two halves. (1) Give the public page its own unauthenticated source for the manifest (a public `GET /downloads/manifest`, or reuse the `PUBLIC_KEYS`-style allow-list in `SystemConfigController`) and keep `admin/downloads/manifest` for the admin page only — or split `useLatestRelease()` into an admin and a public hook. (2) Make `base-client.ts`'s 401 redirect conditional on the request actually belonging to an authenticated surface (e.g. only redirect when the path starts with `/admin`), so a 401 on a public page surfaces as an ordinary error instead of a navigation.
- **Confidence:** High on the mechanics (every link in the chain read directly; route middleware confirmed in `routes/api.php`). Not reproduced in a browser — per the standing no-live-production-testing rule.
- **Status:** Open, logged 2026-09-30. Introduced by `754dc376` ("fix: real per-platform download existence/sizes"), which repointed the shared hook at the admin endpoint.

#### A-95. `web/` — after a failed Paystack confirmation the checkout page falls back to the live checkout form, inviting a second order for an already-paid cart
- **Category:** Payments & Cart — confirmed by tracing
- **Location:** `web/components/storefront/checkout-form.tsx:105-126` (the return-handling effect), `:189-224` (the render branches), `:137-187` (`handleSubmit`)
- **Problem:** On return from Paystack the effect POSTs `/storefront/{slug}/checkout`. On success it clears `sessionStorage`, clears the cart and navigates away. On **failure** it only fires a toast: `orphanReference` stays `null`, `loading` returns to `false`, and the cart was never cleared — so the component falls straight through to the ordinary `Delivery & Payment` form with a live "Place Order" button. The customer has paid, is told "Could not confirm your payment…", and the single most prominent control on the page is one that creates a *new* order.
- **Concrete failure scenario:** stock for one line sells out while the customer is on Paystack's hosted page. `checkout()` returns 422 (possibly with `refunded: true`). The customer sees the error toast, then the checkout form, and clicks "Place Order" with `payment_method: in_store` — creating a second, unpaid order for goods they already paid for online, while the original payment intent stays unreconciled (which is exactly the hole `PG-2` describes, now reachable through an ordinary UI path rather than only by closing the tab). Selecting "Pay Online" again instead produces a second real charge.
- **Why it matters:** P1 — money. The repo already decided the adjacent case is not allowed to be silent: a reference with **no** pending entry gets a dedicated panel (`:189-211`) precisely because "they have paid, and the reference in the URL is the only thing that can find their money" (`web/AGENTS.md`). A reference **with** a pending entry whose confirm failed is the same situation with worse consequences, and gets no panel at all.
- **Evidence:** `web/__tests__/checkout-form-return.test.tsx:55-71` pins only the toast text and that the `sessionStorage` entry is kept; nothing pins what the page renders next. In that test the cart is empty, so the empty-cart card hides the problem — in production the cart still holds the items.
- **Recommended fix:** on a failed confirm, set a `failedReference` state and render a dedicated panel (mirroring the orphan panel) that quotes the reference, states the payment may have gone through, offers an explicit **Retry confirmation** (the `sessionStorage` entry is deliberately retained, so a retry is already safe and idempotent server-side), and does **not** expose the order form. Special-case the 422 `refunded: true` body with "this has been refunded" wording.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-28. `laravel-server`/ops — production's `feedback` table is missing the `occurrence_count` column its migration adds
- **Category:** Deployment / schema drift — confirmed from production (Sentry `DUMOSRX-CLIENT-11`, 567 events, 4 users)
- **Severity:** P1 — every `audit_logs` and `feedback` push carrying the column is rejected by the server, so those devices never sync those tables at all.
- **Evidence:** the migration exists in the repo but was never run against the production database; the server rejects the push with `Unknown column 'occurrence_count' in 'field list'`, the queue item burns its five attempts and is reported as stuck.
- **This is an ops action, not a code change** — run the pending migrations on production. No code fix applies. The client-side amplification this used to trigger is closed by `A-27`; what remains is only that the affected rows still never sync until the migration runs.

---

## 3. Medium-priority findings (P2)

`A-9` (receiving the same purchase order from two devices booked the delivery twice) is fixed — see `docs/FIXED_BUGS.md`. 19 findings are open, all new from the 2026-09-30 three-package sweep:

#### A-76. `laravel-server/` — `CheckAccountStatus` inspects only one of an owner's stores, so suspending/archiving one store of a multi-store account enforces nothing
- **Category:** Auth & Access Control — confirmed by code trace
- **Location:** `app/Http/Middleware/CheckAccountStatus.php:43-45` (`$store = Store::withTrashed()->where('user_id', $user->id)->first();`)
- **Problem:** For an owner the middleware resolves a single, arbitrary store (no `orderBy`, so whatever the storage engine returns first) and checks only that one for suspension/archival. Multi-store is a supported, plan-gated state.
- **Concrete failure scenario:** Owner owns A and B. Admin suspends A. If `first()` returns B, every API call succeeds — including `/app/sync/push` and `/app/sync/pull` scoped to A (`resolveAllowedOwnershipScope()` returns *all* owned stores, deliberately un-narrowed), so A keeps syncing, trading and reporting as though nothing happened. The mirror case is just as wrong: archive B and the account is 403'd out of A as well, with `STORE_ARCHIVED` naming a store the admin never touched.
- **Why it matters:** Suspension and archival are the two administrative enforcement actions in the product, and both are decided by a coin flip on which row `first()` happens to return.
- **Recommended fix:** Resolve the store per *request*, matching `SyncController::resolvePushStoreId()` (`X-Store-Id` when owned, else the caller's own store) rather than picking one arbitrarily; block when *that* store is suspended/archived. Where no store is named, block only if **every** owned store is suspended/archived, and let per-store scoping reject the rest. Add coverage for a two-store owner with exactly one store suspended.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-80. `laravel-server/` — coupon usage limits are check-then-act with no lock and are only counted at activation, so a single-use coupon can be redeemed without limit
- **Category:** Payments / State & Concurrency — confirmed by code trace
- **Location:** `app/Models/Coupon.php:67-70` (`max_uses` counted from `usages()`), `:87-91` (`max_uses_per_user`), `app/Http/Controllers/Api/Web/SubscriptionController.php:331-342` (validated at initiate), `:382-384` and the `recordCouponUsage()` call at the end of `activateSubscriptionFromTransaction()` — the only writer
- **Problem:** `CouponUsage` rows are written at activation, never at initiate, and nothing holds a lock across the check. Validity is therefore evaluated against a count that only moves after the money has already been committed.
- **Concrete failure scenario:** (a) A `max_uses: 1`, 50%-off launch coupon is shared publicly. Twenty users call `POST /subscription/pay` with it before any of them completes payment; all twenty pass `isGloballyValid()` (0 usages) and all twenty get a discounted `PaymentTransaction`. Every one activates at the discounted price. (b) A user double-submits a 100%-off coupon: both requests reach `:361` (`$finalAmount <= 0`), both pass `isValidForUser()` (0 usages), and **two** active `Subscription` rows are created for one coupon, with two `CouponUsage` rows recorded after the fact.
- **Why it matters:** Direct revenue loss, unbounded by design of the check; (b) also leaves the account with duplicate overlapping subscriptions, which `resolveEffectiveSubscription()` resolves by `latest()` and which then skews `billingHistory` and the admin revenue figures.
- **Recommended fix:** Record a usage row (or a reservation) inside a transaction that locks the coupon row at the point the discount is granted — at initiate for the paid path, and inside a locked transaction for the `$finalAmount <= 0` self-activation path — and release it when a transaction fails. A `UNIQUE (coupon_id, user_id)` index on `coupon_usages` would additionally make the per-user cap enforceable by the database for the common `max_uses_per_user: 1` case.
- **Confidence:** High on the mechanics; frequency depends on how widely coupons are shared. **Status:** Open, logged 2026-09-30.

#### A-81. `laravel-server/` — every Paystack/Flutterwave HTTP call is made with no timeout, unlike every other outbound call in the app
- **Category:** Error Handling / Reliability — confirmed by code trace
- **Location:** `app/Services/Payment/PaymentService.php:77`, `:102`, `:145`, `:184`; `app/Services/Payment/PaystackSubaccountService.php:59`, `:80`, `:108`, `:130`, `:152` — nine `Http::withToken(...)` calls, none with `->timeout()`. Contrast `AdminPlatformController.php:164`/`:182`, `AdminPlatformService.php:389` (`->timeout(5)`) and `RebuildStorefrontIfDirty.php:70` (`->timeout(10)`).
- **Problem:** Guzzle's default request timeout is 0 (wait forever). `laravel-server/AGENTS.md`'s own convention for outbound calls is "short `->timeout()`, try/catch, log-and-continue"; the payment services are the only place it isn't followed.
- **Concrete failure scenario:** Paystack's API becomes slow or a connection blackholes. `POST /storefront/{slug}/checkout/initialize` — unauthenticated, 15/min/IP — holds a PHP-FPM worker for the full socket lifetime. On Namecheap shared hosting the worker pool is small; a handful of hung storefront checkouts (or `POST /subscription/verify` calls, which sit in the request path too) exhausts it and the whole API stops answering, including sync. A hung `verifyTransaction()` inside `StorefrontController::checkout()` additionally holds the per-store `lockForUpdate()` taken at `:658` — so one stuck provider call blocks every other checkout for that store.
- **Why it matters:** Turns a third-party latency incident into a full outage, on the one code path that cannot be retried safely (money in flight).
- **Recommended fix:** Add `->timeout(10)->connectTimeout(5)` (or similar) to all nine call sites, and make sure the verify path treats a timeout as "unknown, do not book the order" rather than "failed" — `verifyPaystack()` currently returns `success => false` on any non-2xx, which for a *timeout* during `checkout()` means the paid customer gets "Payment could not be verified" while the intent stays `pending` (recoverable, but only by whatever `PG-2`'s reconciliation sweep eventually becomes).
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-82. `laravel-server/` — cancelling a paid online order transitions and refunds outside any transaction or row lock, so concurrent cancels can double-refund
- **Category:** Payments / State & Concurrency — confirmed by code trace
- **Location:** `app/Http/Controllers/Api/OnlineOrderController.php:145-165` (`order_status !== 'pending'` guard, then `$order->save()`, then `refundOrFlag()`), `:189-208`
- **Problem:** The pending-only guard added for SF-P2-5/SF-P3-6 is a check-then-write with no `lockForUpdate()` and no surrounding transaction, and the refund is a third-party call made *after* the save, outside any transaction.
- **Concrete failure scenario:** Staff double-tap "Cancel order" on a paid Paystack order (or the POS retries a request whose response was lost). Both requests read `order_status === 'pending'`, both write `cancelled`, and both call `PaymentService::refundTransaction()` for the same reference. Paystack usually rejects the second as exceeding the original amount — in which case the order silently falls through to `flagRefundRequired()`, telling the store to refund manually an order that *was* already refunded, and leaving `payment_status` at `'paid'` despite a successful refund having happened. If the second refund is accepted (partial-refund semantics, or a retry Paystack treats as new), the platform pays out twice from its own balance, which the design doc already notes is never clawed back from the store.
- **Why it matters:** Money, in both directions — a double payout, or a correct refund recorded as still-owed. It also contradicts the endpoint's documented promise that "a retry after a partial client-side failure is safe".
- **Recommended fix:** Wrap the state read + transition in `DB::transaction()` with `OnlineOrder::where('id',$id)->lockForUpdate()->first()`, re-check `order_status` inside it, and commit the `cancelled` transition before calling the provider; then update `payment_status` in a second short transaction on the refund's outcome. Treat a refund whose provider response says "already refunded" as success rather than falling through to the manual-refund flag.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-83. `laravel-server/` — the web dashboard's `staff` list includes everyone the caller ever *referred*, leaking other store owners' emails
- **Category:** Auth & Access Control / Multi-tenancy — confirmed by code trace
- **Location:** `app/Services/Web/DashboardService.php:260-273` (`User::whereIn('store_id', $storeIds)->orWhere('referred_by_id', $userId)`)
- **Problem:** `referred_by_id` is the customer **referral program** pointer, set at registration from a `ref` code — it identifies an unrelated store owner who signed up through the caller's link, not a staff member. The dashboard summary returns it in the `staff` array alongside genuine staff, with `email`, `role`, `store_id`, `created_at` and `last_login_at`.
- **Concrete failure scenario:** Owner A shares their referral link; owner B signs up with it. `GET /dashboard/summary` for A now returns B in `staff`, exposing B's email address, role and last-login timestamp. The web dashboard renders that array as the store's team, so B also appears to be A's employee.
- **Why it matters:** Cross-tenant PII disclosure through an ordinary authenticated endpoint, and a functional bug on top (a referred owner shows up as staff, inflating the team list and confusing the staff-limit story the same screen displays).
- **Recommended fix:** Drop the `orWhere('referred_by_id', …)` clause — referral data has its own endpoint (`GET /subscription/referral-stats`), which is already scoped and returns only name/store/status, not email. If the intent was "accounts I created", that is `registered_by_id` and belongs on the admin surface, not a store owner's staff list.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-84. `laravel-server/` — a store owner can delete their own store and lock themselves out of the entire API with no self-service recovery
- **Category:** Auth & Access Control / Data Integrity — confirmed by code trace
- **Location:** `app/Http/Controllers/Api/Web/StoreController.php:234-246` (`destroy()`), read back by `app/Http/Middleware/CheckAccountStatus.php:56-62` (`$store->trashed()` → 403 `STORE_ARCHIVED`)
- **Problem:** `Store` uses `SoftDeletes`, so `DELETE /stores/{id}` stamps `deleted_at` — the same state an admin archive produces. `CheckAccountStatus` then refuses every request in the protected group. Un-archiving is `POST /admin/stores/{id}/restore`, gated `role:super_admin`.
- **Concrete failure scenario:** A single-store owner uses "Remove store" in the web dashboard. All their staff are deactivated (`:239`), the store is soft-deleted, and from the next request onward every API call — including `/user`, `/dashboard/summary`, `/subscription/status` and all sync — returns 403 with "This store has been archived by an administrator and can no longer sync or record data", which is both untrue and unactionable. The only way back is a support request to a super_admin. Unlike the admin archive path this also leaves `deleted_by_id`/`deletion_reason` null and never revokes tokens, so the account's state is inconsistent with an admin-archived one.
- **Why it matters:** A single self-service click permanently bricks a paying account, and the error text misattributes the cause, guaranteeing a support ticket that starts from the wrong premise.
- **Recommended fix:** Either refuse `destroy()` when it is the caller's last remaining store (409 with "contact support"), or route it through `AdminStoreDeletionService::archiveStore()` semantics and give the owner a self-service restore. In all cases distinguish the 403 reason for "you archived this yourself" from "an administrator archived this".
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-85. `laravel-server/` — the staff endpoints can deactivate the store owner's own account, locking the tenant out irreversibly
- **Category:** Auth & Access Control — confirmed by code trace
- **Location:** `app/Http/Controllers/Api/Web/StaffController.php:398-405` (`destroy()`), `:349`/`:380` (`update()` passes `is_active` straight through), scoped by `visibleStaffBaseQuery()` at `:57-60` which deliberately includes `orWhere('id', $owner->id)`
- **Problem:** The owner's own row is intentionally visible and editable through these endpoints (the web staff table's "Main Account"), and neither endpoint excludes it from deactivation. `is_active = false` is then terminal: `CheckAccountStatus:31-37` 403s every API call and `AuthenticatesSessions::login():77-81` rejects the password login with "Account is deactivated".
- **Concrete failure scenario:** Any `manage_staff` holder (an `admin`- or `manager`-role staff member — the permission is not owner-exclusive) calls `DELETE /staff/{ownerId}`, or the owner clicks the delete action on their own row in the staff table. The owner can no longer log in or use the API at all, and neither can any staff member fix it, because reactivation needs an authenticated session in the same tenant. Recovery requires `POST /admin/users/{id}/reactivate` (super_admin only).
- **Why it matters:** A privilege-escalation-adjacent denial of service by a subordinate, and a foot-gun for the owner themselves, on a path whose stated intent ("Deactivate a staff account") never contemplated the owner.
- **Recommended fix:** Reject `destroy()` and any `is_active: false` in `update()` when the target row is the tenant owner (`$staff->id === $owner->id`) or is the caller themselves, with a 422. `AdminUserController::deactivateUser()` should be checked for the equivalent self-deactivation guard at the same time.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-86. `laravel-server/` — every admin revenue figure counts soft-deleted sales, so the admin panel and the store's own dashboard disagree
- **Category:** Correctness — Money / Data Integrity — confirmed by code trace
- **Location:** `app/Services/Admin/AdminStoreService.php:80-98` (`revenueSubquery()`, `DB::table('sales')`) and `app/Services/Admin/AdminStoreMetricsService.php:122-136` (`salesQuery()`, same) — neither filters `deleted_at`. Contrast `AdminStoreMetricsService::countScoped()` at `:230-247`, which *does* (`whereNull('deleted_at')`), and `DashboardService` which uses Eloquent `Sale::` and so inherits the `SoftDeletes` global scope.
- **Problem:** `Sale` uses `SoftDeletes` (`app/Models/Sale.php:17`). Both admin revenue paths bypass Eloquent via `DB::table()`, so deleted sales stay in `SUM(total_amount)`, `COUNT(*)`, `MIN/MAX(created_at)`, the 6-month trend and `active_days`.
- **Concrete failure scenario:** A store deletes/voids 50 sales worth ₦500,000 (locally, synced up as `_deleted`), or runs `POST /dashboard/reset` (which soft-deletes). The owner's dashboard reports ₦0; the admin Store Details page and the fleet list still report ₦500,000 and 50 orders — and `average_order_value` is computed from those, so it is wrong too. Within one Store Details response, `business_metrics.order_count` counts deleted rows while `operational_metrics.inventory.products` excludes them, so the same payload is internally inconsistent.
- **Why it matters:** These are the figures a founder uses to judge account health and to argue about billing; both classes were factored into shared helpers *specifically* so they couldn't drift, and they drift from the owner-facing number instead. `AdminPlatformService::summary()`'s `Sale::sum('total_amount')` (Eloquent) is a third, different answer.
- **Recommended fix:** Add `->whereNull('sales.deleted_at')` inside both helpers (one line each, and they are the single source for every consumer). Decide explicitly whether a voided sale is revenue and document it in `AGENTS.md`; whichever way, make all three call sites agree.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-87. `laravel-server/` — `POST /subscription/verify-license` accepts any license key with no ownership check
- **Category:** Auth & Access Control — confirmed by code trace
- **Location:** `app/Http/Controllers/Api/Web/SubscriptionController.php:117-156` — `Subscription::where('license_key', $request->license_key)->first()` with no comparison against the caller
- **Problem:** The endpoint is authenticated but not authorised. Any authenticated user can present any other tenant's `license_key`, have a `License` row created for *their* `machine_id` against that subscription, and receive `{valid: true, plan, expires_at}`.
- **Concrete failure scenario:** A free-tier user obtains an `enterprise` key (it is returned in plaintext by `GET /subscription/status` to that store's own users, and `verifyLicense` has no rate limit beyond the group's 60/min). They call `verify-license` with it and their own machine id: the server registers the device and answers `valid: true, plan: enterprise`, and their desktop app's offline license state is now seeded with a tier they never paid for. The victim's own device count/`License` table is silently polluted with a stranger's machine.
- **Why it matters:** An entitlement bypass on the licensing system, plus a write into another tenant's `licenses` rows. `.agents/AGENTS.md` §8 flags the license/JWT path as security-sensitive, and this is the one server endpoint that gates it.
- **Recommended fix:** Scope the lookup to the caller's subscription owner: `$owner = $subscriptionService->getSubscriptionOwner($request->user()); Subscription::where('license_key', …)->where('user_id', $owner->id)->first()`, returning the same 404 otherwise so the key isn't confirmed as valid. Also move the `last_check_in` update to after the `is_active` check (`:145-149` currently stamps a deactivated device's check-in before refusing it).
- **Confidence:** High on the missing check; the downstream client effect depends on how `client/`'s license guard consumes the response. **Status:** Open, logged 2026-09-30.

#### A-88. `laravel-server/` — "reset sales data" scopes by the owner's own `cashier_id`, so every staff-rung sale survives and the response still says "cleared"
- **Category:** Data Integrity — confirmed by code trace
- **Location:** `app/Services/Web/DashboardService.php:559-569` (`sales` branch, `where('cashier_id', $userId)` where `$userId = tenantOwnerId($user)`), `:571-581` (`logs` branch, `where('user_id', $userId)`)
- **Problem:** `sales` has no `user_id` column; it is scoped by `store_id` everywhere else in the app (see `Store::sales()`'s doc block, written for exactly this reason). Resolving to the tenant owner's id — which the 2026-09-26 fix correctly introduced for the *other* branches — still only matches sales the **owner personally rang up**. Every sale with a staff `cashier_id` is untouched. `activity_logs` has the same shape: only the owner's own rows are deleted.
- **Concrete failure scenario:** A store with three cashiers runs `POST /dashboard/reset` with `type: 'sales'`. The response is `{"status":"success","message":"Sales records cleared."}`; in reality only the handful of sales the owner rang up are gone. The owner's dashboard still shows the staff sales, the reports still include them, and the next sync pulls them back down to every device. With `type: 'all'` the same partial delete happens while the message reads "All data cleared."
- **Why it matters:** A destructive operation that reports complete success having done a fraction of the work — the exact failure shape `P2-2` (in `FIXED_BUGS.md`) was filed for, on the two branches that fix did not touch. Worse than a plain no-op, because the resulting state is half-reset: inventory and products are gone (they scope by `user_id` correctly) while the sales referencing them remain, leaving `sale_items` pointing at deleted products.
- **Recommended fix:** Scope the `sales` branch by `store_id` across the tenant's stores (`Sale::whereIn('store_id', Store::where('user_id',$ownerId)->pluck('id'))`), with the legacy `cashier_id IN (owner + staff)` fallback for pre-`store_id` rows that `AdminStoreService::revenueSubquery()` already models. Scope `activity_logs` by the same owner-plus-staff id set `ActivityLogController::index()` builds. Extend `tests/Feature/DashboardResetScopingTest.php` with a staff-rung sale.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-89. `laravel-server/` — staff created without an explicit PIN silently get the POS unlock PIN `1234`
- **Category:** Auth & Access Control — confirmed by code trace
- **Location:** `app/Http/Controllers/Api/Web/StaffController.php:197` (`$pin = $request->pin ?: '1234';`), stored hashed at `:211`
- **Problem:** `pin` is `nullable` in the create rules and in the OpenAPI contract, so omitting it is a supported request. The fallback assigns a fixed, publicly-known 4-digit PIN. That PIN *is* the POS credential: `client/` verifies it entirely offline against the hash the sync pull ships down, so the account is immediately usable at the till by anyone who guesses it, and nothing forces a change on first unlock.
- **Concrete failure scenario:** An owner adds a cashier through the web dashboard without filling in the PIN field (or any API caller omits it). The account syncs down to every device with PIN `1234`. Anyone with physical access to a till can unlock as that cashier and ring up, void or refund sales under their identity — and every audit log, `sales.cashier_id` and stock movement attributes the activity to them.
- **Why it matters:** `AGENTS.md`'s "Staff credentials" section removed exactly this pattern for the web `password` (`Hash::make('1234')`, "a live credential with a 10,000-value keyspace"), but the fallback survives on the PIN, which is the higher-value credential of the two because it is what actually authorises POS actions.
- **Recommended fix:** Make `pin` required on `POST /staff`, or generate a random 4-digit PIN and return it once to the creating owner so it can be communicated deliberately. Do not leave a shared literal. If a default is genuinely wanted for onboarding, flag the account as must-change-on-first-unlock and have the client enforce it.
- **Confidence:** High on the mechanics; whether the fixed default is intentional product behaviour needs a product call, which is why the fix is offered as two options. **Status:** Open, logged 2026-09-30.

#### A-55. `client/` — the outgoing user's permission group is still in effect for the incoming user after a lock-screen account switch
- **Category:** Auth & Access Control — confirmed by trace
- **Location:** `client/lib/context/auth-context.tsx:769-791` (the `permissionGroup` state and its loader effect) and `:800-803` (the booleans derived from it); `client/lib/hooks/use-permissions.ts:34-47` (`hasPermission`) and `:97-107` (`useHasPermission`).
- **Problem:** The loader effect resets `permissionGroup` to `null` only when `user` is null. On a **user-to-user** transition it leaves the previous group in state and overwrites it asynchronously. The lock screen's "switch account" tile is exactly that transition: `login()` "calls `login()` directly without ever going through `logout()` first" (`:428-437`), and `setUser(userProfile)` at `:459` commits synchronously while `getUserPermissionGroup()` is an awaited sql.js read. `hasPermission(user, group, key)` takes the user and the group as independent arguments and never checks that the group belongs to the user, so during that window every gate is evaluated as `hasPermission(incomingUser, outgoingUsersGroup, …)`.
- **Concrete failure scenario:** a shared till. An `admin` whose group grants `manage_staff` locks the screen. A `sales_staff` cashier picks their own tile and unlocks with their own PIN. React commits with `user = cashier`, `permissionGroup = <admin's group>`, so `isAdmin`, `canManageStockBatch` and `canViewAllActivity` (`:800-803`) and every `useHasPermission(...)` call site read `true` for the cashier. Staff management, permission-group editing and the other admin-gated surfaces render and are clickable until the read resolves. That read is queued on `core.ts`'s connection-wide FIFO lock behind whatever else is running, and `client/AGENTS.md` documents that lock as taking real time during a draining sync backlog. Local DB writes have no second permission check (the local DB is trusted), so a gated write performed in that window succeeds.
- **Why it matters:** breaks access control. The blast radius is bounded for `users`/`permission_groups` pushes (the server allow-lists those), but purely locally-gated actions — deleting a product, editing prices, voiding a sale, viewing the full activity log — are not.
- **Recommended fix:** make the group's identity explicit. Store it as `{ userId, id, permissions }` and have `hasPermission()`/`useHasPermission()` ignore a group whose `userId` doesn't match the acting user, so a mismatch falls through to `fallbackPermissions(role)` (fail-safe, role-tier only) rather than to another user's grants. Clearing `permissionGroup` on any `user?.id` change is necessary but not sufficient on its own.
- **Confidence:** High on the mechanics; the width of the window depends on DB-lock contention. **Status:** Open.

#### A-56. `client/` — a mixed-payment sale accepts an over-allocated credit split and permanently overstates the customer's debt by the excess
- **Category:** Correctness — Money & Tax / Payments & Cart — confirmed by trace
- **Location:** `client/lib/hooks/use-pos-payment.ts:296-307` (the mixed branch's `outstanding_balance` write); `client/lib/hooks/use-pos-payment-helpers.ts:92-101` (`validatePaymentReadiness`'s mixed branch); `client/lib/utils/pos-calculations.ts:110-132` (`calculateSplitShortage`) and `:144-149` (`calculateMixedAmountPaid`).
- **Problem:** `validatePaymentReadiness` rejects a mixed payment only for a *negative* split and for *under*-coverage (`isFullyCovered`). Nothing caps any individual split, and in particular nothing requires the credit split to be no larger than `total - (sum of non-credit splits)`. `use-pos-payment.ts` then adds the credit split **verbatim** to the customer's balance.
- **Concrete failure scenario:** total ₦1,000. Cashier enters cash ₦400 and credit ₦800 (a routine mistype — ₦800 was the earlier quote, or the credit field was filled before the cash tender). Splits sum to ₦1,200 ≥ ₦1,000, so validation passes. `amount_paid` is ₦400 (credit excluded, correct). `change_given` is 0 (correct). But `outstanding_balance` is bumped by ₦800 while the customer actually owes ₦600. `applyCreditPaymentFIFO` computes this sale's owed amount as `total_amount - amount_paid` = ₦600 and can never apply more than that against it, so ₦200 of debt is attached to the customer with no sale to settle it against.
- **Why it matters:** real money, against the customer. The store's own books (`sales.total_amount`, `amount_paid`) stay correct, so nothing surfaces the discrepancy — it reads as an ordinary outstanding balance until someone reconciles the customer's statement against their sales by hand.
- **Not a regression:** `docs/FIXED_BUGS.md`'s mixed-payment fix closed the **change-due** half of this by excluding credit from `calculateMixedAmountPaid`/`calculateMixedChangeDue`, and that fix still holds. The `outstanding_balance` half was never in its scope.
- **Recommended fix:** in `validatePaymentReadiness`'s mixed branch, reject a credit split greater than `total - sum(non-credit splits)` (with `MONEY_EPSILON` tolerance), and, defensively, clamp the same way at the write in `use-pos-payment.ts`. Pin both with a unit test in the `pos-calculations` suite.
- **Confidence:** High. **Status:** Open.

#### A-57. `client/` — fulfilling an online order for a product with no unexpired active batch records revenue with zero stock-ledger trace and zero COGS
- **Category:** Data Integrity / Money — confirmed by trace
- **Location:** `client/lib/hooks/use-fulfill-online-order-mutation.ts:106-128` (the per-item loop, no stock precondition); `client/lib/db/queries/inventory.ts:184-323` (`recordSaleItemStock`), `:148-161` (`getAnyActiveBatchForProduct`, whose `includeExpired` option this path does not pass)
- **Problem:** `recordSaleItemStock` guarantees a stock trace via a two-step fallback: FEFO over positive-stock batches, then `getAnyActiveBatchForProduct()` for the most recently touched active batch. Both exclude expired batches, and `getAnyActiveBatchForProduct`'s `includeExpired` escape hatch is used by `submitStockAudit` only — never here. If a product's only batches are expired (or it has none), **both** return `[]`: no `sale_item_batches` row and no `stock_movements` row are written, and `sale_items.stock_batch_id` is `null`. On the POS this is unreachable (the catalog query excludes expired-only stock, so `addToCart` refuses it); the online-order path has no equivalent guard.
- **Concrete failure scenario:** product P's single batch expired on 2026-09-01; the storefront (server-derived stock) still lists it. A customer orders 2 units; the owner clicks Fulfill. Result: a `sales`/`sale_items` row carrying the full revenue, `cost_price = 0`, **no** `stock_movements` row, **no** `sale_item_batches` row, and the expired batch's units still counted as on hand. Gross profit is overstated by the whole line, and a later return of that order *adds* phantom stock that was never deducted.
- **Why it matters:** money (COGS/gross profit) plus a silent stock discrepancy on the one write path that has no UI stock guard in front of it.
- **Not a regression:** SF-P2-5's fix routed this hook through `recordSaleItemStock` precisely so a fulfilled online order could not leave zero trace in the stock ledger, and that fix holds for every case where an active, unexpired batch exists. It did not cover the case where `recordSaleItemStock` itself finds nothing to attribute to.
- **Recommended fix:** two parts. (1) In `recordSaleItemStock`, make the last-resort fallback genuinely last-resort: if both lookups come back empty, retry with `includeExpired: true`, and if that is still empty create a target batch the way `getOrCreateTargetBatchForProduct` does, so *every* sale line always produces exactly one `stock_movements` row. (2) In the fulfilment hook, surface an explicit warning (and require confirmation) when a line's product has no sellable stock, instead of fulfilling silently.
- **Confidence:** High on the mechanics. **Status:** Open.

#### A-58. `client/` — `npm run test:schema` compares client `audit_logs` against a vestigial MySQL table, and silently skips any column following an inline `--` comment
- **Category:** Data Integrity / tooling — confirmed by running the script and reading it
- **Location:** `client/scripts/verify-schema-sync.ts:39-60` (`getSQLiteSchema`'s parser) and `:99-141` (the per-table comparison, which has no client→server table-name mapping); the server side is `laravel-server/app/Http/Controllers/Api/App/SyncController.php:2180` (`'audit_logs' => ActivityLog::class`).
- **Problem, two independent defects in the one script:** (1) **No table-name mapping.** The sync engine writes client `audit_logs` to the server's **`activity_logs`** table. A separate, unused MySQL `audit_logs` table also exists. The verifier looks the client table name up directly in `information_schema`, so it compares against the vestigial table — emitting three phantom warnings even though `activity_logs` already has those columns — while **real** drift between client `audit_logs` and server `activity_logs` is invisible to it. That drift class is exactly what caused the live `A-28` production incident. (2) **The column parser is broken by inline comments.** `getSQLiteSchema` does `columnsBlock.split(',')` and takes `parts[0]` of each fragment. In `SCHEMA_SQL`, `loyalty_transactions` has `type TEXT NOT NULL, -- 'earned', 'redeemed'` followed by `transaction_id TEXT,`. Splitting on commas yields two phantom columns and **loses `transaction_id` entirely** — `transaction_id TEXT` is present in `schema.ts` and is written by `use-process-return-mutation.ts:197-212`, but the column is never compared.
- **Why it matters:** `.agents/AGENTS.md` §5 makes this script the mandated gate for cross-repo schema drift. Today it emits four false warnings, which trains readers to treat its output as noise, while the one drift class that has already caused a production outage cannot reach its output at all. It also exits 0 on warnings, so nothing escalates either way.
- **Recommended fix:** add an explicit client→server table-alias map (`audit_logs` → `activity_logs`) mirroring `getModelForTable`, and strip `--` to end-of-line from each line of `columnsBlock` before splitting on commas. The "add to CI" half is deliberately out of scope per `A-25`'s ruling.
- **Confidence:** High — both halves reproduced by running the script and reading the parser. **Status:** Open.

#### A-96. `web/` — the mobile admin nav renders every sidebar item with no role filter, so `platform_admin`/`agent` see the whole super_admin nav below 1024px
- **Category:** Auth & Access Control / Frontend — confirmed by tracing
- **Location:** `web/components/admin/admin-header.tsx:132` (`sidebarItems.map(...)`, no filter) vs. `web/components/admin/admin-sidebar.tsx:135` (`.filter((item) => (item.roles || ["super_admin"]).includes(user?.role || ""))`)
- **Problem:** `AdminSidebar` is `hidden lg:flex`, so below `lg` the header's `Sheet` is the only navigation. That sheet iterates the exported `sidebarItems` directly and drops the role filter the desktop sidebar applies.
- **Concrete failure scenario:** an `agent` opens the admin panel on a tablet or phone (<1024px — the project's own nav breakpoint), taps the hamburger, and sees Overview, Stores, Platform Users, Global Products, Communications, Marketing, Activity Log, Platform Settings and System Downloads. Tapping any of them loads the page shell, whose data call then 403s. Conversely "Register Store" — the one item scoped to `platform_admin`/`agent` — is shown to super_admin too.
- **Why it matters:** No data leaks (the server enforces every one of these), but it is precisely the failure `.agents/AGENTS.md` §9 names — "a role missing from a nav's visibility list, or a page that's reachable but its data call still 403s" — and it makes the admin panel look broken to the two roles least able to tell a permission error from an outage.
- **Recommended fix:** extract the filter into a shared helper (e.g. `visibleSidebarItems(role)` beside `sidebarItems`) and use it in both `admin-sidebar.tsx` and `admin-header.tsx`.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-97. `web/` — clearing a numeric platform-config field silently commits `0`, including the trial length, plan staff/store limits, the referral reward and the storefront commission
- **Category:** Correctness — Money & Tax / Data Integrity — confirmed by tracing
- **Location:** `web/components/admin/views/subscription-config-tab.tsx:260` (`trial_days`), `:410` (`storefront_platform_fee_percentage`); `web/components/admin/views/plan-tier-card.tsx:179` (`limits.staff`), `:189` (`limits.stores`); `web/components/admin/marketing/referrals-settings-form.tsx:83` (`reward_percentage`)
- **Problem:** All five are `onChange={(e) => ... Number(e.target.value)}` straight into form state. `Number("") === 0`, so selecting the contents of the box and deleting them — the ordinary way to retype a number — commits `0` immediately. This is the exact class the same file's sibling `PriceInput` was written to close, and that `referrals-adjust-dialog.tsx` guards against; the fix was never applied to the non-price fields.
- **Concrete failure scenario:** a super_admin opens Platform Settings to change the free-trial length from 14 to 30 days, clears the field, and is interrupted / clicks Save before retyping. `trial_days: 0` is persisted — nothing rejects it — and every subsequent signup gets a zero-day trial. The same click can ship `limits.staff: 0` (a paid tier that admits no staff at all) and `limits.stores: 0`. On the referral form, `reward_percentage: 0` silently stops every referrer earning. On the commission card, `0` hands every storefront sale to the store with no platform cut.
- **Why it matters:** Each of these is money- or entitlement-bearing, applies platform-wide, takes effect immediately, and produces no error on either side — the admin's only signal is the absence of one.
- **Recommended fix:** reuse the `PriceInput` draft/commit pattern already in `plan-tier-card.tsx` for every numeric config field: hold the raw text locally, commit only a parsed in-range value, show the rejected state inline, and discard the draft on blur. Add server-side floors to match.
- **Confidence:** High on the client mechanics; server validation confirmed by reading `SystemConfigController::update`/`validatePlanPricing` and `ReferralController`. **Status:** Open, logged 2026-09-30.

#### A-98. `web/` — the Storefront Commission save has no error handling at all, so a rejected save looks identical to a successful one
- **Category:** Error Handling / Money — confirmed by tracing; also flagged by `eslint` (`@typescript-eslint/no-misused-promises`)
- **Location:** `web/components/admin/views/subscription-config-tab.tsx:415-426`
- **Problem:** The button's `onClick` is an `async` function passed straight to the attribute with no `try`/`catch`: `await updateStorefrontFeeMutation.mutateAsync(...)` then `toast.success(...)`. If the mutation rejects, the success toast never fires, nothing else does either, and the rejection becomes an unhandled promise rejection. Every other save on the same tab wraps the call and surfaces `error.message`.
- **Concrete failure scenario:** a super_admin types `55` and clicks Save Storefront Commission. The server's `'value' => 'required|numeric|min:0|max:50'` rejects it with a 422. The spinner stops, no toast appears, the field still shows `55`, and the admin has no reason to believe the change didn't land.
- **Why it matters:** This is the single control that sets DumosRx's cut of every storefront sale on the platform.
- **Recommended fix:** wrap it in the same `try`/`catch` + `toast.error(...)` shape the two sibling handlers use, and pass a `void`-returning handler to `onClick`. Worth adding at the same time: route this card's save through `ConfirmDialog` like the plan-price change, naming the before/after rate.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-99. `web/` — two native `confirm()` dialogs remain, including on a permanent coupon delete
- **Category:** Frontend / UI-UX convention — confirmed, direct `.agents/AGENTS.md` §9 violation
- **Location:** `web/components/admin/marketing/coupons-manager.tsx:128` (`if (!confirm("Are you sure you want to delete this coupon?")) return;`), `web/hooks/use-store-impersonation.ts:25` (`window.confirm(...)` for the environment-mismatch challenge)
- **Problem:** §9 is unconditional: "NEVER use `window.confirm` for user confirmations. ALWAYS use a custom modal or `AlertDialog`." The same package already has `components/ui/confirm-dialog.tsx` and uses it for store archive, purge, impersonation and plan-price publication — these two call sites were missed.
- **Concrete failure scenario:** the coupon delete is the material one. A native `confirm()` is suppressible — a browser that has had "prevent this page from creating additional dialogs" ticked returns `false` for every subsequent call, so the delete silently no-ops with no feedback; in other browsers/embedded webviews a suppressed dialog can return `true`, deleting without asking.
- **Why it matters:** P2 for the coupon delete (destructive, unrecoverable, guard not under app control), cosmetic for the impersonation challenge — but it is the only remaining `window.confirm` in the monorepo's UI code.
- **Recommended fix:** `ConfirmDialog` for the coupon delete, and a small `Dialog` for the impersonation environment challenge that resolves a promise the way the existing archive/purge dialogs do.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

---

## 4. Low-priority findings (P3)

`A-25` (`npm run test:schema` was broken) is fixed — see `docs/FIXED_BUGS.md`. Its "add to CI" half is intentionally not done; see that entry's Ruling. `A-29` (a double-encoded `stores.enabled_payment_methods` blanked the admin Store Details page in production on 2026-09-29) is fixed — see `docs/FIXED_BUGS.md`; `A-30` below is its residual ops cleanup, which does not block it. `A-31` (the same-family follow-up in `client/`) is also fixed — see `docs/FIXED_BUGS.md`. An independent review of `c384ca47..6218e1ed` (the Product Catalog context menu, the `enabled_payment_methods` encoding fix and the new Stock Adjustments feature) produced six further findings, `A-42`…`A-47`, all fixed — see `docs/FIXED_BUGS.md`; `A-48` and `A-49` below are that review's two display-only findings, deliberately deferred. `A-53` was logged from the offline-assistant final review pass on 2026-09-30. The 2026-09-30 three-package sweep added 18 further P3 findings (`A-59`, `A-60`, `A-78`, `A-90`…`A-93`, `A-100`…`A-107`, `A-108`…`A-110`). 23 findings are open in total:

#### A-59. `client/` — recalling a held reseller sale silently drops the markup and the commission, and blames the loss on a price change
- **Category:** Correctness — Money & Tax / Payments & Cart — confirmed by trace
- **Location:** `client/lib/db/schema.ts` (`held_transactions` has no reseller columns); `client/lib/hooks/use-pos-held-transactions.ts:44-78` (hold) and `:80-167` (recall); `client/lib/hooks/use-pos-cart.ts:392-397` (`clearCart` resets `isResellerSale`/`markupType`) and `:399-414` (`restoreCart`, which restores only items/discount).
- **Problem:** A reseller sale is three pieces of state: the `isResellerSale` flag, `markupType`, and the per-line `unit_price` marked up above `original_unit_price`. `handleHoldTransaction` persists none of the first two, and on recall `handleRecallTransaction` rebuilds every line from the current catalog, discarding the marked-up `unit_price` that `items_json` actually carried. `clearCart()` has already reset `isResellerSale`/`markupType`, and `restoreCart` does not restore them.
- **Concrete failure scenario:** a cashier agrees a ₦1,200 price on a ₦1,000 shelf item with a reseller agent, holds the sale to serve a walk-in, then recalls it. The cart comes back at ₦1,000/unit with "Reseller sale" off, so checkout records `is_reseller_sale = 0` and zero commission. The store loses the ₦200 markup and the agent's commission is never tracked. The only signal is a generic "prices have changed" toast, which misattributes a dropped markup to a catalog price change.
- **Why it matters:** money, and actively misleading. Recoverable only if the cashier notices, and the toast points them away from the real cause.
- **Recommended fix:** persist `is_reseller_sale` and `markup_type` on `held_transactions` (schema.ts + `SYNC_COLUMN_MIGRATIONS` + the Laravel migration + sync coverage, per `.agents/AGENTS.md` §5) and restore them through `restoreCart`. Until then, at minimum suppress the misleading price-change toast when the held cart was a reseller sale.
- **Confidence:** High. **Status:** Open.

#### A-60. `client/` — a failed hard-delete during recall leaves the held sale recallable again while telling the cashier the recall failed
- **Category:** Error Handling / State & Concurrency — confirmed by trace
- **Location:** `client/lib/hooks/use-pos-held-transactions.ts:131-167` — `clearCart()`/`restoreCart(...)` run at `:132-138`, `await remove("held_transactions", held.id)` at `:146`, both inside the same `try` whose `catch` at `:163-166` reports `toast.error("Failed to recall transaction")`.
- **Problem:** The cart mutation is committed to Zustand state *before* the row is deleted, and the two are not atomic. `remove()` can fail for reasons unrelated to the recall: `assertStoreOwnership` on a multi-store device whose active store has moved, or `assertWritable()` on a read-only (second) browser tab.
- **Concrete failure scenario:** the cashier recalls a held sale in a second browser tab (read-only). The cart is replaced with the recalled items, then `remove()` throws, the `catch` shows "Failed to recall transaction", and the dialog stays open still listing the sale. The cashier now has the recalled cart on screen, a failure message, and a held row that is still there to be recalled a second time.
- **Why it matters:** no data is destroyed, but the UI actively contradicts itself at a point where the cashier is about to take money. Low frequency.
- **Recommended fix:** delete the held row first (or at least before touching cart state), and only replace the cart once that write has succeeded.
- **Confidence:** High on the mechanics, low frequency. **Status:** Open.

#### A-78. `laravel-server/` — the web dashboard's low-stock count includes every zero-stock product with no reorder level set
- **Category:** Reporting consistency — confirmed by code trace, display-only
- **Location:** `app/Services/Web/DashboardService.php:170-180` (`getSummary`), `:399-407` (`getStats`), `:489-497` (`getWidgetSnapshot`) — three copies of `->filter(fn ($product) => $product->total_stock <= $product->reorder_level)` with no `reorder_level > 0` condition
- **Problem:** `products.reorder_level` defaults to 0, so any product with zero stock satisfies `0 <= 0` and is counted as low-stock. The client's equivalent query requires `m.reorder_level > 0` (`getStockBatchStats()`), so the server and the device answer the same question differently.
- **Concrete failure scenario:** A store imports a 2,000-product catalog and has received stock for 300 of them, leaving `reorder_level` at its default. The web dashboard, the Fleet Overview card and the Android home-screen widget all report `low_stock_alerts: 1700`, while the POS app's own low-stock list shows only the handful of products with a real reorder level actually running low.
- **Why it matters:** Display-only, but the number is the store's headline operational alert on three surfaces at once, and it is unusable at that magnitude. Same family as `A-53` on the client side.
- **Recommended fix:** Add `AND products.reorder_level > 0` to the three `lowStock` queries, matching the client, and extract them into one private helper in the same change.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-90. `laravel-server/` — a store-less registration is auto-marked email-verified even when the platform requires verification
- **Category:** Auth & Access Control / Error Handling — confirmed by code trace
- **Location:** `app/Http/Controllers/Api/Concerns/RegistersAccounts.php:135` (`$requireVerification` assigned **inside** `if ($request->filled('store_name'))`) vs. `:164` (`if ($requireVerification)`, read unconditionally)
- **Problem:** The variable is only defined on the store-creating branch. For a registration without `store_name`, PHP 8 emits an "Undefined variable $requireVerification" warning and evaluates it as null, so the `else` runs and stamps `email_verified_at = now()` — the opposite of what `require_email_verification` asks for. No verification email is sent either.
- **Concrete failure scenario:** `require_email_verification` is on platform-wide. `POST /register` with no `store_name` returns 201 with a live token and an account already marked verified — bypassing the only anti-abuse gate on self-serve signup (trial farming, signup spam) by omitting one optional field.
- **Why it matters:** the undefined-variable warning is the tell that this was never intended.
- **Recommended fix:** Hoist the `$requireVerification` computation above the `if ($request->filled('store_name'))` block. Add a feature test registering without `store_name` while the config is on. While there: `verifyEmail()` never compares `email_verification_tokens.created_at` against anything, so a verification link never expires despite the endpoint's "expired" message.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-91. `laravel-server/` — the admin panel's "Recent Stores" sync status is always "Active" (Carbon 3 signed `diffInMinutes`)
- **Category:** Frontend-adjacent reporting accuracy — confirmed by execution
- **Location:** `app/Services/Admin/AdminPlatformService.php:67` (`$minutesSinceSync = now()->diffInMinutes($store->last_sync_at);`), used at `:68-72`
- **Problem:** Carbon 3's `diffIn*()` are **signed** (`$other - $this`), the footgun `laravel-server/AGENTS.md` documents and `Store::boot()` was already fixed for. `now()->diffInMinutes($past)` is negative, so `$minutesSinceSync < 60` is always true. Verified in `tinker`: `now()->diffInMinutes(now()->subDays(30))` → `-43200.0`.
- **Concrete failure scenario:** A store that last synced a year ago appears as `sync_status: 'Active'` on the admin dashboard's Recent Stores panel. The `'Away'`/`'Inactive'` branches are unreachable for any store that has ever synced.
- **Why it matters:** Display-only, but it is the panel a founder glances at to spot stores that have stopped syncing — the single signal it exists to give is inverted. `AdminStoreMetricsService::syncHealth()` computes the same thing correctly, so the two surfaces disagree about the same store.
- **Recommended fix:** Flip the receiver: `$store->last_sync_at->diffInMinutes(now())`. A grep for `diffIn*` across the package found no other wrong-direction call.
- **Confidence:** High (confirmed by execution). **Status:** Open, logged 2026-09-30.

#### A-92. `laravel-server/` — the `limit` query param on three list endpoints is unvalidated and uncapped; `?limit=-1` is a 500
- **Category:** Data Integrity — input validation at API boundaries / Error Handling — confirmed by execution
- **Location:** `app/Http/Controllers/Api/App/StockMovementController.php:52` and `:107`, `app/Http/Controllers/Api/App/PurchaseOrderController.php:36` — all `$limit = $request->get('limit', 50);` passed straight to `paginate($limit)` with no validation rule
- **Problem:** No `integer|min:1|max:50` rule, contrary to `.agents/AGENTS.md` §8. The value reaches `paginate()` raw.
- **Concrete failure scenario:** `GET /stock-movements?limit=-1` → Laravel emits `LIMIT -1` → MySQL syntax error → uncaught `QueryException` → 500. Verified against the local MySQL dev DB. `GET /stock-movements?limit=1000000` on a mature store loads the whole ~125k-row table with `product`/`user` eager-loaded into PHP memory, exhausting the shared host's PHP memory limit.
- **Why it matters:** A trivially reachable 500 from any authenticated session, plus a self-service memory-exhaustion lever on a shared host.
- **Recommended fix:** `$request->validate(['limit' => 'sometimes|integer|min:1|max:50'])` in all three methods, defaulting to 50.
- **Confidence:** High (the 500 is confirmed by execution). **Status:** Open, logged 2026-09-30.

#### A-93. `laravel-server/` — `checkSlug` ignores archived stores while `stores.store_slug` is DB-unique, so a "free" slug permanently fails to sync
- **Category:** Data Integrity — confirmed by code trace
- **Location:** `app/Http/Controllers/Api/Web/StoreController.php:74` (`Store::where('store_slug', $slug)` — the `SoftDeletes` global scope excludes archived rows)
- **Problem:** The availability check runs against non-archived stores only, but the uniqueness constraint it is checking on behalf of is a database-level `UNIQUE` index that does not exclude soft-deleted rows (confirmed by `A-41`: "`device_id`/`store_slug` are currently DB-unique").
- **Concrete failure scenario:** Store A, slug `mypharmacy`, is archived. Store B checks `mypharmacy` → `{available: true}`, the settings UI accepts it. The resulting `stores` UPDATE in the next sync push hits the unique index and fails — and because the client keeps re-queuing it, **every subsequent push for that store row fails forever** while the local DB and the UI both show the new slug as saved.
- **Why it matters:** Silent, permanent per-row sync breakage from a normal UI action. The 6-month slug cooldown in `Store::boot()` then makes the failed attempt expensive to retry.
- **Recommended fix:** Use `Store::withTrashed()->where('store_slug', $slug)` in `checkSlug()`. If reclaiming an archived store's slug is desirable, that needs the unique index made soft-delete-aware first — the same schema change `A-41`'s gap (2) is contingent on, so decide the two together.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-108. `laravel-server/` — `GET /announcements` is outside every auth group and every named rate limiter
- **Category:** Reliability / Error Handling — confirmed by code trace
- **Location:** `routes/api.php:68` — unlike the three public routes `AGENTS.md` documents (`/system-configs/{key}`, `/support`, `/logs/client-error`), this one has no `throttle:` group, and Laravel 11 applies no `throttle:api` floor (`bootstrap/app.php` deliberately omits `throttleApi()`).
- **Problem:** `BroadcastController::index()` runs an unbounded `Broadcast::active()->get()` (no `limit`) per hit, with no rate limit anywhere in front of it. `POST /track/download` and `GET /health` are unmetered for the same reason; the webhook routes are covered by the already-open `PG-8`.
- **Concrete failure scenario:** an unauthenticated client polls `/announcements` without limit, each hit a full-table read, with nothing to throttle it.
- **Why it matters:** a cheap, unauthenticated resource-consumption lever on a shared host.
- **Recommended fix:** add it to a `throttle:public-read` group and bound the result set with `limit()`.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-109. `laravel-server/` — `BackupController::upload()` has no size cap, mime restriction, per-tenant quota or retention
- **Category:** Data Integrity / Reliability — confirmed by code trace
- **Location:** `app/Http/Controllers/Api/Web/BackupController.php:47-51` — validates only `required|file`
- **Problem:** No `max:` size cap, no mime/extension restriction, no per-tenant quota and no retention/pruning of old backups.
- **Concrete failure scenario:** any authenticated user can POST 60 max-size uploads per minute (the group's `throttle:60,1`) into `storage/app/backups/{owner}/`, filling the shared host's disk; nothing ever prunes old backups, so ordinary use also grows without bound over time.
- **Why it matters:** a self-service disk-exhaustion lever on shared hosting, worsened by having no retention even in the honest-use case.
- **Recommended fix:** add a `max:` size rule, restrict to the expected backup mime/extension, cap per-tenant storage, and add a scheduled prune of backups past a retention window.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-110. `laravel-server/` — `AdminAlertService::send()` runs synchronous SMTP inside the sync push's open transaction, so a slow mail server holds sync row locks open
- **Category:** Reliability / State & Concurrency — confirmed by code trace
- **Location:** `SyncController::touchStoreLastSyncAt()` (`:1222-1235`), called at `:655`, *before* the outer `DB::commit()` at `:657`; fires one `Mail::to(...)->send()` per configured admin email, with mail itself having no timeout either.
- **Problem:** The "no queue worker, always `->send()`" rule (correct on its own) collides here with holding a transaction: the mail send happens while the push's `lockForUpdate()` row locks are still held.
- **Concrete failure scenario:** on a store's first-ever sync, a slow or unreachable SMTP server holds the push transaction — and every row lock it took — open for the SMTP timeout, so the client's batch times out and retries against still-locked rows.
- **Why it matters:** once-per-store, but it is the one place a correct-in-isolation rule creates a concurrency hazard under a shared-hosting mail setup.
- **Recommended fix:** move the alert send outside the transaction (after commit), or defer it to a queued job/console command sweep.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-100. `web/` — platform-wide revenue and owner emails persist in `localStorage` and are only cleared on an explicit Sign Out, never on session expiry
- **Category:** Auth & Access Control / data exposure — confirmed by tracing
- **Location:** `web/lib/store/use-admin-store.ts:93-99` (`persist` with `partialize: { summary, lastFetched }`), `:86-91` (`reset()`), `web/lib/store/use-admin-auth-store.ts:146` (the only `reset()` caller), `web/lib/api/base-client.ts:275-291` (the 401 path)
- **Problem:** `admin-storage` persists the `admin/summary` payload — "platform-wide data (revenue, recent store names, owner emails)". `reset()` wipes both the state and the key, but it is called from exactly one place: `useAdminAuthStore.logout()`. The 401/refresh-failure path never touches `admin-storage`.
- **Concrete failure scenario:** an admin on a shared/borrowed machine leaves the tab open until the refresh cookie lapses, or simply closes the browser without Sign Out. The next visit bounces to `/admin/login` with no session — and `localStorage["admin-storage"]` still holds the last platform summary, readable from devtools by anyone at that keyboard, indefinitely.
- **Why it matters:** no auth bypass, and the data is a summary rather than a full dataset, but it is precisely the data the existing `reset()` call was added to protect.
- **Recommended fix:** call `useAdminStore.getState().reset()` from the 401 failure branch in `base-client.ts` and from `initSession()`'s catch — anywhere `sessionVerified` goes false.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-101. `web/` — five broadcast and coupon mutations discard the server's error message and show a fixed string
- **Category:** Error Handling — confirmed by tracing
- **Location:** `web/components/admin/views/broadcasts-tab.tsx:135,151,173,182`; `web/components/admin/marketing/coupons-manager.tsx:122,131`
- **Problem:** Each `catch`/`onError` throws away an error whose `message` has already been replaced with the server's own `message` (including a 422's first validation error).
- **Concrete failure scenario:** a super_admin composes a broadcast whose title exceeds the server's max length. The 422 names the field; the admin sees "Failed to create broadcast", has no way to tell which field is wrong, retries the identical payload, fails again. `handleToggle` is worse: a rejected toggle leaves the switch visually in its old position with no explanation.
- **Why it matters:** an admin-only action becomes unfixable without devtools.
- **Recommended fix:** `toast.error(error instanceof Error ? error.message : "<fallback>")` at all six sites.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-102. `web/` — the Global Products metrics CSV export skips `escapeCsvCell`, so a store-controlled category name can inject a spreadsheet formula
- **Category:** Data Integrity — confirmed by tracing
- **Location:** `web/app/admin/products/page.tsx:91-93` vs. `web/lib/utils.ts:24-28` (`escapeCsvCell`, used by the other two exporters)
- **Problem:** This export quotes and doubles quotes but does not neutralise a leading formula character. `metrics.mostStockedCategory?.name` is a category name originating on a store's own device, reaching the server through the sync engine — attacker-controllable free text.
- **Concrete failure scenario:** a store owner names a product category `=HYPERLINK(...)`. A super_admin exports and opens the CSV in Excel/Sheets; the cell evaluates as a formula in the admin's own spreadsheet session.
- **Why it matters:** requires an admin to open the file in a spreadsheet, but is a one-line fix against an already-solved problem in the same package.
- **Recommended fix:** import and use `escapeCsvCell`, exactly as the two sibling exporters do.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-103. `web/` — "Export CSV" exports only the current page of results, and silently does nothing when the page is empty
- **Category:** Data Integrity / Frontend — confirmed by tracing
- **Location:** `web/app/admin/stores/page.tsx:226`, `web/lib/admin-store-export.ts:7` (`if (storeList.length === 0) return;`), `web/app/admin/users/page.tsx:127-128`
- **Problem:** Both exports serialise the page currently in the table (50 rows max), under a button labelled only "Export CSV". When the current page is empty the store exporter returns before doing anything, with no toast.
- **Concrete failure scenario:** a super_admin with 400 stores clicks Export CSV to reconcile the fleet, gets 50 rows, treats the other 350 as absent. Or filters to a status matching nothing, clicks Export, gets silence.
- **Why it matters:** an export that quietly answers a different question than the one asked is a reporting-accuracy problem.
- **Recommended fix:** label it (`Export this page (N)`) and replace the empty-list early return with a toast; better, iterate the paginated endpoint or add a server-side export.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-104. `web/` — `DOWNLOAD_URL` and `WEB_APP_URL` exist in `constants.ts` but three UI files hardcode the same domains, so the env overrides do nothing
- **Category:** Frontend / configuration — confirmed, direct `.agents/AGENTS.md` §4 violation
- **Location:** `web/app/downloads/page.tsx:29-32`, `web/app/admin/downloads/page.tsx:14-17` (hardcode `https://downloads.dumosrx.com`), `web/app/layout.tsx:35,42,55` (hardcodes `https://dumosrx.com`); `web/lib/constants.ts:40` exports `DOWNLOAD_URL` with zero importers.
- **Problem:** §4 names this case literally. `release-hooks.ts:93-94` hardcodes it a fourth time in its fallback branch.
- **Concrete failure scenario:** a staging deploy sets `NEXT_PUBLIC_DOWNLOAD_URL` to a staging CDN and nothing changes — both Downloads pages still send testers to production binaries. A preview deploy of the marketing site advertises `https://dumosrx.com` as its canonical OpenGraph URL while the sitemap correctly follows `WEB_APP_URL`, so the two disagree within one build.
- **Why it matters:** no runtime failure in production, which is why it survived; the cost is a no-op configuration knob.
- **Recommended fix:** import `DOWNLOAD_URL` in both Downloads pages and in `release-hooks.ts`'s fallback, and `WEB_APP_URL` in `app/layout.tsx`'s metadata.
- **Confidence:** High. **Status:** Open, logged 2026-09-30.

#### A-105. `web/` — the checkout submit button is re-enabled before the browser finishes navigating to Paystack, so a second click mints a second payment intent
- **Category:** Payments & Cart / State & Concurrency — confirmed by tracing
- **Location:** `web/components/storefront/checkout-form.tsx:163-174` (the `paystack` branch ends with `window.location.href = data.payment_url; return;`), `:184-186` (`finally { setLoading(false); }`)
- **Problem:** Assigning `window.location.href` starts a navigation but does not stop JavaScript: the `finally` runs immediately afterwards, re-enabling the submit button for the whole interval between the assignment and the browser actually unloading the page.
- **Concrete failure scenario:** a customer on a slow mobile connection taps "Place Order" twice. Two `StorefrontPaymentIntent` rows are minted for the same cart. They pay exactly one; the other stays `pending` forever with no webhook and no sweep to retire it (`PG-2`), polluting the intent table and any future reconciliation.
- **Why it matters:** the customer is not double-charged and the order is correct, but the cost is orphaned intents and a muddied audit trail.
- **Recommended fix:** don't clear `loading` on the redirect path — set a separate `redirecting` flag the button also honours, or clear `loading` only in the non-redirect branches.
- **Confidence:** High on the mechanics. **Status:** Open, logged 2026-09-30.

#### A-106. `web/` — the checkout reprice silently deletes any cart item missing from the storefront's 300-product cap
- **Category:** Payments & Cart / Data Integrity — confirmed by tracing
- **Location:** `web/components/storefront/checkout-form.tsx:50-63` (builds `prices` from `data.products` and calls `reconcilePrices`), `web/lib/store/use-cart-store.ts:68-75` (`.filter((i) => prices[i.id] !== undefined)`), `laravel-server/app/Http/Controllers/Api/Public/StorefrontController.php:46,263` (`MAX_STOREFRONT_PRODUCTS = 300`)
- **Problem:** `reconcilePrices` treats "not in the response" as "no longer purchasable" and drops the item. But `GET /storefront/{slug}` is capped at the first 300 products by name, while `checkout()`/`priceCart()` are not capped at all — the two endpoints disagree about what is purchasable, and the cart follows the narrower one.
- **Concrete failure scenario:** a store publishes more than 300 products online. A customer adds an item near the end of the alphabetical list; new products push it past position 300. At checkout the reprice drops it silently, telling the customer only "Some prices or items in your cart changed", and they pay for a smaller order than they assembled.
- **Why it matters:** requires a store past the 300-product ceiling (`SF-P3-3`'s "well above any real online selection"), but becomes a live lost-sale path the moment that stops being true.
- **Recommended fix:** reprice from an endpoint that answers about *this cart* (a `POST /storefront/{slug}/price-cart` taking item ids), or have `reconcilePrices` distinguish "absent from a truncated list" from "genuinely unavailable" and name the removed item in the toast.
- **Confidence:** High on the mechanics; the trigger is conditional on catalogue size. **Status:** Open, logged 2026-09-30.

#### A-107. `web/` — a failed storefront checkout ships the customer's name, phone, address and email to the telemetry endpoint unredacted
- **Category:** Data Integrity / privacy — confirmed by tracing
- **Location:** `web/lib/api/base-client.ts:233-246` (`reportClientError(..., { requestData: originalRequest.data, ... })` for every non-401 error), `web/lib/api/logger.ts:60` (`sensitiveKeys` masks credentials only), `:129-162` (`reportClientError` POSTs to `/logs/client-error`, unauthenticated on non-`/admin` paths)
- **Problem:** The interceptor reports every failed request's body. `sanitizePayload` has no notion of personal data. The storefront checkout body is `{customer_name, customer_phone, customer_address, customer_email, ...}`, so any checkout failure copies real customer contact details and delivery address into the server-side client-error log, from an unauthenticated public endpoint. The same payload also sits in `window.__DRX_API_LOGS__`, readable by any script on the page.
- **Concrete failure scenario:** a store's last unit sells out mid-checkout. The 422 triggers `reportClientError`, and that customer's name, phone number and home address are written to storage meant for stack traces — no consent, no retention policy.
- **Why it matters:** no money or access is at risk, but the storefront is the only place on this origin where a member of the public types personal data.
- **Recommended fix:** either skip `requestData` entirely for public storefront routes, or extend `sanitizePayload`'s masking to a PII key list (`customer_name`, `customer_phone`, `customer_address`, `customer_email`).
- **Confidence:** High on the mechanics. **Status:** Open, logged 2026-09-30.

#### A-53. `client/` — `getLowStockAlerts()` has no `is_active` filter, so the dashboard's low-stock drill-down list can disagree with the card above it
- **Category:** Frontend / reporting consistency — confirmed, display-only
- **Location:** `client/lib/db/queries/inventory.ts` — `getLowStockAlerts()`'s `HAVING COALESCE(SUM(inv.quantity), 0) <= m.reorder_level AND m.reorder_level > 0` (around line 367) filters `products` only on `_deleted`, never on `p.is_active`. `getStockBatchStats()` (same file, ~line 459-460) requires `p.is_active = 1` for both its `low_stock_count` and `critical_stock_count` cases.
- **Problem:** the two queries answer "which products are low on stock" with different populations. A deactivated product with stock at or below its reorder level is counted by neither stats case but *is* returned by the alerts list, so a dashboard card reading "2 low on stock" can sit above a named list of five, three of them retired products nobody intends to reorder.
- **Why it matters:** display-only. Nothing writes from either query, and the stock figures themselves are correct; the cost is a card and its own drill-down contradicting each other.
- **Recommended fix:** add `AND (m.is_active = 1 OR m.is_active IS NULL)` to `getLowStockAlerts()`'s `WHERE`, matching the stats query's population, and re-check the dashboard low-stock widget's expectations in the same change. Deliberately **not** done as part of the assistant fix pass: `getLowStockAlerts()` is the dashboard's shared query and changing it is outside that pass's scope. The in-app assistant (`lib/assistant/tools/inventory-tools.ts`) works around it by no longer presenting the named list as a subset of the count.
- **Confidence:** High. **Status:** Open.

#### A-48. `client/` — the Stock Adjustments ledger switches to its desktop layout at 768px, below the project's 1024px nav breakpoint
- **Category:** Frontend / responsive convention — confirmed, display-only
- **Location:** `client/components/stock-batch/stock-adjustments-ledger.tsx:76` (`useMediaQuery("(min-width: 768px)")`), `:216` (the in-page "Adjust Stock" button's `md:hidden`)
- **Problem:** The project's stated breakpoint convention is the one `MobileBottomNav` uses — mobile chrome below `1024px`/`lg`, desktop chrome at `lg` and up (see `docs/BUG_REVIEW_PROMPT.md` → Frontend-Specific). The new ledger picks its desktop table at `768px`, so between 768px and 1024px a device shows the mobile bottom nav *and* the wide desktop table at once.
- **Why it is not simply wrong:** the ledger deliberately matches its two immediate neighbours, `stock-movements.tsx:64` and `supplier-table.tsx:68`, which both use `768px`. The drift is older and wider than this feature; changing only the new file would make it inconsistent with the screens it sits beside without making it consistent with the convention.
- **Why it matters:** cosmetic only. No write path, permission or query depends on it; the same rows and the same actions are reachable in both layouts.
- **Recommended fix:** a single sweep moving `stock-movements.tsx`, `supplier-table.tsx` and `stock-adjustments-ledger.tsx` to `1024px` together, verified against the bottom nav — not a one-file change.
- **Confidence:** High on the mechanics, low urgency. **Status:** Open, deliberately deferred out of the `c384ca47..6218e1ed` review remediation (`A-42`…`A-47`) as display-only with no write-path impact.

#### A-49. `client/` — an adjustment spanning midnight can fall outside a ledger date-range filter that should include it
- **Category:** Frontend / reporting accuracy — confirmed, display-only
- **Location:** `client/components/stock-batch/adjustment-derivations.ts` — `groupAdjustmentMovements()` (a group's `date` is the **latest** movement date in the group) and `filterAdjustmentGroups()` (compares only that single date's `slice(0, 10)` against `from`/`to`)
- **Problem:** A ledger row is one `reference_id` group, which can hold movements written either side of midnight (a long cycle count, or a slow write batch straddling 00:00). The group is filtered as though it happened entirely on its latest movement's day, so an adjustment whose movements began on day *N* is invisible to a range ending on day *N* if any one of its movements landed on *N+1*.
- **Why it matters:** the row is missing from a filtered ledger view; it is never missing from the data, and the unfiltered ledger, the stock movements it summarises and every stock figure derived from them are unaffected. Search by adjustment id or product still finds it.
- **Recommended fix:** filter on the group's date **interval** (earliest → latest movement) overlapping the requested range, rather than on a single representative date. That needs the group to carry both ends, which `groupAdjustmentMovements()` already computes one of.
- **Confidence:** High on the mechanics; frequency is low (requires a group's movements to straddle midnight). **Status:** Open, deliberately deferred out of the `c384ca47..6218e1ed` review remediation (`A-42`…`A-47`) as display-only with no write-path impact.

#### A-30. `laravel-server`/ops — production `stores` rows still hold a double-encoded `enabled_payment_methods` value
- **Category:** Data cleanup — confirmed from production (store `edc5b0f0-6f59-4ce7-8015-5f96fa311895`, device `DRX-JIMA7TL8S`)
- **Severity:** P3 — **cosmetic/hygiene only. Nothing is broken while this is open.** The code fix in `A-29` (see `docs/FIXED_BUGS.md`) heals these values *on read*, so the admin panel, the sync pull and the POS all behave correctly against an unrepaired row. This entry exists so the malformed bytes are not rediscovered from scratch by someone querying the column directly.
- **Evidence:** `SyncController::push()`'s `forceFill()` fed the client's JSON *string* to an `'array'` cast, which `json_encode()`d it a second time. Affected rows store `"[\"cash\",\"card\"]"` where they should store `["cash","card"]`.
- **This is an ops action, not a code change.** The code is already correct and defensive; this only normalises the stored bytes. A row self-corrects the next time anything writes it.
- **To find affected rows** (read-only):
  ```sql
  SELECT id, name, enabled_payment_methods
  FROM stores
  WHERE enabled_payment_methods IS NOT NULL
    AND JSON_TYPE(enabled_payment_methods) <> 'ARRAY';
  ```
- **To repair them**, prefer the model path so the new `JsonList` cast does the normalisation rather than hand-written SQL:
  ```
  php artisan tinker --execute="\App\Models\Store::whereNotNull('enabled_payment_methods')->each(function (\$s) { \$s->enabled_payment_methods = \$s->enabled_payment_methods; \$s->saveQuietly(); });"
  ```
  The apparent no-op assignment is the point: the accessor decodes the malformed value into a real array and the mutator writes it back singly-encoded. `saveQuietly()` avoids firing model events / touching `updated_at`-driven sync watermarks. Apply the same to `custom_units` if the query above (with the column swapped) returns rows.
- **Do not hand-edit the column with a raw `UPDATE`** — a raw write bypasses the cast and can reintroduce exactly the encoding this is cleaning up.

#### A-40. `laravel-server/` — `STORE_PURGED` audit row is written outside the purge transaction, and the archive/restore activity logs omit `store_id`
- **Category:** Error Handling / Data Integrity — confirmed, from the admin store-management review (2026-09-29)
- **Location:** `app/Services/Admin/AdminStoreDeletionService.php` — the `STORE_PURGED` `ActivityLog::create()` call sits after the purge's `DB::transaction()` closure returns; the `STORE_ARCHIVED`/`STORE_RESTORED` log entries don't set the `store_id` fillable on `ActivityLog`.
- **Problem:** If the post-purge audit-log insert fails for any reason, the purge itself has already committed with no audit trail of who did it or why. Separately, because the archive/restore logs carry no `store_id`, that store's own activity view (`/admin/activity?store_id=`) never shows that it was archived or restored — the event is only visible from the global admin activity feed, not the store's own history.
- **Recommended fix:** Move the `STORE_PURGED` log write inside the same transaction as the purge (or use an outbox/queued-log pattern if the log store must stay outside the DB transaction). Add `store_id` to the archive/restore `ActivityLog::create()` calls.
- **Confidence:** High. **Status:** Open, logged 2026-09-29 — not fixed in the same pass that fixed the related H1/H2/M1-M4 findings from the same review.

#### A-41. `laravel-server/` — restoring an archived store doesn't re-validate suspension state or handle a uniqueness collision
- **Category:** Auth & Access Control / Data Integrity — confirmed, from the admin store-management review (2026-09-29)
- **Location:** `app/Services/Admin/AdminStoreDeletionService.php::restoreStore()`
- **Problem:** `restoreStore()` restores the store unconditionally (beyond the owner-soft-deleted guard added in the same pass, see `docs/FIXED_BUGS.md`). Two residual gaps: (1) it doesn't re-check or re-surface the store's suspension state on restore — if the store was suspended before being archived, restoring it silently brings back a suspended store with no explicit signal to the admin that suspension is still in effect; (2) `device_id`/`store_slug` are currently DB-unique so a collision with a newly-created store while the original was archived is impossible today, but if either uniqueness constraint is ever relaxed to be soft-delete-aware (i.e. only unique among non-archived rows), `restoreStore()` would need an explicit collision check that doesn't exist yet.
- **Recommended fix:** Surface the store's suspension state explicitly in the restore confirmation/response. Add a uniqueness re-check to `restoreStore()` if/when `device_id`/`store_slug` uniqueness is ever relaxed to exclude soft-deleted rows.
- **Confidence:** Medium (gap 1 is real today; gap 2 is speculative, contingent on a future schema change). **Status:** Open, logged 2026-09-29.

#### A-26. `client/` — a stale device's legitimate second partial receipt collapses into the first one, and nothing tells the store the remainder was never booked
- **Category:** Data accuracy / Sync — confirmed, accepted trade-off of the A-9 fix
- **Location:** `client/lib/db/deterministic-id.ts` (`receiptBatchId`/`receiptMovementId`), `client/lib/db/procurement-receiving.ts` (`receivePurchaseOrder`), server-side `SyncController::push()`'s INSERT→UPDATE collapse
- **Problem:** A receipt's stock batch and stock movement are keyed on the PO line plus the balance already received against it, which is what makes a genuine double-submit from two devices collapse harmlessly into one booking. A device that has **not** pulled since another device received against the same line still computes a start balance of 0, so its receipt derives the *same* ids as the first one — even when it is a legitimate, different second partial receipt (device A receives 60, device B, offline-stale, receives 40). The server turns B's INSERTs into UPDATEs of A's rows: an `UPDATE` on `stock_batches` drops `quantity` outright and an `UPDATE` on `stock_movements` contributes no delta, so B's 40 units are never booked. B's own `quantity_received` UPDATE separately loses the version check and is dropped as `version_conflict`.
- **Why it matters:** Stock and the PO stay *consistent with each other* (which is the point — the pre-fix behaviour was a phantom doubling), but 40 units of real delivered goods exist on the shelf and not in the system, and **nobody is told**. The dropped push is a conflict the sync layer handles silently; the receiving UI shows the line as having 60 of 100 received, which looks like a normal outstanding balance rather than a lost receipt. The store discovers it at the next cycle count, if at all.
- **Evidence:** This is explicitly the accepted cost recorded in `docs/FIXED_BUGS.md` → A-9 → *"Ruling — the key is the PO line plus its already-received balance, not a separate receipt counter"* ("Losing an un-synced second receipt is strictly better than booking a phantom one"). Logged here so the silence, as distinct from the collapse, is not rediscovered from scratch. `client/__tests__/po-receive-no-double-booking.test.ts` pins the collapse behaviour itself as intended.
- **Recommended fix:** Don't change the keying — surface the loss. Carry the dropped `version_conflict` receipt through to the sync-health surface (the sync indicator / a per-PO badge on the receiving screen) so the store is told "a receipt against PO-XXXXXXXX was not applied — re-check the received quantity", which turns a silent shortfall into a one-click re-receive of the remainder. A stricter alternative — pulling the PO line before staging a receipt and refusing to stage against a balance the device knows is stale — would prevent it outright but breaks the offline-first premise of the receiving screen.
- **Confidence:** High on mechanics (both halves are pinned by existing tests and by the A-9 ruling); the frequency depends on how often two devices receive the same PO while one is offline, which is low but not zero for a multi-till store.
- **Status:** Open, logged not fixed — recorded as a known limitation of the A-9 fix, not a regression in it.

---

### Still-open findings carried from the 2026-09-26 pass (unchanged)

#### P2-1. `laravel-server/` — `FLUTTERWAVE_SECRET_HASH` must be set in production before this deploys, or every Flutterwave webhook 500s
- **Category:** Reliability / Payments — confirmed (code fails closed as designed; production `.env` state itself can't be verified from the repo)
- **Location:** `app/Http/Controllers/Api/Web/PaymentController.php` (Flutterwave webhook handler), `config/payment.php`, `.env.example`
- **Problem:** The Flutterwave webhook is authenticated against `flutterwave.secret_hash`, read from `FLUTTERWAVE_SECRET_HASH`. The variable is documented in `laravel-server/.env.example` but whether it is actually set in production `.env` cannot be verified from the repo. The handler deliberately fails closed (500, webhook rejected) if the value is empty.
- **Why it matters:** Every Flutterwave subscription payment silently stops activating the moment this deploys, until someone copies the Secret Hash from the Flutterwave dashboard into production `.env`. Paystack continues working fine, so this would only surface as isolated "customer paid via Flutterwave, subscription never activated" support tickets.
- **Recommended fix:** Confirm `FLUTTERWAVE_SECRET_HASH` is set in the production `.env` (pure ops action, zero code change). Remove this entry once confirmed.
- **Confidence:** High. **Status:** Open, intentionally skipped 2026-09-26 per user direction — ops-only.

#### P3-1. `client/` — auth bearer token kept in `localStorage` instead of an HttpOnly cookie
- **Category:** Security — confirmed, deliberately accepted
- **Location:** `client/lib/api/token-manager.ts:17-50`
- **Problem:** `auth_token` (the Sanctum bearer token) is read/written via `localStorage`. Any XSS in the client app could read it and exfiltrate a long-lived session token (Sanctum expiry is 30 days, `config/sanctum.php:49`; the client rotates after 7 days).
- **Why not fixed already:** `setToken`/`clearToken` mirror the token to native Tauri code (`lib/native/widget-bridge.ts` → Android `TokenStore`, which does use `EncryptedSharedPreferences`) so the home-screen widget can make its own authenticated requests. A real fix needs a dual-path auth design. The compensating control on the desktop/Android side is now in place: A-13's Tauri CSP shipped on 2026-09-28 (`script-src 'self' 'wasm-unsafe-eval'`, no remote or inline script, `object-src`/`frame-src 'none'` — see `docs/FIXED_BUGS.md` and `client/AGENTS.md`), so a script injection in the bundled webview can no longer load remote code to read and exfiltrate the token. It does **not** close this finding: the CSP does not cover the web/PWA build at `app.dumosrx.com`, and even in the bundled app an injected script that satisfies the policy still has same-origin `localStorage` access.
- **Status:** Open, intentionally skipped 2026-09-26 per user direction — accepted tradeoff, needs a real design project.

#### P3-2. `client/` — a long-open tab can 404 on a lazy chunk after a deploy that edits `sw.js`
- **Category:** Reliability — confirmed, accepted tradeoff
- **Location:** `client/public/sw.js` (`activate()`'s cache prune), `client/components/pwa-registrar.tsx`
- **Problem:** `activate()` prunes cache entries not in the current build's manifest. An already-open tab still running the old build's JS can lazy-load a chunk that both the prune and the new deploy have removed. `pwa-registrar.tsx`'s `controllerchange` reload and `lib/utils/chunk-error.ts`'s one-time auto-reload narrow the window but do not close it.
- **Status:** Open, intentionally skipped 2026-09-26 per user direction — accepted tradeoff; needs deploy-asset retention to close fully.

#### P3-5. `client/` — manifest `theme_color` doesn't follow dark mode
- **Category:** UX
- **Location:** `client/public/manifest.json`, `client/app/layout.tsx`
- **Problem:** `manifest.json` hardcodes `theme_color`/`background_color` to white; on Android the install splash is white for dark-mode users.
- **Status:** Open, intentionally skipped 2026-09-26 per user direction — Web App Manifest spec limitation, no action recommended.

### Still-open findings carried from the 2026-09-27 payment-gateway pass (unchanged, not yet fixed)

#### PG-1. `laravel-server/` — storefront checkout silently falls back to Flutterwave, which drops the store's payout subaccount, forces NGN, and can never be verified or refunded
- **Category:** Payments / Money-losing — confirmed
- **Location:** `app/Services/Payment/PaymentService.php:45-58` (silent fallback), `:93-129` (`initializeFlutterwave` takes no `$subaccount`/`$currency`, hardcodes `'currency' => 'NGN'`); `app/Http/Controllers/Api/Public/StorefrontController.php:414-446` (initialize), `:628` (`verifyTransaction($ref, 'paystack')` — provider hardcoded), `:113`/`:118` (refund path, same hardcoding)
- **Problem:** `initializeTransaction()` is shared between subscriptions and storefront checkout. Both gateways default enabled. Any non-2xx from Paystack's initialize call throws and silently retries on Flutterwave, which (1) drops `$subaccount`, (2) forces NGN, (3) writes `provider = 'flutterwave'` on the intent while `checkout()`'s verify and the refund path hardcode `'paystack'`.
- **Failure scenario:** A transient Paystack 5xx during storefront checkout → customer pays in full via Flutterwave → "Could not confirm your payment" → no goods, no refund, money in the platform's Flutterwave balance.
- **Recommended fix:** Pin the storefront call site to Paystack only (no silent fallback), and make `checkout()`/refund read `$intent->provider`.
- **Confidence:** High. **Status:** Open, logged 2026-09-27.

#### PG-2. `laravel-server`/`web` — storefront payments have no webhook handler and no reconciliation sweep; confirmation depends entirely on the customer's browser session surviving the redirect
- **Category:** Payments / Money-losing — confirmed
- **Location:** `web/components/storefront/checkout-form.tsx:87-126, 189-211`; `app/Http/Controllers/Api/Web/PaymentController.php:95-101` (`processSuccessfulPayment` never looks up `StorefrontPaymentIntent`); no sweep command under `app/Console/Commands/`.
- **Problem:** A genuine Paystack `charge.success` webhook for a storefront payment is discarded; the only confirmation path is the customer's own browser returning with matching `sessionStorage`.
- **Failure scenario:** Customer pays, then returns in a new tab / another device / after clearing site data, or just closes the tab. The intent stays `pending` forever — no order, no refund, settled money with zero record.
- **Recommended fix:** Add a storefront branch to the Paystack webhook handler plus a scheduled sweep for stale `pending` intents.
- **Confidence:** High. **Status:** Open, logged 2026-09-27.

#### PG-3. `laravel-server/` — an under-paying or wrong-currency subscription webhook keeps the money with no refund and no operator alert
- **Location:** `app/Http/Controllers/Api/Web/PaymentController.php`'s amount/currency-mismatch branch and `SubscriptionController::verifyPayment()`'s, both of which now route through `SubscriptionController::failTransaction()`
- **Problem:** On amount/currency mismatch the only outcome is `Log::warning` + `status = 'failed'`; no refund, no `AdminAlertService` call.
- **Recommended fix:** Attempt an automatic refund and/or fire an admin alert on mismatch.
- **Confidence:** High. **Status:** Open, logged 2026-09-27.

#### PG-4. `web/` — storefront checkout always displays ₦ regardless of the store's actual currency
- **Location:** `web/components/storefront/checkout-form.tsx:327,350,355`; `app/Http/Controllers/Api/Public/StorefrontController.php:270-282` (`show()` omits `currency`).
- **Recommended fix:** Add `currency` to the `show()` payload and format from it.
- **Confidence:** High. **Status:** Open, logged 2026-09-27.

#### PG-5. `laravel-server/` — bank-account resolve endpoint is an unbounded name-lookup oracle
- **Location:** `app/Http/Controllers/Api/Web/StorePaymentAccountController.php:70-86`; route `routes/api.php:148` (`throttle:60,1`)
- **Problem:** Ownership is checked on the store, but `account_number`/`bank_code` are free-form — any authenticated owner can resolve arbitrary account numbers to holder names at 60/min using the platform's Paystack credentials.
- **Recommended fix:** Tighter per-user limit and/or attempt counter.
- **Confidence:** Medium-High. **Status:** Open, logged 2026-09-27.

#### PG-6. `laravel-server/` — `checkout()` accepts and permanently burns a `paystack_reference` on a non-Paystack order
- **Location:** `app/Http/Controllers/Api/Public/StorefrontController.php:517, 554-577, 688`
- **Recommended fix:** Reject `paystack_reference` unless `payment_method === 'paystack'`.
- **Confidence:** Medium. **Status:** Open, logged 2026-09-27.

#### PG-7. `laravel-server/` — a Paystack subaccount can be created and then orphaned from its store row
- **Location:** `app/Http/Controllers/Api/Web/StorePaymentAccountController.php:150-168`
- **Recommended fix:** Detect/clean up an orphaned remote subaccount, or make the idempotency check query Paystack.
- **Confidence:** Medium. **Status:** Open, logged 2026-09-27.

#### PG-8. `laravel-server/` — payment webhook routes have no rate limit
- **Location:** `routes/api.php:106-107`
- **Recommended fix:** A generous named rate limit.
- **Confidence:** High. **Status:** Open, logged 2026-09-27.

#### PG-9. `laravel-server/` — only `charge.success`/`status: successful` webhook events are handled
- **Location:** `app/Http/Controllers/Api/Web/PaymentController.php:48,88`
- **Recommended fix:** Handle `refund.processed`/dispute events, or log+alert.
- **Confidence:** Medium. **Status:** Open, logged 2026-09-27.

#### PG-10. `laravel-server/` — full bank account numbers stored in plaintext on the merchant-owned `payment_accounts` table
- **Location:** `app/Models/PaymentAccount.php:26`; also synced to client SQLite, `client/lib/db/schema.ts:611-627`
- **Problem:** The store's own transfer-instructions account is stored in full server-side and on every synced device. Reads as an intentional product choice; flagged for confirmation only.
- **Confidence:** Medium. **Status:** Open — needs a product decision.

**Storefront pass index:** every `SF-*` finding is fixed or explicitly accepted (see `docs/FIXED_BUGS.md`, `docs/STOREFRONT_REVIEW.md`). `SF-P3-5` (slug enumeration) is accepted. A confirmation page / order number for the storefront customer remains unbuilt (feature, not a bug).

---

## 5. Performance and low-end-device risks

### Measured: local SQLite query cost on a one-year-old store (sql.js, desktop Node)

Synthetic dataset built from the app's own `SCHEMA_SQL` plus the migration-added `store_id`/`cashier_id` columns: 5,000 products, 8,000 batches, 2,000 customers, 50,000 sales, ~125,000 sale items and ~125,000 stock movements, 3,000 returns, 200,000 audit rows, 15,000 queued sync rows. Each row is the SQL the app actually issues. **These are desktop numbers; the same WASM engine on an entry-level Android phone is typically 5–20× slower, and on the web build every one of these blocks the main thread.**

**This pass shipped without its benchmark table** — the section was left holding a literal `BENCHMARK_TABLE_PLACEHOLDER` and the numbers were never substituted in. The indexing work (A-6) re-measured the queries it touched and those numbers are in `docs/LOCAL_DB_INDEXES.md`. The two queries A-8 covered (the per-pull `stores` prune, the boot-time orphan scan across all 26 tables) were never re-measured either; both are now skipped in their steady state rather than optimised (see `docs/FIXED_BUGS.md`), so the remaining value in benchmarking them is confirming the skip on a real low-end device.

### Other performance risks (not individually benchmarked)

- **First install download (PWA):** `precache-manifest.json` lists every file in the export — 399 URLs, ~15 MB including both 650 KB sql.js WASM binaries and every route's HTML + RSC payload — on first install (`client/AGENTS.md` already lists this as an open thread). On a metered connection this is the single largest network cost the app incurs.
- **Whole-catalog in-memory search:** `getProductsWithDetails()` returns the entire catalog with six correlated subqueries per row (fast now that `stock_batches(product_id)` and the rest of the read-path indexes exist — see `docs/LOCAL_DB_INDEXES.md`), and `product-database.tsx` fuzzy-searches it in memory (now debounced). Acceptable to ~10k products; beyond that the transform+filter+sort chain on every filter change is O(catalog) on the main thread.
- **The per-request `validateSync()` chain** (`SubscriptionService`, `SystemConfig::getVal`, `PermissionGroupSeeder::ensureSeeded`, `enforceStaffLimits`) adds ~10 queries to every push and pull request before any data is touched.
- **`getStockMovements()` with no window** loads the whole `stock_movements` table (by design, only when searching/filtering) — at ~125k rows this is a large result set held in React state regardless of indexing, since no predicate narrows it.
- **`db.export()` per write** (`docs/DATABASE_CONCURRENCY.md` §2.4) — every `execute()` outside a transaction still re-serialises the whole database and writes it to IndexedDB on the web build, and that remains the dominant long-term scaling problem for the PWA. Two of its inputs are now bounded rather than unbounded: A-20 caps `audit_logs` at a 730-day local window (it was the largest single contributor to blob growth), and A-22 makes a burst of saves cost one write of the newest image instead of N writes of N images. The per-write export itself is unchanged and would need a different persistence model (incremental/OPFS) to fix properly.

---

## 6. Offline / sync / database risks

- **`docs/DATABASE_CONCURRENCY.md` status check:** all of its short-term items are now done — `restoreDatabase()`/`resetDatabase()`/`clearDatabaseForNewStore()` call `assertWritable()`, the queued-promotion rejection is scoped away from the outer `.catch` (`tab-lock.ts:314-329`), the graceful handoff + `steal` fallback with UI exists (`tab-lock.ts:177-246`), and A-22 closed the last two (serialised, coalescing `saveDatabase()`; `pagehide`/`visibilitychange` flush gated on the writer lock). Two residual notes on the new handoff code: `resetDatabase()`/`clearDatabaseForNewStore()` still call `db.run()` directly rather than through `reserveDbSlot()`, so they can interleave with an in-flight yielding `query()`; and a stolen-from tab only learns it lost the lock via the `steal-notice` broadcast, which a frozen tab receives only on thaw — its `holdUntilTakeover()` promise is rejected by the browser first, and `writerTab` stays `true` until the notice arrives (the doc's "frozen holder that later thaws" caveat still applies).
- **Server-side row-lock duration:** `SyncController::push()` holds `lockForUpdate()` row locks for the whole outer transaction (documented at `:383-393`); with 50-change batches from several devices this is bounded but is the first place to look if "Lock wait timeout" appears in server logs.
- **Healthy (re-verified):** version-equality conflict resolution and the `versions`/`id_map` echo; the quantity-only `stock_batches` exemption; delta application floored at 0 on both sides; `markSynced` flipping `_synced`; `audit_logs` terminal-conflict settling; deferred movement deltas committed atomically with the `stock_movements` cursor; the `stores` snapshot prune only touching stores with no local data; `awaitSettledTransactions()` before reading the queue; `pull.ts` skipping rows with pending local edits and holding the cursor; `UNIQUE`-collision give-up after 5 retries; the boot-order rule (writer election before migrations).

---

## 7. Architecture and technical debt

- **One hand-rolled tenant-resolution copy remains** (carried, narrowed): `DashboardService` still hand-rolls the staff→owner lookup instead of using a shared `Request`-free helper, and `TenantScopingArchitectureTest` still scans controllers only. The second copy, in `SaleController`, went with A-19.
- **`core.ts` is ~1,640 lines and `SyncController.php` ~2,450 lines** against the project's own 350-line guideline; `getProductsWithDetails`-style "load everything, filter in React" is the norm for catalog/customers/PO lists (documented as intentional; the cutoff at which it stops being fine is not written down anywhere).
- **Two client-side sale-recording paths exist** (`recordSaleItemStock` for POS/online orders; `local-database.ts::createSale` for demo seeding only) — the comment on the second is clear, but it still writes `stock_batches.quantity` directly with a raw `UPDATE` rather than through `update()`, so a demo-seeded batch is the one batch the version model never saw.
- **Quality gates are now enforced** (A-15 fixed): `.github/workflows/checks.yml` runs `tsc --noEmit` + `vitest` + `php artisan test` and every deploy/release workflow `needs:` it. `composer audit`/`npm audit` are still not run in CI (carried from the previous pass).
- **`sw.js` still has no automated coverage** (carried) despite two cache-poisoning fixes.

---

## 8. Areas reviewed that appear healthy

- **POS sale path** (`use-pos-payment.ts`, `use-pos-payment-helpers.ts`, `recordSaleItemStock`): synchronous re-entrancy guard; one `transaction()` for sale, items, FEFO deduction, credit balance, loyalty (re-validated against the live balance), prescription status; oversell floor + alert; correlation ids; VAT computed net of discount; money rounding at storage boundaries.
- **Stock adjustments / cycle counts** (`submitStockAudit`): system quantity re-read inside the transaction; FEFO deductions; expired-batch write-off fallback; cost corrections applied to active batches only.
- **Returns**: per-batch restoration honours prior partial returns; credit-portion forgiveness capped at what the sale still owes; loyalty claw-back prorated; all in one transaction.
- **Customer debt payments**: single transaction; FIFO settlement; epsilon-safe zero detection.
- **PO receiving (single device)**: partial receipts, clamped quantities, cost/selling overrides floored at 0, `quantity_received` re-sent with `bulk_quantity`/`units_per_bulk` so the server scales it correctly.
- **CSV/XLSX import**: transactional, yields every 25 rows, duplicate detection via union-find, opening-stock movement written so server-derived quantities are correct, matched-product stock applied as an audit after the transaction (nesting deadlock avoided deliberately).
- **Multi-tab writer election** (`tab-lock.ts`): idempotent promotion, rehydrate-or-refuse, graceful takeover with `steal` fallback, every DB operation on one FIFO connection lock.
- **Server tenant scoping**: `authorizeChangeTarget`/`authorizeInsertTarget`/`resolveChangeStoreId` mirror `applyPullTenantScope` across all three of INSERT/UPDATE/DELETE (the INSERT half closed 2026-09-30, `A-77`); INSERT payloads naming a foreign `store_id` are rejected, as is an INSERT into a child table under a parent that resolves to a foreign store; `users`/`stores`/`permission_groups` payloads are allow-listed; `audit_logs` matched only by `properties->client_id` within the pushing store; DELETE against `audit_logs` rejected outright.
- **Auth**: PIN hashed (bcrypt) with lazy migration; lockout with countdown; multi-store username/PIN ambiguity fails closed; Sanctum refresh rotates tokens and only clears on a definitive 401/403; admin panel access token memory-only with a `refresh`-ability cookie; the Android widget's mirrored token uses `EncryptedSharedPreferences`.
- **Permissions**: one owner of permission-group state (`AuthContext`), corrupt rows deny rather than fall back, `useMemo` tripwire preserved.
- **Service worker**: precache is all-or-nothing on the shell, per-URL otherwise; both the navigation and asset branches refuse HTML under a non-HTML key; RSC `.txt` keys normalised; `controllerchange` reload.
- **Tauri**: vendored SQL plugin pinned to one pooled connection so `BEGIN/COMMIT` are real; WAL + busy_timeout; restore checkpoints the WAL and refuses to overwrite past a failed `close()`; updater artifacts are signed and CI fails if the signing secrets are missing.
- **Money/tax math** (`pos-calculations.ts`, `finance.ts`, `reports.ts`): consistent cent rounding, ex-VAT refunds netted correctly, prepaid expense smoothing shared by every consumer, sales-level and item-level aggregates split to avoid join fan-out (each of these was a fixed bug in `FIXED_BUGS.md` and is still correct).
- **CI/CD**: pinned action SHAs, `contents: read` where possible, queued (not cancelled) deploy concurrency, storefront output verification before FTP sync, updater-signing preflight, and (since A-15) a reusable `checks.yml` running `tsc`/`vitest`/`phpunit` that every deploy and release workflow gates on.
- **Test suites**: both green. At the time of this pass: client 1303 tests, server 469 tests. After the nine remediation batches: client 255 files / 1392 tests, server 480 tests / 1541 assertions, `tsc --noEmit` clean. (The server count is lower than mid-series because A-19 deleted the endpoints ~46 of those tests covered.)
- **Secrets hygiene (verified):** the Android release keystore, its base64 copy, the local dev SQLite file and the server's local DB file all sit in the working tree but are git-ignored and untracked (`git ls-files`/`git check-ignore` confirmed); no secrets were found in `.env.example` files or committed source. The Sentry DSN in the workflows is a public ingest key by design.

---

## What is left, and why

The 2026-09-28 pass's own remediation is complete — nothing from `A-1`…`A-25` is still open — and the 2026-09-30 three-package sweep (`client/`, `laravel-server/`, `web/`) is a fresh finding set layered on top, not a follow-up to that remediation. What remains open in this document, in priority order:

1. **This pass's remaining P1s (`A-54`, `A-94`, `A-95`)** — not yet triaged for a remediation series the way the 2026-09-28 findings were. The four `laravel-server/` P1s this pass found (`A-74`, `A-75`, `A-77`, `A-79`) were fixed on 2026-09-30 and are in `docs/FIXED_BUGS.md`; the P2 `A-76` from the same suspension-enforcement cluster is still open and is the last thing standing between an admin suspension and it biting for a multi-store account.
2. **Deferred by user direction: PG-2 then PG-1**, then **PG-3…PG-10** — the storefront webhook/reconciliation path and the gateway pinning first; still the largest previously-identified real-world money-loss surface. Explicitly excluded from the 2026-09-28 remediation series rather than overlooked.
3. **This pass's 19 P2s and 18 P3s** — see §3 and §4 above; none fixed yet, all logged 2026-09-30.
4. **Deliberate non-actions, listed here so they are not re-filed as findings next pass:** **P2-1** is a one-line production `.env` confirmation with zero code change; **P3-1** (bearer token in `localStorage`) needs a dual-path auth design project and has a compensating control in the shipped Tauri CSP; **P3-2** (stale lazy chunk after a deploy) needs deploy-asset retention to close fully; **P3-5** (manifest `theme_color`) is a Web App Manifest spec limitation with no action recommended; **A-26** is the accepted cost of A-9's deterministic receipt ids, worth closing only via a sync-health signal, never by changing the keying. **PG-10** needs a product decision, not a fix.
