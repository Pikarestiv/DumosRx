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

**Overall health.** The codebase is unusually well-defended for its size: the sync engine's conflict model, the single-writer tab lock, tenant scoping on the server and the money math have all been through several review-and-fix cycles, and both test suites pass cleanly. The new findings in this pass are therefore not the "obvious" classes (cross-tenant leaks, double-charging, silent rollbacks) but the next layer down: **scale limits that were never exercised** (all three found so far have since been fixed — a local database with essentially no indexes, plus the pull engine's own un-resumable page cap and the server tenant-scope that loaded every sale id into PHP memory per request; see `docs/FIXED_BUGS.md`) and **attribution/consistency gaps** on the newest flows (the online-order fulfilment one, `A-4`, has since been fixed too).

**Findings this pass, by severity:** 0 **P0**, 0 **P1**, 0 **P2**, 1 **P3** — 1 open finding from this pass (`A-26`, logged post-review as a known limitation of the A-9 fix; IDs `A-1`…`A-26`, less the fixed `A-1`, `A-2`, `A-3`, `A-4`, `A-5`, `A-6`, `A-7`, `A-8`, `A-9`, `A-10`, `A-11`, `A-12`, `A-13`, `A-14`, `A-15`, `A-16`, `A-17`, `A-18`, `A-19`, `A-20`, `A-21`, `A-22`, `A-23`, `A-24` and `A-25`), plus 14 still-open items carried from the two earlier passes (`P2-1`, `P3-1`, `P3-2`, `P3-5`, `PG-1`…`PG-10`), all preserved verbatim below.

**Most important risks, in order:**

1. **PG-2 / PG-1 (carried)** — storefront online payments still have no webhook/reconciliation path and can settle via the wrong gateway. **This is the only open finding calling for work of its own size; the one other open item, `A-26`, is a P3 logged as an accepted limitation.** Every one of this pass's own 25 findings (`A-1`…`A-25`, the last logged and fixed during batch 9) is fixed and moved to `docs/FIXED_BUGS.md`, across nine remediation batches plus one follow-up commit on `dev` on 2026-09-28; the payment-gateway findings were explicitly deferred out of that series by the user and are unchanged. What remains open in this document is therefore: the deferred `PG-*` work, and the four carried findings that are deliberate non-actions (`P2-1` is ops-only; `P3-1`, `P3-2`, `P3-5` are accepted tradeoffs).

**The major performance concern** that remains is the whole-blob `db.export()` persistence model already analysed in `docs/DATABASE_CONCURRENCY.md`; the rest of §5's list (boot-time scans, the license-guard sync gate on launch, the 5-second sync-queue poll) is fixed.

---

## 1. Critical findings (P0)

None found this pass. No cross-tenant read/write path, payment double-charge, or unguarded data-destroying path was identified beyond what previous passes closed. (The storefront pass's `SF-P0-1` remains fixed.)

---

## 2. High-priority findings (P1)

`A-1` (the pull page cap that made a >100,000-row table un-syncable) and `A-3` (the server's materialised id lists and offset paging behind it) were fixed together — see `docs/FIXED_BUGS.md` and `docs/SYNC_PULL_PAGINATION.md`. `A-27` (the crash-log amplification loop that was live in production on 2026-09-29, Sentry `DUMOSRX-CLIENT-1B`/`17`/`19`/`1A`/`1G`/`1M`) was found and fixed in the same pass — see `docs/FIXED_BUGS.md`. One finding is open:

#### A-28. `laravel-server`/ops — production's `feedback` table is missing the `occurrence_count` column its migration adds
- **Category:** Deployment / schema drift — confirmed from production (Sentry `DUMOSRX-CLIENT-11`, 567 events, 4 users)
- **Severity:** P1 — every `audit_logs` and `feedback` push carrying the column is rejected by the server, so those devices never sync those tables at all.
- **Evidence:** the migration exists in the repo but was never run against the production database; the server rejects the push with `Unknown column 'occurrence_count' in 'field list'`, the queue item burns its five attempts and is reported as stuck.
- **This is an ops action, not a code change** — run the pending migrations on production. No code fix applies. The client-side amplification this used to trigger is closed by `A-27`; what remains is only that the affected rows still never sync until the migration runs.

---

## 3. Medium-priority findings (P2)

None open. `A-9` (receiving the same purchase order from two devices booked the delivery twice) is fixed — see `docs/FIXED_BUGS.md`.

---

## 4. Low-priority findings (P3)

`A-25` (`npm run test:schema` was broken) is fixed — see `docs/FIXED_BUGS.md`. Its "add to CI" half is intentionally not done; see that entry's Ruling. `A-29` (a double-encoded `stores.enabled_payment_methods` blanked the admin Store Details page in production on 2026-09-29) is fixed — see `docs/FIXED_BUGS.md`; `A-30` below is its residual ops cleanup, which does not block it. `A-31` (the same-family follow-up in `client/`) is also fixed — see `docs/FIXED_BUGS.md`. An independent review of `c384ca47..6218e1ed` (the Product Catalog context menu, the `enabled_payment_methods` encoding fix and the new Stock Adjustments feature) produced six further findings, `A-32`…`A-37`, all fixed — see `docs/FIXED_BUGS.md`; `A-38` and `A-39` below are that review's two display-only findings, deliberately deferred. Four findings are open:

#### A-38. `client/` — the Stock Adjustments ledger switches to its desktop layout at 768px, below the project's 1024px nav breakpoint
- **Category:** Frontend / responsive convention — confirmed, display-only
- **Location:** `client/components/stock-batch/stock-adjustments-ledger.tsx:76` (`useMediaQuery("(min-width: 768px)")`), `:216` (the in-page "Adjust Stock" button's `md:hidden`)
- **Problem:** The project's stated breakpoint convention is the one `MobileBottomNav` uses — mobile chrome below `1024px`/`lg`, desktop chrome at `lg` and up (see `docs/BUG_REVIEW_PROMPT.md` → Frontend-Specific). The new ledger picks its desktop table at `768px`, so between 768px and 1024px a device shows the mobile bottom nav *and* the wide desktop table at once.
- **Why it is not simply wrong:** the ledger deliberately matches its two immediate neighbours, `stock-movements.tsx:64` and `supplier-table.tsx:68`, which both use `768px`. The drift is older and wider than this feature; changing only the new file would make it inconsistent with the screens it sits beside without making it consistent with the convention.
- **Why it matters:** cosmetic only. No write path, permission or query depends on it; the same rows and the same actions are reachable in both layouts.
- **Recommended fix:** a single sweep moving `stock-movements.tsx`, `supplier-table.tsx` and `stock-adjustments-ledger.tsx` to `1024px` together, verified against the bottom nav — not a one-file change.
- **Confidence:** High on the mechanics, low urgency. **Status:** Open, deliberately deferred out of the `c384ca47..6218e1ed` review remediation (`A-32`…`A-37`) as display-only with no write-path impact.

#### A-39. `client/` — an adjustment spanning midnight can fall outside a ledger date-range filter that should include it
- **Category:** Frontend / reporting accuracy — confirmed, display-only
- **Location:** `client/components/stock-batch/adjustment-derivations.ts` — `groupAdjustmentMovements()` (a group's `date` is the **latest** movement date in the group) and `filterAdjustmentGroups()` (compares only that single date's `slice(0, 10)` against `from`/`to`)
- **Problem:** A ledger row is one `reference_id` group, which can hold movements written either side of midnight (a long cycle count, or a slow write batch straddling 00:00). The group is filtered as though it happened entirely on its latest movement's day, so an adjustment whose movements began on day *N* is invisible to a range ending on day *N* if any one of its movements landed on *N+1*.
- **Why it matters:** the row is missing from a filtered ledger view; it is never missing from the data, and the unfiltered ledger, the stock movements it summarises and every stock figure derived from them are unaffected. Search by adjustment id or product still finds it.
- **Recommended fix:** filter on the group's date **interval** (earliest → latest movement) overlapping the requested range, rather than on a single representative date. That needs the group to carry both ends, which `groupAdjustmentMovements()` already computes one of.
- **Confidence:** High on the mechanics; frequency is low (requires a group's movements to straddle midnight). **Status:** Open, deliberately deferred out of the `c384ca47..6218e1ed` review remediation (`A-32`…`A-37`) as display-only with no write-path impact.

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
- **Server tenant scoping**: `authorizeChangeTarget`/`resolveChangeStoreId` mirror `applyPullTenantScope`; INSERT payloads naming a foreign `store_id` are rejected; `users`/`stores`/`permission_groups` payloads are allow-listed; `audit_logs` matched only by `properties->client_id` within the pushing store; DELETE against `audit_logs` rejected outright.
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

This pass's own remediation is complete — nothing from `A-1`…`A-25` is still open, and the one later addition (`A-26`) is a logged limitation rather than queued work, so this is no longer an ordered work queue. What remains in this document is one piece of real deferred work and a set of deliberate non-actions:

1. **Deferred by user direction: PG-2 then PG-1**, then **PG-3…PG-10** — the storefront webhook/reconciliation path and the gateway pinning first; still the largest real-world money-loss surface, and the only substantial engineering work this document still describes. Explicitly excluded from the 2026-09-28 remediation series rather than overlooked.
2. **Deliberate non-actions, listed here so they are not re-filed as findings next pass:** **P2-1** is a one-line production `.env` confirmation with zero code change; **P3-1** (bearer token in `localStorage`) needs a dual-path auth design project and has a compensating control in the shipped Tauri CSP; **P3-2** (stale lazy chunk after a deploy) needs deploy-asset retention to close fully; **P3-5** (manifest `theme_color`) is a Web App Manifest spec limitation with no action recommended; **A-26** is the accepted cost of A-9's deterministic receipt ids, worth closing only via a sync-health signal, never by changing the keying. **PG-10** needs a product decision, not a fix.
