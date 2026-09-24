# Known Bugs & Engineering Review

Deep adversarial review of the whole monorepo (`client/`, `web/`, `laravel-server/`, CI/CD), conducted 2026-09-24 via six parallel scoped passes (laravel auth/authz/payments/tenancy, laravel business logic/data/tests, client offline-sync engine, client UI/state/POS flows, web admin panel/auth handoff, CI/CD/config/dependencies), each cross-checked against `docs/FIXED_BUGS.md` to avoid re-reporting closed items and to catch regressions. Every finding below was traced to concrete code, not inferred from patterns; several were independently re-verified against the actual model/controller source before being included here.

This file holds **open** items only — see `docs/FIXED_BUGS.md` for the changelog of everything already fixed, including the extensive 2026-09-21/22/23 sweeps this review builds on.

---

## Executive Summary

**Overall health:** This is an unusually well-audited codebase for its size — `docs/FIXED_BUGS.md` documents dozens of prior Opus/Sonnet review cycles that already closed the "obvious" classes of bug (tenant isolation, payment idempotency, sync conflict resolution, float/rounding drift, PWA offline handling). This pass confirms most of that prior work holds up under a fresh adversarial read. It also found that the review process itself has a gap: several fixes were applied to one code path but not mirrored onto a structurally identical sibling path, and two live-crashing/live-exploitable bugs sat undetected because they're in less-traveled, undertested corners of `laravel-server/`. **The four Critical findings from this pass (staff IDOR + role-privilege ceiling, stock-batch/movement/PO 500s + tenant under-scoping, hardcoded seeder password) are now fixed and tested as of 2026-09-24** — see `docs/FIXED_BUGS.md`.

**Most important remaining risks:**
- Two browser/PWA tabs open against the same install can silently destroy each other's entire local database (committed sales, stock movements, sync queue) with no error surfaced — inherent to the current sql.js + whole-blob IndexedDB persistence design, not a small patch (**C5**, still open).
- ~~The admin-session-cookie hardening documented in `web/AGENTS.md` (2026-08-26 redesign) has partially regressed~~ — **fixed 2026-09-24** (was H1/M2/M3, the same "fix on one endpoint, not mirrored to its sibling" pattern the staff-IDOR bug had) — see `docs/FIXED_BUGS.md`.
- Two production deployment/ops actions remain pending and are pure blockers, not code work: the 2026-09-23 migrations still need running on production (**C6**), and `FLUTTERWAVE_SECRET_HASH` needs confirming in production `.env` (**H4**).

**Testing maturity:** Strong where it's been exercised — `TenantIsolationTest.php`, `SaleControllerTest.php`, the client's 794-file vitest suite, and repeated fixture-based reconciliation tests catch real regressions. Coverage was uneven going into this review: `StockBatchController`, `StockMovementController`, and `PurchaseOrderController` had **zero** feature tests (exactly where two of this review's Critical bugs lived), and `TenantIsolationTest.php` had a specific gap (store_id *reassignment* of an already-visible row, vs. rejecting an initially-invalid store_id) that let the `StaffController::update` IDOR through undetected. Both gaps are now closed — see `docs/FIXED_BUGS.md` — but the underlying lesson (coverage tends to exist for the *initial* creation-time check of a class of bug and not its update-time sibling) is worth keeping in mind when reviewing new endpoints.

**Performance observations:** No systemic scalability problems found. The two concrete issues are localized: an unmemoized POS product grid re-rendering the full catalog on every cart mutation (worse on low-end Android tablets, the project's actual deployment target for the "grocery/supermarket" vertical), and unpinned dependency versions carrying known Next.js CVEs.

**Security observations:** The security posture is generally mature (constant-time webhook signature checks, row-locked idempotent payment activation, single-use time-limited handoff codes, a real allow-list on the sync privilege-escalation path). The gaps found are consistently the same shape: **a security fix applied to one endpoint was not mirrored onto a structurally identical sibling** (`store()` vs `update()` in `StaffController`; `login()` vs `refresh()`/`impersonateStore()` in the admin cookie flow). This is a process risk, not a one-off mistake — worth a lint/architecture-test rule (see Recommended Engineering Improvements).

---

## Critical Findings

> **C1–C4 fixed 2026-09-24** (cross-tenant staff IDOR + role-privilege ceiling; stock-batch/movement/purchase-order 500s + tenant under-scoping; hardcoded seeder password) — see `docs/FIXED_BUGS.md`. Renumbered below; C2/C3's original "500s on every call for real users" impact claim was corrected during the fix: neither `client/` nor `web/` actually calls any of the five affected endpoints today (verified by grep), so this was live-breaking, publicly-reachable API surface rather than a user-facing outage. C1 also turned up a second, more interesting bug while writing its regression test: the literal reproduction was coincidentally already blocked by an unrelated query filter, which itself needed separating out so the real fix wasn't dead code — see the `FIXED_BUGS.md` entry for detail.

### C5. Two browser/PWA tabs can silently destroy each other's committed data (multi-tab last-write-wins)
- **Category:** Reliability / Architecture — **Confirmed** by code reading (relies on the sql.js/IndexedDB design, not empirically reproduced in a live browser)
- **File:** `client/lib/db/core.ts` (`initDatabase()`, `saveDatabase()`, `execute()`, `transaction()`)

**What is wrong:** On the web/PWA (non-Tauri) build, the local SQLite database is an in-memory sql.js instance held in module-scope JS state — one independent, private copy **per browser tab**. Every write persists via `saveDatabase()`, which does a full `db.export()` and overwrites a single shared IndexedDB key wholesale, with no version/CAS check, no cross-tab lock (`navigator.locks`), and no `BroadcastChannel`/`storage`-event coordination anywhere in `lib/db/`. `isSyncInProgress`/`transactionQueue` are also module-level, so they only serialize writes *within one tab*.

**How it fails in production:** Tab A processes a POS sale; its transaction commits and `saveDatabase()` persists an image including the new sale, line items, stock deduction, and `_sync_queue` entries. Tab B (a manager's dashboard tab open at the same time, or the same install left open twice, or even just its own periodic background sync tick) — whose in-memory copy predates Tab A's sale — calls `saveDatabase()` next and unconditionally overwrites the shared IndexedDB blob with its own, sale-less image. Tab A's entire committed, audit-logged sale (row, line items, stock movements, and its now-unreachable `_sync_queue` entries — so it can never even be pushed to the server after the fact) is permanently gone the next time any tab reloads. This is ordinary usage (two tabs open on one machine), not adversarial timing, and it produces no error, toast, or retry path — unlike every other data-loss scenario already documented and mitigated in this file.

**Recommended fix:** Architecture-level, not a one-line patch: acquire the Web Locks API (or a `BroadcastChannel`-based leader election) around `initDatabase()`/every write path so only one tab is ever the writer; other tabs become read-only views that re-hydrate on a signal, or proxy writes to the elected leader. At minimum, detect the multi-tab condition and block/warn the second tab rather than silently corrupting shared state.

**Tests to add:** A harness simulating two independent `core.ts` instances sharing a mocked IndexedDB store — write via "tab A," then via "tab B" without B re-reading A's save, and assert whether A's write survives (currently, no test exercises cross-tab/cross-instance persistence at all).

**Priority:** Scope as a dedicated project (matches the existing "accepted tradeoff, needs a real architecture change" pattern already used for the localStorage-token item below) rather than a quick fix — but it should be scheduled, since it is a silent, no-warning data-loss path for an app whose defining premise is "every screen works fully offline" and data must survive to sync later.

---

### C6. `laravel-server/` — 10 migrations from 2026-09-23 not yet run on production *(carried forward, unresolved — confirmed still accurate by this review)*
- **Category:** Reliability / Deployment — **Confirmed**
- **File:** `laravel-server/database/migrations/2026_09_23_*.php` (10 files)

These add `stores.receipt_logo_position`, `activity_logs.correlation_id`, `purchase_order_items.{selling_price,cost_price_override,lot_number}`, `stock_movements.status`, `stores.{storefront_dirty_at,store_slug_changed_at}`, `sales.markup_type`, `stores.{staff_can_request_transfers,markup_sales_enabled}`, `stores.timezone`, and widen `stock_movements.movement_type` from an incomplete MySQL `ENUM` to `VARCHAR`. All verified safe (additive `ALTER TABLE`, `--pretend` reviewed, applied cleanly to a throwaway sqlite db and the local dev DB, full `php artisan test` suite green). This review's CI/CD and business-logic passes independently re-confirmed all ten are additive/idempotent and match the migrations currently on disk.

**Until these are deployed and run on production**, any device syncing a change to those columns gets `SQLSTATE[42S22]: Unknown column` and the push silently fails for that row — it stays in the client's local `_sync_queue` retrying forever, never lost, but never reaching the server either.

Production migrations run through a protected route, not direct `artisan` access (no SSH on the shared host): `GET https://<production-domain>/migrate-db?key=<MIGRATE_DB_KEY>`. Deploy this branch first, then hit that route. **Remove this entry once confirmed run.** (The hardcoded-seeder-password issue that same route also re-runs on every hit is now fixed — see `docs/FIXED_BUGS.md` — so this is now a pure deploy/ops action with no remaining code risk.)

---

## High Priority Findings

> **H1 fixed 2026-09-24**, along with M2/M3 below (the same admin-session-cookie hardening regression) — see `docs/FIXED_BUGS.md`.
>
> **H2 fixed 2026-09-24** — see `docs/FIXED_BUGS.md`.

### H3. Known-vulnerable Next.js versions in `client/` and `web/`; `xlsx` has unpatched prototype-pollution/ReDoS CVEs
- **Category:** Dependency / Security — **Confirmed** (via `npm audit`)
- **File:** `client/package.json` (`next@15.2.4`), `web/package.json` (`next@16.1.4`)

`npm audit` (client, production deps): 6 vulnerabilities (5 high, 1 critical) — `next@15.2.4` carries ~19 advisories fixed only by upgrading to `15.5.26`, including an unauthenticated RCE on Windows-hosted servers and an unauthenticated RCE in the Image Optimization API via AVIF. `xlsx *` — prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9), both **no fix available** upstream.

`npm audit` (web, production deps): 7 vulnerabilities (1 moderate, 5 high, 1 critical) — same advisory family, fixed only by `next@16.3.6`.

**Why it matters:** `client/`'s static export runs as the actual in-store POS app; the RCE-class Next.js advisories are mostly build-time/dev-server risk for a statically-exported app, not live-attack-surface risk in production for `client/` specifically. `web/`'s Next.js **is** a live deployed server, and several of its advisories (cache poisoning, SSRF via rewrites, CSRF bypass) are directly relevant there. `xlsx` is used for bulk product import/export (per `docs/FEATURE_LIST.md`), a plausible path for untrusted spreadsheet input in both apps.

**Recommended fix:** Bump `next` to `15.5.26` (client) / `16.3.6` (web). For `xlsx`, since no upstream fix exists, evaluate migrating the bulk-import/export path to a maintained alternative (e.g. `exceljs`) rather than suppressing the advisory.

**Priority:** Schedule the Next.js bumps soon (test the build/export pipeline after — this project pins majors deliberately); track `xlsx` as a longer-term migration.

---

### H4. `laravel-server/` — `FLUTTERWAVE_SECRET_HASH` must be set in production before this deploys, or every Flutterwave webhook 500s *(carried forward, unresolved)*
- **Category:** Reliability / Payments — **Confirmed** (code fails closed as designed; production `.env` state itself can't be verified from the repo)
- **File:** `app/Http/Controllers/Api/Web/PaymentController.php` (Flutterwave webhook handler), `config/payment.php`, `.env.example`

The Flutterwave webhook was previously (wrongly) authenticated against `encryption_key`; it now correctly compares against `flutterwave.secret_hash`, read from `FLUTTERWAVE_SECRET_HASH`. This review confirmed the variable **is** documented with a clear comment in `laravel-server/.env.example`, but whether it has actually been set in production `.env` can't be verified from the repo. Deliberately fails closed (500, webhook rejected) if empty — safe, but means **every Flutterwave subscription payment silently stops activating** the moment this deploys, until someone copies the Secret Hash from the Flutterwave dashboard into production's `.env`. Not evident from the app itself (Paystack continues working fine); would surface as "customer paid via Flutterwave, subscription never activated" support tickets. **Remove this entry once confirmed set on production.**

---

## Medium Priority Findings

> **M1, M2, M3 fixed 2026-09-24** — see `docs/FIXED_BUGS.md`. M1 (role-privilege ceiling) was fixed alongside C1 (same function, `StaffController::update()`); M2/M3 (admin-session-cookie inconsistencies) were fixed alongside H1 (same underlying cookie-hardening regression).

### M4. Impersonation "End Session" is expected to fail in ordinary use — 60s handoff-code TTL vs. minutes-long real sessions
- **Category:** Reliability / Bug — **Highly Likely**
- **File:** `client/components/dashboard/impersonation-banner.tsx`, `AuthHandoffController` (`TTL_SECONDS = 60`)

The return-hop handoff code is minted once, at impersonation start, and expires after 60 seconds — but the UI holds onto it in `localStorage` for the entire impersonation session, which realistically lasts minutes. Every admin who impersonates for longer than a minute and clicks "End Session" hits the expired-code branch and is bounced to a fresh login instead of returning smoothly. This is the expected outcome of normal use, not an edge case. **Fix:** either mint a fresh return-mechanism at click time rather than relying on session-start-time state, or keep the admin's own tab open in parallel so returning is just navigating back (which works via the independent HttpOnly cookie regardless of the handoff code).

> **M5 fixed 2026-09-24** — see `docs/FIXED_BUGS.md`.

### M6. `assertStoreOwnership`'s legacy-row "claim" write runs outside the atomic transaction it precedes
- **Category:** Bug / Data Integrity — **Highly Likely**
- **File:** `client/lib/db/base-helpers.ts` (`update()`/`softDelete()` calling `assertStoreOwnership()` before `transaction(writeUpdate)`/`transaction(writeSoftDelete)`)

For a legacy (`store_id IS NULL`) row, the ownership "claim" (`UPDATE ... SET store_id = ?`) commits as its own bare statement before the actual edit's transaction runs. A crash between the two leaves the row claimed with the intended edit lost — and a second store later touching the same row is then rejected as belonging to someone else, even though nothing visibly changed from their perspective. **Fix:** fold the claim into the same transaction as the write/queue/log.

### M7. FTP-deploying CI workflows have no `concurrency:` guard
- **Category:** Reliability — **Confirmed** (`grep -n concurrency .github/workflows/*.yml` returns nothing)
- **File:** `.github/workflows/deploy-client.yml`, `deploy-web.yml`, `deploy-backend.yml`, `deploy-dev.yml`, `release.yml`

`SamKirkland/FTP-Deploy-Action` diffs against a local state file to decide what to upload/delete, then writes it back. Two overlapping runs against the same `server-dir` (two quick pushes, or a manual dispatch racing a push-triggered run) race that read-modify-write, potentially interleaving uploads or clobbering the state file so a later deploy thinks files are already in sync when they aren't. **Fix:** add `concurrency: { group: deploy-client-${{ github.ref }}, cancel-in-progress: false }` to each workflow.

### M8. `chmod -R 777 storage bootstrap/cache` in both backend deploy workflows
- **Category:** Security — **Confirmed**
- **File:** `.github/workflows/deploy-backend.yml`, `deploy-dev.yml`

Deploys `laravel-server/storage/` (sessions, logs, uploads) and `bootstrap/cache/` (compiled config/routes) world-writable on shared hosting, where file permissions are one of few isolation mechanisms between tenants on the box. **Fix:** use `775` with correct group ownership, scoped only to subdirectories that actually need write access.

### M9. Transitive Symfony CVEs in `laravel-server`
- **Category:** Dependency — **Confirmed** (via `composer audit`)
- **File:** `laravel-server/composer.json`

`symfony/routing` carries two medium CVEs (dot-segment URL-generation bypass; route-requirement regex bypass → off-site `//host` URL injection) most relevant to this app's redirect/auth-handoff URL generation for emails and links. `symfony/yaml` has three low-severity DoS advisories. **Fix:** `composer update symfony/routing symfony/yaml symfony/process`.

### M10. Major-version dependency drift between `client/` and `web/` during an active code-migration effort
- **Category:** Architecture — **Confirmed**
- **File:** `client/package.json`, `web/package.json`

`next` 15.2.4 vs 16.1.4, `sonner` ^1.7 vs ^2.0 (breaking toast API changes), `tailwind-merge` ^2.5 vs ^3.4 (breaking config API), `eslint` ^8 vs ^9, several `@radix-ui/*` packages one-to-two majors apart. The README explicitly frames `web/`'s dashboard code as being actively ported into `client/` in phases — a component copy-pasted between the two during that migration compiles fine (each app has *a* version) but can behave subtly differently with no compiler-level warning. **Fix:** align these specific shared UI-layer packages to the same major version across both apps before porting more dashboard code.

### M11. `client/` — auth bearer token kept in `localStorage` instead of an HttpOnly cookie *(carried forward — accepted tradeoff, confirmed unchanged by this review)*
- **Category:** Security — **Confirmed**, deliberately accepted
- **File:** `client/lib/api/token-manager.ts:7-25`

`auth_token` (the Sanctum bearer token) is read/written via `localStorage`, not an HttpOnly cookie. Any XSS in the client app could read `localStorage.auth_token` and exfiltrate a long-lived session token, versus an HttpOnly cookie which JS can't read at all. The admin web session already avoids this (see `web/`'s hardened design, itself reviewed in H1/M2/M3 above).

Previously investigated and rejected as a quick fix: `token-manager.ts`'s `setToken`/`clearToken` call `mirrorAuthToken`/`clearMirroredAuthToken` (`client/lib/native/widget-bridge.ts`), which hand the raw token to native Tauri (Rust) code so the home-screen widget can make its own authenticated background HTTP requests entirely outside the webview. An HttpOnly cookie is by definition unreadable by JS, so it can't be mirrored to native code — swapping to one would break the widget's live data rather than just change a storage mechanism. A real fix means a dual-path auth design (webview uses a cookie for its own requests; native widget code gets a separate, narrowly-scoped token via its own exchange) — a genuine architecture change, not a quick fix. Left as-is; revisit as a scoped project alongside **C5** (both are client/ auth/storage architecture work).

### M12. `client/` — a long-open tab can 404 on a lazy chunk after a deploy that edits `sw.js` *(carried forward, confirmed unchanged by this review)*
- **Category:** Reliability — **Confirmed**, accepted tradeoff
- **File:** `client/public/sw.js` (`activate()`'s cache prune)

`activate()` prunes cache entries not in the current build's manifest, to stop unbounded cache growth across deploys. This only runs when `sw.js`'s own bytes change, but when it does, an already-open tab still running the *old* build's JS can lazy-load a chunk that both the cache prune and the new deploy's server files have already removed — a chunk-load error, while fully online, until reload. This mirrors how a plain Next.js app with no service worker already behaves on deploy (the SW was incidentally providing extra resilience here). `pwa-registrar.tsx`'s `controllerchange` reload mitigates the common case by reloading onto the new build as soon as the new SW takes control, but a chunk requested in the brief window between prune and reload could still race it. This review's client UI/state pass confirmed the current code still matches this description exactly, with no regression.

### M13. `client/` — existing Pro/Enterprise stores lose the "Reseller sale" POS row on deploy, silently *(carried forward — confirm whether already deployed)*
- **Category:** UX / Deployment — **Confirmed** as designed; open only pending confirmation of rollout communication
- **File:** `client/lib/hooks/use-feature-gate.ts` (`isMarkupSalesEnabled`), `stores.markup_sales_enabled`

New store-level toggle, default `0` (explicit, deliberate product requirement). Any store already on Pro/Enterprise and actively using reseller-commission sales before this ships finds the POS cart's "Reseller sale" row gone the moment it deploys, with no in-app notice, until the owner finds and enables the new toggle in Settings → Register Configs. Not a bug to fix — the default was explicitly requested — but still needs a release note / proactive heads-up to any store already using the feature, so it doesn't read as broken. **Remove this entry once that communication has gone out** (this is a coordination/communication follow-up, not a code fix).

---

## Low Priority Findings

### L1. `deploy-ftp` job in `release.yml` uses unpinned action tags while the rest of the file pins to commit SHAs
- **File:** `.github/workflows/release.yml:198,280,290` — `actions/checkout@v4` and `SamKirkland/FTP-Deploy-Action@v4.3.4` (a mutable tag, and an older version than the SHA-pinned `v4.3.5` used elsewhere). A moved/compromised tag would silently execute different code with access to FTP credentials pushing to the public downloads/updater feed. **Fix:** pin to the same commit SHAs already used elsewhere in the repo.

### L2. No `permissions:` block on the four FTP-only deploy workflows
- **File:** `deploy-client.yml`, `deploy-web.yml`, `deploy-backend.yml`, `deploy-dev.yml` — implicit `GITHUB_TOKEN` scope, unused by these jobs but a missing defense-in-depth layer against a compromised transitive action. **Fix:** add `permissions: contents: read` (or `{}`).

### L3. Tauri backend's `query()`/`execute()` has no corruption-retry, unlike the heavily-hardened sql.js path — currently safe, but the reason isn't documented in `core.ts`
- **File:** `client/lib/db/core.ts`. The asymmetry is currently fine because the vendored `tauri-plugin-sql` fork caps the pool at `max_connections(1)` specifically to make this safe — but that fact lives only in the vendored plugin's own comment, not in `core.ts` or `AGENTS.md`. A future upgrade of `@tauri-apps/plugin-sql` back to a stock (non-vendored) build could silently drop that cap and reopen the exact race sql.js's retry logic exists for. **Fix:** cross-reference `src-tauri/vendor/tauri-plugin-sql`'s `max_connections(1)` in a `core.ts` comment or in `AGENTS.md`'s Database section.

### L4. `POST /app/sales` accepts no discount/tax fields (latent, currently unreferenced)
- **File:** `laravel-server` `SaleController::store`. Every sale created through this REST path would get `discount_amount`/`tax_amount` left null while `subtotal`/`total_amount` are the raw undiscounted sum — but this endpoint is currently defined in `client/lib/api/client.ts` and never actually called from anywhere in `client/`. Not an active production bug; flagged so it isn't silently wired up later without addressing the gap.

### L5. A handful of query invalidations bypass the `queryKeys` factory
- **File:** `client/components/dashboard/multi-store-card.tsx`, `header-store-switcher.tsx`, `transaction-details-dialog.tsx` call `invalidateQueries({ queryKey: [...] })` with hand-written array literals instead of the factory. Functionally correct today (TanStack Query's default prefix matching still works), but renaming a key in `query-keys.ts` would silently break these call sites with no compiler error.

### L6. `client/` — manifest `theme_color` doesn't follow dark mode *(carried forward, unchanged)*
- **File:** `client/public/manifest.json:8`, `client/app/layout.tsx:66-68`. `manifest.json` hardcodes `theme_color`/`background_color` to `#ffffff`; `layout.tsx`'s `viewport.themeColor` correctly switches to black under `prefers-color-scheme: dark`. On Android, the manifest's value drives the install splash screen, so a dark-mode user briefly sees a white splash before the dark app renders. The Web App Manifest spec has no conditional-syntax equivalent for this, so it can't be fully fixed without picking one scheme's splash over the other — left as the light-mode default since it also matches the manifest's own `background_color`.

---

## Security Findings (index)

| Finding | Severity | Status |
|---|---|---|
| Cross-tenant staff reassignment IDOR | Critical | **Fixed** 2026-09-24 |
| Hardcoded super-admin password in production seeder | Critical | **Fixed** 2026-09-24 |
| `/refresh` mints weak admin-session cookie, bypasses device gate | High | **Fixed** 2026-09-24 |
| H4 — `FLUTTERWAVE_SECRET_HASH` production `.env` status unverified | High | Open (needs prod confirmation) |
| `StaffController::update()` role has no privilege ceiling | Medium | **Fixed** 2026-09-24 |
| Inconsistent `drx_admin_session` cookie issuance across 3 paths | Medium | **Fixed** 2026-09-24 |
| Impersonation overwrites admin's own session cookie | Medium | **Fixed** 2026-09-24 |
| M8 — `chmod 777` on deployed Laravel storage/cache | Medium | Open |
| M9 — transitive Symfony CVEs (routing/yaml) | Medium | Open |
| M11 — auth token in `localStorage`, not HttpOnly cookie | Medium | Open (accepted tradeoff) |
| H3 — Next.js high/critical CVEs; unpatched `xlsx` CVEs | High | Open |
| L1 — unpinned action tag in `release.yml`'s FTP job | Low | Open |
| L2 — missing `permissions:` block on 4 deploy workflows | Low | Open |

Areas specifically audited and found **clean** (no regression, matches documented prior fixes): webhook signature verification (constant-time, fail-closed) and idempotent lock-guarded payment activation; sync push's role/field allow-list (`SyncController::sanitizeUserSyncPayload`); `AuthHandoffController`'s single-use/60s-TTL/high-entropy handoff codes and fragment-based transport; CORS allowlist (no wildcard, explicit origins); admin access-token storage (memory-only, never in `localStorage`); XSS surface in `web/` (no `dangerouslySetInnerHTML` on user content); path traversal in `.github/downloads-index.php` (no user input reaches any filesystem path); secrets in `.env.example` files and git history (none found); PIN login lockout (already fixed, still correct).

---

## Performance & Scalability

- **M5-adjacent: unmemoized POS product grid** (`client/components/pos/pos-product-list.tsx`) — `POSProductCard` is a plain function component; the parent recomputes `cartQuantityMap`, several `Set`s, and grouped/sorted product arrays as new references on every render, defeating any future `React.memo` and guaranteeing every visible card re-renders on any cart mutation. On a large catalog (supermarket/grocery vertical, explicitly supported per `AGENTS.md`, no windowing on the "all products" grid), this is effectively **O(catalog size)** re-render work per cart tap, on hardware (Android tablets) where that's most visible. **Fix:** `useMemo` the derived maps/arrays keyed on `cart`/`filteredProducts`; wrap `POSProductCard` in `React.memo`; consider virtualization above a few hundred SKUs.
- **H3-adjacent:** outdated `next` versions carry cache-poisoning and SSRF-via-rewrites advisories relevant to `web/`'s live server (separate from the RCE-class findings already listed as security issues).
- No N+1 query patterns, unbounded pagination, or missing-index issues were found in the areas reviewed (`SaleController`, stock/purchase-order controllers, dashboard aggregation queries) — foreign-key columns are auto-indexed via Laravel's `foreignUuid()->constrained()`, and prior fixes (documented in `FIXED_BUGS.md`) already addressed several store-scoping-driven full-table-scan risks.

---

## Architecture & Maintainability

- **The recurring failure pattern across this review's Critical/High findings is "fix applied to one endpoint, not mirrored to a structurally identical sibling"**: `StaffController::store()` vs. `update()`, `AuthController::login()` vs. `refresh()`/`impersonateStore()`, and `ProductController`/`CustomerController`'s tenant-scoping fix vs. `StockBatchController`/`StockMovementController`/`PurchaseOrderController` — all three now fixed, see `FIXED_BUGS.md`. **What's wrong:** each original fix closed one instance of a class of bug without a mechanism to prevent the same class recurring in a sibling file. **Why it matters:** `laravel-server/tests/Feature/ArchitectureTest.php` already exists specifically to keep one such convention (Controller/Service separation) honest via a test rather than review alone — the same approach could catch this pattern. **Recommended change (still open):** add an architecture test asserting every controller under `Api/App/*`/`Api/Web/*` that queries a tenant-owned table (`stock_batches`, `stock_movements`, `purchase_orders`, `products`, etc.) either `use`s `ScopesToTenant` or is on an explicit allow-list — this would have caught the stock-batch/movement/PO scoping bug mechanically, and would catch the next instance of this pattern automatically instead of needing another manual review pass. All three now-fixed instances also picked up a shared trait as part of their fix (`EnforcesStaffOwnership`, `ManagesAdminSessionCookie`) specifically so they can't drift apart again — the architecture test would still be valuable as a backstop for the *next* new instance of this pattern, not these three.
- **`client/lib/db/base-helpers.ts`'s per-row-write transaction pattern (M6)** is otherwise sound (already hardened against several documented partial-write scenarios) — the legacy-row claim gap is a narrow miss in an otherwise well-designed piece of infrastructure, not a sign of a broader problem.
- **The multi-tab data-loss risk (C5)** is a consequence of an architectural choice (sql.js + whole-blob IndexedDB persistence, one instance per tab) made for good reasons (offline-first, no server dependency) — not a design mistake, but a gap in that design that should be closed deliberately rather than patched incidentally.
- **Dependency drift between `client/` and `web/` (M10)** is a natural consequence of the two apps evolving independently before the current migration effort began; worth resolving as part of that migration's own scope rather than as a standalone task.

---

## Testing Gaps

- ~~**Zero feature-test coverage** for `StockBatchController`, `StockMovementController`, and `PurchaseOrderController`~~ — **closed 2026-09-24**: `StockBatchControllerTest`, `StockMovementControllerTest`, `PurchaseOrderControllerTest` added alongside the scoping fix (see `FIXED_BUGS.md`), covering both the happy path and staff-vs-owner tenant scoping.
- ~~**`TenantIsolationTest.php` gap:** doesn't test *reassigning* an already-visible row's `store_id` to a foreign tenant~~ — **closed 2026-09-24**: `test_staff_update_rejects_reassigning_store_id_to_another_tenant` added. Still worth treating as a template for auditing any *other* endpoint that accepts a foreign-key field pointing at tenant-scoped data on update — this class of gap isn't proven closed everywhere, just at this one site.
- **No test exercises cross-tab/cross-instance persistence** in `client/lib/db/` (C5) — all existing DB tests use a single injected database instance. A harness simulating two independent instances sharing a mocked IndexedDB store would need to be built from scratch to cover this.
- ~~**No test covers `usePOSPayment.handlePayment`'s double-invocation behavior**~~ — **closed 2026-09-24**: `use-pos-payment-double-submit.test.ts` added, verified to fail against the pre-fix code.
- ~~**No test pins the admin-session-cookie's security properties**~~ — **closed 2026-09-24**: `AdminSessionCookieTest.php` now asserts `SameSite`/cookie-presence directly at `refresh()`, `login()`, `impersonateStore()`, and `restoreSession()`.
- **`composer audit`/`npm audit` are not run in CI** (inferred from workflow contents — none of the five workflows invoke either) — the dependency CVEs in H3/M9 would have been caught automatically. Add an audit step (non-blocking initially, since some advisories currently have no fix) to at least surface new ones going forward.

---

## Recommended Engineering Improvements

1. **Still open:** add the `ScopesToTenant`-usage architecture test described above — the single highest-leverage remaining change from this review, since it targets the *pattern* behind the fixed staff-IDOR and stock-batch/movement/PO findings, not just their individual instances.
2. ~~Extract `StaffController::store()`'s store-ownership check and `SyncController::roleIsAtOrBelowCallerPrivilege()` into shared helpers~~ — **done 2026-09-24**: both now live on a shared `EnforcesStaffOwnership` trait, used by `StaffController` (`store()` and `update()`) and `SyncController`.
3. Consolidate all `drx_admin_session` cookie writes through the existing `buildAdminSessionCookie()`/`forgetAdminSessionCookie()` helpers — no call site should hand-roll `cookie(...)` for this cookie name.
4. Add CI-level `npm audit`/`composer audit` steps (report-only initially) so H3/M9-class findings surface automatically rather than needing a manual review pass.
5. Pin every third-party GitHub Action to a commit SHA (matching the convention already used in most of `release.yml`) and add `concurrency:`/`permissions:` blocks to the four FTP-only deploy workflows.
6. Treat the client/web dependency-drift (M10) and the multi-tab data-loss risk (C5) as scoped mini-projects with their own design pass, not quick patches — both require an actual decision (version-alignment policy; single-writer-tab architecture) rather than a local code change.

---

## Suggested Fix Order

**Done (2026-09-24):** the cross-tenant staff IDOR + role-privilege ceiling, the stock-batch/movement/PO 500s + tenant under-scoping, the hardcoded seeder password, the admin-session-cookie hardening regression (former H1/M2/M3), the client token-clearing-on-network-blip regression (former H2), and the POS double-submit guard (former M5) are all fixed, tested, and merged — see `docs/FIXED_BUGS.md`. Remaining order below, renumbered:

1. **C6** (deploy the pending 2026-09-23 migrations) and **H4** (confirm `FLUTTERWAVE_SECRET_HASH` in production) — pure deployment/ops actions, zero remaining code risk, should not wait on anything else.
2. **M6** (legacy-row claim transaction boundary), **M7–M9** (CI/CD hardening: concurrency guards, `chmod`, Symfony bump) — batch as a CI/infra hardening pass.
3. **H3** (Next.js/xlsx CVE remediation) — schedule with normal regression testing given these are major-adjacent framework bumps.
4. **Recommended Engineering Improvement #1** (the `ScopesToTenant`-usage architecture test) — still the single highest-leverage remaining change, since it's a backstop against the *next* instance of the "fix not mirrored to sibling" pattern, not just the three already fixed.
5. **C5** (multi-tab data loss) and **M10/M11** (dependency drift, localStorage-token architecture) — schedule as their own design passes; not blocking for the above, but shouldn't be indefinitely deferred given C5's silent-data-loss nature.
6. **M13** (reseller-sale rollout communication) — not a code task; confirm with product/support whether the release note already went out, then remove the entry.
7. **M12, L1–L6** — low-effort cleanup/accepted tradeoffs, bundle into any of the above passes opportunistically.

This order pulls pure-ops items (C6, H4) to the front regardless of severity ranking, since they require no code changes and are pending only on someone triggering a deploy.
