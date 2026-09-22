# Fixed Bugs Log

A changelog of bugs that were tracked in `docs/KNOWN_BUGS.md` and have since been fixed. `KNOWN_BUGS.md` only ever holds *open* items — an entry is removed from it outright the moment it's fixed, not marked done in place — so this file is where the record of "what it was and when it got fixed" lives instead. Git history has the exact diffs; this is a scannable index into that history, one entry per fix, newest first.

## 2026-09-22

### fix: fuzzy search noise on short terms, un-awaited settings writes, activity-log misattribution on transfers
- **Commit:** `ff657387`
- The fuzzy search fallback (`search.ts`) fired for terms as short as 3 characters at a flat Levenshtein distance of 3, and `searchProducts`'s fallback never scored `barcode` at all — a scanned barcode with no exact match returned unrelated products as "suggestions." Raised the minimum fuzzy-fallback length to 4, scaled the allowed distance by term length, and added `barcode` to the scored fields in both `searchProducts` and `genericFuzzySearch`.
- Two fire-and-forget writes reported success without awaiting: theme updates (`store-context.tsx`'s `setTheme`) and the loyalty earn-rate save (`loyalty-settings-dialog.tsx`) both toasted success immediately after a `void`-called write. Both now await (or catch) before toasting.
- Activity-log rows for stock-transfer writes were attributed to whatever store the UI happened to have active, not the actual source/destination store, since `logAction()` read the global active-store resolver directly. Added an optional `overrideStoreId`, threaded through `insert()`/`update()`/`softDelete()`/`remove()`'s existing options. Default behavior for every other caller is unchanged — confirmed via an Opus-dispatched review, since `base-helpers.ts`/`core.ts` are used by nearly every write in the app.

### fix: stock batch report store-id leak and P&L current-period window left uncapped
- **Commit:** `017e3163`
- `fetchStockBatchReportData` filtered `products.store_id` on the join but never `stock_batches.store_id` itself, so a legacy store_id-less batch could be summed into the active store's valuation. Fixed to match the strict `store_id = ?` convention `stock_batchValueData` already uses elsewhere in the same file for the identical valuation concept — an Opus-dispatched review of the first pass caught that it had kept an `OR store_id IS NULL` fallback, preserving the bug and disagreeing with the BI dashboard's own valuation tile.
- `getBIMetrics`'s current-period queries used `transaction_date >= ?` with no upper bound while the expense side was already capped at "now." The first pass capped only revenue/gross-sales/tax/COGS/transaction queries; an Opus-dispatched review found `totalRefundsData`, `returnedCogsData`, `retentionData`, both top-selling queries, category distribution, and product/cashier performance were all still open-ended — extended the same capped window to all of them.

### fix: prescription line-total rounding, currency-code sanitization crash, expense amount validation
- **Commit:** `d66a6f2e`
- Prescription line totals (`unitCost * quantity`) weren't rounded, letting float drift accumulate into a `REAL` money column. Exported the existing `roundMoney` helper from `pos-calculations.ts` and applied it here too.
- Currency-code sanitization stripped non-uppercase characters before uppercasing, so a valid lowercase code ("usd") was blanked and silently fell back to NGN; a malformed residual code could also crash `Intl.NumberFormat` uncaught. Added `sanitizeCurrencyCode()` (uppercase, then filter) and wrapped every `Intl.NumberFormat` construction site in try/catch with an NGN fallback.
- Expense amount had no numeric validation — a non-numeric amount stored `NaN`, nothing rounded to 2dp or rejected a negative value. Both expense mutations now reject non-positive amounts and round via `roundMoney`.

### fix: lock screen leaves dashboard mounted/polling, editable-number-cell clobbers leading-zero decimals, silent prescription edit-load failures
- **Commit:** `3defbda0`
- The lock screen was a `fixed inset-0` overlay rendered over `children` — the dashboard stayed mounted, rendered, and refetching underneath it while "locked." Now `{!isLocked && children}`, so background polling actually stops. Trades this for losing in-progress component-local state on unlock (an open dialog, a part-filled form) — the highest-value case (an in-progress POS sale) is unaffected since the cart persists to its own zustand store.
- `EditableNumberCell`'s `[value]` resync effect ran even while focused and mid-edit — an external value change landing mid-typing immediately overwrote the in-progress text, clobbering a leading-zero decimal like "0.05" back to "0". Now skipped while focused. An Opus-dispatched review of the first pass found its test used an uncontrolled harness where `value` never actually changed, so it passed against the unfixed component too; rewritten to force a genuine value change via `rerender` while focused, verified to fail against the unfixed component and pass against the fix.
- Prescription edit-form load failures only `console.error`'d, leaving a confusing blank form with no visible error. Now also toasts.

### fix: checkIsAdmin substring match and staff store_id "" vs null
- **Commit:** `21d3ab38`
- `checkIsAdmin` used a substring match (`.includes("admin")`) while every sibling role check uses exact array membership. Switched to `["admin","manager","store_owner","super_admin"].includes(...)`. An Opus-dispatched review of the first pass caught that its array omitted `super_admin` — the old substring match happened to include it, and a prior fix (`pos-transaction-history.tsx`) specifically relies on `checkIsAdmin` including the platform's top role for processing a return; losing it here would have silently reintroduced that bug.
- Staff created with no active store wrote `store_id: ""` instead of `null`, matching neither `store_id = ?` nor the `store_id IS NULL` fallback `getUsers` checks for — invisible in every staff list while still able to log in. Extracted `resolveStaffStoreId()`, used at both the create and edit write sites.

### fix: sync-push double recordSyncFailure overwrite and dangling queue rows after a duplicate-id remap
- **Commit:** `6ad19971`
- `recordSyncFailure` could be called twice for the same queue item in one push run: a pre-network client-side rejection's specific reason got overwritten by a later whole-batch failure's generic message. Tracked via a new `alreadyRejectedIds` Set, populated only after the pre-network transaction actually commits — an Opus-dispatched review caught the first pass adding to the Set inside the transaction, which would wrongly suppress a real failure record if that transaction rolled back.
- The `id_map` duplicate-remap (two locally-created rows that turned out to be the same server record) left any other still-pending `_sync_queue` rows for the old id untouched, so they kept targeting an id the server no longer recognizes. Now remapped alongside the existing remap.

## 2026-09-21

### feat: one-time loyalty_defaults_seeded_at flag so deliberately-cleared tiers don't silently reseed
- **Commit:** `e8c0c810`
- Resolves the still-open half of the loyalty-reseed entry below: `ensureLoyaltyDefaultsSeeded()` couldn't tell "never seeded" apart from "deliberately cleared," so a store that intentionally deleted every tier got them silently recreated the next time Loyalty Settings opened.
- Per product decision, added `stores.loyalty_defaults_seeded_at` (client schema + runtime migration, server migration + `Store` model fillable/cast). Seeding now runs at most once per store ever — the flag is set the first time a seed-or-skip decision is made, regardless of the outcome, so a later deliberate clear is never re-seeded. A store upgrading from before this flag existed still gets exactly one more grandfather decision on its first post-upgrade dialog open.

### fix: sync-push false version-conflict toast on a retried item's own already-applied write
- **Commit:** `3bf8d603`
- A response lost after the server actually committed (timeout, dropped connection) looks like an ordinary network failure to the client, bumping the queue item's `retry_count` before the next attempt resends the same frozen payload — which then collides with the version bump from its own earlier (successful) attempt and gets rejected as a `version_conflict`, showing a misleading "record changed since this edit" toast for a change that had actually already landed.
- Per product ask ("what's recommended best practice") — used `retry_count > 0` at the moment of a `version_conflict`, an already-available signal, to mute the toast specifically for a retried item (still logged via `console.info`); a genuinely first-attempt conflict still shows the normal toast. The server's version is kept either way regardless of whether the toast fires.

### fix: getUsers leaked every store's own admin into every other store's staff list
- **Commit:** `df329a2b`
- `role = 'admin' OR role = 'store_owner'` in the store-scoped query branch meant any admin appeared in every OTHER store's staff directory too, on a multi-store fleet account.
- Per product decision: `store_owner` is business-wide (the fleet account owner) and correctly belongs everywhere; `admin` is a per-store "local master" role and should be scoped like any other staff member. Dropped `role = 'admin'` from the OR, keeping `store_id = ? OR store_id IS NULL OR role = 'store_owner'`.

### fix: loyalty reseed race, receipt-print robustness, prepaid amortization, onboarding sync-queue gap
- **Commit:** `a8abfd35`
- `ensureLoyaltyDefaultsSeeded`'s check-then-seed was not transactional — two rapid settings-dialog opens, or two devices, could double-seed loyalty tiers. Now wrapped in a transaction. (The other half of the original bug — a store that deliberately deleted every tier still gets them silently reseeded — is still open; needs a design decision, see `KNOWN_BUGS.md`.)
- Receipt printing was driven off iframe `onload` plus a fixed 300ms delay with no fallback — could print blank, never print, or leak the iframe silently. Now waits on the actual stylesheet-ready signal (with a timeout) and surfaces a toast + console error on failure across all three print call sites.
- Prepaid-expense amortization double-counted a rolling window that merely overlapped an installment's month (counting the full monthly installment from both sides of a month boundary), and mis-parsed a date-only expense date as UTC, shifting the first installment a month early in negative-UTC timezones. Now prorates by actual day overlap and parses via the existing local-safe date helper.
- Onboarding's first-admin offline-branch inserts (`stores`/`users`) had no matching `_sync_queue` row, relying entirely on a separate "mark everything dirty" fallback to ever reach the server. Now queues the row itself, matching what the normal `insert()`/`update()` helpers do. An Opus-dispatched review of the first pass found it only covered the two INSERT branches, missing the sibling UPDATE branch (existing local store case) in the same offline path — added there too.

### fix: five stale useState/useEffect fetches converted to store-scoped React Query
- **Commit:** `f2ed9268`
- Notification bell, PO edit form, three dashboard detail dialogs (procurement/prescription/stock-movement), and the stock-movement ledger all fetched via plain `useState`/`useEffect` with no request cancellation and no store-scoping — switching stores or records could leave a slower, stale response overwriting newer data, and the notification bell's cloud data/dismissed-broadcast state didn't refresh or persist across a store switch or reload.
- All five converted to `useQuery` against the `queryKeys` factory, whose `resource()` helper already appends the active store id to every key, giving each fetch automatic cancellation/race-safety and store scoping for free. Notification bell's dismissed-broadcast ids now persist to localStorage. The three dialogs also replaced "catch and swallow" error handling with a distinct error state, so a failed fetch no longer reads identically to "this record has no line items."
- An Opus-dispatched review of the PO edit form conversion found the naive version re-seeded the form fields from any background refetch (e.g. a sync pull invalidating `purchase_orders`/`purchase_order_items`), silently overwriting unsaved in-progress edits mid-typing. Fixed with a seeded-once-per-id ref guard.

### fix: sync-engine pull.ts UNIQUE-skip cursor stall and cross-page batch/movement ordering
- **Commit:** `0d0ad865`
- A UNIQUE-constraint-skipped INSERT/UPDATE advanced that table's sync cursor anyway, so the skipped record was never retried. Now the cursor holds until the record is retried — but only up to `MAX_UNIQUE_SKIP_RETRIES` (5) pulls; an Opus-dispatched review of the first pass found an unbounded hold would permanently stall that entire table's cursor (not just the one bad record) on a genuinely non-self-resolving collision (e.g. a duplicate email). After the cap, the cursor advances past that one record, which stays visible via `skippedRecords`/`logCrash` rather than silently blocking every other row in the table forever.
- A `stock_movements` row whose referenced `stock_batches` row hadn't arrived yet (batches and movements are paginated independently, so a movement can land on an earlier page than the batch it references) silently no-op'd its delta application. Deferred deltas are now applied once every page in the pull round has been fetched.
- New test: `pull-unique-skip-and-cross-page-ordering.test.ts`.

### confirmed: credit-sale refund loyalty/balance reversal was already fixed (documentation correction only)
- **Commits:** `96b8bd49`, `5996ee55`
- `docs/KNOWN_BUGS.md` had an open entry claiming a return against a credit sale never reversed `points_earned` or `outstanding_balance`, pointing at `returns.ts`. An Opus-dispatched review while vetting the batch above found both halves were already fixed by these two earlier (2026-08-30) commits — `use-process-return-mutation.ts` prorates and reverses both — and that `returns.ts` itself never contained this logic; the original entry was simply pointing at the wrong module. Removed from `KNOWN_BUGS.md`; no code change made.

### fix: sync push batch failure (`success: false`) was handled by doing nothing
- **Commit:** `997a160d`
- A batch-level failure response (the request completed, the server just rejected the whole batch — auth/validation/rate-limit — as opposed to a thrown exception) had no handling at all: no `markSynced`, no `recordSyncFailure`, no backoff, no retry counter, no stuck-item crash report. Every item in that batch was silently retried forever on every sync tick with zero visibility, and `pushChanges()` reported it identically to a clean success.
- Added the missing `else` branch alongside the existing `if (response.success)` path, routing the batch through the same `recordSyncFailure` path the catch-block (thrown-exception) case already used, and counting it in `failedBatches`.

### fix: loyalty-point redemption wasn't re-validated against the real balance at apply time
- **Commit:** `73bbbb61`
- A customer who no longer actually had the points for a redemption picked earlier in checkout (a second terminal already spent them, or a stale cached balance) still got the discount applied — `calculateLoyaltyPointsAfterSale` floored the resulting balance at 0 instead of the redemption being rejected. The re-read of the real current balance already happened inside the same transaction the sale runs in; it just was never checked against the redemption's cost.
- `applyLoyaltyPointsForSale` now throws a dedicated `InsufficientLoyaltyPointsError` when the freshly re-read balance can't cover it, which rolls back the whole sale (via `runInTransaction`) rather than leaving a half-applied discount. `use-pos-payment.ts` catches it specifically, clears the stale redemption (so retrying the same sale doesn't hit the same rejection again), and shows an actionable toast instead of the generic failure message.

### fix(CRITICAL): online-order fulfillment inserted into nonexistent sales columns, never set transaction_number, and still omitted a NOT NULL subtotal
- **Commits:** `f54d7516`, `f0a896ca`
- Found while fixing the adjacent receipt/id-collision bug below: `useFulfillOnlineOrderMutation`'s `insert("sales", {...})` wrote `receipt_number`, `status`, and `customer_name` — none of which exist on `sales` (it has `transaction_number` UNIQUE NOT NULL, `payment_status`, and `customer_id` instead) — and never set `transaction_number` at all. `insert()` builds a raw parameterized INSERT from whatever keys it's given, with no schema filtering, so this threw a "no such column" SQLite error on every real online-order fulfillment; no test covered this hook.
- First pass (`f54d7516`) writes only real `sales` columns: a unique `transaction_number` (see the id-collision fix below), and the order's `customer_name` folded into `notes` (`sales` has no free-text customer-name column, only `customer_id`, and online orders carry no matched customer record) — per an explicit "store in notes" choice made when asked, over dropping it or looking up/creating a matched customer record. An Opus-dispatched review of that pass found it still omitted `subtotal` (`NOT NULL`, no schema default, unlike `tax_amount`/`discount_total` which default to 0) — it would still throw, just on a different column — caught only because the review flagged that the new test mocked `insert()` entirely rather than running against a real schema. Follow-up (`f0a896ca`) sets `subtotal: order.total_amount` and rewrites the test against a real sql.js-backed schema (with the sync-column migrations applied) instead of a mock, which now also asserts the stock-deduction side (`recordSaleItemStock`), not just the `sales` insert.

### fix: receipt/id collisions from time-based, non-unique identifiers
- **Commits:** `f54d7516`, `f0a896ca`
- `use-pos-payment.ts`'s `` transaction_number = `TXN${Date.now()}` `` (against `sales.transaction_number TEXT UNIQUE NOT NULL`), `use-pos-held-transactions.ts`'s `` id = `held_${Date.now()}` `` (an explicit primary key), and `use-fulfill-online-order-mutation.ts`'s `` `ONL-${order.id.split("-")[0]}` `` (only the first UUID segment, not unique by construction) could all collide across two terminals acting in the same millisecond, or with clock skew.
- All three now derive from `generateId()` (`lib/db/core.ts`). The same review above also flagged that `TXN-`/`ONL-` initially truncated to just the id's first 8-hex-char segment (~32 random bits) — a big improvement over millisecond-resolution `Date.now()`, but with a non-trivial birthday-collision probability over a long-running install's full history. Added `generateShortId()` (two id segments, ~48 bits) and switched both display-number sites to it.

### fix: returned-item COGS was recomputed from current stock cost instead of the cost recorded at sale time
- **Commits:** `0a0d515e`, `f2f822a0`
- `getBIMetrics.returnedCogsData` and `getAdvancedMonthlySalesData.rawMonthlyReturns` averaged a product's *current* active-batch cost instead of using `sale_items.cost_price` — a cost change between sale and return misstated profit, and `IFNULL(…, 0)` silently reported zero returned COGS once a product had no active batches left. The subquery also had no `store_id` scoping.
- First pass (`0a0d515e`) joined `return_items` to `sale_items` via `(sale_id, product_id)`, on the assumption of at most one `sale_item` per product per sale. An Opus-dispatched review of that fix found the assumption false for a prescription dispense (one `sale_items` row per instruction line) and online-order fulfillment (bypasses the POS cart's merge-duplicates step) — a plain join fanned the return out across every matching row and overcounted. Follow-up (`f2f822a0`) pre-aggregates `sale_items` to one quantity-weighted average `cost_price` per `(sale_id, product_id)` before joining.

### fix: expense date-range filters compared a date-only column against ISO timestamps
- **Commit:** `eb80ac3a`
- `expenses.date` is stored as bare `YYYY-MM-DD`, but the range bounds passed in (`toQueryRange()`/`toISOString()`) are full ISO timestamps — a plain string compare made `'2026-09-21' >= '2026-09-21T00:00:00.000Z'` false, silently dropping every expense dated exactly on a range's first day from the Expenses report, the P&L report, and the monthly sales chart's expense series.
- Wrapped both sides in SQLite's `date()` function everywhere `expenses.date` is range-filtered.

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
