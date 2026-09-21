# Fixed Bugs Log

A changelog of bugs that were tracked in `docs/KNOWN_BUGS.md` and have since been fixed. `KNOWN_BUGS.md` only ever holds *open* items — an entry is removed from it outright the moment it's fixed, not marked done in place — so this file is where the record of "what it was and when it got fixed" lives instead. Git history has the exact diffs; this is a scannable index into that history, one entry per fix, newest first.

## 2026-09-21

### feat: show PIN lockout countdown in the pin-entry UI, not just a toast
- **Commit:** `479a9a7c`
- The lockout below only surfaced via a toast (auto-dismisses in a few seconds, no visible reason the Unlock button stopped working). PinEntry now shows a persistent countdown (`role="alert"`) and disables the PIN input/pad while locked, with a live 1s-interval update.

### fix: impersonated identity leaked back in through the normal login key on reload
- **Commit:** `ab8f48f3`
- `loginFromHandoff()` deliberately skips `setDbUser()` for an impersonated profile, but persisted it under the same `dumos_user` key the normal mount effect reads — the very next reload restored it through the ordinary path anyway, defeating the separation.
- Now uses a distinct `dumos_impersonated_user` key, restored into React state only, never through `setDbUser()`. Also cleared on every successful normal login/logout.

### fix: store/user hydration race could resolve queries against the wrong store
- **Commit:** `fd03b43b`
- `targetId = user?.store_id || activeStoreId` ran before `AuthProvider`'s own localStorage read completed — a staff member pinned to store B on a device whose `dumos_active_store_id` said store A had every query in that window read/write store A's data.
- Added `AuthContext.isHydrated`, gated the resolver-mirroring effect and the `storeProfile` query on it.

### fix: product import silently accepted negative cost/price/quantity values
- **Commit:** `e0a962ed`
- `parseNumericValue` accepted negatives and unbounded decimals, written straight into money/stock columns with no validation. Now rejects negative parses the same way it already rejects non-numeric ones.
- Locale-formatted numbers (European `"1.500,00"`) are NOT addressed — needs a decision on which locale to assume, left open.

### fix: updateStoreProfile no longer mints a phantom "My Store" row
- **Commit:** `0b8c90c7`
- Fell back to inserting a hardcoded `id: "default"` / "My Store" row whenever `storeProfile` was null — reachable from any settings write issued while the profile query was still loading. Now logs and skips the write instead.

### fix: submitStockAudit used a stale caller-supplied systemQty
- **Commit:** `72ef44a5`
- `diff = countedQty - systemQty` used the caller-supplied `systemQty` as-is, never re-read inside the transaction — a sale landing between rendering and submit made it stale. Now re-reads the product's actual current quantity right before computing the diff.

### fix(SECURITY): add exponential-backoff lockout to PIN login
- **Commit:** `f2461540`
- PIN login had no attempt limit at all — 10,000 guesses with nothing in the way. Added a client-side exponential-backoff lockout (5 failed attempts → 30s, doubling, capped at 30 minutes), keyed per identifier so it can't lock out other staff sharing a device, checked before the DB lookup so it can't be extended by retrying.

### fix: don't let one bad queue row's _version re-read fail its whole push batch
- **Commit:** `fcd16e9d`
- Follow-up from an Opus-dispatched review of the four Critical fixes below: the `_version` re-read (see the "local edit destroyed" entry below) ran inside a batch-wide `Promise.all`, so a throw from one item could reject the whole batch instead of just that item.
- Wrapped in a try/catch that falls back to the frozen payload value, matching how every other per-item failure in the same push loop is already isolated.

### fix: close two gaps in the DB-restore safety net flagged by review
- **Commit:** `56d43d22`
- Follow-up from the same review pass, on the DB-restore fix below: the desktop pre-restore snapshot was a raw file copy taken *before* closing the connection, so with WAL journaling enabled it could silently miss the most recently committed transactions; and the web recovery function (`restorePreRestoreSnapshot`) had no UI entry point at all.
- Desktop now checkpoints the WAL into the main file before snapshotting. Web now has an "Undo Last Restore" action in Settings > Data & Sync. `restoreDatabase()` also now surfaces (via toast) when the snapshot itself failed, instead of only a `console.error`.

### fix: a local edit made while an earlier push for the same record is in flight could be silently destroyed
- **Commit:** `cee78c1e`
- `update()` froze a queued edit's `_version` at enqueue time; if an earlier push for the same record completed and bumped the local `_version` before this edit was sent, it collided against its own device's already-accepted change and was dropped as a false `version_conflict` — a real, non-conflicting edit silently lost with no error surfaced.
- Fixed by re-reading the record's current local `_version` right before sending, instead of trusting the frozen value.

### fix: P&L report tripled revenue on multi-item sales
- **Commit:** `f39402cc`
- `fetchProfitLossReportData` summed `s.total_amount` in the same query as a `LEFT JOIN` to `sale_items`, fanning each sale out once per line item — Revenue, Gross Profit, Net Profit, and Margin % were all inflated by the average basket size.
- Split into a sales-level revenue query and a sale_items-level COGS query, matching an already-correct sibling function's pattern.

### fix: DB restore (web + desktop) now validates the file and snapshots the outgoing db
- **Commit:** `c90aa895`
- Both restore paths handed a picked file straight to the live database with no validation and no way back — a wrong or corrupt file destroyed the live database irrecoverably.
- Web: validates against a throwaway sql.js instance and checks for DumosRx's core tables before replacing the live db; snapshots the outgoing db into IndexedDB first (`restorePreRestoreSnapshot()` added to recover it).
- Desktop: checks the picked file's SQLite header before touching anything; copies the live db file to a `.pre-restore-backup` sibling first; now aborts instead of proceeding past a failed connection close (which risked stale `-wal`/`-shm` sidecars replaying old data over the restored file).

### fix(SECURITY): close default-admin login backdoor, add _deleted filter
- **Commit:** `5fba1af5`
- `login()`'s "no users exist" fallback fired for ANY typed PIN whenever the identifier "admin" simply didn't match a local row — not "zero users exist." A device mid-sync or one whose real admin was later renamed/deleted could hit this with real users already present, granting a full admin session for an arbitrary PIN.
- Gated the fallback on a genuine zero-user count; require the typed PIN match the documented default; `createDefaultAdmin()` now goes through `insert()` (proper sync + logging) instead of a raw un-synced insert.
- Also added a `_deleted = 0` filter to `getUserByUsernameOrEmail` (its store-scoping half is still open, see `KNOWN_BUGS.md`).

### fix: FEFO batch picking could dispense expired/deactivated stock
- **Commit:** `0a6fe75d`
- The core sale-deduction path (`getBatchesForProduct`) had no `is_active` filter, no expiry filter, and sorted `NULL`-expiry batches before dated ones — expired and deactivated batches could be picked ahead of valid stock on every sale.

### fix: stock-transfer cross-store write race via explicit store override
- **Commit:** `218f8958`
- `transferStock()` nulled the global active-store resolver for its whole transaction to bypass a single-store ownership check, risking any concurrent write elsewhere in the same tab landing unscoped during that window.
- Fixed via an explicit per-call `storeId` override on `assertStoreOwnership()`/`update()`/`softDelete()`/`remove()`, so the global is never touched. Verified as the only production call site that ever nulled the resolver; test coverage gap closed in a follow-up commit (`37dcd74b`).

### fix: PIN changes never synced; remove dead activateLicense
- **Commit:** `8053df3a`
- `updateUserPin()` wrote via raw `execute()` instead of `update()`, so a staff PIN change never reached `_sync_queue` — other devices and the server kept the old PIN.
- `activateLicense()` (licensing-manager.ts) had zero callers anywhere — deleted as dead code.

### fix: audit_logs store_id never backfilled on sync push
- **Commit:** `e4e4c235`
- `logAction()` wrote `store_id` into the local `audit_logs` row but omitted it from the sync payload — every synced activity-log entry lost its store attribution. Fixed client-side (send it) and server-side (backfill already-queued rows from clients that haven't picked up the fix).

### fix: float rounding/equality bugs in debt settlement and POS money math
- **Commit:** `3bde8c75`
- Exact float comparisons in `getDebtors`/`applyCreditPaymentFIFO` could leave a fully-paid customer stuck in the debtors list or "partial" forever due to sub-cent rounding dust. Same class of bug in POS split-payment coverage checks could block checkout on a phantom fractional-cent shortage.
- Added a money epsilon tolerance and consistent cent-rounding across both.

### fix: prescription edits bypassing sync queue, missing store scoping in procurement, dead QuickBooks import code
- **Commit:** `e5d17c6a`
- Several prescription-editing functions wrote via raw SQL instead of `insert()`/`update()`/`softDelete()`, so edits never synced and were silently reverted by the next pull; one did a hard delete instead of soft delete.
- `procurement.ts`'s New Purchase Order queries had zero store scoping — a multi-store device's PO screen listed every store's suppliers/products.
- Deleted `importQuickbooksData` and its only dependency (unused IIF parser) — dead code.

### fix: trial/subscription notification dates use dd/MM/yyyy convention
- **Commit:** `56268a52`
- Server-generated trial/subscription notifications used Carbon's ISO `toDateString()` instead of the app's day-first convention. Fixed in `laravel-server`.

### fix: crash-report feedback rows always got user_id "anonymous"
- **Commit:** `01564d9c`
- The crash logger read a nonexistent localStorage key expecting a Zustand-persist shape; the real session key is a flat object. Every auto-generated crash report was submitted with `user_id: "anonymous"` regardless of who was logged in, and the server permanently rejected those rows.

### fix: refresh store switcher after creating a store
- **Commit:** `b427d1d0`
- Creating a store via the header switcher only wrote to the cloud API; invalidating the local queries alone just re-ran the same stale local-SQLite read, so the new store never appeared without a manual refresh. Now triggers a real sync pull after creation.

## 2026-09-20 and earlier

Bug-fix commits predating the `KNOWN_BUGS.md` tracking convention (see git log for the full history) are not backfilled into this log — it starts from when that convention began, above.
