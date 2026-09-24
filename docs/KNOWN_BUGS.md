# Known Bugs / Data Gaps

Issues spotted incidentally (e.g. while doing TypeScript type-safety cleanup) that aren't fixed yet, tracked here so they don't get lost. Not an exhaustive bug tracker; just a landing spot for "worth fixing later" findings. Fixed entries are removed outright rather than marked — this file is a to-do list, not a changelog (git history is the changelog).

Open items below are grouped by severity (Critical → High → Medium → Low), then a `client/`-area miscellaneous section for older/unlabeled entries, then the separate `web/` pre-launch review section.

---

## Critical

### `laravel-server/` — 10 migrations from 2026-09-23 not yet run on production
`laravel-server/database/migrations/2026_09_23_*.php` (10 files)

These add `stores.receipt_logo_position`, `activity_logs.correlation_id`, `purchase_order_items.{selling_price,cost_price_override,lot_number}`, `stock_movements.status`, `stores.{storefront_dirty_at,store_slug_changed_at}`, `sales.markup_type`, `stores.{staff_can_request_transfers,markup_sales_enabled}`, and widen `stock_movements.movement_type` from an incomplete MySQL `ENUM` to `VARCHAR`. All verified safe (additive `ALTER TABLE`, `--pretend` reviewed, applied cleanly to a throwaway sqlite db (the last two, added later the same day) and the local dev DB, full `php artisan test` suite green: 278 passed).

**Until these are deployed and run on production**, any device syncing a change to those columns gets `SQLSTATE[42S22]: Unknown column` (confirmed live: `activity_logs.correlation_id`, `stock_movements` transfer rows via the old `movement_type` ENUM; the last three were caught by code review before ever shipping, not yet confirmed live) and the push silently fails for that row — it stays in the client's local `_sync_queue` retrying forever, not lost, but never reaching the server either.

Production migrations run through a protected route, not direct `artisan` access (no SSH on the shared host — see `laravel-server/AGENTS.md`): `GET https://<production-domain>/migrate-db?key=<MIGRATE_DB_KEY>`. Deploy this branch first, then hit that route. Remove this entry once confirmed run. (Also now covers `2026_09_23_000008_add_timezone_to_stores.php`, added the same day — additive, `stores.timezone` defaults to `'UTC'`.)

---

## High

### `laravel-server/` — `FLUTTERWAVE_SECRET_HASH` must be set in production before this deploys, or every Flutterwave webhook 500s
`app/Http/Controllers/Api/Web/PaymentController.php` (Flutterwave webhook handler), `config/payment.php`, `.env.example`

The Flutterwave webhook was previously (wrongly) authenticated against `encryption_key`; it now correctly compares against a new `flutterwave.secret_hash` config value, read from `FLUTTERWAVE_SECRET_HASH`. This is not declared in production `.env` yet. Deliberately fails closed (500, webhook rejected) if the secret is empty — safe, but it means **every Flutterwave subscription payment silently stops activating** the moment this deploys, until someone copies the Secret Hash from the Flutterwave dashboard's webhook settings into production's `.env`. Not evident from the app itself (Paystack continues working fine); would surface as "customer paid via Flutterwave, subscription never activated" support tickets. Remove this entry once confirmed set on production.

---

## Medium

### `client/` — auth bearer token kept in `localStorage` instead of an HttpOnly cookie (accepted tradeoff, confirmed 2026-09-23)
`client/lib/api/token-manager.ts:7-25`

`auth_token` (the Sanctum bearer token) is read/written via `localStorage`, not an HttpOnly cookie. Any XSS in the client app could read `localStorage.auth_token` and exfiltrate a long-lived session token, versus an HttpOnly cookie which JS can't read at all. The admin web session already avoids this (`drx_admin_session` is a proper `HttpOnly` cookie — see `AdminStoreController::impersonateStore`).

Investigated switching this: `token-manager.ts`'s `setToken`/`clearToken` call `mirrorAuthToken`/`clearMirroredAuthToken` (`client/lib/native/widget-bridge.ts`), which hand the raw token to native Tauri (Rust) code so the home-screen widget can make its own authenticated background HTTP requests entirely outside the webview. An HttpOnly cookie is by definition unreadable by JS, so it can't be mirrored to native code — swapping to one would break the widget's live data rather than just change a storage mechanism. Fixing this for real means a dual-path auth design (webview uses a cookie for its own requests; native widget code gets a separate, narrowly-scoped token via its own exchange) — a real architecture change, not a quick fix. Left as-is for now; revisit as a scoped project, not a bug-fix pass.

### `client/` — a long-open tab can 404 on a lazy chunk after a deploy that edits `sw.js`
`client/public/sw.js` (`activate()`'s cache prune)

`activate()` now prunes cache entries not in the current build's manifest (added 2026-09-24 to stop unbounded growth across deploys). This only runs when `sw.js`'s own bytes change (the browser only re-checks the SW script then), but when it does, an already-open tab still running the *old* build's JS can lazy-load a chunk that both the cache prune and the new deploy's server files have already removed — a chunk-load error, while fully online, until the user reloads. This mirrors how a plain Next.js app already behaves on a deploy with no service worker at all (the SW was incidentally providing extra resilience here); treated as an accepted tradeoff of the "new SW takes over immediately" design rather than special-cased. `pwa-registrar.tsx`'s `controllerchange` reload (added the same day) mitigates the common case by reloading the tab onto the new build as soon as the new SW takes control, but a chunk requested in the brief window between prune and reload could still race it.

### `client/` — existing Pro/Enterprise stores will lose the "Reseller sale" POS row on deploy, silently
`client/lib/hooks/use-feature-gate.ts` (`isMarkupSalesEnabled`), `stores.markup_sales_enabled`

New store-level toggle added 2026-09-23, default `0` (explicit product requirement — deliberate, not an oversight). Any store already on Pro/Enterprise and actively using reseller-commission sales before this ships will find the POS cart's "Reseller sale" row gone the moment it deploys, with no in-app notice explaining why, until the owner finds and turns on the new toggle in Settings → Register Configs ("Enable Markup Sales"). Not a bug to fix — the default was explicitly requested — but worth a release note / proactive heads-up to any store already using the feature before this ships, so it doesn't read as a broken app to them.

---

## Low

### `client/` — manifest `theme_color` doesn't follow dark mode
`client/public/manifest.json:8`, `client/app/layout.tsx:66-68`

`manifest.json` hardcodes `theme_color`/`background_color` to `#ffffff`; `layout.tsx`'s `viewport.themeColor` correctly switches to black under `prefers-color-scheme: dark`. On Android, the *manifest's* value drives the install splash screen, so a dark-mode user briefly sees a white splash before the dark app renders. The Web App Manifest spec has no equivalent of `<meta name="theme-color" media="...">`'s conditional syntax, so this can't be fully fixed without picking one color scheme's splash over the other — left as the light-mode default since that also matches the manifest's own `background_color`.

---

## `client/` — older/unlabeled entries

No open items currently — the last one (account/store switch stale
dashboard data) is fixed, see `FIXED_BUGS.md`.
