# Known Bugs & Engineering Review

Deep adversarial review of the whole monorepo (`client/`, `web/`, `laravel-server/`, CI/CD), conducted 2026-09-24, later independently re-verified by a separate Opus review pass. This file holds **open** items only — fixed entries are removed outright, not marked done in place. See `docs/FIXED_BUGS.md` for the full changelog of everything already closed from this review (and the extensive 2026-09-21/22/23 sweeps it builds on).

---

## Executive Summary

**Overall health:** This is an unusually well-audited codebase for its size — `docs/FIXED_BUGS.md` documents dozens of prior review cycles that already closed the "obvious" classes of bug (tenant isolation, payment idempotency, sync conflict resolution, float/rounding drift, PWA offline handling). This pass found and closed four Critical bugs (a cross-tenant staff IDOR, a role-privilege-ceiling gap, unconditional 500s on three stock/purchase-order controllers plus their tenant-scoping gap, and a hardcoded production seeder password), a High-severity admin-session-cookie hardening regression, and a long tail of Medium/Low findings — all fixed and tested. What's left below is genuinely not code-fixable in a normal pass: ops actions needing deploy access, product/design decisions, or real architecture/migration projects.

**Recurring pattern worth remembering:** every Critical/High finding in this review had the same shape — **a security or correctness fix applied to one endpoint, not mirrored onto a structurally identical sibling** (`store()` vs `update()` in `StaffController`; `login()` vs `refresh()`/`impersonateStore()` in the admin cookie flow; `ProductController`'s tenant-scoping fix vs `StockBatchController`/`StockMovementController`/`PurchaseOrderController`). This recurred even *inside* this review's own fixes, caught only by a second, independent review pass. See **Recommended Engineering Improvements** below for the architecture-test that would catch this mechanically going forward.

---

## Critical Findings

### C1. `laravel-server/` — 10 migrations from 2026-09-23 not yet run on production
- **Category:** Reliability / Deployment — **Confirmed**
- **File:** `laravel-server/database/migrations/2026_09_23_*.php` (10 files)

These add `stores.receipt_logo_position`, `activity_logs.correlation_id`, `purchase_order_items.{selling_price,cost_price_override,lot_number}`, `stock_movements.status`, `stores.{storefront_dirty_at,store_slug_changed_at}`, `sales.markup_type`, `stores.{staff_can_request_transfers,markup_sales_enabled}`, `stores.timezone`, and widen `stock_movements.movement_type` from an incomplete MySQL `ENUM` to `VARCHAR`. All verified safe (additive `ALTER TABLE`, `--pretend` reviewed, applied cleanly to a throwaway sqlite db and the local dev DB, full `php artisan test` suite green).

**Until these are deployed and run on production**, any device syncing a change to those columns gets `SQLSTATE[42S22]: Unknown column` and the push silently fails for that row — it stays in the client's local `_sync_queue` retrying forever, never lost, but never reaching the server either.

Production migrations run through a protected route, not direct `artisan` access (no SSH on the shared host): `GET https://<production-domain>/migrate-db?key=<MIGRATE_DB_KEY>`. Deploy this branch first, then hit that route. **Remove this entry once confirmed run.**

---

## High Priority Findings

### H2. `laravel-server/` — `FLUTTERWAVE_SECRET_HASH` must be set in production before this deploys, or every Flutterwave webhook 500s
- **Category:** Reliability / Payments — **Confirmed** (code fails closed as designed; production `.env` state itself can't be verified from the repo)
- **File:** `app/Http/Controllers/Api/Web/PaymentController.php` (Flutterwave webhook handler), `config/payment.php`, `.env.example`

The Flutterwave webhook was previously (wrongly) authenticated against `encryption_key`; it now correctly compares against `flutterwave.secret_hash`, read from `FLUTTERWAVE_SECRET_HASH`. The variable **is** documented with a clear comment in `laravel-server/.env.example`, but whether it has actually been set in production `.env` can't be verified from the repo. Deliberately fails closed (500, webhook rejected) if empty — safe, but means **every Flutterwave subscription payment silently stops activating** the moment this deploys, until someone copies the Secret Hash from the Flutterwave dashboard into production's `.env`. Not evident from the app itself (Paystack continues working fine); would surface as "customer paid via Flutterwave, subscription never activated" support tickets. **Remove this entry once confirmed set on production.**

---

## Medium Priority Findings

### M1. `laravel/framework` itself needs a major-version upgrade (11→12) to close its 3 remaining CVEs
- **Category:** Dependency — **Confirmed** (via `composer audit`)
- **File:** `laravel-server/composer.json`/`composer.lock`

Its 3 remaining advisories (temporary signed-URL path confusion; CRLF injection in the default `email` validation rule) all require `>=12.60.0`/`>=12.61.1` at minimum — there is no patched Laravel 11.x release for these; the fix landed only in Laravel 12. This genuinely requires a major-version framework upgrade, which is its own multi-day project (config/provider compatibility, deprecated-API audit, full regression pass). **Recommended next step:** schedule a dedicated Laravel 11→12 upgrade project; until then, be aware the CRLF-injection advisory specifically concerns the default `email` validation rule used throughout this app's registration/staff-creation forms (`'email' => 'nullable|email|...'`), so a defense-in-depth mitigation (stripping CR/LF from email inputs before they reach any raw mail-header construction) could be considered as a stopgap if this is judged worth doing before the full upgrade.

### M2. `client/` and `web/` remain on different Next.js majors (15 vs 16)
- **Category:** Architecture — **Confirmed**, deliberate for now
- **File:** `client/package.json` (`next@15.5.26`), `web/package.json` (`next@16.3.6`)

`client/` is a Tauri-wrapped static export with its own build/native-shell constraints, and jumping it to Next 16 is a materially bigger, riskier change than a patch-level CVE fix. **Fix:** schedule the `client/` → Next 16 migration as its own project once the `web/` → `client/` dashboard port (the actual reason version parity matters) is further along, not as a quick dependency bump.

### M3. `client/` — auth bearer token kept in `localStorage` instead of an HttpOnly cookie
- **Category:** Security — **Confirmed**, deliberately accepted
- **File:** `client/lib/api/token-manager.ts:7-25`

`auth_token` (the Sanctum bearer token) is read/written via `localStorage`, not an HttpOnly cookie. Any XSS in the client app could read `localStorage.auth_token` and exfiltrate a long-lived session token, versus an HttpOnly cookie which JS can't read at all.

Previously investigated and rejected as a quick fix: `token-manager.ts`'s `setToken`/`clearToken` call `mirrorAuthToken`/`clearMirroredAuthToken` (`client/lib/native/widget-bridge.ts`), which hand the raw token to native Tauri (Rust) code so the home-screen widget can make its own authenticated background HTTP requests entirely outside the webview. An HttpOnly cookie is by definition unreadable by JS, so it can't be mirrored to native code — swapping to one would break the widget's live data rather than just change a storage mechanism. A real fix means a dual-path auth design (webview uses a cookie for its own requests; native widget code gets a separate, narrowly-scoped token via its own exchange) — a genuine architecture change, not a quick fix. Revisit as a scoped project of its own — `client/` auth/storage architecture work.

### M4. `client/` — a long-open tab can 404 on a lazy chunk after a deploy that edits `sw.js`
- **Category:** Reliability — **Confirmed**, accepted tradeoff
- **File:** `client/public/sw.js` (`activate()`'s cache prune)

`activate()` prunes cache entries not in the current build's manifest, to stop unbounded cache growth across deploys. This only runs when `sw.js`'s own bytes change, but when it does, an already-open tab still running the *old* build's JS can lazy-load a chunk that both the cache prune and the new deploy's server files have already removed — a chunk-load error, while fully online, until reload. This mirrors how a plain Next.js app with no service worker already behaves on deploy (the SW was incidentally providing extra resilience here). `pwa-registrar.tsx`'s `controllerchange` reload mitigates the common case by reloading onto the new build as soon as the new SW takes control, but a chunk requested in the brief window between prune and reload could still race it.

### M5. `client/` — existing Pro/Enterprise stores lose the "Reseller sale" POS row on deploy, silently
- **Category:** UX / Deployment — **Confirmed** as designed; open only pending confirmation of rollout communication
- **File:** `client/lib/hooks/use-feature-gate.ts` (`isMarkupSalesEnabled`), `stores.markup_sales_enabled`

New store-level toggle, default `0` (explicit, deliberate product requirement). Any store already on Pro/Enterprise and actively using reseller-commission sales before this ships finds the POS cart's "Reseller sale" row gone the moment it deploys, with no in-app notice, until the owner finds and enables the new toggle in Settings → Register Configs. Not a bug to fix — the default was explicitly requested — but still needs a release note / proactive heads-up to any store already using the feature, so it doesn't read as broken. **Remove this entry once that communication has gone out** (this is a coordination/communication follow-up, not a code fix).

---

## Low Priority Findings

### L1. `POST /app/sales` accepts no discount/tax fields (latent, currently unreferenced)
- **File:** `laravel-server` `SaleController::store`. Every sale created through this REST path would get `discount_amount`/`tax_amount` left null while `subtotal`/`total_amount` are the raw undiscounted sum — but this endpoint is currently defined in `client/lib/api/client.ts` and never actually called from anywhere in `client/`. Not an active production bug; flagged so it isn't silently wired up later without addressing the gap.

### L2. `client/` — manifest `theme_color` doesn't follow dark mode
- **File:** `client/public/manifest.json:8`, `client/app/layout.tsx:66-68`. `manifest.json` hardcodes `theme_color`/`background_color` to `#ffffff`; `layout.tsx`'s `viewport.themeColor` correctly switches to black under `prefers-color-scheme: dark`. On Android, the manifest's value drives the install splash screen, so a dark-mode user briefly sees a white splash before the dark app renders. The Web App Manifest spec has no conditional-syntax equivalent for this, so it can't be fully fixed without picking one scheme's splash over the other — left as the light-mode default since it also matches the manifest's own `background_color`.

---

## Security Findings (index)

| Finding | Severity | Status |
|---|---|---|
| H2 — `FLUTTERWAVE_SECRET_HASH` production `.env` status unverified | High | Open (needs prod confirmation) |
| M1 — `laravel/framework` itself (needs a major 11→12 upgrade) | Medium | Open |
| M3 — auth token in `localStorage`, not HttpOnly cookie | Medium | Open (accepted tradeoff) |

Areas specifically audited and found **clean**: webhook signature verification (constant-time, fail-closed) and idempotent lock-guarded payment activation; sync push's role/field allow-list (`SyncController::sanitizeUserSyncPayload`); `AuthHandoffController`'s single-use/60s-TTL/high-entropy handoff codes and fragment-based transport; CORS allowlist (no wildcard, explicit origins); admin access-token storage (memory-only, never in `localStorage`); XSS surface in `web/` (no `dangerouslySetInnerHTML` on user content); path traversal in `.github/downloads-index.php` (no user input reaches any filesystem path); secrets in `.env.example` files and git history (none found); PIN login lockout.

---

## Performance & Scalability

- **Unmemoized POS product grid** (`client/components/pos/pos-product-list.tsx`) — `POSProductCard` is a plain function component; the parent recomputes `cartQuantityMap`, several `Set`s, and grouped/sorted product arrays as new references on every render, defeating any future `React.memo` and guaranteeing every visible card re-renders on any cart mutation. On a large catalog (supermarket/grocery vertical, explicitly supported per `AGENTS.md`, no windowing on the "all products" grid), this is effectively **O(catalog size)** re-render work per cart tap, on hardware (Android tablets) where that's most visible. **Fix:** `useMemo` the derived maps/arrays keyed on `cart`/`filteredProducts`; wrap `POSProductCard` in `React.memo`; consider virtualization above a few hundred SKUs.
- No N+1 query patterns, unbounded pagination, or missing-index issues were found in the areas reviewed (`SaleController`, stock/purchase-order controllers, dashboard aggregation queries) — foreign-key columns are auto-indexed via Laravel's `foreignUuid()->constrained()`.

---

## Architecture & Maintainability

- **The recurring failure pattern across this review's Critical/High findings is "fix applied to one endpoint, not mirrored to a structurally identical sibling."** `laravel-server/tests/Feature/ArchitectureTest.php` already exists specifically to keep one such convention (Controller/Service separation) honest via a test rather than review alone — the same approach could catch this pattern. **Recommended change (still open):** add an architecture test asserting every controller under `Api/App/*`/`Api/Web/*` that queries a tenant-owned table (`stock_batches`, `stock_movements`, `purchase_orders`, `products`, etc.) either `use`s `ScopesToTenant` or is on an explicit allow-list — this would catch the next instance of this pattern automatically instead of needing another manual review pass.

---

## Testing Gaps

- **`composer audit`/`npm audit` are not run in CI** (inferred from workflow contents — none of the five workflows invoke either). Add an audit step (non-blocking initially, since some advisories currently have no fix) to at least surface new ones going forward.

---

## Recommended Engineering Improvements

1. Add the `ScopesToTenant`-usage architecture test described above — the single highest-leverage remaining change from this review, since it's a backstop against the *next* instance of the "fix not mirrored to sibling" pattern.
2. Add CI-level `npm audit`/`composer audit` steps (report-only initially) so the next dependency-CVE surface is found automatically rather than by a manual review pass.

---

## Suggested Fix Order

1. **C1** (deploy the pending 2026-09-23 migrations) and **H2** (confirm `FLUTTERWAVE_SECRET_HASH` in production) — pure deployment/ops actions, zero remaining code risk, should not wait on anything else.
2. **Recommended Engineering Improvement #1** (the `ScopesToTenant`-usage architecture test) — cheap, high-leverage, no design decision needed.
3. **M2** (Next.js 15→16 migration for `client/`), **M3** (localStorage-token architecture), and **M1** (Laravel 11→12 upgrade) — schedule as their own design/upgrade projects.
4. **M5** (reseller-sale rollout communication) — not a code task; confirm with product/support whether the release note already went out, then remove the entry.
5. **M4, L1, L2** — accepted tradeoffs / latent-unreferenced-code notes with no real fix pending; nothing to schedule.

This order pulls the pure-ops item (C1) to the front regardless of severity ranking, since it requires no code changes and is pending only on someone triggering a deploy.
