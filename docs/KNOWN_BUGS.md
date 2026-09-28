# DumosRx — Known Bugs & Engineering Audit

## Audit Information

- **Date of this pass:** 2026-09-28 (supersedes and extends the 2026-09-26 whole-monorepo pass and the 2026-09-27 payment-gateway pass, both of whose still-open findings are preserved below under their original IDs).
- **Scope:** Whole monorepo — `client/` (Next.js 16 / React 19 offline-first Tauri POS app, sql.js in the browser, native SQLite via the vendored `@tauri-apps/plugin-sql` fork on desktop/Android), `laravel-server/` (Laravel 12 / PHP 8.2 API, MySQL on shared hosting), `web/` (static-export marketing site, store-owner stubs, platform admin panel, public storefront), CI/CD workflows (`.github/workflows/`), Android widget/native code under `client/src-tauri/gen/android/`.
- **Methodology:** critical flows were traced end to end rather than pattern-searched, following `docs/BUG_REVIEW_PROMPT.md`'s checklist categories: POS sale → FEFO deduction → sync push → server apply → pull on a second device; stock adjustments and cycle counts; PO create/receive (standard and immediate); CSV/XLSX import; offline writes and reconnect; multi-tab writer election and promotion; multi-store scoping (client resolver and server `applyPullTenantScope`/`authorizeChangeTarget`); PIN login, permission groups, Sanctum token lifecycle; the licensing/clock-tamper guard; database init, migrations, backup/restore; PWA service worker; Tauri startup and updater; returns, loyalty, credit/debt; reports/BI queries over a synthetic mature dataset.
- **Validation performed (read-only):** `npx tsc --noEmit -p client` — clean; `npx vitest run` in `client/` — 237 files / 1303 tests passing; `php artisan test` in `laravel-server/` — 469 tests / 1355 assertions passing; a synthetic-dataset query benchmark run against the app's own `SCHEMA_SQL` in sql.js (the exact engine the web/PWA build runs on) to measure the queries the app actually issues — see the Performance section for the numbers and the caveat that a desktop Node run is 5–20× faster than the low-end Android hardware this product targets.
- **Excluded:** `node_modules/`, `.git/`, `.claude/worktrees/`, `.worktrees/`, `brag-output/`, `refs/`, `client/out/` (inspected only for export size), `client/playwright-report/`, `client/test-results/`, `laravel-server/vendor/`, `laravel-server/public/build/`, generated Tauri bindings under `src-tauri/gen/android/.../generated/`, lockfiles, the `dumosrx-release-key.jks`/keystore files (present in the working tree, flagged below), and `docs/superpowers/` plan/spec history. Areas covered exhaustively by previous passes and re-verified without re-derivation: payment webhook signature/idempotency, `SyncController` role/field allow-lists, handoff-code TTL, CORS allowlist, admin token storage, PIN lockout, and the writer-lock architecture documented in `docs/DATABASE_CONCURRENCY.md` (whose short-term recommendations were checked against current code — see §6).

This file holds **open** items only. Fixed entries move to `docs/FIXED_BUGS.md` and are removed here outright, per `.agents/AGENTS.md` §2.

---

## Executive Summary

**Overall health.** The codebase is unusually well-defended for its size: the sync engine's conflict model, the single-writer tab lock, tenant scoping on the server and the money math have all been through several review-and-fix cycles, and both test suites pass cleanly. The new findings in this pass are therefore not the "obvious" classes (cross-tenant leaks, double-charging, silent rollbacks) but the next layer down: **scale limits that were never exercised** (a pull page cap that silently stops a large table from ever finishing its first sync, a server tenant-scope that loads every sale id into PHP memory per request, a local database with essentially no indexes), **operational footguns** (the production migration route re-seeds and overwrites admin-edited platform configuration on every deploy), and **attribution/consistency gaps** on the newest flows (online-order fulfilment).

**Findings this pass, by severity:** 0 **P0**, 3 **P1**, 8 **P2**, 13 **P3** — 24 new findings (IDs `A-1`…`A-24`), plus 14 still-open items carried from the two earlier passes (`P2-1`, `P3-1`, `P3-2`, `P3-5`, `PG-1`…`PG-10`), all preserved verbatim below.

**Most important risks, in order:**

1. **A-1 — the pull loop's `MAX_PULL_PAGES` cap makes a table with more than 100,000 changed rows un-syncable**: its cursor is never stamped, so every sync cycle re-downloads the same first 100,000 rows forever. `audit_logs` (10–15 rows per sale) reaches that in months on a busy pharmacy; a second device set up against such a store never finishes its first sync.
2. **A-2 — `GET /migrate-db` runs `migrate --seed --force`, and two seeders overwrite rather than seed-if-missing**: every production migration silently resets `subscription_plans` (plan prices, limits, feature flags), `global_suggestions` (to `[]`), `referral_program`, `smartsupp_key`, and every admin-edited email template.
3. **A-3 — the server's pull tenant scope materialises whole id lists (`->pluck('id')`) for six child tables on every pull page**, plus offset pagination; cost grows linearly with the store's lifetime sales on every 30-minute background sync, on shared hosting.
4. **PG-2 / PG-1 (carried)** — storefront online payments still have no webhook/reconciliation path and can settle via the wrong gateway.
5. **A-6 / A-10 (performance)** — the local SQLite database has one index; the measured cost of the sale-history, customer-directory, activity-log and import lookups on a one-year dataset is in the hundreds of milliseconds to seconds on desktop, and the boot-time `requeueOrphanedRows` scan plus the per-pull `stores` prune add full-table scans to every launch and every sync.

**Major performance concerns** are §5 (indexes, boot-time scans, the license-guard sync gate on launch, the 5-second sync-queue poll) and the still-open whole-blob `db.export()` persistence model already analysed in `docs/DATABASE_CONCURRENCY.md`.

---

## 1. Critical findings (P0)

None found this pass. No cross-tenant read/write path, payment double-charge, or unguarded data-destroying path was identified beyond what previous passes closed. (The storefront pass's `SF-P0-1` remains fixed.)

---

## 2. High-priority findings (P1)

#### [P1] A-1. Pull sync never completes for any table with >100,000 changed rows — the cursor is never stamped and the same 100k rows are re-downloaded every cycle
**Category:** Bug / Offline-sync / Data — **Confirmed bug (code path certain; whether a given store has crossed the threshold is not verifiable from the repo)**
**Location:** `client/lib/db/sync-engine/pull.ts:12` (`MAX_PULL_PAGES = 200`), `:164` (`while (hasMoreAny && page < MAX_PULL_PAGES)`), `:520-538` (cursor stamped only when `!tableHasMore`); `laravel-server/app/Http/Controllers/Api/App/SyncController.php:799-810` (500 rows/page).
**Problem:** A pull round fetches at most 200 pages × 500 rows = 100,000 rows per table. `_sync_state.last_synced_at` for a table is only written once the server reports `has_more: false` for it. If a table has more than 100,000 rows newer than the cursor, the loop exits at page 200 with `has_more` still true, the cursor is never advanced, `pageOffsets` (a local variable) is discarded, and the next `sync()` starts again from offset 0 of the same window. The rows are applied idempotently, so nothing corrupts — but the table never finishes, and every subsequent sync (every 30 minutes on the default `auto_sync_interval`, plus every app launch via `LicenseGuard`/`StoreProvider`) re-downloads ~100,000 rows.
**Why it matters:** `audit_logs` is written for every `insert()`/`update()`/`softDelete()` — a single POS sale produces 10–15 rows (`client/AGENTS.md`, correlation-id section), and every device pulls the whole store's log. A store doing 100 sales/day crosses 100,000 audit rows in roughly 2–3 months. From then on: (a) a **new device** (replacement tablet, second terminal, cloud restore) can never complete its first sync of that table; (b) every existing device burns ~50 MB per sync cycle re-fetching the same page window; (c) on a metered/slow connection the sync appears permanently "in progress" and manual "Sync Now" never reports the backlog as drained. `stock_movements` and `sale_items` reach the same threshold later.
**Evidence:** `pull.ts` keeps `lastSyncedMap` fixed for the whole round and only stamps `_sync_state` inside the `!tableHasMore && !skippedTables.has(table)` branch; `pageOffsets` is declared inside `pullChanges()` and never persisted. `forceFullResync()` clears `_sync_state`, which makes the situation worse (every table restarts from an empty cursor). The health check (`health-check.ts`) only compares counts for five tables, none of which is `audit_logs`, so this is invisible to it as well.
**Failure scenario:** Owner replaces a tablet after 8 months. Cloud restore pulls `stores`/`users` (fast), logs in, and the background sync begins. `audit_logs` has 140,000 rows; each cycle fetches 100,000 of them, applies them, hits the cap, never stamps the cursor, and repeats 30 minutes later. The sync indicator alternates between "Syncing…" and "Cloud Active" forever; the activity log shows only the oldest 100,000 entries; data usage is ~2.4 GB/day on that tablet.
**Recommended fix:** Persist the per-table page offset (or, better, switch the server page to a keyset cursor `(updated_at, id)` and stamp an intermediate cursor after every committed page) so a round can be resumed instead of restarted; raise/remove the fixed cap; consider not pulling `audit_logs` to non-owner devices at all, or pulling it lazily with a bounded window.
**Confidence:** High.

#### [P1] A-2. Every production migration re-seeds and overwrites admin-edited platform configuration and email templates
**Category:** Data loss / Operations — **Confirmed bug**
**Location:** `laravel-server/routes/web.php:10-22` (`Artisan::call('migrate --seed --force')`), `laravel-server/database/seeders/DatabaseSeeder.php:85-87`, `laravel-server/database/seeders/SystemConfigSeeder.php:151-163` (`SystemConfig::setVal(...)` → `updateOrCreate`), `laravel-server/database/seeders/EmailTemplateSeeder.php:154` (`EmailTemplate::updateOrCreate`).
**Problem:** Production has no shell access; migrations are applied by hitting `GET /migrate-db?key=…`, which is hard-wired to `migrate --seed --force`. `SystemConfigSeeder` unconditionally calls `setVal()` for `subscription_plans`, `global_suggestions` (`[]`), `referral_program` and `smartsupp_key` (`''`), and `EmailTemplateSeeder` uses `updateOrCreate`. Both overwrite whatever a super-admin has since edited through `PUT /admin/system-configs/{key}` and the email-template admin UI. (`RolesAndPermissionsSeeder` and `PaymentAccountSeeder` correctly use `firstOrCreate`; the super-admin block is guarded by an `exists()` check — so the pattern is inconsistent, not uniformly wrong.)
**Why it matters:** Plan pricing/limits/feature flags, the referral-reward settings, the Smartsupp key and the global autocomplete suggestions every client downloads after each sync (`sync-engine/index.ts:155-163`) silently revert to the checked-in defaults every time the platform ships a migration. The storefront platform fee (`storefront_platform_fee_percentage`) is not in the seeder and survives; the rest does not.
**Evidence:** `SystemConfig::setVal()` is `updateOrCreate` with `value` in the update set (`app/Models/SystemConfig.php:39-51`) and clears the cache; the seeder is called from `DatabaseSeeder::run()` on every invocation; `docs/FIXED_BUGS.md` already records that this seeder chain re-runs on every production deploy (the hardcoded super-admin password fix), which confirms the route is used as described.
**Failure scenario:** Super-admin raises Pro pricing and disables a feature flag in the admin panel on Monday; a hotfix migration ships Thursday; `/migrate-db` is hit; pricing and flags revert, `global_suggestions` becomes empty and every client's autocomplete list is blanked on its next sync. Nobody is notified.
**Recommended fix:** Make the seeders idempotent-if-present (`firstOrCreate`, or guard on "key does not exist"), and/or separate `migrate` from `--seed` in the route (seed only on first install). Add a regression test that runs the seeder twice after editing a value and asserts the edit survives.
**Confidence:** High.

#### [P1] A-3. Server pull tenant scoping materialises whole id lists in PHP and rebuilds them for every table on every page; offset pagination compounds it
**Category:** Performance / Scalability (server) — **Likely performance problem (will become an outage as stores age)**
**Location:** `laravel-server/app/Http/Controllers/Api/App/SyncController.php:821-913` (`applyPullTenantScope`), `:876-881` (`->pluck('id')` for `sale_items`, `return_items`, `prescription_items`, `purchase_order_items`, `stock_batches`, `sale_item_batches`), `:799-810` (`skip($offset)->limit(501)`), `:2018` (`counts()` does the same for products).
**Problem:** For every one of the 29 pulled tables, on every page of every pull, the scope method re-resolves the owner (`Store::where(...)->value`), the owned store list and `User::whereIn(...)->pluck('id')`, then for the six child tables executes a *separate* query that plucks **every parent id the tenant owns into a PHP array** and inlines it as `WHERE ... IN (…)`. `sale_item_batches` nests three plucks (`Sale` → `SaleItem` → ids). None of this is cached across the 29 iterations or across pages. `Schema::hasColumn()` in `applyPullCursor` also runs per table per page (Laravel does not cache it). Separately, `fetchPullPage` uses `skip($offset)`, so a table with N changed rows is scanned O(N²/500) over a full initial sync.
**Why it matters:** This runs on shared hosting, on every 30-minute background pull from every device, even when nothing has changed. For a store with 70,000 sales and 200,000 sale items, each pull page builds and sends a 70,000-value `IN` list for `sale_items` and a 200,000-value one for `sale_item_batches` (roughly 8 MB of query text) and holds those arrays in PHP memory; MySQL has to parse and de-duplicate them. Initial sync of a large table also degrades page by page because of `OFFSET`.
**Evidence:** `->pluck('id')` executes the query and returns a Collection (not a subquery), which Laravel's `whereIn` serialises as bound parameters. The `counts()` method's own comment acknowledges it must mirror this scoping.
**Failure scenario:** A two-year-old store with three devices: every device's 30-minute pull spends most of its time building id lists; PHP `memory_limit` or MySQL `max_allowed_packet` is hit first on `sale_item_batches`, the pull 500s, `pull.ts` throws, `sync()` reports failure and logs a crash for every device, and the store loses background sync entirely until the query is rewritten.
**Recommended fix:** Express the scope as a correlated subquery / join (`whereIn('sale_id', Sale::select('id')->whereIn('store_id', …))` — passing a Builder, not a Collection), resolve `$storeIds`/`$userIds` once per request, cache `Schema::hasColumn` per request, and move page selection to a keyset cursor on `(updated_at, id)`.
**Confidence:** High on the code shape; Medium on when a real store crosses the practical limit (no production row counts were available).

---

## 3. Medium-priority findings (P2)

#### [P2] A-4. Fulfilled online orders are recorded under `sales.cashier_id`, not `user_id`, so they vanish from every cashier-attributed view on the fulfilling device
**Category:** Bug / Reporting — **Confirmed bug**
**Location:** `client/lib/hooks/use-fulfill-online-order-mutation.ts:92` (`cashier_id: cashierId`), `:91` (`payment_status: "paid"`); readers: `client/lib/db/queries/sales.ts:243-290` (`getRecentSales` filters/joins on `s.user_id`), `:155-171` (`getTopStaffByDate` joins `users` on `s.user_id`), `client/lib/db/queries/reports.ts:202-209, 647-661` (dashboard feed and `cashierPerformance` on `s.user_id`), `client/lib/hooks/use-my-today-sales.ts`.
**Problem:** The local `sales` table has both `user_id` (the column every query reads) and a migration-added `cashier_id` (`schema-migrations.ts:209`, present only so pulled rows don't fail on an unknown column). The online-order fulfilment path writes the cashier into `cashier_id` and leaves `user_id` NULL. On the fulfilling device the sale therefore has no cashier for any report; after it round-trips through the server, `mapPullRowForClient` maps `cashier_id → user_id`, so *other* devices see the correct cashier — the same sale is attributed differently per device. `payment_status: "paid"` is also outside the client's own vocabulary (`completed | pending | partial | refunded | partially_refunded`), so any status filter or `applyCreditPaymentFIFO`-style logic keyed on those values treats it as unknown.
**Why it matters:** A cashier who fulfils online orders sees them missing from "My Sales Today"/"My Transactions Today" and the Recent Sales history; the owner's staff-performance report undercounts that cashier on that device but not on another; end-of-day reconciliation by staff disagrees between terminals.
**Failure scenario:** Store fulfils 12 online orders on the counter tablet; the owner's laptop (after sync) shows them under the cashier, the tablet shows them under nobody; the cashier's shift total on the tablet is short by 12 sales.
**Recommended fix:** Write `user_id` (matching `use-pos-payment.ts`) and use `completed` for `payment_status`; add a test asserting the local row's `user_id` is set.
**Confidence:** High.

#### [P2] A-5. The plan-tier sync-interval throttle is enforced only against a client-controlled flag, and the client's own background daemon always sets it
**Category:** Architecture / Business rule / Performance — **Confirmed (design gap)**
**Location:** `client/components/dashboard/sync-indicator.tsx:201, 210` (auto-sync calls `handleManualSync()` → `sync(true)`), `client/lib/db/sync-engine/push.ts:240` (`getPendingSyncItems(isManual)` → backoff ignored), `laravel-server/app/Http/Controllers/Api/App/SyncController.php:2130, 2189` (`$isManual = $request->boolean('manual')`, throttle skipped when manual).
**Problem:** The server-side `sync_interval` limit per tier (180 min / 30 min / 0 in `SystemConfigSeeder`) is bypassed whenever the request carries `?manual=1`, and both the interval daemon and the instant-sync listener in `SyncIndicator` send `manual=1` for every background sync. Two consequences: (1) the plan restriction is decorative — the only thing rate-limiting a Local-tier store is its own `stores.auto_sync_interval` row, which the same client writes; (2) because `isManual` also means "ignore per-item backoff", a permanently failing queue item (unknown column, FK violation) is re-sent on every background cycle — every 2 s of activity in instant mode — instead of backing off, burning the shared 60 req/min API budget and repeatedly hitting the server's per-change savepoint path.
**Note (latent):** if the daemon ever stops sending `manual=1`, the server throttle as written would reject every push batch after the first in a multi-batch backlog (batch 1 stamps `last_sync_at`, batch 2 arrives 1.1 s later with `minutesSinceLastSync === 0` and no pull-style same-minute exemption on the push side) — so the throttle logic itself needs fixing before the flag is ever honoured.
**Recommended fix:** Decide whether the interval is a product rule; if so enforce it server-side from `last_sync_at` regardless of the flag (and exempt consecutive batches of one push run, e.g. by a per-run token), and have the client daemon call `sync(false)` so backoff is respected; keep `manual=1` for the button only.
**Confidence:** High.

#### [P2] A-6. The local SQLite schema has a single index; every hot read path on a mature store is a full-table scan or correlated scan
**Category:** Performance / Low-end device — **Likely performance problem (measured)**
**Location:** `client/lib/db/schema.ts` (only `idx_stock_batches_product_id`), `client/lib/db/schema-migrations.ts:815-820`; affected queries: `sales.ts:274-289` (`getRecentSales`: three correlated subqueries per row over `sale_items`/`returns`), `customers.ts:6-26, 36-50` (`getCustomers`, `getCustomerTotalSpent`), `activity-log.ts:81-101` (`COUNT(*)` + `ORDER BY created_at` over `audit_logs`), `products.ts:152-175` (`getProductHistory` by `record_id`/`product_id`), `product-import.ts:90-117` (barcode/name lookups per imported row), `reports.ts:218-227` (dashboard movements feed), `inventory.ts:784-866` (`getFastMovers` correlated returns subqueries), `pull.ts:286-289` (`_sync_queue` lookup per pulled record), `reconcile-identity.ts:96-101` (boot-time orphan scan).
**Problem:** There are no indexes on `sale_items(sale_id)`, `returns(sale_id)`, `sales(store_id, created_at)`, `sales(customer_id)`, `stock_movements(product_id | store_id, created_at | reference_id)`, `audit_logs(store_id, created_at | record_id)`, `products(barcode | name | store_id)`, or `_sync_queue(table_name, record_id)`. sql.js runs on the main thread, so each of these blocks paint for its full duration; on Tauri the cost lands on the SQLite worker thread instead but still gates every screen.
**Evidence:** See the benchmark table in §5 (synthetic store: 5k products, 8k batches, 2k customers, 50k sales, ~125k sale items/movements, 3k returns, 200k audit rows, 15k queued rows). The unindexed vs. indexed columns are the measured cost of the same statements with and without the indexes listed above.
**Failure scenario:** After a year, a cashier opening the POS History tab, the owner opening Customers, or anyone opening the Activity Log on an entry-level Android tablet sees a multi-second freeze; a CSV re-import of the catalog takes minutes instead of seconds; the boot-time orphan scan and every pull's `_sync_queue` lookups add seconds to launch and to each sync.
**Recommended fix:** Add the indexes above in `SCHEMA_SQL` and as an idempotent step in `runSchemaMigrations` (the `ensureStockBatchesProductIndex` pattern already exists); re-run the benchmark after.
**Confidence:** High.

#### [P2] A-7. App launch is gated behind a full network sync (up to 5 s of splash) on every online start, and the gate re-fires as the store profile settles
**Category:** Performance / Startup — **Likely performance problem**
**Location:** `client/components/auth/license-guard.tsx:236-302` (`performCheck` awaits `Promise.race([sync(true), 5 s timeout])` while rendering `<SplashScreen/>`; effect deps `storeProfile?.status/suspension_reason/subscription_tier`), `client/lib/context/store-context.tsx:411-452` (a second mount-time `sync()`), `:457-493` (`syncSubscriptionStatus()` on mount and every 30 min).
**Problem:** Every online launch runs a full push+pull round (plus the `global_suggestions` config fetch) before the app is allowed to render, bounded only by a 5-second race. `storeProfile` is `undefined` on the first render, so once the profile query resolves the three dependencies change and `performCheck` runs again (a second `sync(true)`, which usually returns `SYNC_IN_PROGRESS` immediately, but on a fast first sync starts a *second* real round). `StoreProvider` fires a third `sync()` and a `syncSubscriptionStatus()` on mount. A device with a large queue (§A-1) or a slow link pays the full 5 s on every launch and every store switch.
**Why it matters:** The product's stated value is "every screen works fully offline"; on a slow or captive-portal network (`navigator.onLine` true), launch is consistently ~5 s slower than offline launch. On a low-end tablet the sync's own sql.js work competes with first paint.
**Recommended fix:** Render immediately from local state and run the license-refresh sync in the background (the guard already treats a null result as "keep the previous license"); de-duplicate the mount-time sync triggers into one owner (the `SyncIndicator` daemon or `StoreProvider`).
**Confidence:** High on the mechanism; Medium on user-visible magnitude (depends on network).

#### [P2] A-8. Every pull runs a `stores` prune with one `NOT IN (SELECT DISTINCT store_id …)` subquery per store-scoped table, and every boot scans all 26 tables for orphaned rows
**Category:** Performance / Startup / Sync — **Likely performance problem (measured)**
**Location:** `client/lib/db/sync-engine/pull.ts:444-482` (`stores` is always a full snapshot, so this runs on every pull round), `client/lib/db/reconcile-identity.ts:90-138` + `client/lib/db/DatabaseProvider.tsx:120-125` (`requeueOrphanedRows(STORE_SCOPED_TABLES)` on every boot).
**Problem:** The prune builds a query with 26 `NOT IN (SELECT DISTINCT store_id FROM <table> WHERE store_id IS NOT NULL)` clauses — each a full scan of `sales`, `sale_items`, `stock_movements`, `audit_logs`, … — to decide whether a store row can be soft-deleted, on every pull even when the `stores` list is unchanged. The orphan scan does `SELECT * … WHERE (_synced = 0 …) AND id NOT IN (SELECT record_id FROM _sync_queue WHERE table_name = ?)` per table; without an index on `_synced` or on `_sync_queue(table_name, record_id)` this is a scan of every table plus a scan of the queue per row candidate.
**Evidence:** Benchmark in §5.
**Recommended fix:** Only run the prune when the set of server store ids actually changed (compare to the local set first); for the orphan scan, index `_sync_queue(table_name, record_id)` and either index `_synced` or run the scan once per install/after a crash flag rather than every boot.
**Confidence:** High.

#### [P2] A-9. Receiving the same purchase order from two devices books the delivery twice
**Category:** Data / Concurrency (multi-device) — **Potential issue requiring verification**
**Location:** `client/lib/db/procurement-receiving.ts:53-57` (`poData` read *outside* the transaction; `alreadyReceived`/`outstanding` computed from that snapshot at `:66-67`), `laravel-server/.../SyncController.php:472-497` (only the `purchase_order_items` UPDATE is version-checked; the `stock_batches` INSERT + `stock_movements` INSERT from both devices are independent rows and are both accepted).
**Problem:** The single-device double-click is guarded by the UI (`receive-po-panel.tsx:348-351` disables the button while `isReceiving`), but two devices receiving the same PO concurrently (or one device receiving while the other's receipt has not yet synced) both compute the full outstanding balance, both create a batch and a purchase movement, and both push. The server accepts both batch inserts and both movement deltas (stock is now double), and rejects one of the two `quantity_received` updates as a `version_conflict` (dropped silently per `push.ts:566-594`), leaving the PO showing a single receipt while on-hand stock reflects two.
**Failure scenario:** Delivery arrives; the owner receives it on the laptop while the stock clerk receives it on the tablet before the laptop's push lands. Stock is doubled, and the PO shows "received" once, so nothing looks wrong until a cycle count.
**Recommended fix:** Re-read `quantity_received` inside the transaction (the pattern `submitStockAudit` already uses for system quantity) and, on the server, treat a `purchase_order_items` `quantity_received` UPDATE that would exceed `quantity_ordered` as a conflict that also rejects the accompanying batch/movement (or key the receipt batch on a deterministic id per PO line + receipt sequence so the second one collides).
**Confidence:** Medium (multi-device path traced; not reproduced).

#### [P2] A-10. `SystemConfig` is publicly readable for any key, and two unauthenticated write endpoints have no rate limit
**Category:** Security / Abuse surface — **Confirmed**
**Location:** `laravel-server/routes/api.php:35-36, 72` (`GET /system-configs/{key}`, `POST /support`, `POST /logs/client-error` outside every `throttle:*` group), `laravel-server/app/Http/Controllers/Api/SystemConfigController.php:27-35` (returns `SystemConfig::getVal($key)` for any key with no allow-list), `laravel-server/app/Http/Controllers/Api/Web/ActivityLogController.php:75-118` (writes attacker-controlled `message`/`details` into `laravel.log`; also an `activity_logs` row per call when a token is present).
**Problem:** The client legitimately needs `global_suggestions`, `subscription_plans` and `require_email_verification`; but the endpoint hands back any stored key, including `referral_program` (reward amounts), `storefront_rebuild_requested_at`, `default_account_manager_id` (a user id), and anything a future admin adds via the "arbitrary JSON for arbitrary keys" update endpoint. Laravel 11+ applies no default API throttle (documented in `laravel-server/AGENTS.md`), so the two public POSTs can be used to fill the shared host's disk via `laravel.log` or to spam support tickets, and `/logs/client-error` accepts an unbounded `details` array.
**Recommended fix:** Add an explicit allow-list of public config keys to `show()`; put `/support` and `/logs/client-error` behind their own named limiters (the storefront limiters are the pattern); cap `details` size.
**Confidence:** High.

#### [P2] A-11. Staff accounts created without a password get a 4-digit web-dashboard password (their PIN, or the literal `1234`)
**Category:** Security — **Confirmed (documented as "not secure", but the exposure is real)**
**Location:** `laravel-server/app/Http/Controllers/Api/Web/StaffController.php:197-198` (`$pin = $request->pin ?: '1234'; $password = … Hash::make($pin)`), `laravel-server/app/Http/Controllers/Api/App/SyncController.php:297-300` (same fallback on the sync-push INSERT path), `AuthenticatesSessions::login` (any active user, staff included, can mint a Sanctum token with that password and reach every `/app/*` and `/dashboard/*` route their role allows).
**Problem:** The staff form's password field is optional and the API docs say to "treat staff accounts as PIN-first" — but the derived password is also a valid credential for `/login` with a 10,000-value keyspace, and the auto-generated email `username@local.dumosrx.com` is predictable. `throttle:auth` is 5/min per IP, which slows but does not prevent a distributed guess; the `NewDeviceLoginEmail` goes to the fake `@local.dumosrx.com` address, so nobody is warned.
**Recommended fix:** Never derive a login password from the PIN; either require a real password for web login or mark PIN-only staff as `password = null` and reject `/login` for them (the POS never uses `/login` for staff).
**Confidence:** High.

---

## 4. Low-priority findings (P3)

#### [P3] A-12. Every pull resets `stores.last_monotonic_time` to the server's value (NULL), silently disarming the offline clock-tamper guard after each sync
**Category:** Security (licensing) — **Potential issue requiring verification**
**Location:** `client/lib/db/sync-engine/pull.ts:295-309` (UPDATE sets every column the server returns, and the local `stores` table has `last_monotonic_time`), `laravel-server/.../SyncController.php:921-923` (`$item->toArray()` includes it), `client/lib/db/queries/setup.ts:93-95` (`updateStoreMonotonicTime` is a raw `execute`, never pushed), `client/lib/licensing/licensing-manager.ts:59-71`.
**Problem:** The monotonic timestamp is written locally only and never pushed, so the server's copy stays NULL; the next pull writes that NULL back over the local value, and `checkLicenseStatus()` then skips the "clock went backwards" check and re-arms from the current (possibly rolled-back) time. The anti-backdating rule that `.agents/AGENTS.md` §8 says must not be weakened is therefore only effective between two syncs. Conversely, if any path ever *does* push it (`window.forceSyncAllData` queues full `stores` rows), a device whose clock runs ahead would propagate a future timestamp to every other device of the store and lock them out with "Clock Discrepancy".
**Recommended fix:** Exclude `last_monotonic_time` (and other device-local columns) from the pull's column set, the same way `stock_batches.quantity` is already excluded.
**Confidence:** Medium (read from code; not executed against a live server).

#### [P3] A-13. The Tauri webview runs with `csp: null`
**Category:** Security hardening (desktop/Android) — **Confirmed configuration**
**Location:** `client/src-tauri/tauri.conf.json` (`"security": { "csp": null }`, `"withGlobalTauri": true`), capabilities grant `fs:allow-read-file`, `fs:allow-copy-file`, `sql:allow-*`, `dialog:*`, `shell:default`.
**Problem:** No content-security policy means any script injection in the webview (a future `dangerouslySetInnerHTML`, a compromised CDN font/script, an XSS in synced data rendered unsafely) would execute with `window.__TAURI__` in scope and the granted capabilities: read the SQLite file, copy it, open the shell. Today the only `dangerouslySetInnerHTML` (`components/ui/chart.tsx:97`) renders config-driven CSS, so this is defence-in-depth, not an active hole.
**Recommended fix:** Set a CSP (Tauri injects nonces for its own IPC) and drop `withGlobalTauri` unless something needs the global.
**Confidence:** High.

#### [P3] A-14. `DatabaseProvider`'s "Reset App Data" button does not reset the database, and uses `window.confirm`
**Category:** Bug / UX — **Confirmed**
**Location:** `client/lib/db/DatabaseProvider.tsx:255-265`.
**Problem:** On a fatal init error the recovery button calls `localStorage.clear()` and reloads; the database lives in IndexedDB (`dumosrx_db`), so a corrupt or un-openable blob survives the "reset" and the same error screen returns, while the user has just lost their auth token, recent-users list, cart and lock state. It also uses the native `window.confirm`, which `.agents/AGENTS.md` §9 forbids.
**Recommended fix:** Snapshot the blob to `dumosrx_db_pre_reset_backup`, delete the IndexedDB key, then reload; use the app's `AlertDialog`.
**Confidence:** High.

#### [P3] A-15. Production builds ignore TypeScript errors
**Category:** Maintainability — **Confirmed**
**Location:** `client/next.config.mjs` (`typescript: { ignoreBuildErrors: true }`); `deploy-client.yml` runs `rm package-lock.json && npm install --legacy-peer-deps` before `npm run build`.
**Problem:** `tsc` is clean today, but nothing in CI enforces it: a type error reaches production if the developer skips the manual `npx tsc --noEmit` that `client/AGENTS.md` asks for. Deleting the lockfile on every deploy also makes production builds non-reproducible (dependency versions can drift between two deploys of the same commit, and `overrides` in `package.json` are the only pin).
**Recommended fix:** Run `tsc --noEmit` and `vitest` as CI steps before the build; use `npm ci` with the committed lockfile.
**Confidence:** High.

#### [P3] A-16. `createPrescription` and `createProduct` are not transactional
**Category:** Data integrity — **Confirmed**
**Location:** `client/lib/db/local-database.ts:197-219` (header insert, then a loop of item inserts, no `transaction()`), `:99-120` (category insert then product insert).
**Problem:** Each `insert()` opens and commits its own transaction, so an interruption between the prescription header and its items (iOS backgrounding a PWA is called out elsewhere in this codebase as aggressive about this) leaves a prescription with no medications, already queued for sync. Same shape for a product whose freshly created category never gets a product.
**Recommended fix:** Wrap in `transaction()` like `createSale`/`receivePurchaseOrder`.
**Confidence:** High.

#### [P3] A-17. POS cart snapshots price and average cost at add time and persists them indefinitely
**Category:** Bug / Money — **Confirmed (low frequency)**
**Location:** `client/lib/hooks/use-pos-cart.ts:51-74` (zustand `persist`), `:252-260` (`unit_price`/`cost_price` copied from the product when added), `client/lib/hooks/use-pos-payment.ts:268-279` (checkout uses `item.unit_price`/`item.cost_price` from the cart).
**Problem:** A cart held overnight, or across a price change synced from the owner's device, is charged at yesterday's selling price and books COGS at the average cost as of add time. Stock is validated only at add/increment time against the catalog snapshot in memory; the sale then deducts whatever is there (oversell handling covers the ledger, not the price).
**Recommended fix:** Re-price cart lines from the current catalog at checkout (or at cart hydration), and warn when a line's price changed.
**Confidence:** High.

#### [P3] A-18. A `COUNT(*)` of the sync queue is polled every 5 seconds on the main thread from the action-centre hook
**Category:** Performance / Low-end device — **Confirmed**
**Location:** `client/lib/hooks/use-action-center-alerts.ts:57-61` (`refetchInterval: 5000`), duplicated by `client/components/dashboard/sync-indicator.tsx:57-64` (30 s) on the same query key; `notification-bell.tsx:102` (60 s network poll), `use-action-center-alerts.ts:63-67` (`checkLicenseStatus()` every 5 min, which also performs a write).
**Problem:** The 5-second poll is the exact "poll against main-thread sql.js" the sync indicator's comment says was removed there; because both hooks share `queryKeys.sync.queueCount()`, the shorter interval wins for the whole app while the dashboard is mounted. Each tick takes the connection-wide lock (`reserveDbSlot`), so it also queues behind any in-flight import/sync transaction.
**Recommended fix:** Drop the 5 s interval and rely on the existing `addSyncQueueChangeListener` event path.
**Confidence:** High.

#### [P3] A-19. Legacy cloud CRUD endpoints (`/app/sales` POST etc.) are live but unused, and `SaleController::store` writes stock outside the movement-delta model
**Category:** Architecture / Attack surface — **Confirmed (dead-from-the-client code)**
**Location:** `client/lib/api/client.ts:122-256` (comment: "no callers left in the app"), `laravel-server/routes/api.php:264-288`, `laravel-server/app/Http/Controllers/Api/App/SaleController.php:81-279` (`$batch->quantity -= $deduct; $batch->save()` directly), `:32-50, 293-309` (`index`/`show` scoped by cashier ids, not `store_id` — a multi-store owner sees every store's sales).
**Problem:** Any staff token can create sales, products, customers, suppliers and categories through REST paths that bypass the client's audit-log/correlation/version conventions. `SaleController::store` mutates `stock_batches.quantity` directly while *also* inserting a `stock_movements` row; every device pulling that movement applies its delta locally (`pull.ts:373-408`), which is consistent with the server value only because the server also skipped its own delta path here — a fragile coincidence that the next refactor can break.
**Recommended fix:** Remove or explicitly gate the unused endpoints; if kept, route stock changes through the same delta accumulation the sync path uses.
**Confidence:** High.

#### [P3] A-20. `_sync_queue` and `audit_logs` have no local retention, and the queue stores a full-row JSON snapshot per write
**Category:** Performance / Storage growth — **Likely performance problem**
**Location:** `client/lib/db/base-helpers.ts:402-415`, `client/lib/db/core.ts:1497-1517`, `client/lib/db/schema.ts` (no pruning anywhere; `resetDatabase` is the only path that clears `audit_logs`).
**Problem:** On the web/PWA build every write re-serialises the entire database (`saveDatabase()` → `db.export()`, see `docs/DATABASE_CONCURRENCY.md` §2.4). `audit_logs` grows by 10–15 rows per sale forever and is pulled to every device (see A-1), so the export cost, the IndexedDB blob size and the memory footprint grow without bound. The benchmark's synthetic year-old store exports at the size shown in §5 on every write.
**Recommended fix:** Local retention for `audit_logs` (keep N days locally once `_synced = 1`; the server keeps the full trail), and stop pulling `audit_logs` to devices that never render it.
**Confidence:** High.

#### [P3] A-21. `returns.user_id`/`stock_audits.user_id` fall back to the literal string `"system"`, which violates the server's foreign key
**Category:** Sync / Data — **Potential issue requiring verification**
**Location:** `client/lib/hooks/use-process-return-mutation.ts:44` (`user_id: userId || "system"`), `client/lib/db/queries/inventory.ts:653` (`user_id: performedBy || "system"`), `laravel-server/database/migrations/2026_06_22_190000_create_returns_system_tables.php:17` (`foreignUuid('user_id')->constrained('users')`).
**Problem:** If the caller ever passes an undefined user (the return dialog is reachable while `useAuth().user` is null for a frame; the audit path is also reached from CSV import with `performedBy` from the caller), the row is written locally but every push fails with an FK error, is retried through backoff and reported as a stuck sync item after 5 attempts — the exact "feedback anonymous user" failure shape already fixed for another table.
**Recommended fix:** Require a real user id (throw early) rather than a sentinel.
**Confidence:** Medium.

#### [P3] A-22. `saveDatabase()` calls are not serialised and there is no flush on `pagehide` (carried from `docs/DATABASE_CONCURRENCY.md` §2.4, still open)
**Category:** Data / Persistence (web/PWA) — **Confirmed by reading; not observed**
**Location:** `client/lib/db/core.ts:357-380, 709` (`void saveDatabase()`), no `pagehide`/`visibilitychange` handler in `lib/db/`.
**Problem:** Two back-to-back `execute()` calls each fire-and-forget an IndexedDB `set()`; the exports are taken in order, but the writes can in principle complete out of order, leaving an older image persisted (silent; no version stamp). The recommendation in that document ("chain saves on a module-level promise; add a `pagehide` save") has not been implemented, while its other three short-term items (the three lock bypasses, the mis-promotion `.catch`, the takeover UI) have been.
**Confidence:** Medium (IndexedDB readwrite transactions on one store are ordered in practice, which is why this has probably never fired).

#### [P3] A-23. `CustomEvent`/`localStorage`-driven cross-module state has grown into an undocumented event bus
**Category:** Architecture / Maintainability — **Maintainability problem**
**Location:** `dumos_sync_completed`, `dumos_subscription_updated`, `dumos_db_save_failed`, `dumos_db_read_only_write_blocked`, `auth_token_set`, `auth_token_cleared` (dispatched from `core.ts`, `sync-engine/index.ts`, `token-manager.ts`; consumed by `auth-context.tsx`, `store-context.tsx`, `sync-indicator.tsx`, `DatabaseProvider.tsx`, `license-guard.tsx`…), plus a dozen `localStorage` keys read directly (`auth_token`, `dumos_user`, `dumos_active_store_id`, `last_sync_time`, `dumos_suggestions`, `dumos_recent_users`, …) by both React and non-React modules.
**Problem:** There is no single place that lists these names or their payloads; several are read in different places with different fallbacks (e.g. the active store id is read from `localStorage` in `client.ts` for the `X-Store-Id` header and from the module resolver in `core.ts` for queries — `auth-context.tsx:394-420` documents a real bug that came from exactly that split). Each new subsystem adds another listener.
**Recommended fix:** A typed `events.ts`/`storage-keys.ts` module (constants + typed dispatch/subscribe helpers) so the names cannot drift and the payloads are visible.
**Confidence:** High.

#### [P3] A-24. Stray backup file in the server test suite
**Category:** Maintainability — **Confirmed**
**Location:** `laravel-server/tests/Feature/SyncPushRowLockTest.php.bak2`.
**Problem:** A `.bak2` copy of a test lives alongside the real one; PHPUnit ignores it, but it will confuse the next person diffing the two.
**Confidence:** High.

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
- **Why not fixed already:** `setToken`/`clearToken` mirror the token to native Tauri code (`lib/native/widget-bridge.ts` → Android `TokenStore`, which does use `EncryptedSharedPreferences`) so the home-screen widget can make its own authenticated requests. A real fix needs a dual-path auth design. See also A-13 (a CSP would be the compensating control on the desktop/Android side).
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
- **Location:** `app/Http/Controllers/Api/Web/PaymentController.php:128-163`; same shape in `app/Http/Controllers/Api/Web/SubscriptionController.php:525-537`
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

Synthetic dataset built from the app's own `SCHEMA_SQL` plus the migration-added `store_id`/`cashier_id` columns: 5,000 products, 8,000 batches, 2,000 customers, 50,000 sales, ~125,000 sale items and ~125,000 stock movements, 3,000 returns, 200,000 audit rows, 15,000 queued sync rows. Each row is the SQL the app actually issues (see the file references in A-6/A-8). **These are desktop numbers; the same WASM engine on an entry-level Android phone is typically 5–20× slower, and on the web build every one of these blocks the main thread.**

BENCHMARK_TABLE_PLACEHOLDER

### Other performance risks (not individually benchmarked)

- **A-7** (launch gated on a network sync) and **A-18** (5-second queue poll) are the two startup/idle costs most likely to be felt on a low-end tablet.
- **First install download (PWA):** `precache-manifest.json` lists every file in the export — 399 URLs, ~15 MB including both 650 KB sql.js WASM binaries and every route's HTML + RSC payload — on first install (`client/AGENTS.md` already lists this as an open thread). On a metered connection this is the single largest network cost the app incurs.
- **Whole-catalog in-memory search:** `getProductsWithDetails()` returns the entire catalog with six correlated subqueries per row (fast with the one existing index — see table), and `product-database.tsx` fuzzy-searches it in memory (now debounced). Acceptable to ~10k products; beyond that the transform+filter+sort chain on every filter change is O(catalog) on the main thread.
- **Server `applyPullTenantScope`** (A-3) and the per-request `validateSync()` chain (`SubscriptionService`, `SystemConfig::getVal`, `PermissionGroupSeeder::ensureSeeded`, `enforceStaffLimits`) add ~10 queries to every push and pull request before any data is touched.
- **`getStockMovements()` with no window** loads the whole `stock_movements` table (by design, only when searching/filtering) — with A-6's missing indexes and ~125k rows this is several hundred ms and a large result set held in React state.
- **`db.export()` per write** (`docs/DATABASE_CONCURRENCY.md` §2.4) — the export size in the table above is what every single `execute()` outside a transaction re-serialises and writes to IndexedDB on the web build. This is the dominant long-term scaling problem for the PWA and is unchanged since that document was written.

---

## 6. Offline / sync / database risks

- **A-1** (pull page cap) is the most consequential sync finding; **A-3** is its server-side counterpart.
- **A-5** — background sync is indistinguishable from manual sync to the server, so backoff and plan throttling are effectively off.
- **A-8** — every pull round pays the `stores` prune; every boot pays the orphan scan.
- **A-9** — multi-device PO receipt has no server-side idempotency beyond the version check on one of its rows.
- **A-12** — pull overwrites a device-local column.
- **A-21** — sentinel user ids can produce permanently-stuck queue items.
- **A-22** — unserialised `saveDatabase()`; no `pagehide` flush.
- **`docs/DATABASE_CONCURRENCY.md` status check:** its three short-term items are done — `restoreDatabase()`/`resetDatabase()`/`clearDatabaseForNewStore()` now call `assertWritable()` (`core.ts:933, 1340, 1372`), the queued-promotion rejection is scoped away from the outer `.catch` (`tab-lock.ts:314-329`), and the graceful handoff + `steal` fallback with UI exists (`tab-lock.ts:177-246`, `DatabaseProvider.tsx:67-90`). Two of its "cheap" items remain (A-22). Two residual notes on the new handoff code: `resetDatabase()`/`clearDatabaseForNewStore()` still call `db.run()` directly rather than through `reserveDbSlot()`, so they can interleave with an in-flight yielding `query()`; and a stolen-from tab only learns it lost the lock via the `steal-notice` broadcast, which a frozen tab receives only on thaw — its `holdUntilTakeover()` promise is rejected by the browser first, and `writerTab` stays `true` until the notice arrives (the doc's "frozen holder that later thaws" caveat still applies).
- **Server-side row-lock duration:** `SyncController::push()` holds `lockForUpdate()` row locks for the whole outer transaction (documented at `:383-393`); with 50-change batches from several devices this is bounded but is the first place to look if "Lock wait timeout" appears in server logs.
- **Healthy (re-verified):** version-equality conflict resolution and the `versions`/`id_map` echo; the quantity-only `stock_batches` exemption; delta application floored at 0 on both sides; `markSynced` flipping `_synced`; `audit_logs` terminal-conflict settling; deferred movement deltas committed atomically with the `stock_movements` cursor; the `stores` snapshot prune only touching stores with no local data; `awaitSettledTransactions()` before reading the queue; `pull.ts` skipping rows with pending local edits and holding the cursor; `UNIQUE`-collision give-up after 5 retries; the boot-order rule (writer election before migrations).

---

## 7. Architecture and technical debt

- **A-5**: the server trusts a client flag for a billing-relevant limit; the "manual" concept needs to mean one thing.
- **A-19**: a second, unused write API coexists with the sync engine and does not share its invariants (delta-derived quantities, audit trail, `_version`).
- **A-23**: the cross-module event/`localStorage` bus is undocumented and duplicated (the active store id has two sources of truth: `localStorage["dumos_active_store_id"]` for headers, the `core.ts` resolver for queries).
- **Two tenant-resolution copies on the server remain** (carried): `SaleController` and `DashboardService` hand-roll the staff→owner lookup instead of a shared `Request`-free helper, and `TenantScopingArchitectureTest` still scans controllers only.
- **`core.ts` is 1,558 lines and `SyncController.php` 2,264 lines** against the project's own 350-line guideline; `getProductsWithDetails`-style "load everything, filter in React" is the norm for catalog/customers/PO lists (documented as intentional; the cutoff at which it stops being fine is not written down anywhere).
- **Two client-side sale-recording paths exist** (`recordSaleItemStock` for POS/online orders; `local-database.ts::createSale` for demo seeding only) — the comment on the second is clear, but it still writes `stock_batches.quantity` directly with a raw `UPDATE` rather than through `update()`, so a demo-seeded batch is the one batch the version model never saw.
- **`typescript.ignoreBuildErrors`** (A-15) and the deploy's lockfile deletion mean the repo's own quality gates (`tsc`, `vitest`, `php artisan test`) are advisory, not enforced. `composer audit`/`npm audit` are still not run in CI (carried from the previous pass).
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
- **Server tenant scoping**: `authorizeChangeTarget`/`resolveChangeStoreId` mirror `applyPullTenantScope`; INSERT payloads naming a foreign `store_id` are rejected; `users`/`stores`/`permission_groups` payloads are allow-listed; `audit_logs` matched only by `properties->client_id` within the pushing store; DELETE against `audit_logs` rejected outright.
- **Auth**: PIN hashed (bcrypt) with lazy migration; lockout with countdown; multi-store username/PIN ambiguity fails closed; Sanctum refresh rotates tokens and only clears on a definitive 401/403; admin panel access token memory-only with a `refresh`-ability cookie; the Android widget's mirrored token uses `EncryptedSharedPreferences`.
- **Permissions**: one owner of permission-group state (`AuthContext`), corrupt rows deny rather than fall back, `useMemo` tripwire preserved.
- **Service worker**: precache is all-or-nothing on the shell, per-URL otherwise; both the navigation and asset branches refuse HTML under a non-HTML key; RSC `.txt` keys normalised; `controllerchange` reload.
- **Tauri**: vendored SQL plugin pinned to one pooled connection so `BEGIN/COMMIT` are real; WAL + busy_timeout; restore checkpoints the WAL and refuses to overwrite past a failed `close()`; updater artifacts are signed and CI fails if the signing secrets are missing.
- **Money/tax math** (`pos-calculations.ts`, `finance.ts`, `reports.ts`): consistent cent rounding, ex-VAT refunds netted correctly, prepaid expense smoothing shared by every consumer, sales-level and item-level aggregates split to avoid join fan-out (each of these was a fixed bug in `FIXED_BUGS.md` and is still correct).
- **CI/CD**: pinned action SHAs, `contents: read` where possible, queued (not cancelled) deploy concurrency, storefront output verification before FTP sync, updater-signing preflight.
- **Test suites**: both green at the time of this pass (client 1303 tests, server 469 tests, `tsc` clean).
- **Secrets hygiene (verified):** the Android release keystore, its base64 copy, the local dev SQLite file and the server's local DB file all sit in the working tree but are git-ignored and untracked (`git ls-files`/`git check-ignore` confirmed); no secrets were found in `.env.example` files or committed source. The Sentry DSN in the workflows is a public ingest key by design.

---

## Recommended remediation order

Ordered by technical impact and by which fixes unblock or de-risk others — not by ease.

1. **A-2** — stop `/migrate-db` from re-seeding over admin configuration. Zero-risk, one-line seeder change plus a two-run regression test; every later server deploy is unsafe until this lands.
2. **A-1 + A-3 together** — resumable, keyset-paged pull on both sides (server: `(updated_at, id)` cursor and subquery-based scoping; client: persist per-table progress, drop the page cap). Doing the client half alone still leaves the server's per-page cost; doing the server half alone still leaves the cap. Add a server-side regression test with >500 rows and a client test for a multi-round table.
3. **A-6** — add the local indexes. Independent of everything else, measurable, and it changes the baseline for A-8/A-18 decisions.
4. **PG-2 then PG-1** (carried) — the storefront webhook/reconciliation path and the gateway pinning; still the largest real-world money-loss surface.
5. **A-4** — online-order sale attribution (`user_id`, `payment_status`); small, and it should land before anyone builds reporting on online orders.
6. **A-5** — decide the sync-interval rule, fix the server throttle's batch handling, and have the daemon call `sync(false)`. Do this *after* A-1/A-3 so backlogs drain correctly once backoff is respected again.
7. **A-8 + A-7 + A-18** — startup/idle cost: gate the `stores` prune on a changed id set, run the orphan scan once per install, move the launch sync off the splash, delete the 5 s poll. Re-benchmark on a real low-end device afterwards.
8. **A-10, A-11, A-13** — server public-surface hardening (config allow-list, throttles, no PIN-derived passwords) and the Tauri CSP. Independent; group into one security batch.
9. **A-9, A-12, A-21, A-16, A-17** — sync/data-integrity edge cases; each is small and self-contained once the index/pagination work above is in.
10. **A-14, A-15, A-19, A-20, A-22, A-23, A-24** — hygiene and architecture debt; A-15 (enforce `tsc`/tests in CI, `npm ci`) is the one worth doing early because it protects everything else.
11. **P2-1** (ops confirmation) and the accepted **P3-1/P3-2/P3-5**, **PG-3…PG-10** as previously scheduled.
