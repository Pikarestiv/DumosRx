# DumosRx — Known Bugs & Engineering Audit

## Audit Information

- **Date of this pass:** 2026-09-30 (supersedes and extends the 2026-09-28 whole-monorepo pass, the 2026-09-27 payment-gateway pass and the 2026-09-26 pass, all of whose still-open findings are preserved below under their original IDs).
- **Scope:** Whole monorepo, swept in three parallel package-scoped passes — `client/` (Next.js 16 / React 19 offline-first Tauri POS app, sql.js in the browser, native SQLite via the vendored `@tauri-apps/plugin-sql` fork on desktop/Android), `laravel-server/` (Laravel 12 / PHP 8.2 API, MySQL on shared hosting), `web/` (static-export marketing site, store-owner dashboard stubs, platform admin panel, public storefront) — each walked category by category against `docs/BUG_REVIEW_PROMPT.md`'s checklist.
- **Methodology:** critical flows were traced end to end rather than pattern-searched, following `docs/BUG_REVIEW_PROMPT.md`'s checklist categories: POS sale → FEFO deduction → sync push → server apply → pull on a second device; stock adjustments and cycle counts; PO create/receive (standard and immediate); CSV/XLSX import; offline writes and reconnect; multi-tab writer election and promotion; multi-store scoping (client resolver and server `applyPullTenantScope`/`authorizeChangeTarget`); PIN login, permission groups, Sanctum token lifecycle; the licensing/clock-tamper guard; database init, migrations, backup/restore; PWA service worker; Tauri startup and updater; returns, loyalty, credit/debt; reports/BI queries over a synthetic mature dataset; store suspension/archival enforcement; admin revenue reporting; storefront checkout failure paths; admin nav role-filtering.
- **Validation performed (read-only):** `npx tsc --noEmit` in `client/` — clean; `npx vitest run` in `client/` — 346 files / 2255 tests passing (one known non-fatal vitest teardown flake, exit 0); `npm run test:schema` in `client/` — completes with warnings (`A-58`, since fixed — see `docs/FIXED_BUGS.md`); `php artisan test` in `laravel-server/` — 581 passed / 1890 assertions, 0 failures; `npx tsc --noEmit` in `web/` — clean; `npx vitest run` in `web/` — 9 files / 35 tests passing; `npx eslint` in `web/` — 0 errors, 16 warnings. A synthetic-dataset query benchmark from the 2026-09-28 pass, run against the app's own `SCHEMA_SQL` in sql.js (the exact engine the web/PWA build runs on), remains the current measurement — see the Performance section for the numbers and the caveat that a desktop Node run is 5–20× faster than the low-end Android hardware this product targets.
- **Excluded:** `node_modules/`, `.git/`, `.claude/worktrees/`, `.worktrees/`, `brag-output/`, `refs/`, `client/out/` (inspected only for export size), `client/playwright-report/`, `client/test-results/`, `laravel-server/vendor/`, `laravel-server/public/build/`, generated Tauri bindings under `src-tauri/gen/android/.../generated/`, lockfiles, the `dumosrx-release-key.jks`/keystore files (present in the working tree, flagged below), and `docs/superpowers/` plan/spec history. Areas covered exhaustively by previous passes and re-verified without re-derivation: payment webhook signature/idempotency, `SyncController` role/field allow-lists, handoff-code TTL, CORS allowlist, admin token storage, PIN lockout, and the writer-lock architecture documented in `docs/DATABASE_CONCURRENCY.md` (whose short-term recommendations were checked against current code — see §6).

This file holds **open** items only. Fixed entries move to `docs/FIXED_BUGS.md` and are removed here outright, per `.agents/AGENTS.md` §2.

---

## Executive Summary

**Overall health.** The codebase is unusually well-defended for its size: the sync engine's conflict model, the single-writer tab lock, tenant scoping on the server and the money math have all been through several review-and-fix cycles, and all three packages' test suites pass cleanly. The 2026-09-28 pass's own remediation is complete (nothing from `A-1`…`A-25` is still open). This 2026-09-30 pass is a fresh whole-monorepo sweep, split into three parallel package-scoped reviews (`client/`, `laravel-server/`, `web/`). All seven of its P1 findings — the store-suspension case-sensitivity no-op and its two compounding gaps (`A-74`, `A-75`, `A-77`), the referral-credit reservation gap that could permanently strand a paid subscription (`A-79`), the lost stock-delta on an interrupted pull (`A-54`), and the two `web/` findings around the public Downloads page and a failed storefront checkout (`A-94`, `A-95`) — were remediated the same day and moved to `docs/FIXED_BUGS.md`, along with ten of the `laravel-server/` P2s (`A-76` — suspension being a coin flip for a multi-store owner — plus `A-80`…`A-87` and `A-89`).

**Findings this pass, by severity:** 0 **P0**, 0 **P1**, 5 **P2**, 8 **P3** — 13 open findings from the 2026-09-30 three-package sweep plus a same-day follow-up spot-check, **all in `web/`** (`A-96`…`A-107`, `A-113`; every `client/` and `laravel-server/` finding from this pass is fixed, see `docs/FIXED_BUGS.md`; see each section for the exact IDs), plus the still-open carried findings below: `A-26`, `A-28`, `A-30`, `A-40`, `A-41`, `A-48`, `A-49`, `A-53` from the 2026-09-28/29 passes, and `P2-1`, `P3-1`, `P3-2`, `P3-5`, `PG-1`…`PG-10` from the two earliest passes — all preserved verbatim below. `A-113` was logged from a same-day follow-up check (the admin sidebar's role coverage); that check's other two claims, `A-112` (no loss/shrinkage metric, fixed) and `A-111` (bulk-import movement-type conflation, retracted as a duplicate of the already-fixed `A-52`), are resolved.

**Most important risks, in order:**

1. **PG-2 / PG-1 (carried)** — storefront online payments still have no webhook/reconciliation path and can settle via the wrong gateway; still the largest deferred, user-acknowledged body of work in this document (see `A-95`/`A-105` in `docs/FIXED_BUGS.md` for the two newly found and now-fixed `web/`-side behaviours immediately around this same hole).

**The major performance concern** that remains is the whole-blob `db.export()` persistence model already analysed in `docs/DATABASE_CONCURRENCY.md`; the rest of §5's list (boot-time scans, the license-guard sync gate on launch, the 5-second sync-queue poll) is fixed.

---

## 1. Critical findings (P0)

None found this pass. No cross-tenant read/write path, payment double-charge, or unguarded data-destroying path was identified beyond what previous passes closed. (The storefront pass's `SF-P0-1` remains fixed.)

---

## 2. High-priority findings (P1)

`A-1` (the pull page cap that made a >100,000-row table un-syncable) and `A-3` (the server's materialised id lists and offset paging behind it) were fixed together — see `docs/FIXED_BUGS.md` and `docs/SYNC_PULL_PAGINATION.md`. `A-27` (the crash-log amplification loop that was live in production on 2026-09-29, Sentry `DUMOSRX-CLIENT-1B`/`17`/`19`/`1A`/`1G`/`1M`) was found and fixed in the same pass — see `docs/FIXED_BUGS.md`. All seven P1s the 2026-09-30 three-package sweep found (`A-54`, `A-74`, `A-75`, `A-77`, `A-79`, `A-94`, `A-95`) were remediated the same day — see `docs/FIXED_BUGS.md` (and `docs/SYNC_PULL_PAGINATION.md`/`docs/DOWNLOADS_MANIFEST.md` for the two with dedicated design docs). One finding is open:

#### A-28. `laravel-server`/ops — production's `feedback` table is missing the `occurrence_count` column its migration adds
- **Category:** Deployment / schema drift — confirmed from production (Sentry `DUMOSRX-CLIENT-11`, 567 events, 4 users)
- **Severity:** P1 — every `audit_logs` and `feedback` push carrying the column is rejected by the server, so those devices never sync those tables at all.
- **Evidence:** the migration exists in the repo but was never run against the production database; the server rejects the push with `Unknown column 'occurrence_count' in 'field list'`, the queue item burns its five attempts and is reported as stuck.
- **This is an ops action, not a code change** — run the pending migrations on production. No code fix applies. The client-side amplification this used to trigger is closed by `A-27`; what remains is only that the affected rows still never sync until the migration runs.

---

## 3. Medium-priority findings (P2)

`A-9` (receiving the same purchase order from two devices booked the delivery twice) is fixed — see `docs/FIXED_BUGS.md`, as are the four `client/` P2s this sweep found (`A-55` permission-group identity on an account switch, `A-56` the over-allocated mixed-payment credit split, `A-57` the untraced online-order fulfilment, `A-58` the schema-sync verifier) and all eleven `laravel-server/` P2s (`A-76`, `A-80`…`A-89`). Five findings are open, all `web/`:

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

#### A-113. `web/` — `platform_admin`/`agent` have no sidebar items for functionality their own role is already permitted to use
- **Category:** Frontend / missing functionality — confirmed by tracing
- **Location:** `web/components/admin/admin-sidebar.tsx:29-94` (`sidebarItems` — items with no `roles` field default to `super_admin`-only; only "Register Store" at `:48` and "My Referrals" at `:55` opt in `platform_admin`/`agent`), `laravel-server/routes/api.php:179-220` (admin routes, almost all `role:super_admin`) vs. the two routes gated only by `permission:grant_trials` (`POST /admin/stores/{id}/grant-trial`, `/activate-plan`) and `GET /admin/stores` (`role:super_admin`-only, no scoped equivalent).
- **Problem:** `platform_admin`/`agent` see exactly two sidebar items. That mostly matches their intended scope (they're not meant to see platform-wide revenue, global settings, etc.), but two concrete gaps exist where the *server* already permits an action these roles are meant to perform and the *nav* gives them no way to reach it: (1) `grant-trial`/`activate-plan` are reachable by these roles per their route middleware, but there is no page or nav item for either action anywhere in `web/`; (2) after using "Register Store" to onboard a merchant, there is no way for a `platform_admin`/`agent` to see a list of the stores they've registered — `GET /admin/stores` is `role:super_admin`-only with no scoped ("stores I registered") variant.
- **Why it matters:** the backend already models a permission tier below `super_admin` for onboarding/field-agent work, but the frontend only ever built the `super_admin` surface plus one registration form, so that tier's own sanctioned actions are currently unreachable through the UI. Not a security issue (nothing is exposed that shouldn't be) — it's a product/functionality gap surfaced while reviewing the sidebar's role coverage.
- **Recommended fix:** decide the intended scope for `platform_admin`/`agent` (probably: see and manage only the stores they personally registered) and build (a) a scoped "My Stores" list backed by a new `GET /admin/stores?registered_by=me`-style endpoint or filter, and (b) a page/action for `grant-trial`/`activate-plan` gated the same way the routes already are. Add both to `sidebarItems` with the correct `roles`.
- **Confidence:** High on the gap; the right scope for a fix is a product decision, not purely technical. **Status:** Open, logged 2026-09-30 (follow-up spot-check, not the original three-package sweep).

---

## 4. Low-priority findings (P3)

`A-25` (`npm run test:schema` was broken) is fixed — see `docs/FIXED_BUGS.md`. Its "add to CI" half is intentionally not done; see that entry's Ruling. `A-29` (a double-encoded `stores.enabled_payment_methods` blanked the admin Store Details page in production on 2026-09-29) is fixed — see `docs/FIXED_BUGS.md`; `A-30` below is its residual ops cleanup, which does not block it. `A-31` (the same-family follow-up in `client/`) is also fixed — see `docs/FIXED_BUGS.md`. An independent review of `c384ca47..6218e1ed` (the Product Catalog context menu, the `enabled_payment_methods` encoding fix and the new Stock Adjustments feature) produced six further findings, `A-42`…`A-47`, all fixed — see `docs/FIXED_BUGS.md`; `A-48` and `A-49` below are that review's two display-only findings, deliberately deferred. `A-52` (the same bulk-import/adjustments-ledger conflation a later follow-up spot-check briefly mis-logged again as a new finding, `A-111` — corrected: `A-111` never existed as an open finding, `A-52` already covers it) is fixed — see `docs/FIXED_BUGS.md`. `A-53` was logged from the offline-assistant final review pass on 2026-09-30. The 2026-09-30 three-package sweep's P3s and the follow-up's `A-112` are all fixed except the eight `web/` findings below — see `docs/FIXED_BUGS.md` for what shipped for `A-59`, `A-60`, `A-78`, `A-90`…`A-93`, `A-108`…`A-110` and `A-112`. Eight findings are open, all `web/`:

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

1. **All seven of this pass's P1s are fixed** (`A-54`, `A-74`, `A-75`, `A-77`, `A-79`, `A-94`, `A-95`), each in its own worktree branch with TDD and merged into `dev` on 2026-09-30 — see `docs/FIXED_BUGS.md` for what shipped in each, as is the `A-76` P2 from the same suspension-enforcement cluster (`CheckAccountStatus` only checking one of a multi-store owner's stores) and nine further `laravel-server/` P2s (`A-80`…`A-87`, `A-89`), remediated on 2026-09-30 in the same way.
2. **Deferred by user direction: PG-2 then PG-1**, then **PG-3…PG-10** — the storefront webhook/reconciliation path and the gateway pinning first; still the largest previously-identified real-world money-loss surface. Explicitly excluded from the 2026-09-28 remediation series rather than overlooked.
3. **This pass's 10 remaining P2s and 20 P3s** — see §3 and §4 above; nothing else fixed yet beyond the P1s and the ten `laravel-server/` P2s named above.
4. **Deliberate non-actions, listed here so they are not re-filed as findings next pass:** **P2-1** is a one-line production `.env` confirmation with zero code change; **P3-1** (bearer token in `localStorage`) needs a dual-path auth design project and has a compensating control in the shipped Tauri CSP; **P3-2** (stale lazy chunk after a deploy) needs deploy-asset retention to close fully; **P3-5** (manifest `theme_color`) is a Web App Manifest spec limitation with no action recommended; **A-26** is the accepted cost of A-9's deterministic receipt ids, worth closing only via a sync-health signal, never by changing the keying. **PG-10** needs a product decision, not a fix.
