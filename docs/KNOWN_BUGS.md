# DumosRx — Known Bugs & Engineering Audit

## Audit Information
- **Date:** 2026-09-26
- **Scope:** Whole monorepo — `client/` (Next.js/React/TypeScript offline-first Tauri POS app, sql.js/native-SQLite dual backend), `web/` (Next.js marketing site + store-owner dashboard stubs + platform admin panel), `laravel-server/` (Laravel 11/PHP 8.2 API, MySQL), CI/CD workflows (`.github/workflows/`).
- **General architecture observed:** Offline-first POS/inventory/pharmacy system. `client/` is the primary product surface — every screen works fully offline against a local SQLite database (sql.js/WASM in browser tabs, native SQLite via `@tauri-apps/plugin-sql` in the Tauri desktop/Android build), with a background delta sync engine (`client/lib/db/sync-engine/`) reconciling against `laravel-server`'s REST API. `web/` is a separate static-export Next.js app for marketing, store-owner auth, and a platform admin panel. Multi-tenancy on the server is enforced primarily via the `ScopesToTenant` trait plus a source-scanning `TenantScopingArchitectureTest` regression guard.
- **Areas reviewed this pass:** POS payment/cart flow, stock deduction/FEFO, procurement (PO create/receive), CSV/XLSX import, React Query cache-key/invalidation conventions, multi-store scoping, service-worker caching strategy, Laravel tenant-scoping coverage across all controller directories, `SyncController` push/pull, queued-mail/`ShouldQueue` usage against the documented "no confirmed queue worker in production" constraint, payment webhook idempotency, admin auth/cookie architecture, CI workflow security (concurrency guards, permissions, dependency audit steps).
- **Storefront pass (2026-09-26, separate):** the public customer-facing storefront (`web/app/store/[store_slug]/`, `Api/Public/StorefrontController`, the `storefront_dirty_at`/`RebuildStorefrontIfDirty` static-rebuild pipeline, storefront order fulfilment) was **excluded** from the whole-monorepo pass above and audited separately — see **`docs/STOREFRONT_REVIEW.md`** for the full writeup (1 P0, 3 P1, 6 P2, 6 P3 plus a feature-completeness review). **15 of those 16 were fixed the same day** and have moved to `docs/FIXED_BUGS.md`; only `SF-P1-2` (wiring the Paystack UI flow) remains, deferred as a business decision. Two of the review's feature items shipped with that work: per-store SEO metadata + a generated sitemap/robots.txt (#12), and `show_online` in the CSV/XLSX importer/exporter plus a bulk show/hide action (#7).
- **Areas intentionally excluded:** `node_modules/`, build output (`client/out`, `web/out`, `laravel-server/vendor`, `laravel-server/public/build`), `.git/`, `.claude/worktrees/`, `.worktrees/`, `brag-output/`, generated/minified files, lockfiles (reviewed only where a specific CVE/version claim needed checking). Areas the project's own prior audits already covered exhaustively and re-verified as still accurate here without re-deriving from scratch: payment webhook signature/idempotency, `SyncController`'s role/field allow-list, `AuthHandoffController`'s handoff-code TTL, CORS allowlist, admin token storage, XSS/`dangerouslySetInnerHTML` surface, PIN login lockout, tab-lock writer-election architecture (see `docs/DATABASE_CONCURRENCY.md`, a standalone deep-dive already covering that subsystem in detail).

This file holds **open** items only — fixed entries are removed outright, not marked done in place. See `docs/FIXED_BUGS.md` for the full changelog of everything already closed (dozens of prior review cycles: tenant isolation, payment idempotency, sync conflict resolution, float/rounding drift, PWA offline handling, cross-tab data loss, dependency CVEs, and more). See `docs/DATABASE_CONCURRENCY.md` for a dedicated deep-dive on the web/PWA build's single-writer-tab lock and sql.js persistence lifecycle — its findings are referenced, not repeated, here.

---

## Executive Summary

**Overall health:** This is an unusually well-audited codebase for its size. Prior passes (documented in `docs/FIXED_BUGS.md`) already closed the "obvious" classes of bug: tenant isolation, payment idempotency, sync conflict resolution, cross-tab data loss, dependency CVEs, and a long tail of smaller issues — several backed by regression tests specifically designed to catch the codebase's own recurring failure shape ("a fix applied to one endpoint, not mirrored onto a structurally identical sibling," per `TenantScopingArchitectureTest`).

**This pass's findings, by severity:** 1 new **P1**, 3 **P2** (2 new, 1 pre-existing), 4 **P3** (3 new, 1 pre-existing). No P0s found — no evidence of cross-tenant data leakage, broken payment idempotency, or catastrophic data-loss paths beyond what prior passes already documented and fixed or explicitly accepted.

**The separate storefront pass (`docs/STOREFRONT_REVIEW.md`) did find a P0 and three P1s**, in a surface this pass explicitly did not cover. All but one are now closed — see the storefront remediation note below.

**Remediation status (2026-09-26):** 6 of the 10 were **fixed the same day** and have moved to `docs/FIXED_BUGS.md` — P1-1 (queued mail with no confirmed worker), P2-2 (`resetData()` scoping), P2-3 + P3-4 (all-or-nothing PO receiving, fixed together as one change introducing partial receipts), P3-3 (`sw.js` catch-all cache guard), P3-6 (`getSuppliers()` store scoping).

**Storefront remediation status (2026-09-26):** 15 of the storefront pass's 16 findings were fixed or explicitly accepted the same day (`SF-P0-1`, `SF-P1-1`, `SF-P1-3`, `SF-P2-1`…`SF-P2-6`, `SF-P3-1`…`SF-P3-6`), all in `docs/FIXED_BUGS.md`. `SF-P1-2` is the single remaining storefront finding, deferred by explicit user direction.

**5 findings remain open below, all intentionally deferred by explicit user direction, not forgotten:**

| Still open | Why it's deferred |
|---|---|
| **P2-1** — `FLUTTERWAVE_SECRET_HASH` production `.env` | Pure ops action, zero code change; nothing in the repo to fix. |
| **P3-1** — auth token in `localStorage` | Accepted tradeoff; a real fix is a dual-path auth design (the native widget needs a token the webview's HttpOnly cookie can't give it), i.e. its own design project. |
| **P3-2** — chunk-load-after-deploy race | Accepted tradeoff; fully closing it needs deploy-asset retention. Existing mitigations (`controllerchange` reload, one-time `ChunkLoadError` auto-reload) already cover the common case. |
| **P3-5** — manifest `theme_color` under dark mode | No action recommended; the Web App Manifest spec has no conditional-syntax equivalent. |
| **SF-P1-2** — Paystack UI flow unreachable | Enabling real online payment collection is a business decision, not a routine bug fix; scheduled as its own round, with a real refund path (`SF-P2-4`'s remaining half) as its prerequisite. |

**Most important remaining risk:** P2-1, purely because it's an unverifiable-from-the-repo production `.env` state that fails closed (every Flutterwave webhook 500s, Paystack unaffected, so it surfaces only as isolated "customer paid, subscription never activated" tickets).

**Major performance/architecture concerns:** none newly found beyond what `docs/DATABASE_CONCURRENCY.md` already covers in depth (the web/PWA build's whole-blob `db.export()`-per-write persistence model, and the writer-lock's lack of a steal/handoff mechanism). Client-side React Query cache-key hygiene, POS double-submit protection, FEFO stock-deduction correctness, and CSV/XLSX import edge cases were all found to be in solid, already-hardened shape (see "Areas That Appeared Healthy").

---

## Findings

### P0 — Critical

None open. (The storefront pass's `SF-P0-1` — a transient `/storefront-slugs` failure deleting every live storefront — was fixed 2026-09-26; see `docs/FIXED_BUGS.md`.)

---

### P1 — High

None open from the whole-monorepo pass. (P1-1 — two mail paths depending on an unconfirmed queue worker — was fixed 2026-09-26; see `docs/FIXED_BUGS.md`.)

One open P1 from the storefront pass. Its two siblings (`SF-P1-1`, `SF-P1-3`) were fixed 2026-09-26 — see `docs/FIXED_BUGS.md`.

#### SF-P1-2. `web/` — storefront online payment is fully built and hardened server-side but unreachable from any client
- **Category:** Feature correctness / dead code — confirmed
- **Location:** `web/components/storefront/checkout-form.tsx:76-81`, `:186-205` vs. `app/Http/Controllers/Api/Public/StorefrontController.php:236-321`
- **Summary:** `CheckoutForm` offers only `in_store` and `transfer`; the string `paystack` and any call to `/checkout/initialize` appear nowhere in `web/`. The whole two-step payment-intent flow (plus its dedicated limiter and 14 of 29 storefront tests) is unreachable, while OpenAPI/`AGENTS.md`/route comments all read as though it is live. Backend needs no change — this is a UI wiring gap.
- **Details:** `docs/STOREFRONT_REVIEW.md` → SF-P1-2. **Confidence:** High.
- **Status:** **Open, deliberately deferred 2026-09-26 per explicit user direction** — enabling real online payment collection is a business decision, not a routine bug fix, and is scheduled as its own round. Every other storefront finding was fixed that day; this one was left untouched on purpose, and nothing in those fixes makes Paystack reachable. `SF-P2-4`'s refund path (a real provider refund call, currently only logged and flagged) must land with it.

---

### P2 — Medium

#### P2-1. `laravel-server/` — `FLUTTERWAVE_SECRET_HASH` must be set in production before this deploys, or every Flutterwave webhook 500s
- **Category:** Reliability / Payments — confirmed (code fails closed as designed; production `.env` state itself can't be verified from the repo)
- **Location:** `app/Http/Controllers/Api/Web/PaymentController.php` (Flutterwave webhook handler), `config/payment.php`, `.env.example`
- **Problem:** The Flutterwave webhook is authenticated against `flutterwave.secret_hash`, read from `FLUTTERWAVE_SECRET_HASH`. The variable is documented in `laravel-server/.env.example:122` but whether it is actually set in production `.env` cannot be verified from the repo. The handler deliberately fails closed (500, webhook rejected) if the value is empty.
- **Why it matters:** Every Flutterwave subscription payment silently stops activating the moment this deploys, until someone copies the Secret Hash from the Flutterwave dashboard into production `.env`. Paystack continues working fine, so this would only surface as isolated "customer paid via Flutterwave, subscription never activated" support tickets — easy to miss.
- **Reproduction/Failure scenario:** A customer completes a Flutterwave payment; the webhook fires against a production `.env` still missing `FLUTTERWAVE_SECRET_HASH`; the handler 500s and the subscription is never activated, with no visible error to the customer or admin until they report it.
- **Recommended fix:** Confirm `FLUTTERWAVE_SECRET_HASH` is set in the production `.env` (pure ops action, zero code change). Remove this entry once confirmed.
- **Confidence:** High (code path verified; production env state is the only unverifiable part, by design of the audit).
- **Status:** Open, intentionally skipped 2026-09-26 per user direction — ops-only, no code to change.

---

### P3 — Low

#### P3-1. `client/` — auth bearer token kept in `localStorage` instead of an HttpOnly cookie
- **Category:** Security — confirmed, deliberately accepted
- **Location:** `client/lib/api/token-manager.ts:7-25`
- **Problem:** `auth_token` (the Sanctum bearer token) is read/written via `localStorage`, not an HttpOnly cookie. Any XSS in the client app could read `localStorage.auth_token` and exfiltrate a long-lived session token, versus an HttpOnly cookie which JS can't read at all.
- **Why not fixed already:** `setToken`/`clearToken` call `mirrorAuthToken`/`clearMirroredAuthToken` (`client/lib/native/widget-bridge.ts`), handing the raw token to native Tauri (Rust) code so the home-screen widget can make its own authenticated background HTTP requests entirely outside the webview. An HttpOnly cookie can't be mirrored to native code, so swapping to one would break the widget's live data rather than just change a storage mechanism. A real fix needs a dual-path auth design (webview uses a cookie for its own requests; native widget code gets a separate, narrowly-scoped token via its own exchange) — a genuine architecture change, not a quick fix.
- **Recommended fix:** Scope as its own design project — `client/` auth/storage architecture work, not a quick patch.
- **Confidence:** High.
- **Status:** Open, intentionally skipped 2026-09-26 per user direction — accepted tradeoff, needs a real design project.

#### P3-2. `client/` — a long-open tab can 404 on a lazy chunk after a deploy that edits `sw.js`
- **Category:** Reliability — confirmed, accepted tradeoff
- **Location:** `client/public/sw.js` (`activate()`'s cache prune)
- **Problem:** `activate()` prunes cache entries not in the current build's manifest, to stop unbounded cache growth across deploys. This only runs when `sw.js`'s own bytes change, but when it does, an already-open tab still running the *old* build's JS can lazy-load a chunk that both the cache prune and the new deploy's server files have already removed — a chunk-load error, while fully online, until reload. `pwa-registrar.tsx`'s `controllerchange` reload mitigates the common case, but a chunk requested in the brief window between prune and reload could still race it. (`client/lib/utils/chunk-error.ts`'s one-time auto-reload-on-`ChunkLoadError` mechanism, documented in `client/AGENTS.md`, further narrows the user-visible impact of this window but doesn't close it.)
- **Recommended fix:** No action needed beyond what's already in place unless this becomes a reported user complaint; would require deploy-asset retention to fully close.
- **Confidence:** High.
- **Status:** Open, intentionally skipped 2026-09-26 per user direction — accepted tradeoff.

#### P3-5. `client/` — manifest `theme_color` doesn't follow dark mode
- **Category:** UX
- **Location:** `client/public/manifest.json:8`, `client/app/layout.tsx:66-68`
- **Problem:** `manifest.json` hardcodes `theme_color`/`background_color` to `#ffffff`; `layout.tsx`'s `viewport.themeColor` correctly switches to black under `prefers-color-scheme: dark`. On Android, the manifest's value drives the install splash screen, so a dark-mode user briefly sees a white splash before the dark app renders.
- **Recommended fix:** The Web App Manifest spec has no conditional-syntax equivalent for this; left as the light-mode default since it also matches the manifest's own `background_color`. No action recommended unless the spec gains conditional support.
- **Confidence:** High.
- **Status:** Open, intentionally skipped 2026-09-26 per user direction — spec limitation, no action recommended.

---

### Storefront pass — remaining open findings (index only)

Everything else the storefront pass found (`SF-P0-1`, `SF-P1-1`, `SF-P1-3`, `SF-P2-1`…`SF-P2-6`, `SF-P3-1`…`SF-P3-6`) was fixed or explicitly accepted on 2026-09-26 — see `docs/FIXED_BUGS.md` for each, and `docs/STOREFRONT_REVIEW.md` for the original writeups with what remains scoped out of each fix.

**`SF-P1-2` is the only open storefront finding**, listed under P1 above. Two follow-ups it carries with it, neither a finding in its own right:

| Follow-up | Where | Why it's tied to SF-P1-2 |
|---|---|---|
| A real provider refund call | `OnlineOrderController::flagRefundRequired()`, `Services/Payment/PaymentService` | Cancelling a paid order currently logs a warning and notifies the store; `PaymentService` has no refund method, and one fabricated against an untested provider API would be worse than none. Harmless while only `in_store`/`transfer` are reachable; a money-handling gap the moment Paystack is. |
| A confirmation page / order number for the customer | `web/components/storefront/checkout-form.tsx` | Feature #2 in the review: the server returns the created order and the client throws it away. Not a bug, but the first thing a real paying customer will ask for. |

---

## Security Findings (index)

| Finding | Severity | Status |
|---|---|---|
| P2-1 — `FLUTTERWAVE_SECRET_HASH` production `.env` status unverified | Medium | Open (needs prod confirmation) |
| P3-1 — auth token in `localStorage`, not HttpOnly cookie | Low | Open (accepted tradeoff) |
| SF-P3-5 — `/storefront-slugs` enumerates every customer with an online store | Low | Accepted 2026-09-26 (product call, not a defect; a build token would make a rotated secret break every `web/` deploy — see `docs/FIXED_BUGS.md`) |

(`SF-P1-3` — no rate limit on the public storefront reads or on order placement — and `SF-P2-1` — storefront products/stock scoped by owner rather than store — were both fixed 2026-09-26; see `docs/FIXED_BUGS.md`.)

Areas specifically audited and found **clean** (this pass and prior passes, re-verified where re-checked): webhook signature verification (constant-time, fail-closed) and idempotent lock-guarded payment activation; `SyncController::sanitizeUserSyncPayload`'s role/field allow-list; `AuthHandoffController`'s single-use/60s-TTL/high-entropy handoff codes; CORS allowlist (no wildcard, explicit origins); admin access-token storage (memory-only, never in `localStorage`); XSS surface (no `dangerouslySetInnerHTML` on user-controlled content — the two call sites found, `client/components/ui/chart.tsx:97` and `web/components/smartsupp-widget.tsx:85`, both render static/config-driven CSS, not user input); rate limiting on auth/session-refresh/handoff endpoints (`routes/api.php`'s `throttle:*` middleware groups — **note:** the storefront was the exception, with only the `/checkout/initialize` step throttled; the public reads and order placement got their own named limiters on 2026-09-26, see SF-P1-3 in `docs/FIXED_BUGS.md`); path traversal in `.github/downloads-index.php`; secrets in `.env.example` files and git history; PIN login lockout; every controller under `Api/*`, `Api/App/*`, `Api/Web/*`, `Api/Admin/*`, `Api/Public/*` that touches a tenant-owned model, per `TenantScopingArchitectureTest`'s source-scanning guard (re-verified: `admin`/`web`-side controllers not on the allow-list — `StaffController`, `StoreController`, `BackupController`, `PaymentController`, `SubscriptionController`, `SessionController`, `FeedbackController`, `NotificationController`, `BroadcastController` — either use `ScopesToTenant` or don't reference the `TENANT_OWNED_MODELS` list at all).

---

## Performance & Low-End Device Risks

No new N+1 query patterns, unbounded pagination, or missing-index issues were confirmed this pass in the areas re-reviewed (`SaleController`, `SyncController` push/pull, dashboard aggregation queries, stock/purchase-order controllers) — foreign-key columns are auto-indexed via Laravel's `foreignUuid()->constrained()`. One item was sampled but not exhaustively traced: `SyncController::pull()`'s per-table result sets and `SaleController::topProducts`'s `groupBy` join were not fully verified to have a LIMIT/cursor on every pulled table — flagged as a follow-up, not a confirmed finding.

On the client side, POS product-grid rendering, cart derived-state memoization, and the FEFO stock-deduction path were all found already hardened against O(catalog-size) re-render/recompute costs (see `docs/FIXED_BUGS.md`'s 2026-09-25 "memoize the POS product grid" entry). The dominant remaining performance/architecture concern for growing datasets is the one already covered in depth by `docs/DATABASE_CONCURRENCY.md`: the web/PWA build's `saveDatabase()` re-serializes the *entire* SQLite database (`db.export()`) on every write, which scales with total local database size rather than with the size of any individual write — see that document's §2.4 and §3 for the full analysis and the recommended OPFS-based long-term fix. That analysis is not repeated here.

---

## Architecture & Technical Debt

- **The recurring failure pattern across this codebase's history is "fix (or pattern) applied to one endpoint/method, not mirrored onto a structurally identical sibling."** `TenantScopingArchitectureTest` guards the tenant-scoping instance of this pattern mechanically, but only for **controllers** — it doesn't scan `app/Services/`, which is exactly where this pass found a fresh instance (P2-2, `DashboardService::resetData()`, since fixed).
- **Still open as technical debt, not as a bug:** `app/Http/Controllers/Api/App/SaleController.php` and `app/Services/Web/DashboardService.php` both hand-roll the "staff → owner" resolution inline (`Store::where('user_id', ...)->pluck('id')`, `User::whereIn('store_id', ...)`), repeated across several methods, instead of using the shared `ScopesToTenant` trait — which they *can't* use directly, since it takes a `Request` and these are service/controller methods taking a bare `$user`. P2-2's fix added a fourth copy of the lookup (a private `DashboardService::tenantOwnerId()`) rather than removing the duplication, deliberately keeping that fix contained. Two follow-ups worth scoping on their own: (a) extract the resolution into one shared, `Request`-free helper both can call, and (b) extend `TenantScopingArchitectureTest`'s scan to service classes that resolve tenant scope inline. Note also that `DashboardService`'s three read-only methods (`getSummary`/`getStats`/`getWidgetSnapshot`) still resolve by `$user->id` — lower-stakes than the destructive `resetData()` and so not changed in that pass, but the same latent shape.

---

## Testing Gaps

- **`composer audit`/`npm audit` are not run in CI** (re-confirmed this pass — none of the five workflows in `.github/workflows/` invoke either). Add an audit step (non-blocking initially, since some advisories currently have no fix) to at least surface new ones going forward.
- **`client/public/sw.js` has no test coverage of any kind** — no unit, integration, or E2E test exercises the install/precache, navigation, or stale-while-revalidate paths, despite two separate content-type cache-poisoning bugs having been found and fixed in it (the navigation path on 2026-09-23, the catch-all branch on 2026-09-26). Every fix in that file so far has been verified by reading and by `node --check` only.
- A queue-worker assumption is invisible to the Laravel test suite by construction (Laravel's testing config runs queues synchronously regardless of production), which is part of why P1-1 went unnoticed. Now moot for mail specifically — every mail call site is synchronous `->send()` — but it still means any *future* `ShouldQueue` dispatch would pass CI and silently no-op in production. A test asserting no `->queue(` call sites exist, in the spirit of `TenantScopingArchitectureTest`, would close that mechanically; not written.
- P2-2's fix is covered (`tests/Feature/DashboardResetScopingTest.php`), but nothing covers the same class of gap in `DashboardService`'s three read-only methods — see Architecture & Technical Debt above.

---

## Areas That Appeared Healthy

- **POS payment flow** (`client/lib/hooks/use-pos-payment.ts`, `use-pos-payment-helpers.ts`): double-submit re-entrancy guard (`processingPaymentRef`), FEFO stock deduction with oversell tracking and fallback-batch handling, loyalty redemption re-read/rollback, correlation-id grouping for multi-row audit trails — all already hardened per `docs/FIXED_BUGS.md` and re-verified this pass with no new gaps found.
- **CSV/XLSX import** (`client/lib/utils/product-import-export.ts` + `lib/utils/spreadsheet-io.ts`): negative-value clamping, blank-row handling (fixed from an earlier truncation bug), `.xls` rejection with an actionable message, formula-error-cell handling — all verified intact. The one real gap this pass missed and the storefront pass found (no `show_online` column at all, so a bulk import could never publish anything online) was closed 2026-09-26, along with the file split that keeps both halves under the 350-line limit.
- **React Query cache-key/invalidation conventions** (`client/lib/query-keys.ts`): store/user-scoping is structural (built into the `resource()` factory itself, not left to per-call-site discipline), closing off an entire class of potential cross-store cache leak.
- **Multi-store cart/session hygiene**: `clearPOSCartStorage()` is wired into both `auth-context.tsx` (logout) and `store-context.tsx` (store switch), preventing a stale cart from surviving either transition.
- **Payment webhooks, subscription resolution, staff role-privilege checks** (server side): idempotent lock-guarded activation, amount/currency verification, role-privilege-ceiling checks mirrored across `store()`/`update()`, grace-period-aware subscription resolution — all read in full this pass with no new issues found, consistent with prior audit passes' conclusions.
- **Rate limiting**: auth, session-refresh and handoff endpoints all sit behind named `throttle:*` middleware groups in `routes/api.php`. **Corrected twice on 2026-09-26:** this entry originally also claimed the storefront-checkout endpoints were covered, when only `POST /storefront/{slug}/checkout/initialize` was (Laravel 11 dropped `throttle:api` from the default `api` group and `bootstrap/app.php` still doesn't call `throttleApi()`). `SF-P1-3`'s fix added `throttle:storefront-order` to order placement and `throttle:storefront-read` to both public GETs the same day, with `StorefrontThrottleTest` — which deliberately does not disable `ThrottleRequests` — guarding all four.
- **Tenant scoping breadth**: every controller directory (`Api/*`, `Api/App/*`, `Api/Web/*`, `Api/Admin/*`, `Api/Public/*`) was re-checked against `TENANT_OWNED_MODELS`; the only gap found was the service-class instance in P2-2 (since fixed), not a controller-level regression.

---

## Recommended Remediation Order

Everything actionable from this pass was completed on 2026-09-26 and has moved to `docs/FIXED_BUGS.md`, in this order: **P1-1** (queued mail → synchronous `->send()`), **P2-2** (`resetData()` tenant-owner scoping, plus its regression test), **P3-3** (`sw.js` catch-all cache guard), **P3-6** (`getSuppliers()` store scoping), then **P2-3 + P3-4** as one change (PO partial receipts: client + server schema, sync mapping, receiving logic, and every status-aware UI surface).

The storefront pass's findings were then worked through the same day: 15 of its 16 are closed (`SF-P0-1`, `SF-P1-1`, `SF-P1-3`, `SF-P2-1`…`SF-P2-6`, `SF-P3-1`…`SF-P3-6`), leaving only `SF-P1-2`. What remains, in the order it should be picked up:

0. **`SF-P1-2`** (wire the built-and-tested Paystack flow into the storefront UI) — deferred by explicit user direction as a business decision, with `SF-P2-4`'s real refund call as its hard prerequisite. Also needs `STOREFRONT_REBUILD_TOKEN` set on both sides for `SF-P2-3`'s rebuild confirmation to engage (ops action, no code).


1. **P2-1** (`FLUTTERWAVE_SECRET_HASH`) — the only item with a real failure mode still live. Pure ops/deploy confirmation, zero code risk; shouldn't wait on anything. Delete the entry once confirmed set in production `.env`.
2. **P3-1** (auth token in `localStorage`) — needs its own design project (dual-path auth: cookie for the webview, a separate narrowly-scoped token for the native widget). Revisit if an XSS finding ever lands.
3. **P3-2** (chunk-load-after-deploy race) and **P3-5** (manifest `theme_color`) — accepted as-is; P3-2 needs deploy-asset retention to close fully, P3-5 needs a Web App Manifest spec change. Revisit only if either becomes a reported user complaint.

All four were explicitly skipped this round by user direction — they are deferred, not overlooked. The same is true of `SF-P1-2`.

**Follow-ups this pass created or left behind** (not findings, but the natural next steps): extract the shared staff→owner tenant resolution so `SaleController`/`DashboardService` stop repeating it, extend `TenantScopingArchitectureTest` to service classes, add any test coverage at all to `sw.js`, add `composer audit`/`npm audit` to CI, and get product judgement on the partial-receipt UX questions noted in the PO entry in `docs/FIXED_BUGS.md` (over-delivery, cancelling an outstanding balance, editing a partially-received PO).

**Follow-ups the storefront remediation (2026-09-26) left behind**, none of them findings: a real provider refund call (tied to `SF-P1-2` above — `PaymentService` has no refund method and one was not fabricated against an untested API); a paginated online-order history view now that `index()` is capped at 50; raising `throttle:storefront-read`'s 120/min ceiling, or giving the build pipeline a token, before the platform passes roughly 50 live storefronts (the static build spends ~2 requests per store from one runner IP); setting `STOREFRONT_REBUILD_TOKEN` on both sides so `SF-P2-3`'s rebuild-confirmation loop engages (ops, no code); and `Api/Public/StorefrontController.php` is now **638 lines** against `.agents/AGENTS.md` §4's 350-line limit — it was already 566 before this work and its OpenAPI attributes are most of the bulk, but `priceCart`/`storeProducts`/`availableQuantity`/`checkAvailability` are business logic sitting in a controller and belong in `app/Services/` per that file's Controller/Service rule. Deliberately not attempted alongside the correctness fixes; worth scoping on its own, with the 34 existing storefront tests as the safety net.
