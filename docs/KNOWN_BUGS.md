# DumosRx — Known Bugs & Engineering Notes

This file holds **open** items only. A fixed entry moves to `docs/FIXED_BUGS.md`
and is removed here outright — never marked done in place — per `.agents/AGENTS.md`
§2. Full audit history (methodology, dates, every closed finding) lives in
`docs/FIXED_BUGS.md` and git history; this file is deliberately short so the
handful of things actually worth your attention aren't buried in it.

---

## Open bugs awaiting a fix

None currently open.

---

## Pending a product decision

#### PG-10. `laravel-server/` — full bank account numbers stored in plaintext on the merchant-owned `payment_accounts` table
- **Location:** `app/Models/PaymentAccount.php:26`; also synced to client SQLite, `client/lib/db/schema.ts:611-627`.
- **Problem:** The store's own transfer-instructions account is stored in full server-side and on every synced device.
- **Why it's not just fixed:** reads as an intentional product choice (store owners need to see their own account number), not an oversight — flagged here for an explicit decision, not a code change.
- **Confidence:** Medium.

---

## Accepted tradeoffs (no fix planned)

#### P3-1. `client/` — auth bearer token kept in `localStorage` instead of an HttpOnly cookie
- **Location:** `client/lib/api/token-manager.ts:17-50`.
- **Problem:** `auth_token` (the Sanctum bearer token) is read/written via `localStorage`. Any XSS in the client app could read it and exfiltrate a long-lived session token (Sanctum expiry 30 days, client rotates after 7).
- **Why accepted:** `setToken`/`clearToken` mirror the token to native Tauri code (`lib/native/widget-bridge.ts` → Android `TokenStore`, which does use `EncryptedSharedPreferences`) so the home-screen widget can make its own authenticated requests. A real fix needs a dual-path auth design — a real project, not a quick patch. The Tauri build's CSP (`script-src 'self' 'wasm-unsafe-eval'`, no remote or inline script) is a compensating control there, but does not cover the web/PWA build at `app.dumosrx.com`, and even in the bundled app an injected script that satisfies the policy still has same-origin `localStorage` access.

#### P3-5. `client/` — PWA install splash screen doesn't follow dark mode
- **Location:** `client/public/manifest.json`.
- **Problem:** `theme_color`/`background_color` are hardcoded to white, so the one-time Android "Add to Home Screen" install splash flashes white for dark-mode users before the page paints. (The in-app browser-chrome tint is unaffected and already dark-mode-aware, via `app/layout.tsx`'s `viewport.themeColor`.)
- **Why accepted:** the Web App Manifest spec has no conditional/media-query support for `theme_color`/`background_color` — it's a single static value, full stop. A dynamic per-request manifest would need a server, which this app's static export doesn't have. No real fix exists; the only lever is picking a different static color that trades which color scheme gets the flash, which is a product call, not a bug fix.

---

## Engineering notes (tech debt / ongoing risk, not bugs)

These describe the current state of known architectural tradeoffs and performance ceilings — not defects, and not tracked toward a fix. Re-derive before relying on anything here; this isn't re-validated on every pass.

### Performance
- **`db.export()` per write** (web/PWA build): every `execute()` outside a transaction re-serializes the whole local database and writes it to IndexedDB — the dominant long-term scaling risk for a large catalog. Two of its biggest inputs are bounded (`audit_logs`' 730-day local retention window, coalesced multi-image save bursts), but the per-write export itself is unchanged; fixing it properly needs a different persistence model (incremental/OPFS).
- **First PWA install download:** `precache-manifest.json` lists ~399 URLs (~15 MB, including two 650 KB sql.js WASM binaries) fetched on first install — the single largest network cost on a metered connection.
- **Whole-catalog in-memory search:** `getProductsWithDetails()` loads the entire catalog and `product-database.tsx` fuzzy-searches it in memory (debounced). Fine to ~10k products; beyond that the transform+filter+sort chain is O(catalog) on the main thread every filter change.
- **`validateSync()`'s per-request chain** (`SubscriptionService`, `SystemConfig::getVal`, `PermissionGroupSeeder::ensureSeeded`, `enforceStaffLimits`) adds roughly 10 queries to every push/pull before any data is touched.
- **`getStockMovements()` with no window** loads the whole table when searching/filtering — a large result set in React state at scale, independent of indexing, since nothing narrows the predicate.

### Offline / sync
- **Server-side row-lock duration:** `SyncController::push()` holds `lockForUpdate()` locks for the whole outer transaction. Bounded with the current ~50-change batch size, but the first place to look if "Lock wait timeout" shows up in server logs.
- **Tab-lock residual notes:** `resetDatabase()`/`clearDatabaseForNewStore()` call `db.run()` directly rather than through `reserveDbSlot()`, so they can interleave with an in-flight yielding `query()`. A stolen-from tab only learns it lost the lock via the `steal-notice` broadcast, which a frozen tab receives only on thaw — `writerTab` stays `true` until that notice arrives.

### Architecture
- **One hand-rolled tenant-resolution copy remains:** `DashboardService` still hand-rolls the staff→owner lookup instead of a shared `Request`-free helper; `TenantScopingArchitectureTest` only scans controllers, not services.
- **File-size guideline exceeded by design in a few hot spots:** `client/lib/db/core.ts` (~1,640 lines) and `laravel-server/.../SyncController.php` (~2,700 lines) are both well past the project's 350-line guideline — known, not tracked toward a split. `getProductsWithDetails()`-style "load everything, filter in React" is the deliberate norm for catalog/customer/PO lists; where that stops being fine isn't written down anywhere.
- **Two client-side sale-recording paths exist:** `recordSaleItemStock` (POS/online orders) and `local-database.ts::createSale` (demo seeding only) — the second still writes `stock_batches.quantity` via a raw `UPDATE` rather than through `update()`, so a demo-seeded batch is the one batch the version model never saw.
- **`composer audit`/`npm audit` are not run in CI.**
- **`sw.js` has no automated test coverage**, despite two prior cache-poisoning fixes.
