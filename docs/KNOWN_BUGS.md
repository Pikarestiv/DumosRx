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

### `laravel-server/` — staff PINs are stored in plaintext and serialized to API clients
`app/Models/User.php:34` (fillable `pin`), `:58-61` (`$hidden` omits it), `app/Http/Controllers/Api/Web/StaffController.php:153`, `app/Http/Controllers/Api/Concerns/AuthenticatesSessions.php:267-270`

`users.pin` is a plain `string(4)` column (`2026_05_16_070000_add_sync_fields_to_users_table.php:16`) written verbatim by `StaffController::store`/`update` and by sync push, never hashed. It is also absent from `$hidden`, so every endpoint that returns a `User` model serializes it: `GET /api/v1/user` returns the caller's PIN on every session bootstrap, `GET /api/v1/staff` returns the PIN of every staff member in the store, and sync pull ships them to each device. The PIN is the actual POS login credential (`client/lib/db/queries/auth.ts` compares it directly), so this is a credential disclosed in plaintext at rest and in transit-to-client.

---

## Medium

### `laravel-server/` — a storefront order can still be paid with a payment reference this app never issued
`app/Http/Controllers/Api/Public/StorefrontController.php` (checkout flow)

Just hardened (now also checks `payment_transactions`, not just `online_orders`, and asserts currency) but not closed: a Paystack reference for a charge made entirely outside this app's own recorded transactions — e.g. directly through the merchant's Paystack dashboard, a payment link, or another product on the same Paystack account — can still be replayed once into a storefront order, as long as Paystack reports it successful for at least the order total in NGN. The real fix is binding the reference to the specific cart/store at initialize-time (server-side `initialize` call storing the reference before redirect, then only accepting references this app itself issued) — a bigger redesign than a bug-fix pass. Low real-world likelihood (requires knowing/guessing a valid unconsumed reference on the platform's Paystack account) but worth scheduling as its own project.

### `client/` — Analytics dashboard revenue still double-subtracts VAT on a refunded sale
`lib/hooks/use-bi-data.ts` (`netSales` calculation)

The exact bug already fixed in the Daily Close report (refund totals are VAT-inclusive, so subtracting a refund from ex-VAT revenue and then also subtracting the *original* sale's full VAT double-counts the refunded VAT's share) is still present here. Left deliberately unfixed alongside the Daily Close fix: fixing it means changing this hook's revenue definition to match, which would then require re-deriving the `report-reconciliation.test.ts` fixtures that were just updated to reconcile against the (currently still-buggy) BI definition. Needs its own pass that updates both together.

### `client/` — a filtered Profit & Loss report silently excludes expenses, with no note explaining why
`lib/db/queries/reports.ts` (`fetchProfitLossReportData`), `lib/hooks/use-report-export.ts`

When a P&L is filtered by staff or payment method, expenses are now correctly excluded from the total (an expense's `user_id`/`payment_method` don't mean the same thing as a sale's, so force-filtering them would misattribute store overhead to one cashier). But there's nowhere in the UI to say so — `use-report-export.ts` drives CSV/PDF columns off a fixed `headers` array with no subtitle/note slot, so a reader could reasonably assume "Net Profit" on a filtered report is the full P&L rather than a contribution-margin figure. Add a note/subtitle mechanism to the export path (or a banner in `report-center.tsx`) explaining the exclusion whenever a staff/payment-method filter is active.

### `client/` — pinch-zoom is disabled app-wide (WCAG 1.4.4)
`app/layout.tsx` (`maximumScale: 1, userScalable: false`)

Confirmed a genuine AA failure by the accessibility audit, but plausibly a deliberate "native app feel" choice for the packaged Tauri app rather than an oversight — left alone pending a product decision rather than silently reversed. If kept, at minimum the in-app font-size/zoom controls (if any exist) should be verified sufficient as an alternative means of enlarging content.

### `client/` — auth bearer token kept in `localStorage` instead of an HttpOnly cookie (accepted tradeoff, confirmed 2026-09-23)
`client/lib/api/token-manager.ts:7-25`

`auth_token` (the Sanctum bearer token) is read/written via `localStorage`, not an HttpOnly cookie. Any XSS in the client app could read `localStorage.auth_token` and exfiltrate a long-lived session token, versus an HttpOnly cookie which JS can't read at all. The admin web session already avoids this (`drx_admin_session` is a proper `HttpOnly` cookie — see `AdminStoreController::impersonateStore`).

Investigated switching this: `token-manager.ts`'s `setToken`/`clearToken` call `mirrorAuthToken`/`clearMirroredAuthToken` (`client/lib/native/widget-bridge.ts`), which hand the raw token to native Tauri (Rust) code so the home-screen widget can make its own authenticated background HTTP requests entirely outside the webview. An HttpOnly cookie is by definition unreadable by JS, so it can't be mirrored to native code — swapping to one would break the widget's live data rather than just change a storage mechanism. Fixing this for real means a dual-path auth design (webview uses a cookie for its own requests; native widget code gets a separate, narrowly-scoped token via its own exchange) — a real architecture change, not a quick fix. Left as-is for now; revisit as a scoped project, not a bug-fix pass.

### `client/` — existing Pro/Enterprise stores will lose the "Reseller sale" POS row on deploy, silently
`client/lib/hooks/use-feature-gate.ts` (`isMarkupSalesEnabled`), `stores.markup_sales_enabled`

New store-level toggle added 2026-09-23, default `0` (explicit product requirement — deliberate, not an oversight). Any store already on Pro/Enterprise and actively using reseller-commission sales before this ships will find the POS cart's "Reseller sale" row gone the moment it deploys, with no in-app notice explaining why, until the owner finds and turns on the new toggle in Settings → Register Configs ("Enable Markup Sales"). Not a bug to fix — the default was explicitly requested — but worth a release note / proactive heads-up to any store already using the feature before this ships, so it doesn't read as a broken app to them.

---

## Low

### `client/` — remaining accessibility gaps from the 2026-09-24 audit not covered by that pass's fixes
Several files across `components/`

A broad accessibility audit and fix pass covered the highest-severity findings (keyboard-unreachable POS actions, unlabeled icon buttons, focus-ring/contrast failures, PIN entry labeling). Left for a follow-up pass, roughly in order of value:
- ~49 more click-only `<div>`/`<span>` elements outside the POS (list rows in customers/products/expenses/prescriptions/procurement, and hand-rolled combobox option lists with no keyboard support) — same defect class as the ones already fixed, just lower individual traffic.
- No `<h1>` on any page except POS and Dashboard (fixed in those two only).
- No skip link past the persistent sidebar.
- `components/ui/table.tsx` — `<th>` elements have no explicit `scope="col"` (low risk here since the simple shape browsers infer it correctly, but cheap insurance).
- `components/ui/search-input.tsx` gained an `aria-label` prop, but several consumers still rely on its placeholder-text fallback rather than an explicit label: `settings/staff-management.tsx`, `settings/staff/staff-activities-tab.tsx`, `products/product-database-filters.tsx`, `products/product-database.tsx`, `activity-log/activity-log-filters.tsx`, and the local `SearchInput` usages in `customers/activity-tab.tsx`, `customers/directory-tab.tsx`, `expenses/expense-list.tsx`.
- Light-theme `--secondary` (`app/globals.css`) pairs with white `--secondary-foreground` at ~3.9:1, just under the same AA threshold `--muted-foreground` was fixed for in this pass — noticed in passing, not in the original audit's finding list.

### `client/` — `queryKeys.stockBatches.expiring()` has the same 30-vs-90-day fallback hazard its sibling `stats()` key just had fixed
`lib/query-keys.ts`

`stockBatches.stats(expiryDays)`'s default was corrected from 30 to 90 to match the schema default and every display consumer. `stockBatches.expiring(expiryDays)` presumably has the same kind of caller-supplied-or-defaulted `expiryDays` parameter and wasn't audited/fixed in the same pass (different call sites, out of that fix's scope). Check its call sites for the same mismatch.

### `laravel-server/` — some `feedback` sync pushes rejected as "forbidden", cause not yet investigated
`app/Http/Controllers/Api/App/SyncController.php` (~line 357, `authorizeChangeTarget` check)

Seen live in a production sync response: two `feedback` table rows rejected with `reason: "forbidden"` (the record exists but doesn't resolve to the caller's authorized store/user scope). Not reproduced or root-caused — could be stale `_sync_queue` entries from before an account/store switch on that device, or a genuine ownership-scoping gap specific to `feedback`. Rows stay queued locally, not lost. Investigate if it recurs or affects more than a couple of stale rows.

---

## `client/` — older/unlabeled entries

No open items currently — the last one (account/store switch stale
dashboard data) is fixed, see `FIXED_BUGS.md`.
