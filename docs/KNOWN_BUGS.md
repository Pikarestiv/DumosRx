# Known Bugs & Engineering Review

Deep adversarial review of the whole monorepo (`client/`, `web/`, `laravel-server/`, CI/CD), conducted 2026-09-24 via six parallel scoped passes (laravel auth/authz/payments/tenancy, laravel business logic/data/tests, client offline-sync engine, client UI/state/POS flows, web admin panel/auth handoff, CI/CD/config/dependencies), each cross-checked against `docs/FIXED_BUGS.md` to avoid re-reporting closed items and to catch regressions. Every finding below was traced to concrete code, not inferred from patterns; several were independently re-verified against the actual model/controller source before being included here.

This file holds **open** items only — see `docs/FIXED_BUGS.md` for the changelog of everything already fixed, including the extensive 2026-09-21/22/23 sweeps this review builds on.

---

## Executive Summary

**Overall health:** This is an unusually well-audited codebase for its size — `docs/FIXED_BUGS.md` documents dozens of prior Opus/Sonnet review cycles that already closed the "obvious" classes of bug (tenant isolation, payment idempotency, sync conflict resolution, float/rounding drift, PWA offline handling). This pass confirms most of that prior work holds up under a fresh adversarial read. It also found that the review process itself has a gap: several fixes were applied to one code path but not mirrored onto a structurally identical sibling path, and two live-crashing/live-exploitable bugs sat undetected because they're in less-traveled, undertested corners of `laravel-server/`. **The four Critical findings from this pass (staff IDOR + role-privilege ceiling, stock-batch/movement/PO 500s + tenant under-scoping, hardcoded seeder password) are now fixed and tested as of 2026-09-24** — see `docs/FIXED_BUGS.md`.

**The "fix not mirrored to sibling" pattern recurred inside the fix itself**, caught only by a separate, independent Opus review pass dispatched specifically to re-verify these fixes against the real code rather than trust the fixing pass's own commit messages: the initial fix added a role-privilege-ceiling check to `StaffController::update()` but not to `store()` (the exact asymmetry the fix was supposed to eliminate, just inverted), and separately left `DatabaseSeeder`'s environment check as an exact `'production'` string match rather than "anything not explicitly local/test" — meaning `deploy-dev.yml`'s real, internet-facing dev host would have fallen through to the hardcoded password. Both are now closed too (2026-09-24) — see `docs/FIXED_BUGS.md`. Three additional LOW findings from that same independent pass (a `storeIdBelongsToCaller(null)` edge case, `release.yml`'s workflow-wide concurrency group, and the legacy-row claim not reaching the sync queue) are also now fixed (**L7**, **L8**, **L9** — see `docs/FIXED_BUGS.md`).

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

> **H3 fixed 2026-09-24** (the Next.js CVEs — `xlsx` remains, see below) — see `docs/FIXED_BUGS.md`.

### H3-remainder. `xlsx` still has unpatched prototype-pollution/ReDoS CVEs — no upstream fix exists
- **Category:** Dependency / Security — **Confirmed**, **no fix available**
- **File:** `client/package.json` (`xlsx`)

`xlsx *` — prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9). Used for bulk product import/export (per `docs/FEATURE_LIST.md`), a plausible path for untrusted spreadsheet input. **Recommended fix:** evaluate migrating the bulk-import/export path to a maintained alternative (e.g. `exceljs`) — this is a real code-level migration (different API surface), not a version bump, so it's tracked separately from the now-fixed Next.js CVEs rather than blocking them.

---

### H4. `laravel-server/` — `FLUTTERWAVE_SECRET_HASH` must be set in production before this deploys, or every Flutterwave webhook 500s *(carried forward, unresolved)*
- **Category:** Reliability / Payments — **Confirmed** (code fails closed as designed; production `.env` state itself can't be verified from the repo)
- **File:** `app/Http/Controllers/Api/Web/PaymentController.php` (Flutterwave webhook handler), `config/payment.php`, `.env.example`

The Flutterwave webhook was previously (wrongly) authenticated against `encryption_key`; it now correctly compares against `flutterwave.secret_hash`, read from `FLUTTERWAVE_SECRET_HASH`. This review confirmed the variable **is** documented with a clear comment in `laravel-server/.env.example`, but whether it has actually been set in production `.env` can't be verified from the repo. Deliberately fails closed (500, webhook rejected) if empty — safe, but means **every Flutterwave subscription payment silently stops activating** the moment this deploys, until someone copies the Secret Hash from the Flutterwave dashboard into production's `.env`. Not evident from the app itself (Paystack continues working fine); would surface as "customer paid via Flutterwave, subscription never activated" support tickets. **Remove this entry once confirmed set on production.**

---

## Medium Priority Findings

> **M1, M2, M3 fixed 2026-09-24** — see `docs/FIXED_BUGS.md`. M1 (role-privilege ceiling) was fixed alongside C1 (same function, `StaffController::update()`); M2/M3 (admin-session-cookie inconsistencies) were fixed alongside H1 (same underlying cookie-hardening regression).

> **M4 fixed 2026-09-24** — see `docs/FIXED_BUGS.md`.

> **M5 fixed 2026-09-24** — see `docs/FIXED_BUGS.md`.

> **M6, M7, M8, M9 fixed 2026-09-24** — see `docs/FIXED_BUGS.md`. Fixing M9 surfaced a much larger dependency-vulnerability surface than originally scoped, tracked separately as **M14** below — that's now also mostly fixed (2026-09-24), with `laravel/framework` itself the one remaining survivor (needs a major-version upgrade, not a patch).

### M14. `laravel/framework` itself needs a major-version upgrade (11→12) to close its 3 remaining CVEs *(mostly resolved 2026-09-24 — this is the one survivor)*
- **Category:** Dependency — **Confirmed** (via `composer audit`, run 2026-09-24 while fixing M9)
- **File:** `laravel-server/composer.json`/`composer.lock`

**What was wrong:** M9 was scoped to `symfony/routing`/`yaml`/`process` specifically. Re-running `composer audit` after fixing those three found the vulnerability surface was much broader and had grown since the original review: `league/commonmark` (12 advisories), `guzzlehttp/guzzle` (9), `guzzlehttp/psr7` (4), **`laravel/framework` itself (3)**, `symfony/mime` (2), plus one each on `symfony/polyfill-intl-idn`, `symfony/mailer`, `symfony/http-kernel`, `symfony/http-foundation`, `psy/psysh` (dev-only REPL), and `phpunit/phpunit` (dev-only test runner).

**Resolved 2026-09-24, except `laravel/framework` itself:** on inspection, every package except `laravel/framework` had a patch/minor-level fix available *within its currently-installed major version* — `guzzlehttp/guzzle` needed `<7.15.2` (installed `7.10.0`, well within the `^7.8.2` constraint `laravel/framework` itself requires), `guzzlehttp/psr7` needed `<2.12.3`, `league/commonmark` needed `<2.10.0`, the `symfony/*` packages needed the same "already on the right minor, needs a patch release" bump M9's fix was, and `psy/psysh`/`phpunit/phpunit` are dev-only tooling with trivial patch bumps. `composer update` with all ten targeted, `--with-all-dependencies`, resolved cleanly with zero major-version changes and `laravel/framework` itself untouched at `v11.48.0`. Full Laravel suite green after (341 passed), plus a manual boot/route-list/swagger-doc-generation smoke test. See `docs/FIXED_BUGS.md`.

**Still open — `laravel/framework` itself:** its 3 remaining advisories (temporary signed-URL path confusion; CRLF injection in the default `email` validation rule) all require `>=12.60.0`/`>=12.61.1` at minimum — there is no patched Laravel 11.x release for these; the fix landed only in Laravel 12. This genuinely requires a major-version framework upgrade (11→12), which is its own multi-day project (config/provider compatibility, deprecated-API audit, full regression pass) — correctly out of scope for a dependency-patch pass. **Recommended next step:** schedule a dedicated Laravel 11→12 upgrade project; until then, be aware the CRLF-injection advisory specifically concerns the default `email` validation rule used throughout this app's registration/staff-creation forms (`'email' => 'nullable|email|...'`), so a defense-in-depth mitigation (stripping CR/LF from email inputs before they reach any raw mail-header construction) could be considered as a stopgap if this is judged worth doing before the full upgrade.

### M10. Major-version dependency drift between `client/` and `web/` during an active code-migration effort
- **Category:** Architecture — **Confirmed**
- **File:** `client/package.json`, `web/package.json`

`next` 15.5.26 vs 16.3.6 (both bumped 2026-09-24 for CVE remediation — see the now-fixed H3 — but the *major*-version gap between the two apps is unchanged), `sonner` ^1.7 vs ^2.0 (breaking toast API changes), `tailwind-merge` ^2.5 vs ^3.4 (breaking config API), `eslint` ^8 vs ^9, several `@radix-ui/*` packages one-to-two majors apart. The README explicitly frames `web/`'s dashboard code as being actively ported into `client/` in phases — a component copy-pasted between the two during that migration compiles fine (each app has *a* version) but can behave subtly differently with no compiler-level warning. **Fix:** align these specific shared UI-layer packages to the same major version across both apps before porting more dashboard code.

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

> **L1, L2 fixed 2026-09-24** (alongside the M7–M9 CI/CD hardening batch), and **L3, L5 fixed 2026-09-24** separately — see `docs/FIXED_BUGS.md`.

### L4. `POST /app/sales` accepts no discount/tax fields (latent, currently unreferenced)
- **File:** `laravel-server` `SaleController::store`. Every sale created through this REST path would get `discount_amount`/`tax_amount` left null while `subtotal`/`total_amount` are the raw undiscounted sum — but this endpoint is currently defined in `client/lib/api/client.ts` and never actually called from anywhere in `client/`. Not an active production bug; flagged so it isn't silently wired up later without addressing the gap.

> **L7, L8, L9 fixed 2026-09-24** — see `docs/FIXED_BUGS.md`.

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
| `chmod 777` on deployed Laravel storage/cache | Medium | **Fixed** 2026-09-24 |
| Transitive Symfony CVEs (routing/yaml/process) | Medium | **Fixed** 2026-09-24 |
| M14 — `guzzlehttp/*`, `league/commonmark`, `symfony/*`, dev tooling (all patch-level) | Medium | **Fixed** 2026-09-24 |
| M14-remainder — `laravel/framework` itself (needs a major 11→12 upgrade) | Medium | Open |
| M11 — auth token in `localStorage`, not HttpOnly cookie | Medium | Open (accepted tradeoff) |
| H3 — Next.js high/critical CVEs | High | **Fixed** 2026-09-24 |
| H3-remainder — unpatched `xlsx` CVEs (no upstream fix) | High | Open |
| Unpinned action tag in `release.yml`'s FTP job | Low | **Fixed** 2026-09-24 |
| Missing `permissions:` block on 4 deploy workflows | Low | **Fixed** 2026-09-24 |

Areas specifically audited and found **clean** (no regression, matches documented prior fixes): webhook signature verification (constant-time, fail-closed) and idempotent lock-guarded payment activation; sync push's role/field allow-list (`SyncController::sanitizeUserSyncPayload`); `AuthHandoffController`'s single-use/60s-TTL/high-entropy handoff codes and fragment-based transport; CORS allowlist (no wildcard, explicit origins); admin access-token storage (memory-only, never in `localStorage`); XSS surface in `web/` (no `dangerouslySetInnerHTML` on user content); path traversal in `.github/downloads-index.php` (no user input reaches any filesystem path); secrets in `.env.example` files and git history (none found); PIN login lockout (already fixed, still correct).

---

## Performance & Scalability

- **M5-adjacent: unmemoized POS product grid** (`client/components/pos/pos-product-list.tsx`) — `POSProductCard` is a plain function component; the parent recomputes `cartQuantityMap`, several `Set`s, and grouped/sorted product arrays as new references on every render, defeating any future `React.memo` and guaranteeing every visible card re-renders on any cart mutation. On a large catalog (supermarket/grocery vertical, explicitly supported per `AGENTS.md`, no windowing on the "all products" grid), this is effectively **O(catalog size)** re-render work per cart tap, on hardware (Android tablets) where that's most visible. **Fix:** `useMemo` the derived maps/arrays keyed on `cart`/`filteredProducts`; wrap `POSProductCard` in `React.memo`; consider virtualization above a few hundred SKUs.
- ~~**H3-adjacent:** outdated `next` versions carry cache-poisoning and SSRF-via-rewrites advisories relevant to `web/`'s live server~~ — **fixed 2026-09-24** alongside H3.
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
- **`composer audit`/`npm audit` are not run in CI** (inferred from workflow contents — none of the five workflows invoke either) — the dependency CVEs closed as H3/M14 (and M14's residual `laravel/framework` finding) would have been caught automatically, and M14's original broader surface was only found by running the audit manually. Add an audit step (non-blocking initially, since some advisories currently have no fix) to at least surface new ones going forward.

---

## Recommended Engineering Improvements

1. **Still open:** add the `ScopesToTenant`-usage architecture test described above — the single highest-leverage remaining change from this review, since it targets the *pattern* behind the fixed staff-IDOR and stock-batch/movement/PO findings, not just their individual instances.
2. ~~Extract `StaffController::store()`'s store-ownership check and `SyncController::roleIsAtOrBelowCallerPrivilege()` into shared helpers~~ — **done 2026-09-24**: both now live on a shared `EnforcesStaffOwnership` trait, used by `StaffController` (`store()` and `update()`) and `SyncController`.
3. ~~Consolidate all `drx_admin_session` cookie writes through the existing `buildAdminSessionCookie()`/`forgetAdminSessionCookie()` helpers~~ — **done 2026-09-24**: extracted onto a shared `ManagesAdminSessionCookie` trait, used by both `AuthenticatesSessions` and `AdminStoreController`; `refresh()`/`impersonateStore()` no longer write the cookie at all, `restoreSession()` now routes through the shared helper.
4. ~~Add CI-level `npm audit`/`composer audit` steps~~ — **still open**: M14 was only found by running `composer audit` manually; wiring this into CI (report-only initially) would surface the next one automatically.
5. ~~Pin every third-party GitHub Action to a commit SHA... and add `concurrency:`/`permissions:` blocks~~ — **done 2026-09-24**: all five workflows now pin every action to a SHA, have `concurrency:` groups, and have explicit `permissions: contents: read` where none existed before.
6. Treat the client/web dependency-drift (M10) and the multi-tab data-loss risk (C5) as scoped mini-projects with their own design pass, not quick patches — both require an actual decision (version-alignment policy; single-writer-tab architecture) rather than a local code change. **M14-remainder** (`laravel/framework` 11→12) belongs in this same "needs its own review pass" category — it's a real framework-upgrade project now, not a dependency patch.

---

## Suggested Fix Order

**Done (2026-09-24):** the cross-tenant staff IDOR + role-privilege ceiling, the stock-batch/movement/PO 500s + tenant under-scoping, the hardcoded seeder password, the admin-session-cookie hardening regression (former H1/M2/M3), the client token-clearing-on-network-blip regression (former H2), the POS double-submit guard (former M5), the legacy-row claim transaction boundary (former M6), the CI/CD hardening batch (former M7/M8/M9/L1/L2), three gaps an independent Opus review caught in the above, two low-priority maintainability findings (L3/L5), the Next.js CVE remediation (former H3 — `next` bumped to `15.5.26` in `client/` and `16.3.6` in `web/`, both builds verified), the broader dependency surface found while fixing M9 (former M14 — `guzzlehttp/*`/`league/commonmark`/remaining `symfony/*`/dev tooling, all patch-level), and the three remaining LOW findings from the Opus vetting pass (former L7/L8/L9 — the null-store_id edge case, `release.yml`'s concurrency scoping, and the legacy-row claim not reaching the sync queue) are all fixed, tested, and merged — see `docs/FIXED_BUGS.md`. Remaining order below, renumbered:

1. **C6** (deploy the pending 2026-09-23 migrations) and **H4** (confirm `FLUTTERWAVE_SECRET_HASH` in production) — pure deployment/ops actions, zero remaining code risk, should not wait on anything else.
2. **Recommended Engineering Improvement #1** (the `ScopesToTenant`-usage architecture test) — still the single highest-leverage remaining change, since it's a backstop against the *next* instance of the "fix not mirrored to sibling" pattern, not just the ones already fixed.
3. **C5** (multi-tab data loss), **M10/M11** (dependency drift, localStorage-token architecture), and **M14-remainder** (Laravel 11→12 upgrade) — schedule as their own design/upgrade projects; not blocking for the above, but shouldn't be indefinitely deferred given C5's silent-data-loss nature.
4. **H3-remainder** (`xlsx` migration to a maintained alternative) — a real code migration (different API), not a version bump; lower urgency than the Next.js CVEs since it's scoped to the bulk-import/export feature specifically.
5. **M13** (reseller-sale rollout communication) — not a code task; confirm with product/support whether the release note already went out, then remove the entry.
6. **M12, L4, L6** — accepted tradeoffs / latent-unreferenced-code notes with no real fix pending; nothing to schedule.

This order pulls pure-ops items (C6, H4) to the front regardless of severity ranking, since they require no code changes and are pending only on someone triggering a deploy.
