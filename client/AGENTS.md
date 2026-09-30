# AGENTS.md: DumosRx Client

This file exists so that any AI (or human) picking up this repo cold can get
oriented quickly and work consistently with existing conventions. Keep it
updated when architecture, conventions, or the current focus of work change:
it decays fast otherwise, and a stale doc is worse than no doc.

The standing rule for this — docs ship in the same change as the code that
makes them true, including moving a fixed finding from `docs/KNOWN_BUGS.md`
into `docs/FIXED_BUGS.md` — lives in `.agents/AGENTS.md` §2 and is not
repeated here (duplicating a shared rule per package is how the two copies
drift).

## What this is

**DumosRx** ("NextGen Retail & Store OS") is an offline-first point-of-sale
and inventory management system, built pharmacy-first but adaptable to
grocery/supermarket/general retail via a terminology layer. It ships as:

- A web app (Next.js, deployed normally)
- A **Tauri v2 desktop app** (Windows/Mac/Linux)
- An Android app (also via Tauri, see `dumosrx-release-key.jks` /
  `TAURI_ANDROID_*` env vars)

The defining architectural trait: **every screen works fully offline.** All
reads/writes hit a local SQLite database first; a background sync engine
pushes/pulls deltas to a remote server when connectivity is available. This
is not a caching layer bolted onto a normal CRUD app: it's the actual
architecture, and almost everything else in the codebase exists to serve it.

## Repo relationship: this is the client half of two repos

This repo (`DumosRx/client`) is the frontend only. The backend is a
**separate Laravel/MySQL repo**, expected to live as a sibling directory at
`../laravel-server` (see `scripts/verify-schema-sync.ts`, which diffs this
repo's SQLite schema against the Laravel server's MySQL schema to catch
drift, run `npm run test:schema` when either schema changes, and note it
needs the sibling repo checked out to actually run).

The client talks to that backend over REST (`NEXT_PUBLIC_API_URL`, see
`lib/api/`) purely for sync (push/pull deltas) and auth. The UI itself
never depends on the network being up.

## Tech stack

- **Next.js 15** (App Router), **React 19**, TypeScript
- **Tailwind CSS v4** (see `app/globals.css` for the `@theme`/`:root`
  design-token setup; colors are OKLCH, not hex)
- **TanStack Query v5** for all data fetching (see query-key conventions below)
- **Tauri v2** for desktop/Android packaging (`src-tauri/`)
- **sql.js** (WASM SQLite) in the browser; **`@tauri-apps/plugin-sql`**
  (native SQLite) inside Tauri: two different backends behind one API,
  see "Database" below
- **Zustand** for a small amount of non-query client state
- **Vitest** for unit tests (`__tests__/`), **Playwright** for e2e (`e2e/`)
- shadcn/Radix-based UI primitives in `components/ui/`

## Database & sync architecture

### Dual backend, one API

`lib/db/core.ts` exposes `query()`/`execute()`/`transaction()` that work
identically whether the app is running in a browser tab (sql.js) or inside
Tauri (`@tauri-apps/plugin-sql`); callers never branch on this themselves.
`isTauri()` detects which environment is active. The two underlying
Database objects have genuinely incompatible APIs (`.exec()/.run()` vs
`.execute()/.select()`), which is why `core.ts` deliberately leaves the `db`
handle untyped rather than describing a misleading union.

Schema lives in **`lib/db/schema.ts`** (`SCHEMA_SQL`, a big `CREATE TABLE IF
NOT EXISTS` string): this is the source of truth for the local DB shape.
`initDatabase()` in `core.ts` also runs an ad-hoc column-migration pass on
every boot (checking `PRAGMA table_info` and `ALTER TABLE ... ADD COLUMN`
for anything missing), so schema changes should go in *both* places: add
the column to the `CREATE TABLE` in `schema.ts` **and** to
`SYNC_COLUMN_MIGRATIONS` in `lib/db/schema-migrations.ts` if existing local
databases need to pick it up without a full reinstall.

**Indexes are the one exception to "both places".** They live only in
`READ_PATH_INDEXES` in `lib/db/schema-migrations.ts`, not in `SCHEMA_SQL`:
sql.js executes `SCHEMA_SQL` as a single blob, so a `CREATE INDEX` naming a
column that an old local table has not been migrated to yet aborts the
statements after it. The migration pass runs on fresh installs too, and runs
*after* the column migrations, so both populations converge on the same set.
Adding an index there also means updating the stats gate in the same
function — see `docs/LOCAL_DB_INDEXES.md` for which query each index serves
and why the `ANALYZE` step is not optional.

### One connection, one writer: the `core.ts` concurrency model

Everything below is why `lib/db/core.ts` looks the way it does. The source
now carries only pointers; the reasoning lives here.

**One FIFO queue for every database operation.** `reserveDbSlot()` hands
each caller a `previous`/`release` pair, and `query()`, `execute()` and
`transaction()` all reserve a slot, so reads and writes serialize onto a
single connection-wide queue. The slot is reserved *synchronously*, before
the caller awaits anything, so two calls issued back-to-back with no `await`
between them still queue in call order. A `query()` or `execute()` running
*inside* an open `transaction()` does not reserve its own slot — the
enclosing transaction already holds it and reserving again deadlocks on
itself.

**Why the lock exists.** sql.js has one shared connection and no reader
isolation. A `SELECT` that yields mid-iteration is stepping a live
statement, and a write landing in one of those yields modifies the table it
is walking. SQLite's behaviour is then undefined: rows can be skipped, and
the statement can be reset or invalidated outright, ending the step loop
early and returning a **short or entirely empty result with no error**. That
was the Product Catalog's "No products found" after a large sync —
`getProductsWithDetails()` returns ~1900 rows so it is one of the few
queries that yields at all, and a draining sync backlog is exactly when
writes land continuously. Single-row aggregates (`getStockBatchStats()`)
never reach a yield point, which is why they stayed correct in the same
window.

**`query()` yields every `QUERY_YIELD_INTERVAL` (200) rows** because sql.js
runs on the main thread with no worker, so a large result set blocks
painting — nothing else, not even React committing an already-rendered
skeleton, runs until it returns (the read-side twin of `product-import.ts`'s
`YIELD_INTERVAL`). It never yields inside a transaction: `execute()` does
not queue behind an open transaction the way nested `transaction()` calls
do, so yielding there would let an unrelated write interleave into
uncommitted state.

**`writeEpoch` and the torn-read retry.** Every write bumps `writeEpoch`; a
read that actually yielded and finds the epoch changed re-runs, up to
`QUERY_TORN_READ_ATTEMPTS` (6). With the lock in place this can no longer
trigger for callers going through `query()`/`execute()`/`transaction()`, and
is kept as defence-in-depth for any future caller that bypasses them. A
retry must not simply re-prepare against the connection as it looks *right
now* — the write that forced the retry is often a sync apply's still-open
`transaction()`, and the single connection would hand back its uncommitted,
half-applied state — so retries wait for in-flight transactions to settle
first. Reads issued inside a transaction never yield, so nothing can tear
them.

**The misuse-class retry** (`MAX_MISUSE_RETRIES` = 2) re-runs on
`closed|finalized|bad parameter|api misuse|allocation failed`. Those are all
observed spellings of the same live-statement-vs-write race: sql.js's
`SQLITE_MISUSE` text when a `step()` hits a statement invalidated by an
interleaved `BEGIN`, and a `RangeError` ("Array buffer allocation failed")
from the WASM heap when the interleaving corrupts the statement's buffer
bookkeeping. A `SELECT` has no side effects, so discarding a partial result
and re-`prepare()`ing against the same (still valid — only the statement
handle died) connection is always safe. Its budget is deliberately kept well
below `QUERY_TORN_READ_ATTEMPTS`, because both `continue` the same loop: a
torn read detected on the last available attempt is returned to the caller
silently un-retried, and that truncated-but-authoritative-looking result is
the more dangerous of the two failure modes.

**`transaction()` does not nest — calling it from inside another
`transaction()`'s `fn` deadlocks, on purpose.** This used to be guarded only
by the `inTransaction` boolean, which cannot tell a genuinely nested call
apart from two merely concurrent ones overlapping in wall-clock time — e.g.
a background `pushChanges()` loop (which awaits between batches) still
running when a cashier's `createSale()` also calls `transaction()`. The
second ran inline against the first's open transaction, so when the sync's
block later threw and rolled back, the sale's writes were rolled back with
it, after `createSale()` had already returned and the UI showed the sale as
recorded. Plain browser/Tauri JS has no async-call-chain identity (no
`AsyncLocalStorage`) to distinguish the two, so nesting is unsupported
outright: every call queues and gets its own real `BEGIN`/`COMMIT`. A
composed operation that is already inside a transaction must call
`query()`/`execute()` directly — see `requeueOrphanedRows()` in
`reconcile-identity.ts`, the one real example. A hang in testing is far
easier to catch than silent cross-transaction data loss.

If `BEGIN` itself fails, `transaction()` falls back to running `fn` without
atomicity rather than blocking the operation. On Tauri that risk is closed,
not merely tolerated: the vendored `@tauri-apps/plugin-sql` fork
(`src-tauri/vendor/tauri-plugin-sql/src/wrapper.rs`) caps its sqlx pool at
`.max_connections(1)` so every call serializes onto the same connection.
Replacing that fork with a stock build silently removes real transactional
semantics unless the cap is re-applied.

**`awaitSettledTransactions()`** exists for `getPendingSyncItems()`, which
reads `_sync_queue` with a bare `query()` from a background timer that has
no idea a multi-minute bulk import's transaction is open. Same-connection
reads-your-own-writes means it would otherwise read and push rows from that
transaction before it commits — and if it later rolls back, those rows are
orphaned on the server with no local record. Awaiting first narrows the
window to a microtask gap; it is not a guarantee, and does not need to be.

**Persistence is whole-database.** `saveDatabase()` exports the entire sql.js
database, so `transaction()` saves once per block instead of once per
statement, and any bulk write loop belongs inside a `transaction()` — a
manual sync retrying thousands of backed-off items without that batching can
exhaust the tab's memory on one full re-serialization per item. A failed
save (most plausibly `QuotaExceededError`, competing with the PWA precache
for the same origin budget) emits `APP_EVENTS.dbSaveFailed` rate-limited to
once per `SAVE_FAILURE_NOTICE_INTERVAL_MS` (5 min) rather than importing a
toast library into this low-level module; before that, it was
`console.error` only and the app looked perfectly healthy while writes
silently stopped persisting.

**Invalidation is batched per transaction.** `queueTableInvalidation()`
collects touched table names while `inTransaction` and fires once after
commit. Invalidating per row during a 1000+ row import means as many
refetches of whatever list is on screen — that refetch storm, not the SQL,
is what froze the tab. `syncQueueChangeListeners` is a `Set`, not a single
slot, because `SyncIndicator` mounts several instances (sidebar, mobile
header, mobile drawer) with independent lifecycles; listeners receive the
*set of tables* that changed so they can ignore pure `audit_logs` churn.

**Writer election runs before the schema migrations.** `initWriterLock()` is
awaited in `initDatabase()` *before* `runSchemaMigrations()`, because one
migration (`clearLegacyTransactionsOnce`) can persist a destructive one-time
cleanup to the shared IndexedDB snapshot. Deciding writer/read-only first,
and gating that callback on it, lets a soon-to-be-read-only tab mutate its
own in-memory `db` (so its later reads see the current schema) while never
writing that back to shared storage. It is awaited rather than
fire-and-forget so a caller that awaits `initDatabase()` can read
`isWriterTab()` immediately; that only waits for the initial decision, never
for an eventual promotion. `saveDatabase` is passed as the graceful-handoff
callback so an outgoing writer force-saves before dropping to read-only.

`initDatabasePromise` dedupes concurrent `initDatabase()` calls. `db` stays
null for the whole async init (WASM load, IndexedDB read, schema run) and
every `query()`/`execute()` independently does `if (!db) await
initDatabase()`, so without the shared promise each would register its own
writer-lock request — 14+ pending Web Lock requests for a single tab,
observed live, which breaks the handoff in `tab-lock.ts` (a tab dropping the
lock could instantly re-grant itself from one of its own leftovers).

`rehydrateFromIndexedDb()` runs once per tab, at promotion: the promoted
tab's in-memory copy predates whatever the outgoing writer committed just
before closing, so it must catch up or it would resurrect stale rows (the
same class of loss C1 exists to close). It reserves a db slot before
swapping `db` out, or an operation suspended mid-yield could resume against
a `close()`d handle and throw sql.js's generic "bad parameter or other API
misuse" (reproduced: a fast login racing boot-time `requeueOrphanedRows()`
during promotion). It returns `true` after a successful rehydrate *or* when
no snapshot exists at all; `false` only on a real read failure, which
`tab-lock.ts` treats as "refuse to promote". It deliberately does not re-run
schema migrations.

**Tauri PRAGMAs.** The Tauri SQL plugin hands out a pooled sqlx connection,
and SQLite's default rollback-journal mode allows one writer at a time, so
two pooled connections writing close together can lock each other out for
seconds or fail with "database is locked", with no PRAGMA tuning by default.
`initDatabase()` sets `journal_mode = WAL` (readers and a writer proceed
concurrently), `busy_timeout = 5000` (retry internally instead of erroring)
and `synchronous = NORMAL`.

### Backup, restore, wipes and diagnostics (`core.ts`)

- **`restoreDatabase()` (web).** Builds the candidate as a throwaway sql.js
  instance first, so a malformed file throws with the live database fully
  intact, then sanity-checks it against `RESTORE_SANITY_CHECK_TABLES`
  (`users`, `stores`, `products`, `sales`) — not exhaustive, just enough to
  reject some other app's valid `.db`/`.sqlite`. It snapshots the outgoing
  database to `<app>_db_pre_restore_backup` first (recoverable via
  `restorePreRestoreSnapshot()`, one generation deep) and returns
  `snapshotSucceeded` so the caller can warn the user that the usual undo
  will not be available this time instead of that failing console-only.
  Runs the cold-start schema pass (`SCHEMA_SQL` then `runSchemaMigrations`)
  against the restored database, inside the same `reserveDbSlot()`
  reservation as the swap, before persisting it — a backup taken on an
  older app version otherwise keeps running on its stale schema until the
  next full reload, which is how a device ended up missing a table
  (`permission_groups`) a later sync pull expected. Both `SCHEMA_SQL` and
  the migrations are additive/idempotent against existing data (there is no
  schema-version table to conflict with — every migration step is written
  to be safely re-runnable), so this is the same pass an ordinary app
  upgrade already runs, just applied at restore time instead of at boot.
- **`restoreDatabaseFromFile()` (desktop/mobile).** Validates the SQLite
  magic header (`SQLITE_FILE_HEADER`) *before* touching the live connection
  or file. Runs `PRAGMA wal_checkpoint(TRUNCATE)` before snapshotting,
  because WAL is enabled and a raw copy of `dumosrx.db` alone misses the most
  recent writes — exactly the data most likely to matter. A failed
  `db.close()` aborts the restore outright rather than overwriting: a still-
  open connection's `-wal`/`-shm` sidecars can replay stale pre-restore pages
  over the freshly copied file on the next open, mixing pre- and post-restore
  state. The caller must reload the app afterwards.
- **`backupDatabaseToFile()`** uses `VACUUM INTO` rather than a raw file
  copy, so the snapshot is coherent even if writes land during it. The
  destination path is escaped and inlined because `VACUUM INTO` does not
  reliably accept a bound parameter across drivers; the path comes from a
  native save dialog, but a quote in a folder name would still break it.
- **`discardLocalDatabaseBlob()`** is the last resort for a database that
  cannot be opened at all (web/PWA): snapshots to `<key>_pre_reset_backup`,
  deletes the live key, and deliberately does not touch `db`, since it runs
  on the init-failure screen where there may be no usable connection.
- **`LOCAL_WIPE_TABLES`** is shared by `resetDatabase()` and
  `clearDatabaseForNewStore()` so the two cannot drift apart again — they
  previously both omitted `sale_item_batches`, orphaning rows pointing at
  cleared `sale_items`/`stock_batches`. It excludes store configuration
  (`loyalty_tiers`, `loyalty_redemption_options`, `system_configs`); only
  `clearDatabaseForNewStore()` adds `stores`/`users`.
- **`diagnoseLegacySchema()`** is read-only and exposed on `window`
  unconditionally (not dev-gated), like `window.__forceFullResync`: a rare
  production recovery/inspection tool for a support session to run from
  DevTools, deliberately not an in-app button. Its `retirable` map answers
  the inverse of `findings` — per still-active legacy migration, is *this*
  device a blocker to deleting it. A migration is only safe to delete once
  every active device reports `ok: true`, and `backfillStoreIdOnLegacyRows`
  re-runs on every launch, so it doubles as an ongoing safety net: a clean
  device is necessary but not sufficient to retire it.
- **`window.__e2eSetSubscriptionTier`** (development builds only) elevates
  the e2e browser context's own copy of the local DB, never the checked-in
  free-tier fixture (`e2e/.auth/test-db.bin`) that other specs rely on for
  `LockedModuleOverlay`. See `e2e/fixtures.ts`'s `loginAsPaidTier`.

### `logAction()` and audit-log dedup (`core.ts`)

A repeating action (`isDedupableAuditAction`, e.g. `LOGIN_FAILED`) folds
into the most recent still-unsynced `audit_logs` row for the same
`(action, table, record_id, store)` by bumping `occurrence_count` and
rewriting that row's pending `_sync_queue` INSERT payload **in place**. The
server side of `audit_logs` is genuinely append-only — matched by
`properties->client_id`, never looked up by id for an UPDATE (see
`SyncController`) — so folding repeats into one eventual row is preferable
to teaching the sync engine an UPDATE path that table was never designed
for. Once the row has synced (`_synced = 1`) a further repeat starts a fresh
row, same as a first occurrence; the count already reached the server. If a
push in flight has already cleared the queue row, the payload rewrite simply
no-ops — the local row is still correct, and the next repeat starts fresh.

`logAction()`'s `overrideStoreId` mirrors `assertStoreOwnership`'s: the one
real caller is `stock-transfers.ts`'s `transferStock()`, which writes rows in
two stores inside one transaction, and without it every audit row was
attributed to whatever store the UI had active rather than the one the write
belongs to.

### Every table follows the same sync-tracking convention

Every syncable table has: `id` (UUID, client-generated via `generateId()`),
`created_at`, `updated_at`, `_version` (int, starts at 1, incremented on
every local write), `_synced` (0/1), `_synced_at`, `_deleted` (soft-delete
flag; most deletes are soft; see `remove()` vs `softDelete()` below).

### The generic CRUD helpers: use these, don't hand-roll SQL for mutations

`lib/db/base-helpers.ts` exports `insert()`, `update()`, `softDelete()`,
`remove()` (hard delete). Every one of them, on every call, automatically:

1. Writes the row to local SQLite
2. Appends an entry to `_sync_queue` (via `addToSyncQueue`) so the sync
   engine picks it up on the next push
3. Writes an activity-log entry (`logAction`)
4. Invalidates the right React Query caches (`invalidateQueriesForTable`,
   matched against each query's `meta.tables`, see query-keys below)

**This means any new feature that writes data gets sync, audit logging, and
cache invalidation for free just by calling `insert`/`update` instead of
raw `execute()`.** Only reach for raw SQL for reads, or for genuinely
bespoke multi-row writes (and even then, wrap them in
`transaction()` from `core.ts`, see `submitStockAudit` in
`lib/db/queries/inventory.ts` for the reference pattern: multiple
inserts/updates across `stock_audits`, `stock_batches`, `stock_movements`,
and `products` in one atomic transaction).

**`insert()`'s store auto-scope treats `null` like `undefined`.** It fills in
`store_id` from `getActiveStoreId()` when the caller passed `data.store_id ==
null` — a loose `==` on purpose, not a typo. A store **owner**'s own
`users.store_id` is deliberately always NULL (they "have" a store via
`stores.user_id`), so any caller forwarding `user.store_id` hands this an
explicit `null`; the old strict `=== undefined` let that through and wrote a
NULL-scoped row, which every store-scoped read (`... ${storeId ? " AND
store_id = ?" : ""}`, dozens of sites) then filtered out. The online-order
fulfilment path did exactly this and lost the money from every report — see
`docs/FIXED_BUGS.md` (SF-P2-6). Passing an explicit *other* store id still
wins, as before. Prefer `user?.store_id ?? storeProfile?.id` at call sites
anyway; don't rely on the helper alone.

**`options.correlationId`** (added 2026-09-23, all four helpers +
`logAction()` in `core.ts`) ties every `audit_logs` row one multi-step
operation writes together — e.g. a single sale's ~10-15 rows across
`sales`/`sale_items`/`stock_batches`/`stock_movements`/`customers`/
`loyalty_transactions` all share the sale's own id as `correlationId`, so
the Activity Log (`components/activity-log/`) can collapse them into one
"Sale processed (+N more)" entry instead of showing each write separately.
Generate the id up front (e.g. `generateId()`, then pass it as `data.id`
into the first `insert()` so the correlation id and the primary record's
own id are the same value) and thread it through every subsequent
insert/update/softDelete call in that operation — see
`lib/hooks/use-pos-payment.ts`'s `handlePayment` for the reference
pattern. Grouping is purely presentational (`groupByCorrelation` in
`activity-log-rows.tsx`, adjacency-only within the current page — no
SQL/pagination change), so it's safe to add to a new multi-step write
without touching the Activity Log's query/sort/search paths at all.

**Local `audit_logs` retention** (`lib/db/retention.ts`, added 2026-09-28
for A-20). `pruneSyncedAuditLogs()` runs from `sync()` on the writer tab,
at most once a day, and deletes `audit_logs` rows that are already
`_synced = 1`, have no pending `_sync_queue` entry, and are older than
`AUDIT_LOG_LOCAL_RETENTION_DAYS` (730). It uses raw `execute()`, never
`softDelete()` — these rows must not enter `_sync_queue`, because the
server keeps the full trail and a synced delete would destroy it for every
device. If you add another append-only local table with the same growth
shape, prune it here rather than inventing a second mechanism.

### Sync engine (`lib/db/sync-engine/`)

`sync(isManual, isSetup)` in `index.ts` does one push-then-pull cycle:

- **Push** (`push.ts`): drains `_sync_queue`, sends to the server, marks
  queue entries synced on success. Preserves `_version` (a past bug here,
  see commit `3352b5a`, stripped `_version` on push, which broke conflict
  detection).
- **Pull** (`pull.ts`): fetches server-side changes since each table's
  `_sync_state.last_synced_at`. **Conflict handling is deliberately
  conservative**: if a row being pulled has a pending entry in
  `_sync_queue` (i.e. a local edit not yet pushed), the pull *skips that
  row* rather than overwriting it; the next push resolves it properly via
  version comparison on the server. This means a pulled update can be
  briefly "invisible" locally if you have an unsynced edit in flight; that
  is intentional, not a bug.
- **Pull paging is resumable, and carries two cursors per table.**
  `_sync_state.last_synced_at` is the *delta window* and only advances when
  the server reports `has_more: false` for that table with no skipped
  record; `_sync_state.server_cursor` is the `(updated_at, id)` keyset
  *position* inside a still-undrained window and is written after every
  committed page, then cleared when the window is stamped. So an
  interrupted round (network failure, `MAX_PULL_PAGES`, app close) resumes
  instead of restarting, and nothing is ever declared synced that isn't.
  The request sends `page_cursor` and the legacy `page_offset` together so
  client and server can deploy independently. Do not collapse the two
  cursors into one — the server's window filter is `_synced_at OR
  updated_at`, and a row-ordered position cannot express it. Full design,
  including the `id` tie-break and the cursor's date format, is in
  `docs/SYNC_PULL_PAGINATION.md`.
- Sync failures use exponential backoff per queue item
  (`recordSyncFailure` in `base-helpers.ts`), with a one-time report to
  superadmins after `SYNC_FAILURE_REPORT_THRESHOLD` (5) consecutive
  failures on the same item.
- **Never log a crash about the `feedback` table back into the `feedback`
  table, and never embed a raw push error in a new log message.** Both
  rules exist because breaking either one caused a live production incident
  on 2026-09-29 (Sentry `DUMOSRX-CLIENT-1B`, `17`, `19`, `1A`, `1G`, `1M`;
  full account in `docs/FIXED_BUGS.md`, A-27). `logCrash()` stores its
  report as a `feedback` row, and `insert()` queues that row for push like
  any other — so a crash report is itself a syncable row that can fail to
  sync. When `recordSyncFailure()` reported a stuck `feedback` row by
  embedding the push error, and that error was a database rejection (whose
  text includes the **entire attempted SQL statement**, i.e. a verbatim
  copy of the row), each report contained every previous one: unbounded,
  self-nesting growth until the column limit was hit, whereupon *that*
  insert failed and produced another report, forever. Fingerprint dedup did
  not catch it because every generation carried a different stuck-record id.
  The two guards now in place: `truncateForLog()`
  (`lib/utils/error-truncation.ts`) caps anything embedded in a log message
  at `MAX_EMBEDDED_ERROR_LENGTH`, and `logCrash()` caps its own final
  message at `MAX_CRASH_MESSAGE_LENGTH` (2000, matching the server's
  `/logs/client-error` validation so an oversized report is truncated
  rather than silently 422-rejected); and `recordSyncFailure()` routes a
  stuck `feedback` item to `reportStuckCrashLog()`, which reports via
  `console.error` + a direct `Sentry.captureException` and writes no
  `feedback` row. A stuck *crash* row (`type = 'bug'` with a fingerprint)
  is also dropped from the queue and settled via `markConflictSettled` —
  Sentry and `/logs/client-error` already have it, and leaving it
  `_synced = 0` without that settle would let `requeueOrphanedRows()`
  resurrect it every boot. Genuine user-submitted feedback keeps its normal
  retry behaviour. **If you add another table that a logging/telemetry path
  writes to, apply the same "don't log X into X" check before reporting a
  failure on it.**
- **`isManual` means "a human clicked Sync Now", and nothing else.** It
  bypasses per-item backoff (`getPendingSyncItems`) *and* the server's
  plan-tier sync-interval throttle (`?manual=1`), so passing it from an
  automatic caller turns both off for everyone — which is exactly what the
  `SyncIndicator` daemon used to do (see `docs/FIXED_BUGS.md`, A-5). Every
  background caller passes `false`.
- **Every request of one `sync()` call carries the same `X-Sync-Run-Id`**
  (minted once in `index.ts`, threaded through `pushChanges`/`pullChanges`),
  because the server measures its interval throttle per run rather than per
  request. A new sync path must thread it through too, or a multi-batch
  backlog will be throttled by its own first batch.
- `syncSubscriptionStatus()` is a separate, lighter-weight pull of just the
  `stores` table (tier/status/suspension), run even for free-tier stores
  that don't get full sync, so plan changes/suspensions still land.

Call `sync(true)` before any workflow where stale local data would be
actively misleading (e.g. `StockAudits` syncs on mount before showing
counts, see `components/stock-batch/stock-audits.tsx`).

#### Push details (`sync-engine/push.ts`)

- **Terminal vs retryable rejections.** `NON_RETRYABLE_CONFLICT_REASONS`
  (`version_conflict`, `stale_timestamp`,
  `quantity_received_exceeds_ordered`, `permission_denied`) all share one
  property: the queued payload is *frozen*, so resending it cannot change
  the outcome — the base version this edit was computed from never moves,
  the receipt the server judged impossible against the ordered quantity
  stays impossible, and the caller's own grants do not change by resending.
  Routing any of them through `recordSyncFailure()`'s backoff would loop
  until the cap and then report a permanently stuck item. They are deleted
  from `_sync_queue` outright instead; the next pull brings the server's
  real value down, now that nothing local blocks it (see pull's
  pending-local-edit skip). A `forbidden` rejection is deliberately *not* in
  this set — see "the `stores` prune" below.
- `SILENT_TERMINAL_REASONS` (`permission_denied`) is dropped without a
  toast: those edits are queued by automatic machinery (the permission
  catalog backfill), not a user action anyone is waiting on, so "could not
  be saved" would be alarming noise about something they never did.
- `TERMINAL_CONFLICT_SETTLES_SOURCE_ROW` (`audit_logs`): the server row does
  not carry the id the client pushed, so no future pull can ever match and
  settle the terminally-conflicted local row — `markConflictSettled()` is
  called explicitly. See `docs/FIXED_BUGS.md`, "audit_logs conflict
  resurrection loop".
- **`coalescePendingUpdates()`.** `update()` no longer bumps `_version`
  locally (it sends the unchanged base version so the server can tell a
  stale edit from a current one), which fixed the two-device case but left a
  single-device regression: `addToSyncQueue` appends one row per `update()`
  with no coalescing, so two ordinary sequential edits to the same record
  before the next sync (e.g. `outstanding_balance` then `loyalty_points` in
  `use-pos-payment.ts`) freeze the *identical* base `_version` in two rows.
  The first is accepted and bumps the server version; the second collides
  with that bump and is rejected as a false `version_conflict`, silently
  losing an ordinary edit and showing a misleading "another device" toast.
  The fix folds every pending UPDATE for one record into one change — later
  field values win per column (same full-overwrite semantics a single
  `update()` has), the merged payload carries the **earliest** entry's
  `_version` (the true base the chain started from; none of these has
  synced, so the server knows nothing past it), and `mergedIdsByRepId`
  tracks every folded queue row id so mark-synced/drop acts on all of them
  and never orphans the rest. It runs once up front, before batch slicing,
  so batching can never re-split two edits to one record. INSERT and DELETE
  are untouched: an INSERT never faces a version check, and a record is only
  ever deleted once while pending.
- **`withheldRecordsWithBackedOffSiblingsRemoved()`.** Retry backoff can
  still split a same-record pair that coalescing would have merged:
  `getPendingSyncItems()` only returns rows currently due. If edit A failed
  retryably and is still backed off while edit B for the same record is due,
  a background sync pushes B alone, it is accepted, the server version
  bumps, and A later collides as a false conflict. So for background syncs
  every due UPDATE is held back if any sibling UPDATE for that record is
  still in `_sync_queue` (one `COUNT(*)` per distinct record — a
  correctness-critical path, not a hot loop). It lives in `pushChanges()`
  rather than in `coalescePendingUpdates()` because it must see the *full*
  queue, including not-yet-due rows. A manual sync bypasses backoff and
  already sees every row together, so this is a no-op there.
- **`_version` is re-read at push time**, not taken from the frozen payload.
  Coalescing only folds edits queued *before* a push run starts; an edit
  made while an earlier push for the same record is in flight is queued into
  a later run, by which point the earlier response's `versions` handling has
  already bumped the local `_version`. The frozen pre-bump value would
  collide with this device's own accepted change. The re-read falls back to
  the frozen value on error (e.g. a queue row naming a table that no longer
  exists locally) so one bad row cannot reject the whole batch's
  `Promise.all`.
- **`compareCategoriesFirst()`** moves every category change to the front of
  the *whole* queue, not just within a batch: the server's duplicate-name id
  remap lives only in that one request's in-memory `$idMap`, so a product in
  a later batch referencing a category resolved in an earlier one would fail
  its foreign key forever. The comparator must also be *consistent* — the
  previous `table_name === "categories" ? -1 : … ? 1 : 0` version returned
  `-1` in both directions when both rows were categories, reversing their
  `created_at` order and sending an UPDATE ahead of the INSERT it edited, so
  the server applied the stale INSERT last and the edit vanished.
- **`response.id_map` handling.** `remapForeignKey()` only rewrites payload
  *content* (a foreign key baked into another row's queued JSON); the queue
  row's own `record_id` column — what the server actually looks the target
  up by — is rewritten separately, or a pending edit to the merged-away
  record keeps targeting an id the server no longer has, failing until the
  backoff cap. The local duplicate is then soft-deleted. This must happen at
  push time: a future delta pull only reconciles categories/suppliers that
  appear in that pull's own response, and a long-unchanged row never will.
- **`response.versions` is applied per row inside a `try`/`catch`.** Applying
  the server's authoritative version immediately (rather than waiting for a
  pull) stops this device's very next edit being rejected against its own
  accepted change. But `table` comes straight from the server, and an
  unrecognized or locally-absent name would throw `no such table` inside the
  transaction callback, rolling back the entire batch *including*
  `markSynced()` and setting up an infinite re-push loop. Caught per row
  instead; the affected record keeps its pre-push version until the next
  pull corrects it, which is harmless since pull always trusts the server's
  version.
- **Payload scrubbing before send.** `_deleted`/`_synced`/`_synced_at` are
  stripped, `_version` is deliberately kept (stripping it once forced every
  conflict check onto the weaker `updated_at` fallback, which trusts each
  device's local clock instead of a monotonic per-record counter). Every
  string field matching `ISO_DATETIME_REGEX` is rewritten to
  `YYYY-MM-DD HH:MM:SS`, because MySQL `DATETIME` rejects the `T`/`Z` and
  fractional seconds — applied by shape, not by hardcoded column name.
- **Per-table payload fixes.** `products`: `brand_name`/`supplier_id` are
  stripped, since a row queued before the server dropped those columns still
  carries them in its frozen snapshot (a write-time snapshot never picks up
  later schema changes); a non-UUID `category_id`/`supplier_id` is rejected
  rather than allowed to block the queue. `stock_movements`: a null
  `stock_batch_id` is rejected (the server requires it). `stock_batches`:
  `selling_price` is dropped, and an **INSERT** with no `batch_number` gets
  `"Opening Stock"` to satisfy the server's NOT NULL column for rows queued
  before `product-import.ts` stopped writing `batch_number: null`. That is
  gated to INSERT deliberately — applied to an UPDATE it (1) injected a
  bogus value into the quantity-only payloads
  `updateStockBatchQuantity()` produces, defeating
  `SyncController::push`'s narrowed `stock_batches` conflict exemption
  (which only fires when the payload is provably quantity-only) and
  reintroducing the false-conflict regression, and (2) reached the server's
  `forceFill($payload)` and overwrote the batch's real `batch_number` on
  every ordinary sale, cost correction or return restock. Neither is
  possible for an INSERT.
- **Rejected items are never silently dropped**: each gets a
  backoff-tracked `recordSyncFailure()` with `reportImmediately = true`,
  because these are deterministic client-side validation failures that will
  fail identically forever, so waiting for the 5-retry report threshold just
  delays remote visibility. `alreadyRejectedIds` is populated only *after*
  that transaction commits, so a rollback cannot make a never-recorded
  failure look recorded; both the whole-batch-failure branch and the catch
  block iterate the full `batch` and skip those ids rather than overwriting
  a specific reason with a generic one and double-bumping `retry_count`.
- **Batching and throttling.** `SYNC_BATCH_SIZE` is 50 with a 1.1s pause
  between batches (never before the first): the API route's shared limit is
  60 requests/minute and other app traffic competes for it, so a manual sync
  draining a large backlog would otherwise trip "Too Many Attempts" instead
  of syncing. All per-item bookkeeping is wrapped in one `transaction()` per
  batch, because each `markSynced`/`recordSyncFailure`/`remapForeignKey`
  outside a transaction triggers a full sql.js database export.
- **Conflict toasts.** One per conflicted record (coalescing guarantees at
  most one `failed` entry per record per run), collapsing into a single
  summary above `CONFLICT_TOAST_THRESHOLD` (5) — Sonner's Toaster does a
  `flushSync` state update per `toast()` call, and a batch's worth fired in
  one tick trips React's "Maximum update depth exceeded" and crashes the
  page. The wording deliberately does not claim "another device": a
  `stale_timestamp` rejection is the legacy fallback for a row with no
  version tracking, and this client cannot verify what changed the record
  server-side — state what happened, not an unverifiable cause. A conflict
  on an item with `retry_count > 0` is logged, not toasted: a response lost
  after the server committed (timeout, dropped connection) is
  indistinguishable from a network failure here, so the resend collides with
  its *own* already-applied first attempt. That can occasionally mute a real
  conflict, but the cost is a missed notification, not lost data — the
  server's version is kept either way. `feedback` and `audit_logs` conflicts
  are logged rather than toasted: both are push-only telemetry the user
  never edits, and `audit_logs` has no `_version` at all, so the server's
  duplicate-INSERT handling always falls to the `stale_timestamp` path.
- **Whole-batch and thrown failures.** A `success: false` response (the
  request completed, the server rejected the batch — auth, validation, rate
  limit) previously had no handling at all: no backoff, no retry counter, no
  report, every item retried forever invisibly. It now routes through the
  same `recordSyncFailure()` path as a thrown error, keyed off the `batch`
  actually sent. A plan restriction (`SYNC_THROTTLED`, `SYNC_DISABLED`,
  `STORE_LIMIT_EXCEEDED`) is rethrown and stops the run with the queue
  untouched — it is not any item's fault, and burning every item's
  5-attempt budget would report a perfectly healthy queue as stuck. Any
  other thrown error fails just its batch and the run continues.
  `failedBatches` counts only these two cases (not ordinary per-item
  rejections), so `sync()` can tell "nothing to push" from "everything
  failed" — see `index.ts`.

#### Pull details (`sync-engine/pull.ts`)

- **`MAX_PULL_PAGES` (1000) is a safety bound, not a correctness ceiling.**
  It only stops one `sync()` running forever if the server ever reports
  `has_more` indefinitely; every committed page persists its own keyset
  position, so a round that stops there resumes.
- **Paging within a round.** The server caps each response at 500
  rows/table and reports `has_more` per table; `last_synced` stays fixed for
  the whole round (it is the delta-window boundary) while the round walks
  that filtered, deterministically-ordered `(updated_at, id)` set. Before
  this, only page 1 was ever fetched and the cursor was stamped to `now()`
  regardless, permanently losing every row past the 500th changed row in a
  table (`docs/KNOWN_BUGS.md`). The legacy `page_offset` is still sent
  alongside `page_cursor` so client and server can deploy independently;
  offset paging alone was never immune to concurrent writes shifting
  offsets mid-round, which was an accepted trade-off because a row missed
  that way still has `updated_at >= ` this round's start and is caught by
  the next delta pull.
- **`categories`/`suppliers` (`DUPLICATE_NAME_TABLES`) are never given a
  cursor.** The server treats a table missing from `last_synced` as "return
  everything", and duplicate-name reconciliation can only fix a collision if
  the pre-existing row it collided with is present in the response — a delta
  pull would never re-surface a long-unchanged row like "DRUGS", hiding the
  collision from every future sync. These are small collections, so a full
  fetch costs nothing. A row whose `last_synced_at` is still NULL (mid-window
  progress recorded before any window was drained) is also left out, or an
  interrupted first-ever sync would stop looking like one and lose the setup
  escape hatch.
- **Skips hold the window cursor back, never the page cursor.** A record
  with a pending `_sync_queue` entry is left alone (the next push resolves
  it by version); a record that hit a UNIQUE collision was not applied. In
  both cases the per-table window cursor must not advance past it, or the
  server never re-offers it and the local row is stuck on stale data
  forever. Re-fetching and re-applying an already-applied page is a harmless
  no-op. The *page* cursor always advances, or the round would re-ask for
  the same page and never terminate.
- **A table this device's local schema doesn't have yet is skipped for the
  round, not allowed to throw.** Every table in a pull page shares one
  transaction, so one missing table (it predates the migration that added
  it — e.g. a restored backup, before `restoreDatabase()` re-ran migrations)
  would otherwise roll back `stores`/`users` along with it — the exact
  mechanism that turned a schema-drifted device's first sync into "no staff
  accounts were found". Nothing is persisted for the skipped table; a later
  round re-offers the same window once the table exists, and the in-memory
  page position still advances so the round terminates.
- **UNIQUE collisions give up after `MAX_UNIQUE_SKIP_RETRIES` (5).** Unlike
  a pending-local-edit skip, a UNIQUE collision (e.g. two accounts each
  created a user with the same email) is not self-resolving, and blocking
  the table's cursor on it forever would stall every other record in that
  table. Counts are kept per record in `localStorage`
  (`STORAGE_KEYS.syncUniqueSkipCounts`); a failed write there just resets the
  count, which only makes the behaviour more conservative. The record stays
  in `skippedRecords`/`logCrash` either way, so the loss is visible, not
  silent. Those reports are collected and emitted *after* the transaction
  commits, because `logCrash()` writes to SQLite and would otherwise nest a
  write transaction inside the pull's own.
- **`stock_batches.quantity` is never trusted from a pulled snapshot**,
  mirroring the server's rule for pushed payloads. The pulled value is only
  as current as the movements the server had processed at pull time, so
  writing it clobbers real local state — reproduced as a pull racing a push
  leaving ~500 batches permanently forked into duplicates, because a zeroed
  batch becomes invisible to the "does one already exist" check. Quantity
  stays whatever local movements derived, and each newly-pulled
  `stock_movements` row applies its own delta as
  `MAX(0, quantity + delta)`. The floor is load-bearing: without it, an
  oversell floored at 0 on the originating device diverged permanently from
  every other device applying the raw delta. Movements are an immutable log,
  so the insert branch sees each one exactly once — a missed delta is lost
  forever, which is why the deferral below exists.
- **Deferred movement deltas.** Batches and movements paginate
  independently, so a movement can arrive on an earlier page than the batch
  it references, where the delta would silently no-op (an `UPDATE … WHERE
  id = ?` matching zero rows). Such deltas are collected and applied after
  every page of every table, and `stock_movements`' cursor stamps (both the
  window stamp and the mid-window position) are **held back** and committed
  in the same transaction as those deltas. Committing the cursor first would
  let a crash in between leave the cursor claiming the movements were pulled
  while their deltas were never applied. Within a page, `stock_batches` is
  sorted first explicitly — the server's table order happens to match today,
  but that is incidental, not a contract.
- **`DEVICE_LOCAL_PULL_COLUMNS`.** Columns each device owns privately:
  written locally, never pushed, so the server's copy is meaningless and
  must never be written back. Today that is `stores.last_monotonic_time`,
  the anchor for the offline clock-tamper guard
  (`lib/licensing/licensing-manager.ts` refuses a local time earlier than
  the last recorded action). Only `updateStoreMonotonicTime()` writes it, as
  a raw `execute` that never reaches `_sync_queue`, so the server's column is
  permanently NULL and writing that NULL back disarmed the guard after every
  sync round. Were the column ever pushed (`window.forceSyncAllData` queues
  whole `stores` rows), a device with a fast clock would propagate a future
  timestamp and lock every other device of the store out.
- **JSON-cast server attributes** (e.g. `permission_groups.permissions`)
  arrive as real JS arrays/objects and are `JSON.stringify`d before binding:
  sql.js turns an array into an object of numeric keys, producing a value no
  later `JSON.parse()` can read back. This matches how every local write of
  a JSON-shaped column already stores it.
- Updates set only the columns the server returned, preserving local-only
  columns (`is_initialized`, `theme`, `license_token`).
- **Duplicate-name reconciliation:** a local row absent from the response
  but name-matching a server row has its references remapped to the server's
  id and is then soft-deleted rather than left as an orphaned duplicate.
- **`onCriticalTablesReady` / `SETUP_CRITICAL_TABLES` (`stores`, `users`).**
  Fires once, the first time those tables have fully drained this round, so
  a caller mid-first-sync (`startSyncProcess` in `use-onboarding.ts`) can let
  the user log in and reach the dashboard while the same call keeps pulling
  everything else — it decides only *when* the callback fires, never what is
  fetched. It is checked after each page's transaction commits, and fired
  from `finally` so a thrown pull cannot leave a future caller awaiting it
  forever.

#### `sync()` and friends (`sync-engine/index.ts`)

- **Guards, in order, all centralized here so no call site can bypass
  them:** the in-progress mutex (returns `SYNC_IN_PROGRESS_ERROR`, which
  callers must treat as a no-op, not a failure); impersonation (a superadmin
  handed into a store's app is read-only support visibility — syncing would
  push writes and pull-overwrite state under ambiguous attribution, bypassing
  the owner's own auto-sync settings and audit trail); a read-only tab
  (caught before `assertWritable()` throws mid-sync); a missing auth token;
  and `navigator.onLine`. The offline check is centralized because a couple
  of call sites (e.g. the store-switch handler) did not check: an offline
  attempt gives every queued item a "Failed to fetch", burning the 5-attempt
  backoff (~15 minutes) and firing a "stuck sync" crash report when nothing
  is broken.
- **`runId`** is minted once per `sync()` (`newSyncRunId()`, which falls back
  off `crypto.randomUUID` since it is unavailable on insecure origins and
  some older webviews — only per-device uniqueness within a short window
  matters) and threaded through every push batch and pull page.
- **`failedBatches > 0` makes `sync()` report failure**, even though the
  individual batches were swallowed so one bad batch cannot block the rest —
  otherwise the indicator toasted "Sync completed successfully" when nothing
  pushed. Ordinary per-item rejections do not fail the sync.
- On failure, the first 20 entries of `getSyncQueueBreakdown()` are attached
  to the crash report under `area: sync-run`. Not user-facing: it lets a
  support session tell a one-off bulk-import backlog from "stuck on the same
  handful of records every time" without device access.
- **`forceFullResync()` / `window.__forceFullResync`.** Escape hatch for a
  device whose pull cursor drifted ahead of rows it never received (a
  mid-round crash stamping `_sync_state` past content a later page never
  applied): every future delta pull silently skips that content forever, with
  no error. Clearing `_sync_state` touches neither local data nor the
  outbound queue; pull treats a table missing from `last_synced` as "return
  everything", so the next pull re-fetches in full. Exposed on `window`
  unconditionally as a support tool and deliberately not wired to any UI — a
  full re-pull of a large catalog is not free on a slow connection.
- **`syncSubscriptionStatus()`** passes `last_synced: { stores: "" }` so the
  server returns the full current store record regardless of delta
  timestamps, and `isSetup = true` to bypass the backend's free-tier sync
  block. It writes only `SUBSCRIPTION_FIELDS` so local-only columns are not
  clobbered, and invalidates `["storeProfile"]`/`["allStores"]` as
  prefix-only keys so every store/user-scoped variant matches.

#### The sync indicator (`components/dashboard/sync-indicator.tsx`)

- `isUserInitiated` is the one thing that makes a sync "manual", and it
  travels all the way to `getPendingSyncItems()` and the server. The
  background daemon therefore calls `runSync(false)`; it used to invoke the
  button's own handler, making every automatic sync claim to be a click and
  turning both protections off for everyone (`docs/FIXED_BUGS.md`, A-5). A
  background sync also stays quiet: no success toast for a sync nobody asked
  for, and an expected plan-tier restriction is the steady state on a
  throttled tier, not a "Sync Error".
- **Two daemon modes, chosen purely by `auto_sync_interval`:** `0` means
  instant (subscribe to `addSyncQueueChangeListener`, debounced by
  `INSTANT_SYNC_DEBOUNCE_MS` = 2000 so a multi-item checkout or bulk receive
  collapses into one sync, same reasoning as `core.ts`'s transaction-scoped
  invalidation batching); any positive number polls every N minutes. Both
  are torn down and rebuilt when the setting changes, so retuning a plan
  tier at runtime cleanly stops whichever mode was active. Neither is
  installed at all while impersonating or on a read-only tab.
- A change batch containing **only `audit_logs`** does not trigger an instant
  sync: PIN logins, failed logins and PIN changes are low-priority telemetry
  no other device needs immediately, and they still reach the server with
  the next real sync. A mixed batch (a sale, which also `logAction()`s)
  triggers normally.
- **Manual sync is always clickable**, regardless of `status`. It used to be
  gated on `status !== "offline"`, but that comes from `navigator.onLine`,
  which iOS/Android can misreport as false right after wake before the radio
  settles — disabling the user's own escape hatch on a device that is
  actually online. `sync()` already checks and fails gracefully.
- The Sync Now button calls `stopPropagation()` because the whole card also
  handles click: without it a click fired twice, the second hit `sync()`'s
  mutex, toasted a spurious error, and its `finally` cleared
  `isSyncInProgress` while the first call was still running.
- **Visibility is driven by the pending count alone**; `isSyncOverdue`
  (30 min) only escalates the visual urgency. Gating visibility on it let a
  real backlog of unsynced sales sit behind a green "Cloud Active".
- The queue count is event-driven via `addSyncQueueChangeListener`, with a
  30s `refetchInterval` as a slow safety net for a drain that emits no
  change event — it is no longer the 5s poll against main-thread sql.js it
  once was.
- Collapsed rendering: the collapsed rail shows the bare icon with no status
  border or background, and the expanded state is one persistent shape
  revealed via max-width/max-height + opacity on the sidebar's own 300ms
  timeline, not two structurally different trees swapped by a conditional.

### The `stores` prune, and how a store disappears (2026-09-29)

**Reported live**: a two-store owner's device showed both stores in the
header switcher, then showed only one, alongside a stuck/pending sync
indicator. The switcher reads `getAllStores()` (`WHERE _deleted = 0`), so
"a store vanished" means something wrote `_deleted = 1` locally. The only
thing that does that is `pull.ts`'s `stores` prune.

**The prune's premise was wrong in one specific, ordinary situation.** It
soft-deletes a live local store the pull response's `stores` list omits,
on the stated premise that `stores` is "always a full, unfiltered snapshot
of every store this account owns". It is not: `SyncController::pull()`
scopes it through `resolvePullTenantScope()`, whose `$ownedStoreIds` is
`[$user->store_id]` for **any user carrying a store_id** — i.e. every staff
account — and only `Store::where('user_id', $ownerId)` for a store_id-less
owner identity. So a pull on a cashier/manager session legitimately returns
one store, and the prune read that as "the server confirmed the owner's
other store is gone". Pinned server-side by
`SyncEndpointTest::test_pull_sync_stores_snapshot_is_narrowed_to_a_staff_users_own_store`.
`pull.ts` now skips the prune entirely unless the stored user snapshot has
no `store_id` (`storesSnapshotIsAccountWide()`); an unknown identity (no
stored user at all, e.g. the onboarding setup pull) still prunes, which is
the original pre-cloud-link reconcile case.

**And a wrongly-pruned store could never come back.** The prune ignored
the pending-local-edit rule the row-apply branch three lines above it
obeys: a store with an unpushed `_sync_queue` row is exactly the row every
later pull *skips*, so the `_deleted = 1` written by the prune was never
cleared again by a correctly-scoped snapshot. A pending queue row on
`stores` is not exotic — `backfillDefaultGroupPermissions()` and
`ensurePermissionGroupsSeeded()` both `update("stores", …)` on login, as
do the store-profile, loyalty and fleet writes. Prune candidates now
exclude any store with a pending `stores` queue row.

Both guards fail closed, matching the direction this code already prefers:
a stale entry lingering in the switcher beats losing sight of a real store.
Tests: `__tests__/store-prune-fails-closed.test.ts`.

**A third, older guard: only a locally *empty* store is ever pruned.** A
store the server does not currently recognize is still not safe to hide if
it is the one this device's whole local history is attributed to (e.g. the
original pre-cloud-link store). Emptiness is checked against every
`STORE_SCOPED_TABLES` entry, not just products/sales — a store whose only
local data is expenses or customers deserves the same protection. Each
table is filtered through `columnExists(t, "store_id")` first, because most
of those columns arrive via `initDatabase()`'s runtime `ALTER TABLE` pass
rather than the base schema: on a device that has not run it (or a test
harness that bypasses it) the query would throw `no such column: store_id`
and roll back the *entire* pull transaction instead of merely skipping that
one table's check.

**Still open, same incident, not fixed here.** A push rejected `forbidden`
(`SyncController::push`'s `authorizeChangeTarget` — e.g. a staff session
draining a queue row the owner left behind for a store outside that staff
member's scope) is **retryable**, and correctly so: the same frozen payload
succeeds once the owner signs back in, unlike the `permission_denied`
class, which is why the H1 fix's terminal handling should *not* be widened
to cover it. But the row then sits in `_sync_queue` indefinitely (backoff is
capped, never abandoned), which is both the stuck sync indicator and — via
the pending-local-edit skip — a record that stops being pulled at all for as
long as it sits there. The general "a permanently-parked queue row silently
freezes its record's pulls" problem is unaddressed.

## Cross-module events and `localStorage`: `lib/events.ts` and `lib/storage-keys.ts`

Required, not optional — this is the fix for A-23 (`docs/FIXED_BUGS.md`), and
the pattern that keeps it from coming back.

**`lib/events.ts` owns every cross-module `CustomEvent` this app dispatches.**
`APP_EVENTS` holds the names, `AppEventDetails` holds each one's payload type,
and `emitAppEvent(name, detail)` / `onAppEvent(name, handler)` are the only
supported way to fire and subscribe. `onAppEvent` returns an unsubscribe
function, so a React effect can `return onAppEvent(...)` directly.

```ts
emitAppEvent(APP_EVENTS.syncCompleted, { updatedTables });
useEffect(() => onAppEvent(APP_EVENTS.syncCompleted, handleSync), [handleSync]);
```

Do **not** write `window.dispatchEvent(new CustomEvent("dumos_…"))` or
`window.addEventListener("dumos_…")` by hand. A new cross-module signal means a
new entry in `APP_EVENTS` plus its detail type in `AppEventDetails` — that is
what makes the payload shape visible in one place and the name impossible to
typo apart. (Genuine DOM events — `online`, `offline`, `pagehide`,
`visibilitychange` — stay on `window.addEventListener`; this module is only for
the app's own events.)

**`lib/storage-keys.ts` owns every `localStorage` key.** `STORAGE_KEYS` is the
registry; the shared, multi-module values also have typed accessors
(`getAuthToken`/`setAuthToken`/`clearAuthToken`, `getStoredUser`/`setStoredUser`,
`getRecentUsers`/`setRecentUsers`, `getStoredActiveStoreId`/
`setStoredActiveStoreId`, `getLastSyncTime`/…) plus `readJsonItem`/
`writeJsonItem` for the rest. The accessors never throw: a missing or corrupt
value comes back as the fallback.

No new bare string key, anywhere. A module-private key still goes in
`STORAGE_KEYS` and the module aliases it (`const PEEK_KEY =
STORAGE_KEYS.sidebarPeekEnabled`), so the registry stays the one place that
lists what this app puts in a user's browser storage.

Note the deliberate naming split: `storage-keys.ts`'s
`getStoredActiveStoreId()` reads the id the API client stamps on `X-Store-Id`,
while `core.ts`'s `getActiveStoreId()` resolves the id local queries scope to.
They are two different things and must not be conflated — them silently
disagreeing is the bug `auth-context.tsx` already carries a comment about, and
the reason A-23 was filed.

## React Query conventions: read this before adding a new `useQuery`

**`lib/query-keys.ts` is a query-key *and* cache-dependency factory.**
Every entry looks like:

```ts
products: {
  withDetails: () =>
    resource(["productsWithDetails"] as const, ["products", "categories", "stock_batches"]),
}
```

Spread it straight into `useQuery`: `useQuery({ ...queryKeys.products.withDetails(), queryFn })`.
The second array (`meta.tables`) is what `invalidateQueriesForTable` (in
`base-helpers.ts` and `sync-engine/index.ts`) uses to invalidate *exactly*
the queries that could be affected by a mutation on a given table, via a
`predicate`, not prefix-matching, because several queries (dashboard,
reports, daily-close) legitimately read from more than one table. A query
with no `meta.tables` falls back to being invalidated on *every* mutation
(safe but wasteful), so always add new queries through this factory rather
than calling `useQuery` with a bare key.

## Directory map (feature areas)

```
app/(dashboard)/        Next.js routes: one folder per top-level nav item
  inventory/[tab]/       overview | catalog | ledger(movements) | audits, tabbed via one dynamic route
  procurement/           vendors, requests, PO create/edit
  settings/[tab]/        general | store | alerts | data | security | staff | system

components/
  ui/                    shadcn/Radix primitives + a few shared house patterns:
                          - filter-pill.tsx   "Label: value" dropdown filter (see below)
                          - responsive-tab-label.tsx   short label <md, full label >=md
                          - responsive-detail-panel.tsx   sheet-on-mobile / inline-panel-on-desktop
  products/               Product Catalog page + product detail panel (product-details/ subfolder)
  procurement/            Purchase orders (Standard + Immediate types), receiving
                           (ledger-style dense table). Create/edit flow is a
                           two-phase "details step → item entry" screen; see
                           Domain model essentials below.
  stock-batch/             "Inventory" tab group: overview, catalog table, movements (ledger), audits (cycle count)
  pos/                    Point of sale
  settings/                One file/folder per settings card, composed by store-settings.tsx etc.
  dashboard/               Home dashboard + DashboardHeader (route-based page titles, PAGE_ROUTES)

lib/
  db/                     Everything described above
    queries/               One file per domain (products.ts, inventory.ts, sales.ts, procurement.ts, ...)
  context/                 AuthProvider, StoreProvider (business vertical + multi-store), pull-to-refresh
  hooks/                   useFeatureGate, dashboard/report hooks
  licensing/               Offline-first license/tier checks (see below)
  api/                     Axios client talking to the Laravel backend (sync + auth only)
  query-keys.ts            See above, read before adding queries
  utils/                    date-utils, search (fuzzy), report-pdf, etc.

src-tauri/                 Tauri Rust shell (desktop/Android packaging), rarely touched from the client side
scripts/                   release.ts (version bump/release), verify-schema-sync.ts (client/server schema diff)
__tests__/                 Vitest unit tests (transactions, sync engine, calculations, parsers)
e2e/                       Playwright end-to-end specs
```

## Domain model essentials

- **Multi-vertical**: `StoreType = "pharmacy" | "grocery" | "supermarket" |
  "retail"`. `lib/context/store-context.tsx` has a `terminology` table that
  relabels generic concepts per vertical (e.g. "Product" → "Item",
  "NAFDAC Number" → "Registration No."). Pharmacy is the primary/default
  vertical; most domain-specific fields (NAFDAC number, controlled
  substance flag, prescription requirement) are pharmacy terms reused
  generically elsewhere.
- **Multi-store**: one account can have several stores; `StoreProvider`
  exposes `availableStores`/`switchStore`. Creating/managing additional
  stores happens on the *web dashboard*, not in this client, see
  `MultiStoreCard`.
- **Licensing/tiers**: `free | local | pro | enterprise`
  (`lib/licensing/licensing-manager.ts`). Includes offline clock-tampering
  detection (rejects local time earlier than the last recorded action) and
  account suspension handling. `useFeatureGate()` (`lib/hooks/`) is how UI
  components check `canUseX` and get an upgrade message, see
  `MultiStoreCard` for the pattern.
  **Tier-AND-store-toggle combined gates**: a feature that's both
  plan-gated *and* individually switchable per store (loyalty program,
  and — added 2026-09-23 — reseller/store-markup sales) follows
  `isLoyaltyProgramEnabled(tierAllows, storeToggle)`'s pattern: a small
  pure function (unit-testable without a StoreContext render harness) that
  ANDs the plan-tier `getFeature(...)` result with a `stores.*_enabled`
  column, exposed as a `canUseX` combined value from `useFeatureGate()`
  alongside the tier-only value (e.g. `canUseResellerCommission` next to
  `canUseMarkupSales`). **Always use the tier-only value, not the
  combined one, to decide whether the settings switch itself is even
  shown/enabled** — gating a toggle's visibility on the combined value
  hides the only way to turn it back on once it's off. Watch the
  toggle's *default*: loyalty defaults **on** (`storeToggle !== 0`, so
  existing users see no change), markup sales defaults **off**
  (`storeToggle === 1`, explicit opt-in) — pick per-feature, don't copy
  the sign blindly. A store that already had the underlying feature live
  (e.g. every Pro/Enterprise store already using reseller-commission
  sales before markup_sales_enabled existed) will lose access silently
  the moment a new default-off toggle ships, until the owner finds and
  flips it — a real rollout cost worth flagging when introducing one, not
  something to "fix" by quietly changing the requested default.
- **Stock audits / cycle counts** (`components/stock-batch/stock-audits.tsx`,
  `lib/db/queries/inventory.ts:submitStockAudit`): tracks three kinds of
  deviation per product (**qty**, **cost price**, **selling price**)
  against system records. Qty diffs post FEFO-ordered adjustments to
  `stock_batches` + a `stock_movements` row; cost diffs correct all active
  batches (master-data fix, not a new purchase); selling diffs overwrite
  `products.selling_price`. The audit ledger UI shows all three as live
  colored diff columns. `products` also now surfaces `last_audited_at`
  (derived via `MAX(stock_audits.reconciled_at)`, joined in
  `getProductsWithDetails()`), shown on the product detail panel with a
  90-day-stale warning banner.
- **Quick stock adjustments** (`components/stock-batch/adjust-stock-flow.tsx`,
  `lib/db/queries/inventory.ts:submitStockAdjustment`): a two-step flow —
  step 1 picks one of four fixed reasons (`ADJUSTMENT_REASONS` in
  `adjustment-derivations.ts`: Receive items, Damage, Inventory count, Loss)
  plus an optional note; step 2 adds items by name/SKU/barcode and shows
  Current Stock, an entered quantity and a live Stock After preview. It is
  the "correct a few items right now" counterpart to the cycle count's
  "count everything".

  **"Inventory count" is a target, not a delta.** Every other reason has a
  fixed direction and the entered number is the amount to move. Inventory
  count's direction is `"either"`, and there its number is the **counted
  on-shelf quantity**: `resolveAdjustmentDelta()` returns
  `entered - currentStock`, which goes negative when the shelf holds less,
  and Stock After previews the count itself. That is why the function takes
  `currentStock` as a required third argument. Quantity inputs stay
  `min={0}` — a physical count cannot be negative; only the derived delta
  can. See `docs/FIXED_BUGS.md` → A-43.

  **The draft is cleared on a store switch and on logout**, via
  `clearStockAdjustmentDraft()` (`lib/hooks/use-stock-adjustment-draft.ts`),
  called from `store-context.tsx` and `auth-context.tsx` beside
  `clearPOSCartStorage()`/`clearStockAuditDraft()`. It is persisted under one
  global key and staged against one store's product ids, so it must never
  survive into a newly-active store or a different cashier.

  **It is a full page, not a dialog.** `AdjustStockFlow` renders the same
  shell `stock-audits.tsx` uses — `fixed inset-0 z-50 flex flex-col`, a
  header carrying a back button and a "Step N of 2" subtitle, a centered
  `max-w-[560px]` scrolling body and a pinned full-width footer action. The
  back button walks step 2 → step 1 before it closes the flow. The
  Adjustments ledger does not overlay it: on `?action=create`
  `stock-adjustments-ledger.tsx` returns `AdjustStockFlow` *instead of* the
  ledger, after all of its own hooks have run, so the ledger's query stays
  warm for the return trip. Dismissing the flow just flips that state back.
  (An earlier version of this was a `Dialog`; it was reworked because the
  two-step entry needs the whole viewport on a phone.)

  **The item picker is the shared `ProductCombobox`**, wired exactly as
  `procurement/po-item-builder.tsx` wires it: search-to-add-a-row with no
  separate "Add" click, `showGlobalSuggestions={false}` so non-catalog name
  suggestions never mix with real catalog matches, and
  `showCreateNewOption={false}` (unlike the PO builder) because an
  adjustment can only ever move stock that already exists. Rows already in
  the draft are withheld from the `products` array handed to the combobox
  rather than filtered out of its results, so re-picking one cannot wipe a
  quantity that has already been typed. `ProductCombobox` now also fuzzy-
  matches on `barcode`, which this flow depends on for scanned codes — that
  key was added to the shared component, so PO item search gained it too.

  **Both of the feature's lists are responsive, each following the pattern of
  its nearest neighbour.** The items-to-adjust list takes the *procurement*
  pattern, not the cycle count's: `adjustment-items-step.tsx` switches on
  `useMediaQuery("(min-width: 640px)")` between `AdjustmentItemsTable`
  (`adjustment-items-table.tsx`, a div/ARIA-table on the same conventions as
  `po-item-ledger-table.tsx`) and `AdjustmentItemsCardList`
  (`adjustment-items-card-list.tsx`), exactly as `po-item-builder.tsx` does.
  An adjustment is a handful of explicitly searched-and-added rows, so it
  wants the item-builder's table/card split rather than `audit-ledger-step`'s
  single virtualized grid, which exists for counting the whole catalog at
  once. The two components are adjustment-specific rather than reuses of the
  PO ones: `POItemLedgerTable`'s props are purchase-order shaped
  (`POLineItemDraft`, `poType`, expiry and sell-price columns) and none of
  them fit an adjustment's four fields (Item / Current / Quantity / Stock
  After + remove). Quantity entry uses the shared `EditableNumberCell` on
  both branches, and both rows are `React.memo`'d against callbacks the step
  keeps stable through refs, so a keystroke in one row does not re-render
  every other row's input.

  **The Adjustments ledger mirrors `stock-movements.tsx`'s split**, being
  the same kind of history data in the same tab family:
  `useMediaQuery("(min-width: 768px)")` picks either the virtualized desktop
  grid or `AdjustmentMobileGroup` (`adjustment-mobile-group.tsx`), the
  analogue of `StockMovementMobileGroup`. The two branches are
  *conditionally rendered, never `md:hidden`* — the desktop branch is
  virtualized and the mobile one is not, so CSS-hiding would make desktop pay
  for a full unvirtualized render of the whole ledger and then throw it away.
  Mobile cards are bucketed by the same date-label scheme the movements
  ledger uses (TODAY / YESTERDAY / N DAYS AGO / MMM d, yyyy), keyed off each
  group's own `date`, because the Date column is the first thing the desktop
  grid loses on a phone; it becomes the heading above its cards. Search,
  reason and date-range chrome stays shared above both branches. Both test
  files parameterise their row assertions over the two branches with a
  mutable flag behind `vi.mock("@/hooks/use-media-query", ...)`.

  **Two `reference_type` values mean "adjustment", and both matter.** Every
  stock correction outside a sale/purchase/transfer is a
  `stock_movements` row with `movement_type = 'adjustment'`. The
  `reference_type` says which flow wrote it:
  `"stock_audit"` (a full cycle count, `submitStockAudit`) or
  `"stock_adjustment"` (this quick flow, `submitStockAdjustment`). Both
  constants live in `lib/constants/stock-adjustments.ts` — a neutral module
  so `lib/db` never has to import from `components/`. **Anything querying
  `stock_movements` for corrections must accept both**: filtering on
  `reference_type = 'stock_adjustment'` alone silently drops every cycle
  count. The Adjustments ledger
  (`components/stock-batch/stock-adjustments-ledger.tsx`, `/inventory/adjustments`)
  deliberately shows both, one row per distinct `reference_id`, labelling
  the source as "Quick adjustment" or "Cycle count".

  **A third `reference_type`, `"import"` (`PRODUCT_IMPORT_REFERENCE_TYPE`),
  is deliberately excluded.** Bulk CSV/XLSX import
  (`lib/db/queries/product-import.ts`) also corrects a product's quantity
  via `submitStockAudit`, passed this reference_type instead of the default
  `AUDIT_REFERENCE_TYPE` (its third, optional param). An import side effect
  isn't something a person deliberately recorded, the way a cycle count or
  a quick adjustment is — the same reasoning that already keeps a purchase
  order receipt (`movement_type = 'purchase'`) out of this ledger.
  `groupAdjustmentMovements` skips it; the underlying `stock_movements` row
  and its `stock_audits` reconciliation record are unchanged, so FEFO,
  reporting and the audit trail still see it. One residual side effect,
  left as-is: a bulk import still bumps the product's `last_audited_at`
  (read from `stock_audits`, `lib/db/queries/products.ts`), clearing its
  stale-audit banner even though nobody manually counted it.

  All items in one submission share a single `crypto.randomUUID()`
  `reference_id` (same id convention `submitStockAudit` already uses for
  `auditId`) — that grouping is what makes one submission one ledger row.

  **`stock_movements` has no note column**, so the optional note rides in
  `reason` behind a ` — ` separator (`buildAdjustmentReason` /
  `parseAdjustmentReason`). `reason` therefore starts with the fixed reason
  label, and a legacy free-text reason with no separator parses back
  unchanged.

  **The batch-level write is shared, not duplicated.**
  `applyStockAdjustmentDelta()` in `inventory.ts` is the single
  implementation of "move a product's stock by N, spread across its
  batches, leaving a movement trail": FEFO deduction for a decrease, the
  soonest-expiring-active-batch (or a new batch) target for an increase, and
  the "shortfall exceeded every tracked batch" fallback. `submitStockAudit`
  was refactored onto it; `submitStockAdjustment` calls the same helper with
  a different `reference_type`/`batchNumberPrefix`. Do not add a third copy.

  **Gating**: reading the ledger is `view_stock_adjustment_history` (the same
  key the Movements tab uses — it was already wired there, not unused);
  creating an adjustment is `adjust_stock_counts` (the key the catalog's
  quick stock edit already uses), enforced both on the header action
  (`actionPermission` in `dashboard-page-routes.ts`) and again inside the
  page, since `?action=create` is a typeable URL. That route carries **no**
  `actionAdminOnly`: the coarse `manage_products` gate on top of the precise
  key left a holder of `adjust_stock_counts` alone with no reachable entry
  point above `md`, where the in-page button is hidden. `DashboardHeader`
  checks whatever key a route names via `hasPermission()` — do not
  reintroduce a hardcoded list of keys there. See `docs/FIXED_BUGS.md` →
  A-45.

  **No branch column**, unlike the competitor UI this was modelled on: every
  inventory read is already scoped to the active store by
  `getActiveStoreId()`, so a branch filter here would be a constant.

- **Purchase Orders: Standard vs Immediate** (`lib/db/procurement.ts`,
  `components/procurement/`). `purchase_orders.type` (`'standard' |
  'immediate'`) is separate from `status` (`PURCHASE_ORDER_STATUSES` in
  `lib/db/procurement.ts`: `'pending' | 'sent' | 'partially_received' |
  'received'`) and is
  set once at creation, never changed: a **Standard** PO is created
  `pending` via `createPurchaseOrder()` and received later through the
  existing `ReceivePOPanel`; an **Immediate Purchase** is created *and*
  received in one atomic transaction via `createAndReceivePurchaseOrder()`
  (status `received` from the moment it's inserted, stock batches created
  in the same call). Both share one item-entry UI
  (`POItemBuilder`/`POItemLedgerTable`/`POItemCardList`,
  `POLineItemDraft` type), which renders a different column set per
  `poType` rather than being two separate tables.
  `purchase_orders.supplier_id` is **nullable** — a self/walk-in purchase
  (no real vendor) is represented as `NULL`, the same convention
  `sales.customer_id` uses for "Walk-in Customer"; the UI sentinel
  `SELF_PURCHASE_VENDOR_ID` (`components/procurement/po-details-fields.tsx`)
  is mapped to `null` at submit time, never stored as a real id. Never
  reintroduce a seeded "Walk-in Purchase" supplier row — it was
  deliberately rejected in favor of nullable FK, see the schema-migration
  comment in `lib/db/core.ts` (search `purchase_orders_nullable_supplier`)
  for why (per-store local DBs, sync, and the Vendors list all would have
  to special-case a fake row).
  The create/edit page is a **two-phase flow**: `PODetailsFields` (vendor,
  type, notes, payment, due date) is filled first, then item entry
  (`POItemBuilder`) becomes the dominant full-screen content; once
  confirmed, details collapse into `PODetailsSummaryBar` with an
  icon-only edit button that reopens `PODetailsDialog`. Don't put the
  details form and the item table on screen at the same time again — that
  was the exact complaint (Moniebook-inspired) this flow replaced.
  `purchase_order_items` also persists `selling_price`,
  `cost_price_override`, `lot_number`, `expiry_date` (added 2026-09-23) so
  an Immediate Purchase saved as a draft and resumed later keeps what was
  typed — coerce these via `coerceOptionalNumber()` (`lib/db/procurement.ts`),
  which explicitly treats `null` (what a reloaded row's unset override
  reads back as) the same as `undefined`/`""`: `Number(null) === 0` will
  silently turn "no override" into a real, permanent zero if you bypass
  it. The **edit page reads the PO's real `type`** (not hardcoded
  `"standard"`) to decide which columns to show — it used to assume only
  Standard POs are ever resumed via "Edit Order," which was wrong (any
  `pending`/`sent` PO gets that button, including an Immediate draft).

- **Partial PO receipts** (added 2026-09-26, `lib/db/procurement-receiving.ts`).
  Receiving used to be all-or-nothing: any submitted quantity flipped the
  whole PO to `received` and a guard (`status === "received"`) then blocked
  it forever, so a short delivery — routine in real procurement — silently
  forfeited the undelivered balance with no path back into the system.
  `purchase_order_items.quantity_received` now tracks the cumulative
  received quantity per line, **in the same unit as `bulk_quantity`**, and
  `receivePurchaseOrder()` only flips to `received` once every line reaches
  its ordered quantity; otherwise the PO becomes `partially_received` and
  stays receivable against its outstanding balance. Rules worth knowing
  before touching this:
  - `outstandingBulkQuantity()`/`clampReceivedQuantity()`
    (`components/procurement/po-line-item-math.ts`) are the single source of
    truth for "what's still expected" and for clamping the qty input. Both
    receiving surfaces (`ReceiveLedgerTable` on tablet+, `ReceiveItemCard` on
    phones) prefill and clamp to the **outstanding** balance, not the ordered
    quantity — a row written by an older build reads back null and is treated
    as fully outstanding.
  - A submit with every line at 0 against a PO with nothing received yet is a
    deliberate no-op (status untouched), not a partial receipt.
  - "Edit Order" is still gated to `pending`/`sent` only, and that matters:
    `updatePurchaseOrder()` soft-deletes and re-inserts every line, which
    would discard `quantity_received`. Don't widen that gate to
    `partially_received` without reworking that function first.
  - **Sync**: the client sends `quantity_received` in bulk units, but the
    server stores it in base units, because `SyncController::push()` scales
    `quantity_received` by `units_per_bulk` exactly as it already does for
    `quantity_ordered` — and it only does so when `bulk_quantity` and
    `units_per_bulk` are both in the payload. A sync-queue `UPDATE` payload
    carries changed fields only, so `receivePurchaseOrder()` deliberately
    re-sends those two columns unchanged alongside `quantity_received`. Drop
    that and the column syncs at the wrong scale. Server counterpart:
    `2026_09_26_000001_add_quantity_received_to_purchase_order_items.php`
    plus the mirrored branch in `Services/Web/SyncPayloadMapper.php`.

## Receiving cost scale, and what "cost" means where

`unit_cost` on a `purchase_order_items` row is **per bulk unit** (per
carton/pallet); every cost *override* a user types — the Immediate Purchase
flow's "New Cost" and the Receive panel's "Cost Price" — is **per base
unit** (per tablet/bag). `resolveBaseUnitCost()`
(`components/procurement/po-line-item-math.ts`) is the single place that
conversion happens; `getImmediateUnitCost()` delegates to it and
`receivePurchaseOrder()` (`lib/db/procurement-receiving.ts`) calls it
directly instead of re-deriving the division inline, which is how the two
flows drifted before. Both receiving surfaces label the input "per
{base_unit}" and placeholder it with the per-base-unit figure, because the
quantity field right above them is in *bulk* units and the old
`item.unit_cost` placeholder read as per-carton.

**Each `stock_batches` row keeps the singular cost it was received at, and
that is the figure margin/COGS and FEFO deduction use.** The averaged
`cost_price` that `getProductsWithDetails()` and friends derive is a
**display/reporting** figure only — nothing computes on it. A small new
batch barely moves a large displayed average, which reads as "the cost I
typed didn't save"; `notifyCostRecorded()` in `lib/hooks/use-purchase-orders.ts`
is the confirmation that says otherwise, and the receive inputs show the
product's Last Bought Price (the last real, non-`ADJ-%` batch cost)
alongside. Keep that distinction in any copy you write here.

`purchase_order_items.unit_cost` is deliberately **not** rewritten on
receipt: it is what was ordered, the PO's own total and `amount_paid`
reconcile against it, and a partial receipt would revalue the outstanding
balance. New POs already prefill from a real `AVG(cost_price)` via
`getActiveProductsForPO()`, so nothing needed it.

## Enforced permissions

**Permission keys are stable identifiers and are never renamed once
shipped.** `permission_groups.permissions` stores a JSON array of the raw
key strings, so renaming a key makes every already-synced group silently
lose that grant — there is no migration path that can tell "the owner
unticked this" from "the key moved". Retire a key by deleting it (an
unrecognised key in a stored array grants nothing and is harmless) and add
the replacement as a new key. `PermissionCatalogEntry.category` exists only
to group rows for the Roles & Permissions matrix UI.

`ENFORCED_PERMISSION_KEYS` (`lib/constants/permissions.ts`) lists the keys
with a real `useHasPermission()` / `hasPermission()` call site; the Roles &
Permissions matrix reads it to mark the rest as not-yet-wired. **It is a
hand-maintained set, not derived from the codebase** — add the key to it in
the same commit as its first call site, or the matrix will keep telling
owners a live gate is "coming soon". Each entry carries a one-line
comment naming its call sites; that inline index is the one place in the
file comments are allowed to stay, because it is a lookup table rather than
an explanation. That mark is **customer-facing copy on a screen real
store owners use**, so it reads as a product roadmap note, not a dev TODO:
an outline `Badge` saying "Coming soon" (matching `data-settings-auto-sync.tsx`'s
"Pro Feature" badge), with the tooltip "This permission is coming in a future
update. Your choice is saved now, and will start granting or restricting
access as soon as it's available." Keep the honest meaning — an owner who
thinks they have restricted an employee and has not is worse off than one
told "not yet" — and keep the checkbox toggleable so they can pre-set it;
only the wording is product-voiced. `apply_discounts` joined it on 2026-09-28:
`components/pos/pos-cart.tsx` hoists `useHasPermission("apply_discounts")`
to an unconditional top-level const (never inside a `&&`, see the
hook-count crash documented in `pos-layout-header.tsx`) and gates the
"+ Add discount" button and the discount editor on it. A discount **already
on the cart** — a resumed held sale, or one that came from a loyalty
redemption — still renders read-only for a cashier without the permission:
only creating or editing one is gated. Loyalty redemption
(`pos-redeem-reward.tsx`) is intentionally independent of this key; it is a
customer-earned entitlement, not a staff price concession. The desktop cart
and the mobile drawer both render the same `POSCart`, so there is one gate,
not two.

The matrix's own markup changed shape on 2026-09-28: it is now div/grid/ARIA
(`role="table"` / `"rowgroup"` / `"row"` / `"columnheader"` / `"cell"`) like
every other table in the app, not a raw `<table>`. A future
permission-category pass adds rows by rendering another `role="row"` grid
with the shared `gridStyle`, and queries them in tests by `[role="row"]`
rather than `tr`. The header rowgroup carries `sticky top-0` and each row's
first cell `sticky left-0`; the scroll box is a `ScrollFade` that takes its
height from the Settings panel (`h-full` on the roles `TabsContent` plus
`flex-1 min-h-0` here), so don't reintroduce a fixed pixel height.

On phones it stays **one matrix, horizontally scrolled**, the dense-ledger
treatment (`overflow-x-auto` + pinned name column), not the card-list swap
`supplier-table.tsx`/`activity-log-page.tsx` do: a permission is only
meaningful next to the groups it is compared against, and a card per
permission with one line per group is longer and harder to scan than the
grid. The name column is `minmax(min(45vw,220px),1.5fr)` so it gives back
width on a narrow screen instead of eating it; group columns floor at
110px. If the group count ever makes this genuinely unusable, the next step
is a group filter above the matrix, not a per-permission card list.

Four more Sales & POS keys joined it on 2026-09-28, all following the same
pattern (unconditional top-level `useHasPermission()` const, existing state
still rendered read-only, only the trigger gated):

- `override_price` — `components/pos/pos-cart-item.tsx`. The reseller /
  store-markup unit-price input is the app's **only** "type a different
  price for this line" surface; without the permission the line falls back
  to the read-only `{price} each` label, so a markup already on a resumed
  cart still shows. It is floored at the product's own price (it can raise a
  line, never discount it), which is why `sales_staff` was **granted** this
  key in `DEFAULT_GROUP_PERMISSIONS` when enforcement landed — the cashier
  is who rings reseller sales, and withholding it would have made the
  Reseller toggle inert at the till. `specialist` deliberately still lacks
  it (stock role, matching its existing `apply_discounts` exclusion).
- `hold_sales` — `components/pos/pos-cart.tsx` (the "Hold Sale" button, plus
  `SECONDARY_ACTION_GRID_COLS`, a literal-class lookup that keeps the
  secondary-action grid honest now that its column count varies) and
  `components/pos/held-transactions-dialog.tsx` (the "Recall" button).
  Creating a hold and resuming one are both gated; the amber "N on hold"
  banner and the held list itself are not, so a cashier without the right
  can still see a colleague's sale is parked on this till. The dialog's
  "Discard" button is deliberately **left ungated** — discarding is neither
  holding nor resuming, and `void_refund_sales` is the nearest destructive
  key; revisit if that reads wrong in practice.
- `view_sales_history` — `components/pos/pos-main-tab-nav.tsx` (the "Recent
  Sales" trigger) and `components/pos/pos-system.tsx` (the panel itself and
  the `resolvedTab` fallback, because `?tab=history` is reachable by URL, so
  hiding the trigger alone is not a gate). This is **"does the tab exist at
  all"** and is cleanly separable from `view_activity_log`, which answers
  **"whose sales appear in it"** (`pos-transaction-history.tsx` scopes
  `getRecentSales` to the acting user without it). The two compose: no
  history key, no tab; tab but no activity-log key, own sales only.
- `reprint_receipt` — `components/pos/transaction-details-dialog.tsx`
  ("Print Receipt" and the "Print Tax Invoice" dropdown beside it). The
  receipt shown straight after checkout (`pos-receipt-dialog.tsx`) is part
  of `process_sales` and stays ungated; this is only the after-the-fact copy
  pulled out of transaction history. `proforma-preview-dialog.tsx` prints a
  quote, not a receipt, and is likewise untouched.

`run_daily_close` joined them on 2026-09-29, and the finding that got it
there **overturns the previous pass's conclusion**, which had looked only at
`daily-close-actions.tsx` (Print / Export CSV / Export PDF) and called Daily
Close a read-only report with nothing to run. The action row is not the only
thing on that screen. `daily-close/daily-close-header.tsx` — the
"Daily Close Ready … use this for end of day reconciliation" banner — carries
**two buttons that were missed**, and they are the only controls on the whole
Daily Close surface that write anything:

- **Download Local Backup** → `useSettings()`'s `handleDownloadBackup`, which
  serialises **the entire SQLite database** to a `.drx` file (via
  `backupDatabaseToFile()` under Tauri, a `Blob` download on web).
- **Cloud Sync Now** → `handleSync(true)`, a forced full push/pull round.

Those are the same two operations `data-settings.tsx` offers on the Data &
Sync tab, which sits behind `backup_restore_data` — so the Daily Close banner
was a **real leak**: every role, `sales_staff` included, could take a
complete copy of the store's database off the device from the Reports page,
by a route the Settings gate never covered. That is the strongest argument
for the key: there is no ledger-locking "close the day" write in this app
because the close **is** securing the day's data, and this banner is where it
happens.

So `run_daily_close` gates the banner's action group (one hoisted
`useHasPermission()` const, hide-the-trigger-preserve-the-state as usual);
the alert text, and the whole report below it, stay readable by every role.
The previous pass's other conclusion still stands and is **deliberately kept**:
the report *view* is **not** gated — a cashier plausibly needs to see their
own day's numbers, Daily Close is the `/reports` fallback panel for a role
without `view_reports`, and gating the view would leave such a role on a page
with no panel at all. Reading the day is open; running the close is not.

This is a **deliberate narrowing with no compensating grant** —
`specialist`, `sales_staff` and `auditor` lose both buttons — and the usual
"reproduce today's behaviour" rule is *not* applied here, because the
behaviour being reproduced is the leak. `run_daily_close`'s default holders
(admin, manager) are exactly `backup_restore_data`'s, so the two gates agree
on day one; if a store ever diverges them, AND the backup button with
`backup_restore_data` too rather than re-opening it.

The other four Sales & POS keys were **removed from the catalog** on
2026-09-29 — see "Removed from the catalog" below.

Twelve **Inventory & Stock** keys followed on 2026-09-28, in the same
category-by-category pass. This category is where the migration **from
coarse role gates to per-permission gates** actually starts paying off, so
several of these are conversions rather than brand-new gates — each one is
noted below with what it widens or narrows:

- `view_cost_fields` — `components/products/catalog-list.tsx` +
  `catalog-row.tsx` (the Avg Cost column, header and cell, removed
  together via `CATALOG_GRID_COLS` so the grid doesn't leave a blank
  column) and `components/products/product-details/product-pricing-info.tsx`
  (Avg Cost Price, Last Bought Price and the whole profit block). This
  **closes a real leak**: only the profit block was gated before (by a
  direct `user?.role !== "sales_staff"` check); the cost figures above it
  were shown to every role, cashiers included, on two screens a cashier can
  reach. The key's defaults (admin/manager/specialist/auditor, never
  `sales_staff`) reproduce that old role check exactly, so the profit block
  is behaviour-neutral and only the cost figures change.
- `edit_product_price` — `catalog-row.tsx` (the selling-price quick edit)
  and `components/stock-batch/audit-ledger-step.tsx` (the Counted Selling
  cell). `edit_product_cost` — `audit-ledger-step.tsx`'s Counted Cost cell,
  the app's only master-data cost-correction surface (cost is otherwise a
  per-batch acquisition figure set by receiving). A withheld key leaves the
  figure on screen read-only in both places, but the **two surfaces are
  protected differently**. In `catalog-row.tsx` the new key *composes* with
  the existing coarse check rather than replacing it —
  `canEdit && canEditSellingPrice`, where `canEdit` is
  `canManageStockBatch`. In `audit-ledger-step.tsx` there is **no direct
  `canManageStockBatch` check at all**: the file holds only the two
  `useHasPermission` consts, and the coarse protection sits **upstream**.
  The audit screen renders only while `isAuditing` is true
  (`components/stock-batch/inventory-audit-overlay.tsx` returns `null`
  otherwise), and `lib/hooks/use-stock-batch-management.ts` now sets
  `isAuditing` only when `perform_stock_audit` is held — so the whole audit
  flow is gated before the Counted Cost/Counted Selling cells are ever
  reached. Don't "restore" a per-cell `canManageStockBatch` composition
  there expecting parity with the catalog row; the gate is the audit
  entry point. The Add Product
  form's Selling Price input is deliberately **not** gated: it is part of
  creating the product at all, which is `manage_products`.
- `adjust_stock_counts` — `catalog-row.tsx`'s stock-quantity quick edit.
  This is a real, discrete feature and not a duplicate of
  `perform_stock_audit`: the quick edit is a single-product correction
  that goes through `submitStockAudit()` as a one-item reconciliation,
  whereas the audit is the whole cycle-count flow.
- `perform_stock_audit` — `components/dashboard/dashboard-header.tsx`
  (Start Audit, desktop), `components/stock-batch/stock-batch-management.tsx`
  (the mobile button) and `lib/hooks/use-stock-batch-management.ts` (the
  `/inventory/audits` route effect, which is the real gate — the route is
  typeable). **Converted from `isAdmin`**, which widens it to `specialist`,
  the stock-owning role that already held the key by default.
- `view_stock_adjustment_history` — `stock-batch-tab-nav.tsx` (the
  Movements tab), `stock-batch-management.tsx` (its panel) and
  `use-stock-batch-management.ts` (the `/inventory/ledger` redirect and
  prefetch). **Converted from `canManageStockBatch`**, which widens it to
  `auditor` — a read-only role gaining a read right, and nothing else.
- `manage_purchase_orders` — `components/procurement/purchase-order-details.tsx`
  (Edit Order, Delete, Mark as Sent), the `/procurement/new` and
  `/procurement/edit` routes via `RequireRole`'s new `permission` prop, and
  the Procurement header's "Create Order" via `PAGE_ROUTES.actionPermission`.
  `receive_purchase_orders` — the same panel's Receive Goods / Receive
  Balance. Splitting these two is the point: booking a delivery in is a
  different job from raising or amending the order it arrived against, and
  a stockroom account can now be allowed one without the other. Both keys'
  defaults match `canManageStockBatch`'s population exactly
  (admin/manager/specialist), so the conversion is behaviour-neutral on day
  one. Download PDF and the order itself stay ungated.
- `manage_suppliers` / `view_suppliers` — the add/edit and read thirds of
  the supplier split. `manage_suppliers` gates
  `components/stock-batch/supplier-detail-pane.tsx`'s "Edit Details" (the
  action row falls back to "New Order" across the full width),
  `supplier-table.tsx`'s inline rating quick-edit and empty-state "Add
  Supplier", `supplier-management.tsx`'s `?action=add` handler, and the
  Vendors header action. `view_suppliers` gates
  `components/procurement/procurement-tab-nav.tsx`'s Vendors tab and the
  `/procurement/vendors` route via `RequireRole`.
- `request_stock_transfers` — `components/pos/pos-layout-header.tsx`. Note
  the **two mechanisms that already existed** and how they reconcile: the
  store-wide `store_profile.staff_can_request_transfers` toggle is *not*
  an older version of this key, it is a different axis, and both still
  apply. The composition is now
  `process_sales && request_stock_transfers && (manage_staff || staff_can_request_transfers)`
  — the key is the acting group's own right, the toggle is the store's
  opt-in for non-admin-tier accounts. `sales_staff` was **granted** the key
  in `DEFAULT_GROUP_PERMISSIONS` at the same time: the toggle exists
  precisely so cashiers can pull stock in, and ANDing it with a key they
  lacked would have silently killed that feature in every store using it.
  Unticking the key now actually withholds the button, which it previously
  did not.
- `export_product_list` — `components/stock-batch/import-export-toolbar.tsx`'s
  Export dropdown (CSV / XLSX / PDF). Import is a different right and stays
  under `manage_products`, so the toolbar keeps a working control. `auditor`
  was **granted** this key in `DEFAULT_GROUP_PERMISSIONS` — the dropdown is
  reachable by every role today and an auditor already holds
  `export_reports`, so withholding it would have been a narrowing. It *is*
  a deliberate narrowing for `sales_staff`, who could previously export the
  whole catalog including its cost columns.

Two pieces of shared plumbing came out of this and are reusable for the
remaining categories:

- `RequireRole`'s `permission` prop (`components/auth/require-role.tsx`) —
  a specific key required **on top of** the coarse
  `isAdmin || canManageStockBatch` baseline, never instead of it, so
  converting a route never widens it by accident. `RequireRole` is the only
  enforcement point for these routes in a local-first app with no server
  guard, so a typeable URL must redirect, not just hide a link.
- `PAGE_ROUTES.actionPermission` + `resolveHeaderAction`'s trailing
  `hasActionPermission` callback (`lib/constants/dashboard-page-routes.ts`).
  The callback defaults to granting everything, so unannotated routes and
  existing callers are untouched.

`print_product_labels` joined the enforced list on 2026-09-29, and this too
**overturns the previous pass** — not its evidence, which was right, but what
it concluded from it. `barcode-print-dialog.tsx` and `barcode-label-sheet.ts`
are real, complete and tested; the dialog's only mount was in
`stock-overview.tsx`, keyed off a `selectedProduct` state whose setter was
never called from anywhere. That is not "no feature exists" — it is a
finished feature with no door. The previous pass left both the feature and
the key dormant; the right answer was to hang the door, which is a
four-line change:

- `components/products/catalog-detail-panel.tsx` — the overflow menu on the
  catalog detail panel already existed and held exactly one item ("Edit
  Product"). A "Print Labels" item joins it, gated on a hoisted
  `useHasPermission("print_product_labels")` const, and the panel owns the
  dialog's open state locally. The **menu button itself** is now
  `canManageStockBatch || canPrintLabels` rather than `canManageStockBatch`
  alone, with "Edit Product" gated individually underneath, so a group with
  the print right and no edit right still gets a menu instead of nothing.
  It gained an `aria-label="Product actions"`; it was an unlabelled icon
  button before.
- `components/stock-batch/barcode-print-dialog.tsx` — its prop type narrows
  from `POSProduct` to a new exported `BarcodeLabelProduct`
  (`id`/`name`/`barcode?`/`unit_price`), which is exactly the four fields a
  label carries. `POSProduct` satisfies it structurally, and the catalog's
  camelCase `ProductViewModel` maps onto it at the call site
  (`sellingPrice` → `unit_price`), so no product shape had to change.
- `components/stock-batch/stock-overview.tsx` — the dead mount, its dead
  `selectedProduct` state and the now-unused imports are gone.

Defaults are **unchanged and behaviour-neutral**: the key's holders (admin,
manager, specialist) are exactly `canManageStockBatch`'s population, which is
who could open that menu before, and the item it sits beside is new — nobody
loses anything they had.

`delete_products` and `delete_suppliers` joined the enforced list on
2026-09-29 as well, and they are the **third** reversal of that morning's
removal pass — but a different kind. `run_daily_close` and
`print_product_labels` were re-investigation errors: the feature was there
and the pass missed it. These two were not. The removal finding was
factually correct (no `deleteProduct`/`deleteSupplier` query, no
`softDelete()` call site, no menu action, `useDelete()` with zero callers)
and the conclusion drawn from it — "a key with no action does not sit in the
catalog" — still stands. What changed is the **product** decision: not being
able to delete a product or a vendor is a real gap, so the action was built
and the key came back with it, in the same commit, exactly as the standing
rule requires.

**The deactivate-vs-delete design, and why it differs per entity.** Both are
soft deletes (`softDelete()`, `_deleted = 1`, a `DELETE` on the sync queue),
never `remove()`. Neither cascades: nothing rewrites `sale_items`,
`purchase_order_items` or `stock_batches`. That is safe **only because every
historical join is a plain `JOIN`/`LEFT JOIN` with no `_deleted = 0` filter
on the joined side** — `reports.ts`'s top-products/category queries join
`products` bare, and `procurement.ts` / `local-database.ts` LEFT JOIN
`suppliers` bare — so a deleted product's or vendor's **name still resolves
on the records it already appears in**. Deleting removes it from the
catalog, the till and the directory; it does not rewrite history. If a future
change ever adds `_deleted = 0` to one of those joins, these deletes silently
start erasing report rows — that filter is load-bearing in its absence.

**That absence is pinned by tests, not just by this note** (added 2026-09-29).
Each one seeds a product/vendor, records history against it, soft-deletes it
through the real `deleteProduct()`/`deleteSupplier()`, then runs the actual
query function and asserts the historical row still resolves the name. All
sixteen go red the moment a `_deleted = 0` filter is added to the join they
protect (verified by temporarily adding one to every join below):

- `__tests__/deleted-product-report-history.test.ts` — `reports.ts`:
  `getBIMetrics()`'s `topSellingByRevenue` / `topSellingByQuantity` /
  `categoryDistribution` / `productPerformance`, `fetchTopSellersReportData()`,
  and `getPurchasePatterns()`'s `slotCategoryData`.
- `__tests__/deleted-product-sales-history.test.ts` — `sales.ts`:
  `getSaleItems()`, `getTransactionDetails()`, `getRecentSales()`'s
  `item_names`, `getDailyCloseData()`'s `itemsToday`; plus `customers.ts`'s
  `getCustomerTransactions()` `item_names`. (`getResellerCommissionSales()`
  carries the same `item_names` subquery and the same comment.)
- `__tests__/deleted-entity-procurement-history.test.ts` — `procurement.ts`:
  `getPurchaseOrders()` and `getPurchaseOrderById()` (`vendor_name`, which
  falls back to "Self / Walk-in Purchase" if the vendor join is filtered) plus
  their product joins, `getPurchaseOrderItemsForDetail()`;
  `local-database.ts`'s `getStockMovements()` / `getStockAdjustments()`
  (product **and** supplier name); and `stock-transfers.ts`'s
  `getStockTransferHistory()` source/destination product names.

Every one of those joins now also carries a two-line comment at the join
itself pointing back here, so the warning is visible where the edit would be
made. `reports.ts`'s `fetchStockBatchReportData()` and `inventory.ts`'s
expiry/oversold/fast-mover reads are **not** in that set: they already filter
`m._deleted = 0` on purpose, because they report on *current* stock rather
than on history.

- `delete_products` — `components/products/catalog-detail-panel.tsx`'s
  overflow menu (a third item beside Edit Product and Print Labels, opening
  `components/products/product-delete-dialog.tsx`), backed by
  `deleteProduct()` in `lib/db/queries/products.ts`. **Two blockers, both
  hard**: stock on hand across the product's active batches, and membership
  of a still-receivable purchase order
  (`pending`/`sent`/`partially_received`). `getProductDeletionBlockers()`
  reads both in one pass; the dialog reads it for **wording** and
  `deleteProduct()` re-checks it for **enforcement**, so a stale dialog
  cannot slip a delete through. The reasoning is the same shape as the
  customer dialog's "settle the balance first": stock batches are not
  cascaded, so deleting a product with stock leaves those units still
  counted in total stock value (`local-database.ts`'s
  `WHERE _deleted = 0 AND is_active = 1` sums batches, never joining
  `products`) with no product to show for them — an inventory figure that
  cannot be reconciled to anything. An open PO is the same harm arriving
  later: receiving books new batches against `product_id`, so the delivery
  would create stock for a product that no longer exists. **Sale history is
  deliberately not a blocker** (per the join note above).
  The stock-on-hand check sums `ABS(quantity)`, not `quantity` (corrected
  2026-09-29 after a review found the netting bug). This app really does
  produce negative-quantity batches — `inventory.ts`'s FEFO deduction books
  an oversell rather than refusing the sale, and `getOversoldAlerts()`
  reports the result — so a plain `SUM(quantity)` let a product with a `+5`
  and a `-5` batch net to `0` and be judged deletable, even though both rows
  are real and both still count in the stock-value total, which sums
  `cost_price * quantity` over **every** non-deleted batch regardless of
  sign (`inventory.ts`'s `getStockBatchStats()`, `reports.ts`'s
  `getBIMetrics()`). A lone negative batch is the same harm with the sign
  flipped: orphaning it leaves negative value in the total with no product
  to trace it to. So the guard blocks on **any non-zero batch quantity**,
  positive or negative — the figure it reports (and the dialog's "still has
  N in stock") is therefore a count of units still sitting on non-empty
  batch rows, not a net inventory position. A genuinely emptied batch
  (`quantity = 0`) still does not block, which is what keeps a sold-through
  product deletable. There is
  **no "deactivate" alternative offered for products, on purpose**:
  `products.is_active` is read in exactly **one** place — the inventory
  dashboard's counters in `lib/db/queries/inventory.ts`'s
  `getStockBatchStats()`, which tests `p.is_active = 1` three times, for
  `active_products`, `low_stock_count` and `critical_stock_count` — so an
  `is_active = 0` product already silently drops out of those three figures
  today, and out of nothing else. The write path can already produce a `0`:
  `components/products/add-product-dialog.tsx` sends
  `is_active: status === "active" ? 1 : 0` from a `status` form field (no
  visible control is currently wired to set it to anything but `"active"`,
  but the code path exists). So the column is neither write-only nor
  fully-read — it is a half-wired flag. Building a real deactivate feature
  on it would still mean adding a new `is_active` filter to **every**
  catalog/POS/report read before it could safely gate visibility anywhere,
  which is a much larger and riskier change than this feature warrants, and
  would silently hide products in any store whose imported rows already
  carry `is_active = 0`. That — not an unused column — is why the
  delete-feature work chose a guarded soft-delete instead.
  A product with no stock and no open order is already functionally
  "deactivated" by having nothing to sell; the delete is what removes the
  row from the picker.
- `delete_suppliers` — `components/stock-batch/supplier-detail-pane.tsx`'s
  action row (a "Delete Supplier" outline button beside Edit Details and New
  Order, opening `components/suppliers/supplier-delete-dialog.tsx`), backed
  by `deleteSupplier()` in `lib/db/procurement.ts`. The row's column count is
  now a literal-class lookup (`ACTION_GRID_COLS`, same mechanism as
  `CATALOG_GRID_COLS`/`SECONDARY_ACTION_GRID_COLS`) because it varies from
  one to three buttons with the two keys. It sits in the **detail pane, not
  `supplier-table.tsx`'s rows**: the table has no row menu at all (its only
  row affordance is the inline rating pencil), and a destructive action on a
  row you may have clicked by accident is the wrong place for one.
  **One blocker**: money still owed, summed by
  `getSupplierOutstandingBalance()` over unpaid purchase orders — the exact
  mirror of `customer-delete-dialog.tsx`'s guard, from the payable side
  instead of the receivable one. Deleting a vendor you still owe erases the
  payable from the directory's "₦X owed to N suppliers" summary while the
  orders stay on the books. "Unpaid" is
  `COALESCE(payment_status, 'unpaid') != 'paid'`, not a bare
  `payment_status != 'paid'` (corrected 2026-09-29): SQLite evaluates any
  comparison against NULL to NULL, so a row whose `payment_status` is
  explicitly NULL — which the schema default never produces, but an older
  client version or a data import can — would be excluded from "unpaid"
  despite plainly not being paid, letting a vendor with real debt be
  deleted. **The same predicate has to appear in both places**:
  `getSupplierOutstandingBalance()` and `getSuppliers()`'s `total_debt`
  join, because the delete dialog's copy points the user at the directory's
  owed figure, so the two undercounting differently would be worse than
  either undercounting alone. **Order history is not a blocker.** Unlike
  products, suppliers **do** have a real, user-editable deactivate state —
  `suppliers.is_active`, set by the Add/Edit Supplier dialog's Active toggle
  and shown as the Active/Inactive badge on this very pane — so the
  non-blocking delete dialog **names it**: "If you only want to stop ordering
  from them, set them to Inactive under Edit Details instead." That is the
  asymmetry in one line: products get a guard because they have no softer
  option, suppliers get a signpost because they do.

Defaults follow the catalog's standing rule that `delete_*` keys are
admin/manager only: `manager` holds both, `specialist` (the stock-owning
role) holds neither despite holding every other Inventory & Stock write key,
and `sales_staff`/`auditor` hold neither. The safety-check design does not
change that calculus — the guards stop a *destructive mistake*, not an
*unauthorised* one, and a store that wants its stock specialist deleting
dead catalog rows ticks one box. Nothing narrows on day one, because neither
action existed before.

`approve_stock_transfers` joined the enforced list on 2026-09-29 too, and it
is the **fourth** reversal of that morning's removal pass — and, like the two
deletes, a product decision rather than a missed file. The removal finding
was re-traced from scratch and every line of it holds: `transferStock()`
(`lib/db/queries/stock-transfers.ts`) deducts the source batches FEFO,
opens the destination batch and writes **both** `transfer_out`/`transfer_in`
movement rows inside one `transaction()`, so the stock lands the instant the
dialog is submitted; `needs_review` is set on both legs only when
`checkIsAdmin(initiatedByRole)` is false, i.e. a non-admin initiator; and
nothing anywhere read that status except two amber badges
(`stock-movement-desktop-row.tsx`, `stock-movement-mobile-group.tsx`) that
the detail modal did not even repeat. No pending queue, no accept/reject.
The label was the lie, not the mechanism.

**Option A (a real approval queue) was considered and deliberately not
built.** The decisive argument is not risk, it is that the flow does not
have two parties in the places an approval queue assumes:

- **The requester IS the destination.** `transfer-stock-dialog.tsx` pins
  `destStoreId` to the acting store for a non-admin (`isAdmin ?
  manualDestStoreId : activeStoreId`) precisely so a cashier can only PULL
  stock in, never push it out. An "confirm it arrived at the destination"
  gate would therefore be the cashier approving their own request. The party
  with an exposure here is the **source** store, which is losing stock, and
  the person who should check is the **owner**, after the fact — which is
  exactly the shape `needs_review` already has.
- `receive_purchase_orders` is not the precedent it looks like. A supplier
  delivery has a genuine gap in time and custody between ordering and
  arrival; a store-to-store transfer in this app is one atomic local write
  across two stores on the same synced database.
- The data model actively resists it. The header note at the top of
  `stock-transfers.ts` records why there is no `stock_transfers` table: a
  new table needs a matching Laravel migration before it can round-trip
  through cloud sync, and a pending transfer held in an unsynced local table
  would be invisible on every other terminal. A pending state is exactly the
  thing that must sync. With a live multi-store customer on this flow since
  2026-09-25, that is a change that needs product sign-off and a server-side
  commit, not a permission pass.

**Option A stays on the table as a follow-up** if a store ever reports
receiving-end disputes ("it says it arrived, it never did"); it would need a
synced pending state (server migration included) and would change the
multi-store UX for anyone already using transfers. Do not ship it off the
back of this entry.

So **Option B**: the existing flag was made actionable, and the key's label
changed with it — `approve_stock_transfers` is now **"Review Stock
Transfers"**, not "Approve Incoming Stock Transfers", because the label must
describe what the key gates. It gates the **"Mark Reviewed"** action in
`components/stock-batch/stock-movement-detail-modal.tsx` (one hoisted
`useHasPermission("approve_stock_transfers")` const, as usual), backed by
`markStockTransferReviewed()` in `lib/db/queries/stock-transfers.ts`.

- The action lives in the **detail modal, not the ledger row**. The rows are
  virtualized and the whole ledger is click-to-open; the same reasoning that
  put Delete Supplier in the detail pane rather than the table applies.
- It clears **both legs by `reference_id`**, not the one row that was opened
  — reviewing the out leg and leaving the in leg flagged is meaningless. Each
  leg is updated under its **own `store_id`**, never the acting store's,
  because the two legs live in two different stores by definition and
  `update()`'s `assertStoreOwnership` would otherwise reject one of them.
- Status goes to **`"reviewed"`, not `null`**. Blanking it would make a
  reviewed transfer indistinguishable from one that was never flagged, so
  the ledger now carries a muted "Reviewed" badge beside the amber "Needs
  Review" one. `stock_movements.status` is a nullable string on **both**
  sides already (client `schema-migrations.ts`, server
  `2026_09_23_000003_add_status_to_stock_movements.php`), so this needed **no
  schema change on either side** — which is the other half of why Option B
  was safe to ship today and Option A was not.
- It is **idempotent**: it only ever selects rows still sitting at
  `needs_review`, so a second click, or two devices reviewing the same
  transfer, writes nothing and reports 0. The modal says "already reviewed"
  rather than failing.
- The amber flag itself stays visible to **every** role that can open the
  ledger; only the button to clear it is gated. A group without the key sees
  that a transfer needs checking and cannot sign it off.

Defaults: `manager` holds it (restored), admin holds everything.
`specialist` deliberately does **not**, despite holding every other
Inventory & Stock write key including `request_stock_transfers` — it is the
one key in this category that tracks `manage_staff`'s population rather than
the stock role's, because a stock specialist signing off their own transfer
request is the exact thing the flag exists to prevent. `sales_staff` and
`auditor` hold neither. Nothing narrows on day one: the action did not exist
before.

The one remaining Inventory & Stock key, `manage_stock_batches`, was
**removed from the catalog** on 2026-09-29 — see "Removed from the catalog"
below.

Both **Prescriptions** keys followed on 2026-09-28, in the same pass. The
category is small and was **completely ungated before this** — the
`storeType === "pharmacy"` nav check (`dashboard-sidebar.tsx`,
`mobile-more-drawer.tsx`) and the plan's `LockedModuleOverlay` decide
whether the *module* exists for the store, and nothing decided what a given
role could do inside it. That store-type gate is a different axis and still
applies; these keys sit on top of it, they do not replace it.

The split between the two keys is **the record's data vs. the fulfilment
pipeline**, which is the distinction their labels already draw:

- `manage_prescriptions` ("Manage Prescription Records") — what the doctor
  wrote. `lib/hooks/use-prescription-management.ts` gates
  `showNewPrescription`, which is the **real** gate: `?action=add` and
  `?edit_rx=<id>` are typeable, so the full-screen create/edit overlay has
  to require the key itself. `components/prescriptions/prescription-detail-panel.tsx`
  gates the "Edit" button, and `PAGE_ROUTES`' `/prescriptions` entry gained
  `actionPermission: "manage_prescriptions"` for the header's "New
  Prescription" (wired through `dashboard-header.tsx`'s
  `hasActionPermission` callback, same as Vendors and Procurement). Note it
  takes `actionPermission` **without** `actionAdminOnly` — the action was
  never role-gated, and adding the coarse `canManageStockBatch` baseline
  underneath would have narrowed it for reasons unrelated to this key.
- `dispense_prescriptions` ("Dispense Prescriptions") — medicine leaving
  the shelf, and the **whole pipeline** that ends in it, not just the last
  click: `prescription-detail-panel.tsx`'s "Process" (pending →
  in_progress), "Mark Ready" (in_progress → ready), "Dispense" and
  "Dispense Refill". Those status transitions are dispensing work, not
  record data — a pharmacy assistant can be allowed to walk the queue and
  hand medicine over without being allowed to alter what the prescriber
  wrote, and vice versa. `lib/hooks/use-pos-prescription.ts` gates the
  `/pos?dispense_rx=<id>` loader, which is the real gate for the same
  reason as the overlay: that URL *is* the dispense action (it pulls the
  prescription's items onto the till, and `use-pos-payment.ts` marks the rx
  completed from there), and it is typeable.

The record itself is never hidden — a role with neither key still opens a
prescription and reads the patient, prescriber, medication and cost detail;
only the action row goes away, and it collapses to nothing rather than
leaving an empty bar. "Process Return" is deliberately **left ungated**: it
is neither dispensing nor a record edit but a reversal of the linked sale,
and it hands straight off to the existing Return flow
(`/pos?tab=history&return_sale=…`), which carries its own
`void_refund_sales` / `view_sales_history` gates. Revisit only if that
reads wrong in practice.

`DEFAULT_GROUP_PERMISSIONS` is **unchanged** for this category
(admin/manager/specialist hold both; `sales_staff` and `auditor` hold
neither), which makes this the pass's first deliberate **narrowing without
a compensating grant**: a cashier on a pharmacy store could previously see
the Prescriptions nav item and create, edit and dispense freely, and now
cannot. That is the point of the key — dispensing is the regulated act the
`specialist` role exists for, and it was in `sales_staff`'s exclusion list
from the day the catalog was written. A single-till pharmacy that really
does have its cashier hand medicine over ticks either key onto the cashier
group in one click, which previously did nothing.

Four of the five **Customers & Loyalty** keys followed on 2026-09-28, in
the same pass. Like Prescriptions, the category was **almost entirely
ungated** — the only role checks anywhere in `components/customers/` were
two direct ones in `directory-tab.tsx` (`user?.role === "auditor"` on the
empty state's "Add Customer", and
`!isAuditor && user?.role !== "sales_staff"` on the delete control), plus
the coarse `canManageStockBatch` on the Loyalty tab's "Edit Settings".
Everything else — add, edit, and every customer's outstanding balance —
was open to every role, including cashiers, on a page a cashier reaches.

- `manage_customers` ("Manage Customers") — creating and editing a
  customer record. `lib/hooks/use-customer-management.ts` gates the
  `?action=add` opener, which is the **real** gate: that URL is typeable
  and is also exactly what the dashboard header's "Add Customer"
  navigates to, so hiding the header action alone would not be one.
  `PAGE_ROUTES`' `/customers` entry gained
  `actionPermission: "manage_customers"` for that header action (no
  `actionAdminOnly` underneath it, same reasoning as `/prescriptions`),
  `directory-tab.tsx` gates the empty state's "Add Customer" and the
  detail panel's "Edit Profile", and `components/pos/pos-customer-selector.tsx`
  gates the till's inline "Add new customer" form. That last one matters:
  it writes a `customers` row through `insert()` just like the Customers
  page does, so it is the same right, not an at-the-till concession. The
  record stays fully readable without the key — only the triggers go, and
  the detail footer collapses to "View History" alone.
- `manage_loyalty` ("Manage Loyalty Program") — configuring the
  **program**: tiers, earn rate and redemption options.
  `components/customers/loyalty-tab.tsx` gates the "Edit Settings" button
  and `loyalty-settings-dialog.tsx` adds the key to its existing
  defense-in-depth close-on-open effect. Both **compose** with the coarse
  `canManageStockBatch` rather than replacing it, so nothing widens. This
  is deliberately **not** the same thing as a cashier spending a
  customer's earned points at checkout (`pos-redeem-reward.tsx`), which
  stays independent of every staff-side key for the same reason it is
  independent of `apply_discounts`: a redemption is a customer-earned
  entitlement, not a staff concession, and the cashier who rings the sale
  is who applies it.
- `delete_customers` ("Delete Customers") — the trash control in
  `customer-detail-panel.tsx`, fed from `directory-tab.tsx`, which is the
  only way to reach `customer-delete-dialog.tsx` at all. The direct role
  check it replaces allowed `specialist` through; the key does not, which
  is the intended split (the defaults comment has excluded `delete_*` from
  `specialist` since the catalog was written). The dialog's own
  "outstanding balance, settle it first" guard is untouched — that is a
  data rule, not a permission.
- `view_customer_balances` ("View Customer Account Balances") — a pure
  **read** right over customer debt, and the one place this category
  closes a leak rather than adding a restriction. Before it, the
  directory's Balance column, the "Has debt" filter chip, the
  "₦X outstanding across N customers" summary and the detail panel's
  outstanding-balance block were all shown to every role. All four are now
  gated in `directory-tab.tsx`; the desktop row drops its balance **cell
  with its header**, via `CUSTOMER_GRID_COLS` in `customer-list-rows.tsx`
  (a literal-class lookup, same mechanism as `CATALOG_GRID_COLS`), rather
  than being left blank. Note that hiding the block takes the
  **"Record Payment" button with it**, which is deliberate — you cannot
  record a payment against a balance you are not allowed to see — and is
  why the defaults changed, below. The per-sale outstanding balance in
  `components/pos/transaction-details-dialog.tsx` is a **different
  figure** (one sale's remainder, not the customer's account) and stays
  ungated, so the till's own debt-payment flow is untouched either way.

`manage_customer_credit_terms` was **removed from the catalog** on
2026-09-29 — see "Removed from the catalog" below.

`DEFAULT_GROUP_PERMISSIONS` changed in exactly one way for this category:
`view_customer_balances` was **granted to `specialist` and `sales_staff`**,
which are the two roles that lacked it. That is behaviour-preserving, not a
widening — every role could already see these figures, so reproducing that
is the rule this pass has followed throughout (`view_cost_fields`,
`request_stock_transfers`, `override_price`). It matters most for
`sales_staff`: "Record Payment" lives inside the block, so withholding the
key would have silently removed over-the-counter debt collection from the
cashier, who is exactly who does it. The owner who wants balances kept from
cashiers unticks one box, which previously did nothing.

The other three keys keep their existing defaults, which means two
**deliberate narrowings** landed with enforcement: `specialist` loses
customer deletion (it was reachable through the old role check) and the
Loyalty Settings dialog (it was reachable through `canManageStockBatch`).
Both are what those keys are for — `delete_customers` and `manage_loyalty`
were scoped to admin/manager from the day the catalog was written — and
both are one tick away for a store that disagrees. `manage_customers` is
already in `sales_staff`, `specialist` and `manager`, so wiring it is a
**no-op for every role except `auditor`**, which correctly loses the
"Edit Profile" button it should never have had.

Four of the five **Reports & Activity** keys are wired, across two changes
on 2026-09-28. The whole category is described here so it reads as one
picture rather than two halves:

- `view_reports` ("View Reports & Analytics") — **does the Report Center /
  Analytics half of the Reports page exist for this role at all**.
  `app/(dashboard)/reports/reports-tab-nav.tsx` gates the "Operational
  Reports" and "Analytics & Insights" triggers and
  `app/(dashboard)/reports/page.tsx` gates both `<TabsContent>` panels
  **and** the `?tab=` resolution, which is the real gate — `/reports?tab=reports`
  is typeable, so hiding the trigger alone is not one. Without the key the
  page falls back to Daily Close, exactly as it did for a non-admin before.
  **Converted from `isAdmin`** (i.e. from `manage_staff`), which widens it
  to `auditor`: the reports-focused read-only role has held `view_reports`
  and `export_reports` by default since the catalog was written and could
  not reach a single report, which was the bug. admin and manager both hold
  the key, so nothing narrows.
  **Daily Close is deliberately not under this key** — every role,
  `sales_staff` included, reaches it by design (see the cashier-visibility
  section below; `run_daily_close` gates the *running* of the close, not
  the reading of it — see its entry above).
  The sidebar's own Reports-vs-Daily-Close split
  (`dashboard-sidebar.tsx`) is still `isAdmin || canManageStockBatch` and
  was **left alone**: it is a link, not a gate, and an auditor reaches the
  page through its Daily Close link. Convert it in whatever change next
  touches that nav.
- `export_reports` ("Export / Print Reports") — `components/reports/report-center.tsx`
  hoists `useHasPermission("export_reports")` and hides the per-report Export
  dropdown and Print button, and passes the same boolean into
  `report-view-dialog.tsx` as `canExport` so the in-dialog copies of those
  actions can't be the way round it. The "View" action is deliberately *not*
  gated on it — reading a report on screen is `view_reports`, taking a copy
  off the device is `export_reports`. **Known gap**: the Analytics
  dashboard's own "Export Reports" button
  (`business-intelligence-dashboard.tsx`) downloads the profit-loss CSV and
  has never been under `export_reports`; it is now under
  `view_financial_reports`, which is the narrower of the two for that
  button, but a role with the P&L right and no export right can still take
  that one CSV. Add `export_reports` to it in whatever change next touches
  that toolbar.
- `view_financial_reports` ("View Financial Reports (P&L, Margins)") — the
  **margin-revealing slice** of everything `view_reports` opens, and the
  reports-side extension of `view_cost_fields`: a role that may not see a
  product's cost may not pull the store's P&L either. Four surfaces, one
  hoisted const each: `report-center.tsx` drops the "Profit & Loss Summary"
  card from the report list (the other five reports, including the two also
  tagged "Financial", are operational and stay);
  `components/analytics/analytics-tab-nav.tsx` drops the "Profit & Loss"
  sub-tab; `business-intelligence-dashboard.tsx` drops its `<TabsContent>`
  and the "Export Reports" button; and `components/analytics/bi-key-metrics.tsx`
  drops the "Net Profit" card, which is the same figure condensed, taking
  its column with it via `METRIC_GRID_COLS` (a literal-class lookup, same
  mechanism as `CATALOG_GRID_COLS`) rather than leaving a gap. No `?tab=`
  fallback is needed here: the Analytics dashboard's `activeTab` is local
  state defaulting to `sales` and is not URL-driven, so hiding the trigger
  really is the gate. Defaults are **unchanged** and the key is
  behaviour-neutral on day one — admin, manager and auditor hold it and are
  exactly who could see these surfaces before; `specialist` and
  `sales_staff` lack it, and both already lack `view_reports`, so they never
  reach them either way.
- `view_activity_log` ("View Activity Log") — the oldest wired key in the
  category and a **different axis** from the three above: it answers "whose
  records does a list show", not "which screen exists". See
  `pos-transaction-history.tsx`, `use-dashboard-overview.ts` and
  `auth-context.tsx`'s `canViewAllActivity`.

`view_dashboard` ("View Dashboard Overview") stays **catalog-only, and
deliberately so — this one is not a "no surface exists" finding but a "the
gate would be wrong" one**. `/dashboard` is the post-login landing route for
every role (`app/login/use-login-page.tsx`, `hooks/use-login.ts`,
`app/page.tsx`, `app/auth/callback/page.tsx`, `app/setup/use-onboarding.ts`)
**and** the redirect target `RequireRole` sends every denied user to
(`components/auth/require-role.tsx`). Gating the page on this key would
give a denied user nowhere to land and would make `RequireRole` bounce them
into a page that bounces them back. It is also the only key in the whole
catalog that **every one of the five default groups holds**, which is the
same finding from the data side: no role is meant to be denied it. Gating
one widget under it instead was considered and rejected as inventing a
meaning the label ("View Dashboard Overview") does not carry — and the
widgets that would be candidates are already covered: the store-wide
figures on `dashboard-overview.tsx` swap to the cashier's own
"My Sales Today"/"My Transactions Today" via `useMyTodaySales`'s
`isCashier`, and the activity feed is already under `view_activity_log`.
Wire this key only if a genuinely optional dashboard ever exists — a second
landing route, or an overview that some roles are meant to start without.

Both **Expenses** keys were wired on 2026-09-28. This is the one small
category where every key had a real surface waiting, and the two split
cleanly along the write/read line:

- `record_expenses` ("Record Expenses") — **write access to the expense
  ledger**, i.e. every control on `/expenses` that changes a row, gated in
  four places because the create path has three entrances and the amend path
  two: `lib/constants/dashboard-page-routes.ts` gives the route
  `actionPermission: "record_expenses"` (the header's "Add Expense");
  `app/(dashboard)/expenses/page.tsx` hoists the const and gates the
  `?action=add` effect, which is the **real** gate since
  `/expenses?action=add` is typeable and is exactly where that header action
  navigates; `components/expenses/expense-list.tsx` ANDs the key into its
  existing `canAddExpense` (the empty state's "Add Expense" CTA) and passes
  it down as `ExpenseDesktopRow`'s new `canEdit` prop, which drops the
  row-hover quick-edit pencil; and
  `components/expenses/expense-detail-dialog.tsx` hoists its own const and
  drops the whole Edit/Delete footer. Everything else on the page — the
  list, the search and category filters, the insights strip, the detail
  dialog's body — is read and stays open, which is the usual
  hide-the-trigger-preserve-the-state shape. Edit and Delete are under this
  key rather than left ungated on purpose: there is no `edit_expenses` or
  `delete_expenses` in the catalog, and "can log a spend but can also wipe
  one they can't log" is not a coherent state to ship. It is a **no-op for
  every role that can reach the page today** — `admin`, `manager`,
  `specialist` and `sales_staff` all hold the key by default, and `auditor`
  never clears `RequireRole`'s `isAdmin || canManageStockBatch ||
  allowSalesStaff` baseline for `/expenses` at all. `RequireRole` itself was
  **not** given `permission="record_expenses"`: reading the ledger is not
  recording, and the route must stay reachable for a group that has had the
  write right taken away.
- `view_all_expenses` ("View All Expenses") — **whose expenses the ledger
  shows**, the same own-vs-all axis `view_activity_log` runs on the sales
  side, and a **conversion, not a new restriction**. `lib/hooks/use-finance-data.ts`
  has had the scope since the ledger was paginated — `useExpenseList` and
  `useExpenseTotals` both compute
  `const viewerId = <key> ? undefined : user?.id` and pass it into
  `getExpensesPage`, `getExpensesLifetimeTotal`, `getSmoothedExpensesTotal`
  and `getCurrentMonthExpensesByCategory` (all four already take an optional
  `viewerId`, in `lib/db/queries/finance.ts`) — but it hung off
  **`view_activity_log`**, the sales-side key, which is the bug: only
  `admin` holds that key, so a manager saw a ledger scoped to their own
  receipts while the catalog had said since day one that managers
  "View All Expenses". Switching the two hooks to `view_all_expenses` is a
  one-word change in two places and puts the scope on the key that names it.
  Note the figures beside the list are scoped too, not just the rows — the
  lifetime total and the month's per-category breakdown all take the same
  `viewerId`, so a scoped viewer gets a self-consistent page rather than
  their own rows under everyone's total.

  ⚠️ **The one consequential call in this pass**: this **widens `manager`**
  from own-only to the whole store's expense ledger. That is the key's
  stated meaning and `manager` has held it by default since the catalog was
  written, so the fix is restoring intent rather than granting something
  new — but it *is* a visible change for an existing store on upgrade, and
  it is the reconciliation figure at the bottom of the page that moves, not
  just a list. `specialist` and `sales_staff` are **deliberately left
  without** the key: both keep seeing only what they logged, which is
  exactly what they see today, so a cashier's own running expense total for
  their own till is unaffected. `auditor` holds the key and is unaffected
  either way — it cannot reach `/expenses`; if that route is ever opened to
  the read-only role, the key is already right for it.

  The P&L / BI expense figures (`lib/db/queries/reports.ts`,
  `usePnLReport`) pass **no** `viewerId` and are left alone: they are a
  store-wide financial report already gated by `view_financial_reports`, and
  scoping them per-viewer would silently produce a wrong P&L rather than a
  restricted one.


All seven remaining **Store & Settings** keys were wired on 2026-09-28,
closing the pass. This category is almost entirely a **conversion**: one
coarse `isAdmin` check (which is `manage_staff`, and so includes `manager`)
covered nearly every Settings tab, and the catalog had already named the
specific keys those tabs should carry.

The tab-level half lives in one map, `SETTINGS_TAB_PERMISSIONS`
(`lib/constants/settings-tabs.ts`), read by all three places that decide tab
visibility — `settings-tab-nav.tsx` (desktop rail), `settings-mobile-menu.tsx`
(the only settings nav below `md`) and `hooks/use-settings.ts`' URL-resolution
effect, which is **the real gate**: `/settings/<tab>` is typeable and is in
`generateStaticParams`, so hiding the two triggers is not one. `settings-client.tsx`
gates the matching `<TabsContent>` from the same resolver. Both nav components
take an optional `canAccessTab` prop and fall back to their old `adminOnly`
behaviour without it, so no caller had to change at once.

- `manage_store_settings` — **Business Info, Branches, Receipt Settings and
  Register Configs**, i.e. store-wide configuration that is not payments,
  data or billing. Business Info and Branches are not split further: the
  business identity form and the fleet list are one "who this store is"
  surface. It also gates **Regional Settings** (currency, VAT, reseller
  commission) in `appearance-settings.tsx` — store-wide config that happens
  to sit on the everyone-can-open General tab and was `isAdmin`-gated inline;
  the theme and sidebar-preference cards above it stay open to every role.
  Exact no-op: `manager` holds the key and cleared `isAdmin`.
- `manage_payment_accounts` — the **Payment Methods** tab (accepted methods,
  the payment-accounts list, and the require-an-account rule). Receipt
  Settings and Register Configs deliberately sit under
  `manage_store_settings` instead: they are till and print configuration, not
  where money lands, which is what "Payment Accounts" names. No-op.
- `backup_restore_data` — the **Data & Sync** tab, whole. Backup, restore,
  undo-restore, force-full-resync and the auto-sync schedule are one surface
  (`data-settings.tsx`, `data-settings-auto-sync.tsx`) and splitting sync
  configuration away from the restore buttons it feeds would gate the halves
  of a single decision separately. No-op.
- `manage_device_settings` — the **System** tab: install cards, app version,
  environment, platform and About. That is "this workstation", which is what
  the key's label says, and it is the one tab in the group that holds nothing
  store-wide. This **widens to `specialist`**, which holds the key by default
  and could not clear `isAdmin`. Low blast radius by construction — the tab's
  one actionable control was the "Manage Billing" shortcut card, which now
  carries `manage_billing` itself rather than linking a specialist into a tab
  that would bounce them straight back out.
- `manage_billing` — the **Billing** tab (subscription plans, payment
  history, coupons, referrals) and the System tab's shortcut into it.
  ⚠️ **The consequential call in this category**: this **narrows `manager`**,
  which could open every billing screen because it cleared `isAdmin`. The
  defaults comment has excluded `manage_billing` from `manager` since the
  catalog was written — subscription and payment-method changes are the
  owner's, not a shift manager's — so this is the key doing what it has
  always said, but it *is* a visible change for an existing store on upgrade,
  and it is the only tab a manager outright loses. One tick restores it, and
  that tick previously did nothing.
- `manage_online_store` — the storefront slice, and the one key here that
  **cuts across tabs rather than owning one**: the Store Profile block inside
  Business Info (`store-profile-section.tsx` — the public URL slug and the
  Enable Online Store switch) and the Paystack payout onboarding inside
  Payment Methods (`online-payments-section.tsx`, gated from
  `panels/payment-methods-panel.tsx`). Both exist only to make the public
  storefront work, so the key sits **on top of** each tab's own rather than
  replacing it. The Store Profile block returns `null` when nothing is left
  to show (a retail store whose group lacks the key and whose plan has no
  loyalty program) instead of an empty bordered box with a heading in it.
  `products.show_online` is deliberately **left under `manage_products`**: it
  is a per-product catalog attribute set in three places — the Add Product
  form, the CSV/XLSX importer and the catalog toolbar's "Online" dropdown
  (`bulk-show-online-action.tsx`) — and gating one of the three would be
  theatre while the other two stay open. Wire it here only if all three move
  together. No-op otherwise: admin and manager hold all three keys.
- `install_app_updates` — `components/tauri/auto-updater.tsx`, and the only
  key in the category with no Settings tab at all. It gates the **user-facing
  half**: the floating "Check for updates" pill and the consent /
  restart-to-apply prompts it opens. The startup check and the silent patch
  download behind it are deliberately **left running for every session** —
  they are not a user action, and stopping them would strand a till on an old
  build rather than restrict anyone. A session with **no signed-in user**
  (login screen, first run) is ungated: there is no group to check and the
  updater is the device's own. `AutoUpdater` moved inside `AuthProvider` in
  `app/layout.tsx` so it can read the acting session at all; it is
  `position: fixed`, so where it sits in the tree is not a layout decision.
  This is a **real narrowing** — the pill was reachable by anyone signed in —
  and `sales_staff` and `auditor` are the two default groups without the key,
  so on a cashier-only till a major update now waits for someone who holds
  it. That is what the key is for.

`DEFAULT_GROUP_PERMISSIONS` is **unchanged** for this whole category. Every
conversion above either reproduces the old `isAdmin` population exactly or
moves in the direction the defaults already stated, which is the point of
converting rather than inventing a gate.

Tabs deliberately **left on the `isAdmin` fallback**, so nobody re-derives it:
**Personal Info** (no key in the catalog names it), **Product Units** and
**Categories** (Inventory & Stock's `manage_products`, out of this
category's scope — convert them in whatever change next touches that
category), **Staff** and **Roles & Permissions** (Staff & Groups; the
permission matrix already enforces `manage_roles_permissions` *inside* the
panel, and moving the tab itself would take the read-only view away from a
manager), and **Danger Zone** (already enforces `factory_reset` inside
`device-danger-zone.tsx`). The **Alerts** tab is likewise untouched: low-stock
and expiry thresholds are store-wide but the tab has been open to every role
since it shipped, and putting it under `manage_store_settings` would be a
narrowing this pass has no evidence anyone wants.

### The category-by-category pass is complete

All eight categories have now been walked: Sales & POS, Inventory & Stock,
Prescriptions, Customers & Loyalty, Reports & Activity, Expenses, Staff &
Groups and Store & Settings. After the 2026-09-29 re-investigation below,
the two delete features and the transfer-review action built the same day,
**47 of the catalog's 48 keys are enforced** and exactly **one is
catalog-only**:

| Category | Enforced | Catalog-only |
| --- | --- | --- |
| Sales & POS | 8 / 8 | — |
| Inventory & Stock | 17 / 17 | — |
| Prescriptions | 2 / 2 | — |
| Customers & Loyalty | 4 / 4 | — |
| Reports & Activity | 4 / 5 | `view_dashboard` |
| Expenses | 2 / 2 | — |
| Staff & Groups | 2 / 2 | — |
| Store & Settings | 8 / 8 | — |

`view_dashboard` is the only one left, and it is **not** a "the feature does
not exist" finding: it has a real surface and the gate would simply be wrong
(see its entry above). Every key that *was* a "does not exist yet" finding
has now been resolved one way or the other — two were wired, three had their
missing feature **built** (`delete_products`, `delete_suppliers`,
`approve_stock_transfers`), and six were removed.

### Removed from the catalog (2026-09-29)

The twelve catalog-only keys were re-investigated from scratch on
2026-09-29, on the explicit premise that the first pass may have dismissed
some too quickly. It had: **two were wrong**, and both are now enforced —
`run_daily_close` (the Daily Close banner's backup/sync buttons, a real
leak the first pass never opened the file to see) and `print_product_labels`
(a finished dialog whose trigger was simply never wired). Their entries are
in the Sales & POS and Inventory & Stock blocks above.

Three more — `delete_products`, `delete_suppliers` and
`approve_stock_transfers` — were removed that day and **restored the same
day**, and these are the cases where the finding was right and the
*decision* was overturned rather than the evidence. There genuinely was no
delete anywhere, and there genuinely was no way to clear a `needs_review`
transfer; the owner's call was that each is a product gap, not a
catalog-cleanup item. So the features were built
(`deleteProduct()`/`deleteSupplier()` and their confirmation dialogs;
`markStockTransferReviewed()` and the ledger detail modal's "Mark
Reviewed") and all three keys came back **with** their enforcement, in the
same commit — which is the standing rule working as intended, in the
direction it is usually read. Their entries — the deactivate-vs-delete
safety-check design, and the Option A (approval queue) vs. Option B
(actionable review flag) reasoning that also renamed
`approve_stock_transfers` to "Review Stock Transfers" — are in the
Inventory & Stock block above.

The remaining six were re-traced file by file and confirmed dead — **no
feature, and no small safe fix available** — so they were **deleted** from
`PERMISSION_CATALOG`, `DEFAULT_GROUP_PERMISSIONS` and
`PermissionGroupSeeder.php`'s server-side copy, rather than left wearing a
"Coming soon" badge for something that is not coming. A checkbox that can
never do anything is worse than no checkbox: it tells an owner they have
restricted an employee when they have not.

| Removed key | What the re-check actually looked at |
| --- | --- |
| `open_cash_drawer` | No drawer integration in any layer: no ESC/POS kick sequence, no serial/USB/HID crate in `src-tauri` (`lib.rs`, `main.rs`, `Cargo.toml`, `capabilities/`), no "no sale" control, no till concept. |
| `view_drawer_counts` | Searched far wider than "drawer" — cash count, till count, reconcile, variance, expected cash, opening/closing balance, float. Nothing records a counted float against expected cash anywhere. |
| `edit_completed_sale` | Every `update("sales", …)` call site: the refund path (`use-process-return-mutation.ts`, already `void_refund_sales`), the reseller-commission redeem, and a debt payment (`customers.ts`). No re-assign customer, no note/reference edit, no payment-method correction; `transaction-details-dialog.tsx`'s only buttons are payment, return, reprint and commission. |
| `override_credit_limit` | `customers.credit_limit` appears in exactly two places repo-wide: `schema.ts`'s column and one report-export column in `reports.ts`. `use-pos-payment.ts` adds a credit sale straight onto `outstanding_balance` with no ceiling check — not even a soft warning. There is no block, so there is nothing to override. |
| `manage_customer_credit_terms` | The same two places, from the other side: nothing in the app ever **sets** `credit_limit` either — no field in the add/edit customer modals, no terms UI. Both keys would front a feature that is one unused column. |
| `manage_stock_batches` | No batch CRUD screen. `/inventory/batches` was in `generateStaticParams` but `stock-batch-management.tsx` rendered no `<TabsContent>` for it, and its "Add Batch" header action pointed at a `?action=add` nothing handles. `createStockBatch()`'s only caller is `getOrCreateTargetBatchForProduct()`; every other `stock_batches` write is receiving, audit restock or CSV import. Batch expiry is only ever set during receiving (`receive_purchase_orders`). The dead route itself was fixed on 2026-09-29 — see "The dead /inventory/batches route" below. |

**`open_cash_drawer` and `manage_stock_batches` predate the QuickBooks
pass** (the other four were all added in `91c3dfd3` on 2026-09-28, so no
real store could hold them), which means an already-synced
`permission_groups.permissions` array may still carry those two as strings. That is harmless — an unrecognised key grants nothing and
is never read — so no migration backfills them out. The client catalog and
the Laravel seeder were changed together so the two stay in step.

Do **not** re-add any of the six from a fresh QuickBooks comparison without
re-litigating this: the standing rule is that a key and its enforcement ship
in the **same commit**, and that rule now runs in both directions — a key
with no action does not get to sit in the catalog waiting for one.

### The default-group lists themselves (`DEFAULT_GROUP_PERMISSIONS`)

`DEFAULT_GROUP_PERMISSIONS` (`lib/constants/permissions.ts`) is the exact
permission set each of the five default groups is **seeded with**, and the
set "Revert to Default" in the matrix restores a group to. It was not
designed from scratch: every entry was **derived to reproduce the six
coarse `auth-context.tsx` helpers' behaviour exactly, role by role**, and
cross-referenced against `checkIsAdmin` / `checkCanManageStockBatch` /
`checkCanProcessSales` / `checkCanViewAllActivity` / `checkCanFactoryReset`'s
role arrays as they stood **before** the per-permission migration — so
migrating an existing store changed nothing on day one. That is why the
lists look uneven; each omission below is a legacy helper's shape, not an
oversight:

- **`admin`** is `PERMISSION_CATALOG.map(p => p.key)` — everything, by
  construction, so a new catalog key never needs an admin edit.
- **`manager`** deliberately excludes `view_activity_log`,
  `manage_roles_permissions`, `manage_billing` and `factory_reset`:
  `checkCanViewAllActivity` and `checkCanFactoryReset` both excluded
  `manager` at migration time.
- **`specialist`** excludes `void_refund_sales`, `apply_discounts` and
  `override_price` (all `checkIsAdmin`-only then), and the whole
  reports / activity-log / staff / store-settings surface. As the
  stock-owning role it holds the cost / price / audit rights but none of
  the destructive (`delete_*`) or money-side (`run_daily_close`) ones.
- **`sales_staff`** and **`auditor`** hold only what their helpers already
  implied; each later addition to those two is annotated with its own
  reasoning in the per-key blocks above, and every one of them is
  behaviour-preserving rather than a widening.

Anything that changes one of these lists is a catalog-version bump, not an
edit in place — see the next section.

### Catalog versioning and the default-group backfill (2026-09-29)

**The seeder only ever runs once per store, so the catalog it seeded with is
the catalog that store is stuck on.** `ensurePermissionGroupsSeeded()`
(`lib/db/queries/permission-groups.ts`) and its server counterpart
`PermissionGroupSeeder::ensureSeeded()` are both gated on
`stores.permission_groups_seeded_at`, and `hasPermission()`
(`lib/hooks/use-permissions.ts`) reads the **stored**
`permission_groups.permissions` array — it only falls back to
`DEFAULT_GROUP_PERMISSIONS` when a user has no group at all, which seeding
makes sure never happens. So every key the 2026-09-28 QuickBooks expansion
and the 2026-09-28/29 enforcement passes added to a default group reached
**new** stores only. An already-seeded store — including the live production
one, which predates the feature — would have had its cashiers lose Hold
Sale/Recall, the whole Recent Sales tab, receipt reprinting, the reseller
price override and the customer-balance block (which carries "Record
Payment"), and its managers lose Daily Close backup/sync, cost visibility,
Start Audit, the Movements tab, the Vendors tab, the deletes, P&L and the
System tab. That is the exact regression each of those grants was chosen to
avoid; it just never arrived.

Two things fix it, and both are load-bearing.

**1. The PHP seeder is a port, and parity is now a test.**
`laravel-server/app/Services/PermissionGroupSeeder.php` is a hand-maintained
copy of `lib/constants/permissions.ts`; it had only ever been edited for
removals and was 20 keys behind. `PermissionCatalogParityTest`
(`laravel-server/tests/Feature/`) parses the TypeScript constants and asserts
`DEFAULT_GROUP_PERMISSIONS`, `PERMISSION_CATALOG_VERSION` and
`DEFAULT_GROUP_PERMISSION_ADDITIONS` match the PHP copies key-for-key, plus a
guard test that the parser actually parsed a plausible catalog rather than
passing on an empty parse. **It lives on the PHP side on purpose**: the
Checks workflow's `client` job has Node but no PHP, while its `server` job
checks out the whole repo (`client/` included) and has PHP — so that is the
only one of the two jobs where both artifacts exist. The client remains the
source of truth; the test just refuses to let the copy drift again.

**2. `stores.permission_catalog_version` + an add-only, delta-scoped
backfill.** `PERMISSION_CATALOG_VERSION` (currently `2`) names the revision
the current default lists belong to — `1` is the 2026-09-27 launch lists
(`a5f40463`). `DEFAULT_GROUP_PERMISSION_ADDITIONS` records, per version, the
keys each role **gained** at that version. `backfillDefaultGroupPermissions()`
(client) and `PermissionGroupSeeder::ensureCatalogBackfilled()` (server) read
the store's stamp — NULL means 1 — and, for each `is_default = 1` group,
union in every key owed by a newer version. The column is on `stores` (not
per group) because defaults are seeded per store and the delta is the same
decision for all five groups; it is an ordinary synced column, like
`permission_groups_seeded_at`. A fresh seed stamps the current version, so
the backfill never runs against a store that never needed it.

Three properties make that safe, and each has a test on both sides:

- **Add-only.** It never removes a key, so a retired-but-still-stored key
  (`open_cash_drawer`, `manage_stock_batches`) survives untouched, as the
  removal note above promised.
- **Delta-scoped, not "revert to defaults".** Only keys from versions
  *newer* than the stamp are added, so a key the owner unticked while
  stamped at v2 is never silently restored by a v3 pass. **The known limit**:
  a legacy store has no stamp, so the whole v1→v2 delta applies to it — if
  such a store had already unticked one of those 20 keys, it comes back.
  There is no baseline that distinguishes "never had it" from "had it and
  removed it" for an unstamped store, so this is accepted and documented
  rather than guessed at.
- **Idempotent.** A group is written only when its stored array actually
  changes, so a second run is a genuine no-op — no duplicate keys, no queue
  rows, no `_version` bump.

**`is_default` does NOT track customization — do not read it that way.**
`toggle()`/`toggleMany()`/`revertToDefault()` (`lib/hooks/use-permission-groups.ts`)
never clear the flag, and the sync layer actively refuses to let a payload
change it (`sanitizePermissionGroupSyncPayload`). It means "this is one of
the five seeded role groups", full stop. So `is_default = 1` is the right
filter for *which rows the backfill may touch* (a copied or hand-made group
is `is_default = 0` and is never touched), but it is **not** what protects a
customized default group — the version delta is.

**The client/server race, and how it resolves.** Both sides can backfill the
same store minutes apart, and a third device may still be holding the
pre-backfill array.

- The operation is a **union of a fixed, version-indexed key set computed
  identically on both sides**, so it commutes: client-first and server-first
  converge on the same array. Content is never "last writer wins".
- **The server's backfill bumps `permission_groups._version`.** This is the
  piece that closes the silent-overwrite hole: a device that has not
  backfilled still holds the old array at the old version, and without the
  bump its next push would pass `SyncController::push`'s strict
  version-equality check and erase the backfill. With it, that push is
  rejected as `version_conflict`, which `sync-engine/push.ts` already treats
  as terminal — it drops the queue row (and toasts) and the next pull brings
  the server's superset down. Loud and correct, instead of silent and wrong.
- **The client writes only on change**, so a device that pulled the
  already-backfilled rows first pushes nothing at all and produces no
  conflict.
- **The stamp is queued last**, after the group rows, inside the same local
  transaction — a device can never advertise "v2 applied" ahead of the rows
  that make it true. And nothing derives *content* from the stamp: if a v2
  stamp arrives by pull before the group rows do, that side skips its own
  backfill and the rows themselves still arrive by ordinary pull.
- **The backfill push is rejected, and that rejection is terminal.** It runs
  on *any* signed-in user's login, cashiers included, and its whole job is to
  add keys that user does not hold — which
  `sanitizePermissionGroupSyncPayload`'s escalation and
  `manage_roles_permissions` checks throw on. The fix is **not** to exempt
  that payload; it is to make the rejection terminal on the client. Those two
  throws are a `SyncPushPermissionDeniedException`, which `push()`'s
  per-change catch reports as the stable reason **`permission_denied`**
  (the exception message still carries the specific detail into the log), and
  `push.ts`'s `NON_RETRYABLE_CONFLICT_REASONS` lists it beside
  `version_conflict`: the queue row is dropped on the first response instead
  of retried forever, and the next pull brings the server's row down. It is
  also in `SILENT_TERMINAL_REASONS`, so no "could not be saved" toast fires —
  the user never made the edit the backfill queued on their behalf, and the
  matrix UI gates a *real* group edit behind `manage_roles_permissions`
  anyway.

  This is correct for the failure class in general, not just for the
  backfill: a payload is frozen once queued and the caller's own grants don't
  change by resending it, so a privilege rejection stays a privilege
  rejection on every attempt — exactly the property that already makes
  `version_conflict` terminal.

  **An exemption was tried first and was wrong twice over**
  (`isCatalogBackfillOnlyPayload()`, removed 2026-09-29, with
  `backfillableKeysForRole()` on both sides). It was dead code in the real
  ordering: `validateSync()` runs `ensureSeeded()` → `ensureCatalogBackfilled()`
  at the top of **every** push and pull, before any change is processed, so
  the server row already holds the v2 superset when the device's own backfill
  push arrives — the payload adds nothing, the exemption's `added` set is
  empty, and it falls through to the privilege check anyway. Every upgrading
  cashier device therefore ended up with 5 permanently-stuck
  `permission_groups` queue rows, and `pull.ts` skips pulling any record with
  a pending queue row, so those devices would never have received another
  server-side change to any default group again. It also did not "cover
  nothing but the backfill": it accepted any key in that role's delta set at
  any time, so a staff device could re-add a key the owner had deliberately
  removed post-backfill and the server took it.

`DEFAULT_GROUP_PERMISSION_ADDITIONS` is **deliberately a literal,
hand-written table rather than a diff computed against a stored snapshot of
each old default list.** The same table has to exist byte-for-byte in PHP
(`PermissionGroupSeeder`, enforced by `PermissionCatalogParityTest`), and a
literal ports across without either side re-deriving anything — a computed
diff would have to reproduce the derivation identically in two languages to
stay in parity.

Bumping `PERMISSION_CATALOG_VERSION` therefore means: add the version's entry
to `DEFAULT_GROUP_PERMISSION_ADDITIONS`, mirror both into the PHP seeder
(the parity test fails otherwise), and nothing else — the backfill, the
stamping and the race handling are already generic over the version number.

### The dead `/inventory/batches` route (2026-09-29)

`/inventory/batches` was a generated route with nothing behind it:
`app/(dashboard)/inventory/[tab]/page.tsx` lists `batches` in
`generateStaticParams`, but `stock-batch-management.tsx` renders no
`<TabsContent value="batches">`, so the page resolved to the tab bar and an
empty panel. Three things pointed at it — the `/inventory/batches` header
action ("Add Batch", `?action=add`, which nothing anywhere handles),
`needs-attention.tsx`'s "View batch" card and
`use-action-center-alerts.ts`'s expiring-items alert.

The fix is a **redirect to `/inventory/catalog`**, not a new Add Batch
dialog, because there is no batch-create flow to point the button at:
`createStockBatch()`'s only caller is `getOrCreateTargetBatchForProduct()`,
and every other `stock_batches` write is receiving, audit restock or CSV
import (this is the same finding that removed `manage_stock_batches`, and it
is still true). The Catalog tab is the all-products-with-stock view all
three callers actually meant.

It redirects **client-side, in `use-stock-batch-management.ts`**, beside the
existing `audits` and `ledger` redirects, rather than server-side in the tab
page. That is not a style choice: `next.config.mjs` sets `output: "export"`,
so a `redirect()` inside a statically generated param is evaluated at build
time, and `batches` has to stay in `generateStaticParams` or an existing
bookmark 404s instead of redirecting. The route still generates; the page
bounces on mount.

The `/inventory/batches` `PAGE_ROUTES` entry was **deleted** rather than
repointed — it existed only to title a page that never rendered and to offer
an action that landed nowhere, and `/inventory`'s own entry (Inventory
Dashboard / Add Product) already covers the prefix. The two in-app callers
were repointed at `/inventory/catalog` directly so they do not flash through
the redirect.

### The 2026-09-28 granularity pass

The catalog was compared against QuickBooks Point of Sale's own
security-rights matrix and 24 keys were added, all **catalog-only** (no
call site yet) except where noted — they are visible and settable in the
matrix but the repo's incremental-rollout rule still holds: **wire
enforcement and add the key in the same commit**, and add the key to
`ENFORCED_PERMISSION_KEYS` in that same commit.

- **Sales & POS** — `hold_sales`, `view_sales_history`,
  `edit_completed_sale`, `reprint_receipt`, `run_daily_close`,
  `view_drawer_counts`, `override_credit_limit`. (`edit_completed_sale`,
  `view_drawer_counts` and `override_credit_limit` were removed again on
  2026-09-29 — see "Removed from the catalog" above.) These split apart what
  `process_sales` and `void_refund_sales` currently cover as one lump:
  reading history vs. making a sale, parking a sale vs. completing one,
  amending a finished sale vs. voiding it, and the end-of-day/drawer
  surfaces (`daily-close-report.tsx`) which today are role-gated by a
  direct `user?.role === "sales_staff"` check rather than by a key.
  `hold_sales`, `view_sales_history` and `reprint_receipt` were wired up
  later the same day (along with `override_price`), and `run_daily_close` on
  2026-09-29 — read its entry above before re-investigating.
- **Inventory & Stock** — `view_cost_fields`, `edit_product_cost`,
  `edit_product_price`, `delete_products`, `perform_stock_audit`,
  `view_stock_adjustment_history`, `print_product_labels`,
  `export_product_list`, `view_suppliers`, `delete_suppliers`. `manage_products`
  today grants cost, price, quantity, deletion and supplier writes all at
  once; these are the pieces. All of these except `delete_products`,
  `delete_suppliers` and `print_product_labels` were wired up later the
  same day, along with `adjust_stock_counts`, `manage_purchase_orders`,
  `receive_purchase_orders`, `manage_suppliers` and
  `request_stock_transfers`; `print_product_labels` followed on 2026-09-29,
  and `delete_products`/`delete_suppliers` on the same day, once the delete
  features they front were actually built — see the Inventory & Stock block
  above before re-investigating any of them. `view_cost_fields` is the key form of the cashier cost/margin
  gating described below; that conversion has now happened for
  `product-pricing-info.tsx`, and the remaining
  `role === "sales_staff"` sites (`daily-close-report.tsx`,
  `transaction-metrics.tsx`, `transaction-details-dialog.tsx`) are the
  next ones to move.
- **Customers & Loyalty** — `delete_customers`, `view_customer_balances`,
  `manage_customer_credit_terms`. The first two were wired up later the
  same day, along with `manage_customers` and `manage_loyalty`;
  `manage_customer_credit_terms` was removed on 2026-09-29 — see the
  Customers & Loyalty block and "Removed from the catalog" above before
  re-investigating any of them.
- **Reports & Activity** — `view_dashboard`, `view_financial_reports`.
  `view_reports` stays the broad "can open Report Center" right;
  `view_financial_reports` is the P&L/margin tier on top of it (QuickBooks'
  level-3/4 report split).
- **Store & Settings** — `manage_device_settings` (this workstation's own
  preferences, as distinct from store-wide `manage_store_settings`),
  `install_app_updates` (`components/tauri/auto-updater.tsx`). Both were
  wired up later the same day, along with the rest of the category —
  `manage_store_settings`, `manage_payment_accounts`, `manage_online_store`,
  `manage_billing` and `backup_restore_data` — see the Store & Settings block
  above, and the completion note after it, before re-investigating any of
  them.

Deliberately **not** imported from QuickBooks: anything about
QuickBooks-desktop mechanics (company-file open/close/create/rename/clean-up,
convert-from-previous-version, license management, setup interview,
integrated-application login, linked QuickBooks transactions,
update/recover QuickBooks), its hardware wizards and troubleshooter, its
Dashboard-webpage rights, "Exit Point of Sale"/"Customize program
interface", and its Departments concept (DumosRx has product categories,
not departments — `manage_products` covers them).

## Roles & Permissions matrix: hierarchical categories

`permission-matrix.tsx` renders each `PermissionCatalogEntry.category` as a
collapsible section header row with a **tri-state checkbox per group
column** (`data-testid="category-checkbox"`). The maths lives in
`category-selection.ts` (pure, unit-tested): all children granted =
checked, none = unchecked, some = indeterminate (set on the native input
via a ref, since `<input type="checkbox">` exposes `indeterminate` as a DOM
property, not an attribute). Clicking a checked category clears its
children; clicking an unchecked *or* indeterminate one grants them all.

Two things a new category-level control must keep:

1. It writes through `usePermissionGroups().toggleMany(groupId, keys, granted)`,
   **not** a loop over `toggle()` — each `toggle()` reads the `groups` state
   captured by the current render, so the second write in a loop would
   overwrite the first with a set that predates it.
2. `getCategoryToggleKeys()` filters out locked keys. Today that is the
   acting user's own `manage_roles_permissions` plus every key the acting
   user can't grant (below), which the per-cell UI renders disabled;
   without the filter the category checkbox would be a way round those
   guards. A category whose writable set comes out empty renders its
   checkbox disabled rather than as a click that silently writes nothing.

Sections default to expanded — the matrix's job is being scannable at a
glance — and collapse state is local component state, not persisted.

### "You can't grant what you don't hold" (2026-09-29)

The matrix's only gate used to be `canManage` (holding
`manage_roles_permissions`), but the sync server's
`sanitizePermissionGroupSyncPayload()` enforces a second, narrower rule,
and the two disagreed. `lib/permissions/grant-scope.ts` now mirrors the
server's rule exactly and `useOwnGrantScope()` feeds it to the matrix:

- **Unrestricted roles are `store_owner`, `admin` and `super_admin`** —
  the server's own list, which is **not** the same as `hasPermission()`'s
  short-circuit (that one omits `admin`). Follow the server here; a
  mismatch either over-restricts a legitimate owner action or lets the
  silent revert below back in.
- Everyone else may only grant keys **their own permission group row**
  carries. The server has no role-based fallback for this check, so a
  caller with no group row can grant nothing — `buildGrantScope()`
  deliberately does not reuse `fallbackPermissions()`.
- The check runs against the **whole resulting `permissions` array**, not
  the one key that changed, and `toggle()`/`toggleMany()` always write the
  whole array. So a group that *already* holds a key the caller can't
  grant can't be edited by that caller at all — the matrix disables that
  group's entire column, with its own explanatory title, rather than
  letting an untick be rejected too.

Both refusals are **disabled cells with a `title`, never hidden cells** —
the same "show something true, never a mystery-disabled control" rule the
`factory_reset` surface follows.

**Why this replaces relying on the sync layer's behavior.** Without it, a
manager-tier user ticking a key they don't personally hold got a local
write that applied instantly, showed as ON, pushed as `permission_denied`,
had its queue row dropped terminally, and was reverted by the next pull —
with **no toast at all**, because `permission_denied` is in
`SILENT_TERMINAL_REASONS` (`lib/db/sync-engine/push.ts`). That silencing is
correct and stays: it exists for the automatic catalog backfill's own push,
an edit no user made and no user is waiting on. Narrowing it by "was this
queued by machinery or by a human" would need an origin marker on the sync
queue row (the two pushes are indistinguishable today — same table, same
column, same shape), so the fix belongs in the UI, where the edit can be
refused before it is ever written locally.

**Known residual.** The matrix is now honest, but `revertToDefault()` and
`copyGroup()` (the group toolbar) still write permission sets a restricted
caller may not be able to grant, and would hit the same silent
`permission_denied` drop. They are not gated yet.

## Reports: on-screen view

Every Report Center report returns the same pre-labelled
`Record<string, unknown>[]` from `useReportExport`'s `getRows()`, so one
generic `components/reports/report-table-view.tsx` (column-driven, wired to
`useSortableData` + `SortableHeaderCell`) renders all six on screen behind
the card's "View" action, with Export/Print repeated inside the view.
Column order comes from `getReportHeaders(reportId)` so the view, the CSV
and the PDF can't drift. `fetchSalesReportData` now also selects a
"Cashier" column (`LEFT JOIN users`), which the export formats already
carried a *filter* for but never showed.

### Searching and re-filtering from inside the view (2026-09-29)

The filters used to live only on the Report Center card: they were captured
in a closure when "View" was clicked and baked into the one `getRows()` call
behind the modal, so changing anything meant closing the modal, changing the
card, and clicking View again. `report-view-dialog.tsx` now carries both
kinds of control itself, and the distinction between them is the thing to
preserve:

- **Search filters the rows already on screen.** One `SearchInput` over
  `genericFuzzySearch` (`lib/utils/search.ts`, the same utility the product
  catalog and customer directory use), across every visible column, with no
  query behind it. It renders for **every** report, including the two that
  take no parameters at all.
- **Date range / staff / payment method re-fetch.** They call the *same*
  `getRows()` machinery the card's exports use: the dialog raises
  `onFiltersChange`, and `report-center.tsx`'s `loadViewRows(reportId,
  filters)` — which `openView` also calls — does the fetch and flips the
  existing `isLoading`, so a re-fetch shows the same spinner the first load
  does. The filter controls stay mounted while it runs; only the table is
  replaced.

**Which controls render is read from `REPORT_CONFIG`, not a second list.**
`reportSupportsDateRange()` / `reportSupportsSalesFilters()`
(`lib/hooks/use-report-export.ts`) expose the `takesDateRange` /
`takesSalesFilters` flags that the export path already ran on, so the view
cannot drift from what the query actually accepts. Today that means: Detailed
Sales, Top Sellers and Profit & Loss get date + staff + payment; Expense
Categories gets date only; Inventory Valuation and Customer Loyalty (pure
point-in-time snapshots) get neither, only the search box. A report whose
query gains or loses a dimension gets the right controls by changing that one
config entry. `ReportFiltersBar` grew `showDateRange`/`showStaff`/
`showPaymentMethod` (default `true`, so the card and Analytics are untouched)
plus a `compact` variant for the narrower modal row.

**The modal's filters are independent of the card's, seeded from them.** It
opens pre-populated with whatever the card had when "View" was clicked and
owns its state from then on: adjusting inside the modal never moves the card
behind it, and the card re-rendering never resets the modal. The seeding is a
`key={viewing.id}` remount in `report-center.tsx`, not a sync effect — an
effect that copied the prop back into state would undo the user's in-modal
change on any unrelated parent render. The reasoning: the card's filters are
"what the next export will use" and are shared by six reports at once, while
the modal's are "what I'm looking at right now" in one of them; silently
rewriting the card from a modal would change what the other five reports'
Export buttons do. The amber Profit & Loss note is computed from the
**modal's** filters while it is open, so the banner always describes the rows
actually on screen.

## Cashier (`sales_staff`) visibility gating — a recurring pattern, not a one-off

A cashier account should never see store-wide profit/margin figures or
manage stock/settings beyond their own sales. The established check is a
direct `user?.role === "sales_staff"` (or `!== "sales_staff"` to show
something to everyone else), matching the pattern already used in
`daily-close-report.tsx`, `transaction-metrics.tsx`,
and `transaction-details-dialog.tsx`. It is being **migrated to the
`view_cost_fields` permission key**, whose default grants
(admin/manager/specialist/auditor, never `sales_staff`) reproduce it
exactly; `product-pricing-info.tsx` moved on 2026-09-28 and the three
sites above are next. Until then, a new profit/margin display uses
whichever of the two matches its neighbours — **not**
`checkIsAdmin()`/`isAdmin`, which also excludes `auditor` and `specialist`
(read-only/stock-managing roles that have no reason to be denied a
profit figure they can already derive from data they can see elsewhere).
When adding a new profit/margin display, gate it the same way and check
sibling surfaces: profit has leaked from more than one place before
(Daily Close's aggregate was gated once, then found still visible via
drilling into an individual sale's `TransactionDetailsDialog` from three
different entry points — POS history, the dashboard activity feed, and
Daily Close's own sales list — because the dialog itself wasn't gated).
For a permission that's admin-plus-one-specific-role rather than a clean
admin/non-admin split (e.g. "cashiers can also reach this, but auditors
still can't"), see `dashboard-page-routes.ts`'s `actionAllowSalesStaff`
flag and `RequireRole`'s `allowSalesStaff` prop for the pattern — don't
just delete/loosen the existing `actionAdminOnly`/`canManageStockBatch`
check, that widens the gate for every non-admin role at once, not just
the one you meant to add.

## PWA offline precaching

`public/sw.js` does both runtime caching (stale-while-revalidate for
same-origin static assets, network-first-with-cache-fallback for
navigations) and, since 2026-09-23, install-time **precaching**: a
`postbuild` script (`scripts/generate-precache-manifest.ts`) walks the
static export's `out/` directory and writes `precache-manifest.json`,
which `sw.js`'s `install` handler fetches and caches per-URL (not the
atomic `cache.addAll()` — one bad URL degrades instead of silently
killing the whole precache) before calling `skipWaiting()`. **On any
change to the install/precache logic, an async handler that merely
`console.error`s a caught failure and returns normally still reports
"install succeeded" to the browser** — a real failure must `throw` so the
`event.waitUntil()` promise actually rejects, otherwise this SW version
activates with an empty/partial cache instead of leaving whatever worker
was previously in charge running. Bump `CACHE_VERSION` on any change to
the caching *strategy* itself (not on every deploy — the runtime-caching
half already refreshes assets on every successful fetch). This only
matters for the browser/PWA target; Tauri loads `out/` directly off disk
via its own protocol and doesn't go through this service worker at all.

**Every navigation response must be verified as real HTML before it's
cached or returned** (`isHtmlResponse` in `sw.js`, added 2026-09-23,
`CACHE_VERSION` bumped to `v3`). This app's static export
(`output: "export"`) writes each route as **both** `route.html` (the
real page) and `route.txt` (the React Server Component flight payload
Next's client router fetches for soft/client-side transitions) —
confirmed live: an iPhone home-screen install, restarted offline, showed
the raw serialized RSC text on screen instead of the app, because
something had ended up cached under the page's own URL with a non-HTML
body and the navigate handler served it back with no check. The guard
applies on **both** the network path and the offline cache-fallback
path, and deliberately does **not** also require `response.ok` — a
genuine, current 404/500 HTML error page from the network is still real
information and must be shown as-is; only its *content-type* determines
trustworthiness, not its status code. (An earlier version of this fix
did gate on `response.ok` too and was caught by code review: it made a
real current error page get treated identically to being offline,
serving stale cached content instead.)

The **catch-all stale-while-revalidate branch** (every other same-origin
GET: JS/CSS chunks, the sql.js WASM binary, manifest, icons, Next's `.txt`
RSC payloads) got the mirror-image guard on 2026-09-26, with `CACHE_VERSION`
bumped to `v4` so `activate()`'s prune also drops any already-poisoned
entry. It used to cache anything on a bare `response.ok`, so a captive
portal or misconfigured proxy answering a chunk/WASM request with its own
login page (still `200 OK`) would poison that entry under the real asset's
cache key and keep being served long after the network recovered. The check
is inverted relative to the navigation path: `expectsNonHtml` tests the
request pathname's extension, and HTML is refused only for those requests —
so a legitimately-HTML response on some other same-origin GET still caches
as before.

## Tauri webview content-security policy

`src-tauri/tauri.conf.json`'s `app.security.csp` is a real policy, not `null`,
and `withGlobalTauri` is gone. It only governs the **bundled** desktop/Android
build: Tauri applies the CSP to assets it serves over its own protocol, so
`npm run tauri dev` (which loads `devUrl` from the Next dev server) is
unaffected and Next's HMR `eval` keeps working. The web/PWA build at
`app.dumosrx.com` is served by a plain host and is not covered by this at all.

The policy and why each source is in it:

- `script-src 'self' 'wasm-unsafe-eval'` — no `'unsafe-inline'` and no
  `'unsafe-eval'`. It does **not** need them: `tauri-codegen` sha256-hashes
  every non-empty inline `<script>` in each exported HTML file at build time
  and appends those hashes to this directive, which covers Next's static
  `self.__next_f.push(...)` payload scripts (94 of them across the 47 pages in
  `out/`). `'wasm-unsafe-eval'` is for sql.js instantiating
  `public/sql-wasm.wasm`; the desktop/Android build uses native SQLite rather
  than sql.js, so it is belt-and-braces, but it costs nothing and the fallback
  path exists in `lib/db/core.ts`.
- `style-src 'self' 'unsafe-inline'` — load-bearing. `components/ui/chart.tsx`
  writes a `<style>` via `dangerouslySetInnerHTML`, React 19 hoists
  `<style precedence>` tags, and Radix's scroll-lock injects its own. Note the
  CSP-3 rule that a nonce or hash in a directive makes `'unsafe-inline'`
  ignored: this works **because** the exported HTML contains zero build-time
  `<style>` tags, so Tauri adds no style nonce. **Adding an inline `<style>` to
  the exported HTML would silently disable `'unsafe-inline'` and break every
  runtime-injected stylesheet.**
- `worker-src 'self' blob:` — `lib/utils/report-pdf.tsx` spawns the PDF worker.
- `img-src`/`media-src` with `data:` and `blob:` — receipts, barcodes and the
  generated PDFs.
- `connect-src` includes `ipc:` and `http://ipc.localhost` (Tauri v2's IPC
  channel is `ipc://localhost` on macOS/Linux, `http://ipc.localhost` on
  Windows/Android) plus `https:` and the localhost/`10.0.2.2` entries, because
  `components/ui/server-selector.tsx` lets the API host be repointed at
  runtime.
- `object-src 'none'`, `frame-src 'none'`, `base-uri 'self'`,
  `form-action 'self'` — the app embeds nothing and posts nowhere.

`withGlobalTauri` was dropped because nothing depends on it: the only two
readers of `window.__TAURI__` (`lib/db/core.ts`'s `isTauri()` and
`lib/utils/error-logger.ts`) already fall through to `window.__TAURI_INTERNALS__`,
which Tauri v2 injects regardless. `__tests__/tauri-csp-config.test.ts` pins
all of the above.

## Stale-chunk auto-recovery

A tab left open across an auto-deploy (the storefront rebuild pipeline,
or any redeploy of this app itself) holds JS chunk hashes a fresh build
has already deleted from the server — the moment it lazy-loads a route it
doesn't already have in memory, that 404s as `ChunkLoadError` (Chromium:
`"Loading chunk N failed"`; Safari: `"Importing a module script failed"`;
Firefox: `"error loading dynamically imported module"` — see
`CHUNK_ERROR_PATTERN` in `lib/utils/chunk-error.ts`, shared so the
pattern can't drift between call sites). This isn't a real crash, just
the browser needing a fresh copy, and is handled by a **one-time
auto-reload per tab session** rather than showing the crash screen:

- `components/tauri/error-boundary.tsx`'s `componentDidCatch` catches
  the **React-render-time** case (a lazy-loaded component throwing while
  mounting).
- `components/tauri/global-error-listener.tsx`'s `window` `error`/
  `unhandledrejection` handlers catch the **more common** case: most
  real `ChunkLoadError`s are a rejected dynamic `import()` promise (a
  route-level code-split chunk failing to fetch during client-side
  navigation), which never reaches a React throw at all.

Both funnel through the same `sessionStorage` guard
(`CHUNK_RELOAD_GUARD_KEY`) so a genuinely-broken deploy (the chunk still
404s after the reload) falls through to the normal crash screen instead
of reload-looping forever; `GlobalErrorListener`'s mount effect clears
the guard on every clean boot, so a *later*, unrelated chunk error in the
same tab session still gets its own fresh one-time retry.

## UI conventions worth knowing before changing shared components

- **Full-screen page takeover**: `fixed inset-0 z-50 flex flex-col
  bg-background` (no dashboard shell, no sidebar), used for
  `stock-batch/stock-audits.tsx` (Cycle Count) and both
  `app/(dashboard)/procurement/new|edit/page.tsx`. Header uses `style={{
  paddingTop: "calc(var(--tauri-top, 0px) + 1.25rem)" }}` to clear the
  Tauri title bar. Reach for this pattern (over an embedded
  `rounded-2xl border` panel inside the dashboard shell) for any
  multi-step or dense-table flow that deserves the user's full attention.
- **Search-to-create combobox pattern**: `components/ui/product-combobox.tsx`
  (generic, also used for the product name field) and
  `components/procurement/supplier-combobox.tsx` (vendor-specific) both
  follow the same shape: type to fuzzy-filter, click/scroll to pick, and a
  pinned "Create ..." row — tinted `bg-primary/10 text-primary`,
  `font-semibold` — that stays visible at the top of the dropdown
  regardless of whether matches also exist below it (a "only show create
  when zero matches" rule was tried and rejected: fuzzy search almost
  always finds *something*, so that hid the create option in practice).
  `ProductCombobox` has opt-in flags for reuse in different contexts:
  `showGlobalSuggestions` (catalog matches vs. the static
  non-catalog name-suggestion list — never mix both in one dropdown),
  `showCreateNewOption` (off for the Add/Edit Product dialog's own name
  field — "create the product you're naming" isn't meaningful there), and
  `showSearchIcon` (leading `Search` icon, hidden below `sm`, for contexts
  that are genuinely a search bar rather than a name field).

- **Category pickers read the `categories` table, never `suggestions.ts`.**
  `components/ui/category-combobox.tsx` is the one picker for *choosing* a
  category (Add/Edit Product, and the receive flow's inline fix-up). It
  queries `getCategoryList()` (`lib/db/queries/categories.ts` — the canonical
  one; the near-duplicate `getCategoriesList()` in `queries/products.ts` was
  deleted, along with `queryKeys.categories.all`, so there is only
  `queryKeys.categories.list()` now) and shows a pinned `Create "{typed}"`
  row, which is what keeps it open-ended: both save paths
  (`use-save-product-mutation.ts`, `use-product-quick-edit-mutation.ts`)
  create a missing category by name. `FORM_SUGGESTIONS.categories`
  (`lib/constants/suggestions.ts`) is only ever allowed in a category
  *creation* field (`settings/store/category-form-dialog.tsx`), never as
  options in a picker — a fresh install shows an empty list plus the create
  row rather than pharmacy reference data a construction-materials store
  will never use.
  It is deliberately an **in-DOM absolutely positioned** dropdown, not a
  `createPortal` one like `components/ui/searchable-input.tsx`: every caller
  sits inside a Radix dialog, and that dialog's `react-remove-scroll` lock
  blocks wheel/touch scrolling over a portaled sibling of the dialog
  content, so a portaled option list could not be scrolled at all. Don't
  "simplify" it back to `SearchableInput` inside a dialog.
- **Scroll affordances** (`components/ui/scroll-fade.tsx`,
  `components/ui/scroll-to-top-button.tsx`). `ScrollFade` (top/bottom) and
  `HorizontalScrollFade` (left/right) are the house cue for a clipped
  scroll region; the horizontal one exists specifically for the
  `.hide-scrollbar` metric/card strips, which by design have no scrollbar
  to give the game away. `ScrollToTopButton` takes the *same* ref the list's
  `useVirtualizer` holds and portals a fixed button measured off that
  element's bounding rect (the lists sit inside cards with their own
  overflow/transform contexts, which would clip or re-anchor an absolute
  child). All three no-op safely where `ResizeObserver` is missing (jsdom).
  Tab rails (`components/ui/tabs.tsx` and the `TabsList`-based status
  filters) deliberately get no fade — the active-tab indicator is already
  their orientation cue.
  The always-visible scrollbar block in `app/globals.css` now colours the
  thumb with `color-mix(in srgb, var(--primary) …%, transparent)` rather
  than a neutral grey, so every theme variant and both light/dark modes
  follow from the one token; don't hardcode a per-theme hex there.
- **`FilterPill`** (`components/ui/filter-pill.tsx`): a "Label: value"
  dropdown that replaces a long row of one-per-value quick-filter chips.
  Used for Category/Inventory filters on the product catalog and the audit
  ledger's category picker. Prefer this over adding another chip row when a
  filter has more than ~4-5 possible values.
- **`ResponsiveTabLabel`** (`components/ui/responsive-tab-label.tsx`):
  `<span className="md:hidden">{short}</span>` / `<span className="hidden
  md:inline">{long}</span>`: the house pattern for abbreviating table
  headers/labels on small screens instead of letting them force horizontal
  scroll.
- **Click-to-expand a truncated list item**: keep the `line-clamp-*` on the
  row and add a detail modal beside it — never widen the row or drop the
  clamp. The row's click handler sets a nullable `target` state and the
  `ResponsiveModal`-based `<Entity>DetailModal` renders from it
  (`components/stock-batch/stock-movement-detail-modal.tsx` is the reference;
  `components/dashboard/notification-detail-modal.tsx`, reached by clicking a
  clamped broadcast in the notification bell, is the smallest example). When
  the row lives inside a `DropdownMenu` or `Drawer`, the modal is rendered as
  a **sibling of that menu, not a child of it**, and the click closes the menu
  before opening the modal — two dismissable layers mounted at once is what
  leaves `document.body.style.pointerEvents` stuck (the same failure
  `ResponsiveModal`'s `mounted` gate exists to avoid). `NotificationBell`
  falls back to the detail modal only when a notification has no other action
  (no `link`, not an online order), so it never displaces existing navigation.
- **No raw `<table>` elements, ever.** Every data table in the app is
  div-based with ARIA roles standing in for real `<table>` semantics
  (`role="table"` / `"rowgroup"` / `"row"` / `"columnheader"` / `"cell"`),
  laid out with CSS Grid (a single `grid-cols-[...]` template string shared
  between the header row and every body row (never repeat per-column
  widths in each row separately, that's exactly how header/body columns
  drift out of alignment). See `components/stock-batch/supplier-table.tsx`
  for the reference implementation, or `components/activity-log/activity-log-page.tsx`
  for one with a sticky first column and row click/keyboard handling.
  `components/ui/table.tsx` (the shadcn `<table>`-based primitive) exists
  but is intentionally unused, don't reach for it.
  `components/settings/roles-permissions/permission-matrix.tsx` was migrated
  to this pattern on 2026-09-28 (it had been missed by the earlier sweep);
  because its column count is the group count and so isn't knowable at build
  time, its shared template lives in one `gridStyle` object spread onto the
  header row and every body row instead of a Tailwind `grid-cols-[...]`
  class — the rule is "one template, one place", not "must be a class".
  `components/stock-batch/stock-audits.tsx`'s off-screen printable sheet
  followed on the same day, and is the one documented **layout** exception:
  it is div-based with the same ARIA roles, but laid out with `display:
  table*` utilities (`table` / `table-header-group` / `table-row` /
  `table-cell`) instead of CSS Grid, because a browser only repeats a header
  across printed pages when that header box is a `table-header-group`, and
  that sheet routinely runs to several pages. Any other **print-only** sheet
  should copy that shape; on-screen tables stay on grid. No raw `<table>`
  elements remain in the app outside the unused `components/ui/table.tsx`.
- **Dense "ledger" tables** (receive-goods, stock audit): same div/grid/ARIA
  pattern, with a `sticky left-0` item-name column and `overflow-x-auto` on
  the wrapper: the agreed pattern for "QuickBooks/Moniebook-style" dense
  editable grids. Match header and body cell padding exactly (`px-3 py-2`
  convention); a mismatch here is an easy-to-miss bug that makes columns
  look misaligned under their headers.
- **Paginated tables** get a standard footer via `components/ui/table-pagination.tsx`:
  a rows-per-page selector, "Showing X-Y of Z", and "Page A of B" with
  prev/next. Use it for any new paginated table instead of hand-rolling
  pagination controls.
- **`hover:` variant is redefined project-wide** in `app/globals.css` to
  only apply under `(hover: hover) and (pointer: fine)`: this fixes an iOS
  Safari/WebKit double-tap-to-hover bug. Every existing `hover:` utility
  picks this up automatically; don't reintroduce a raw media query for the
  same problem.
- **`--input` CSS variable** is the *border* color for form controls
  (`border-input` on Input/Select/Textarea/Switch), not a background.
  Don't set it to something close to `--card`/`--background` or borders go
  invisible (this exact bug shipped once; see commit `54272f5`).
- **PO number / SKU-style IDs**: `PO-XXXXXXXX` (first 8 chars of the UUID,
  uppercased) is the display convention for order/audit IDs, see
  `formatPONumber` in `components/procurement/purchase-order-table.tsx` for
  the canonical helper; don't reintroduce ad-hoc `id.split("-")[0]` calls.
- **Header day format**: short weekday (`Thu, Aug 13`), not long, see
  `components/dashboard/dashboard-header.tsx`.
- **Right-click row actions** (`components/ui/context-menu.tsx`, the shadcn
  wrapper over `@radix-ui/react-context-menu`, added 2026-09-29): the
  Product Catalog row (`components/products/catalog-row.tsx`) is the first
  and so far only user. Rules that made it work, and that a second row-based
  screen should copy:
  - **Never the only path to an action.** Every item in the catalog's menu
    also exists as a button inside the product details panel
    (`catalog-detail-panel.tsx`'s kebab menu). Right-click is a shortcut
    for people who already know the action exists, not a place to hide one
    — touch devices and keyboard users have no right-click at all.
  - **Reuse the dialog, don't rebuild it.** The row itself owns no dialog
    and no mutation: it calls `onPrintLabel`/`onDeleteProduct`, and
    `catalog-list.tsx` hosts one `BarcodePrintDialog` and one
    `ProductDeleteDialog` for the whole virtualized list. Mounting a pair
    of dialogs per row would have been a dialog per visible row, and the
    delete dialog carries a mutation plus a blockers query each.
  - **Permission gating is disabled-with-a-reason, not hidden** — the
    opposite of the detail panel's kebab menu, which omits the items
    outright. A menu that changes shape per user teaches nothing; a
    disabled row with a `title` naming the missing permission
    ("Print Product Labels" / "Delete Products") does. Same reasoning as
    the roles matrix, see `permission-matrix.tsx`. The keys are the
    existing `print_product_labels` and `delete_products` — the context
    menu introduced no permission key of its own.
  - **`CatalogRow` is `React.memo`'d**, so the two new callbacks are
    `useCallback`-stable in `catalog-list.tsx` for the same reason the
    save handlers are; see the comment on `quickEditProduct` there.
  - Dropped from this pass: a "jump to batches" item. `CatalogDetailPanel`
    drives its tabs with an uncontrolled `<Tabs defaultValue="details">`,
    so there is no existing trigger to reuse — adding one means lifting
    that tab state into a prop, which is a change to the panel, not to the
    catalog row. Do that first if the item is wanted.
  - Tests: `__tests__/catalog-row-context-menu.test.tsx`. Note that
    `CatalogList` tests must stub both dialogs (as they already stub
    `RequestItemDialog`) or they need a `QueryClientProvider`.

- **Scrolling on desktop: two opt-in mechanisms, neither global.**
  - `.stable-scrollbar` (`app/globals.css`) forces a thin, always-visible,
    theme-coloured scrollbar with `scrollbar-gutter: stable`. macOS hides
    overlay scrollbars until a two-finger trackpad gesture reveals them, so
    on a mouse — or before the first scroll — a scrollable region looked
    like a clipped one. Applied deliberately to the Catalog list and detail
    panel, the Movements and Adjustments lists, the Adjust Stock items
    table, the Add/Edit Product modal body, and the combobox dropdowns it
    feeds (product, category, strength/size, supplier, transfer picker).
    This replaced a blanket `* { scrollbar-width: thin; ... }` rule that
    restyled every scroller in the app, including ones nobody had looked
    at; add the class to a container rather than widening the selector.
  - `useArrowKeyScroll(ref)` (`lib/hooks/use-arrow-key-scroll.ts`) makes the
    arrow keys scroll one container the way a browser scrolls a plain page,
    for tabs whose content lives in an `overflow-auto` div rather than the
    document scroller. Call it on the container from the page/tab that owns
    it — it is not a global listener, because arrow keys are already spoken
    for on plenty of screens. Wired to Catalog, Movements and Adjustments
    (the two ledgers gate it on `isDesktop`, since only the desktop branch
    owns the scroller). It stands down for text fields, selects,
    contenteditable, anything matching `ARROW_CONSUMING_SELECTOR`
    (combobox/menu/tablist/grid/slider roles, or an explicit
    `data-arrow-keys="own"`), modified or already-handled keypresses,
    nested scrollers, and — rescanned at most every 200ms — any page that
    has a second visible scroll region, which is what suspends it while a
    detail panel, dropdown or dialog is open. Guards are covered by
    `__tests__/use-arrow-key-scroll.test.tsx`; note jsdom lays nothing out,
    so a test element must state `scrollHeight`/`clientHeight` and
    `getClientRects` itself.

## Testing & verification

- `npm test`: Vitest unit tests. Cover: DB transaction semantics
  (`db-transaction.test.ts`), sync engine behavior
  (`sync-engine.test.ts`), stock audit math (`stock-audit.test.ts`), query-key
  factory shape (`query-keys.test.ts`), and various calculation/parsing
  utilities.
- `npm run test:e2e`: Playwright, full user flows (auth, sales lifecycle,
  procurement, products, dashboard, expenses, customers). Since a fresh
  browser context starts with an empty IndexedDB, don't rely on network
  interception or the "Setup New Store" flow for initial state — a
  `global.setup.ts` script pre-seeds `idb-keyval` with a dedicated test
  account (`admin@dumosrx.com`, PIN `1234`) and mock data once; test files
  import `test`/`expect` from `e2e/fixtures.ts` (not `@playwright/test`
  directly) to inject that seeded database via `window.restoreDatabase()`
  before navigating. Avoid `page.goto()` for internal navigation (forces a
  full reload, resetting SPA state); click through sidebar links instead.
  New pages should get E2E coverage alongside the existing core set
  (Dashboard, POS, Inventory, Customers, Procurement, Expenses, Reports) so
  the whole app stays covered, not just the area you're adding.
- `npm run test:schema`: diffs local SQLite schema against the Laravel
  backend's live MySQL schema. Requires the sibling `../laravel-server` repo
  and a working `php artisan tinker` in it.
- **There is no substitute for exercising a change in the actual app** for
  anything touching a live screen. This session's convention has been:
  start the dev server (`npm run dev`, already runs on `:3000` in most
  sessions, check before starting a second one), drive it via the
  claude-in-chrome browser tools, and actually click through the flow
  rather than trusting `tsc`/tests alone for UI-shaped changes. If you edit
  files while the dev server is mid-session and hit a `Rendered more hooks
  than during the previous render` error that traces into Next's *router*
  internals (not your component), that's stale Fast Refresh state after
  adding/removing files. Ask for (or do, if permitted) a dev-server
  restart rather than debugging it as a real bug.
- `npm run lint` (ESLint) and `tsc --noEmit` (no dedicated script currently,
  run `npx tsc --noEmit -p .`) before considering non-trivial changes done.
- These are no longer advisory. `.github/workflows/checks.yml` runs
  `npm ci --legacy-peer-deps`, `npx tsc --noEmit` and `npx vitest run` for
  `client/` and `php artisan test` for `laravel-server/`, and every deploy
  and release workflow calls it as a `needs:` gate — a red check stops the
  deploy, it does not just annotate it. `next.config.mjs` no longer sets
  `typescript.ignoreBuildErrors`, so `next build` type-checks too. Running
  both locally first is still the fast path; CI is the backstop.

### Tests pin the timezone: `TZ=Africa/Lagos`, set in `vitest.config.ts`

This app's date handling is deliberately **local-time**, because "local" means
the timezone the till is physically standing in: `parseLocalDateOnly()`
(`lib/utils/date-utils.ts`) builds a `Date` from the components of a bare
`YYYY-MM-DD` so it lands on *local* midnight rather than UTC midnight, and
every month/day/hour bucket in `lib/db/queries/reports.ts` carries SQLite's
`'localtime'` modifier so reports agree with the dashboard and daily close.
Both of those are fixes for real shipped bugs, and the tests covering them
(`__tests__/date-utils.test.ts`, `__tests__/finance-reports.test.ts`) assert
behaviour that only distinguishes the fix from the bug **at a UTC-offset day
or month boundary** — a sale at `2026-01-31T23:30Z` is February in Lagos and
January in UTC.

Those tests were written on WAT machines and silently depended on the runner
being UTC+1. GitHub Actions runs UTC, so its very first run of
`.github/workflows/checks.yml` turned four of them red while every local run
stayed green. `vitest.config.ts` therefore sets `process.env.TZ =
'Africa/Lagos'` at module scope — before Vitest forks its workers, so they
inherit it — which makes the whole suite's pass/fail independent of the
machine running it, for `npm test`, a bare `npx vitest run`, and CI alike.

The rule that follows: **a test asserting local-time behaviour may rely on the
pinned `Africa/Lagos` offset, but must never rely on the host's timezone.**
Don't "fix" such a test by rewriting its expectation to whatever UTC produces
— that just moves the fragility to "green in CI, red on every dev machine".
And don't remove the `TZ` line: SQLite's `'localtime'` and JS's local getters
both read the process timezone, so dropping it silently reintroduces the
split.

### Named capture groups need `new RegExp(...)`, not a regex literal

`tsconfig.json` sets `"target": "ES6"`, and TypeScript rejects a regex
*literal* containing a named capture group under that target (`TS1503:
Named capturing groups are only available when targeting 'ES2018' or
later`). The runtime supports them fine — only the literal syntax is
checked. So anywhere a pattern needs named groups (the assistant's
`IntentDefinition.phrases`, whose captures feed `buildArgs`, is the main
case), build it with `new RegExp("...(?<name>...)...")` instead of `/.../`.
Don't raise the compile target to work around this.

### `TOOL_REGISTRY` entries need an explicit cast

`lib/assistant/tools/index.ts` types the registry as `ReadonlyMap<string,
AssistantTool>` — i.e. `AssistantTool<Record<string, unknown>, unknown>` —
because the router only ever has an untyped `args` bag and an opaque
result to hand around. A concrete tool is declared with its own argument
and result types (e.g. `AssistantTool<{ topic: string }, HelpTopic |
null>`), and under `strictFunctionTypes` that is **not** assignable to the
registry's element type: `execute`/`format` are property-style function
types, so their parameters are contravariant and `Record<string, unknown>`
is not assignable to `{ topic: string }`. Registering a tool therefore
goes through an explicit `as unknown as AssistantTool` at the map entry,
which is also where a tool's own signature stays precise for its direct
callers and its tests. Don't "fix" a new tool's registration by widening
its declared argument type to `Record<string, unknown>` — that throws away
the typing inside `execute`/`format` — and don't loosen the registry's
element type to `any`.

### "All tests passed but the run still exited 1"

Vitest fails the whole run when it catches a **process-level** unhandled
rejection or uncaught exception, independently of any assertion. The summary
then reads `Test Files 312 passed / Tests 1708 passed` followed by
`Errors 1 error` and exit code 1, and the offending stack is printed in an
`Unhandled Errors` block **above** the summary — always scroll up to it
before theorising, and note the `This error originated in "<file>"` line,
which names the test file that was running, not necessarily the file at
fault.

These are timing races, so they reproduce on a loaded CI runner and almost
never locally, and the same commit can be green on one trigger and red on
another. Two have happened so far, with different mechanisms:

1. **2026-09-28, after `fe374fe5`** (the `audit_logs` retention prune). The
   prune runs from `sync()`, so `sync-skips-when-offline.test.ts` and
   `sync-blocked-during-impersonation.test.ts` suddenly reached real sql.js,
   whose Emscripten `abort()` escapes *outside* the awaited promise chain —
   the `.catch()` on `pruneSyncedAuditLogs()` in `sync-engine/index.ts`
   cannot catch it. Fixed in `036829f2` by mocking `@/lib/db/retention` in
   those two files rather than trying to catch an uncatchable abort.
2. **2026-09-29.** `ReferenceError: window is not defined` thrown from
   `Timeout._onTimeout` in `node_modules/input-otp`, through React's
   `dispatchSetState` → `resolveUpdatePriority`. `input-otp` schedules three
   `setTimeout`s (0ms / 10ms / 50ms, its `syncTimeouts` helper) per OTP-input
   mount, each ending in a `setState`, and **clears none of them on
   unmount**. A test file that finishes while one is still pending has it
   delivered after Vitest has torn that file's jsdom environment down, so
   React reads a `window` that no longer exists. Nothing to do with promises
   at all, despite the identical symptom. Fixed by
   `__tests__/helpers/input-otp-timers.ts`'s `drainInputOtpSyncTimeouts()`,
   an `afterAll` that waits out the longest of those timers while `window` is
   still alive; called from `pin-entry-lockout-ui.test.tsx` and
   `staff-form-group-dropdown.test.tsx`, the only two files that mount an OTP
   input. **Any new test file that mounts `components/ui/input-otp` (directly
   or via PinEntry / StaffFormFields / ConfirmDialog's PIN step / LockScreen
   / the register step) must call it too.**

The general rule both share: **fix the thing that leaks the async work, at
the file that leaks it.** Do not add a blanket `unhandledRejection` /
`uncaughtException` swallower to `vitest.config.ts` — that detector is
exactly what would catch a real production fire-and-forget rejection, and
silencing it globally trades one flaky check for a whole class of invisible
bugs. A useful sanity check while hunting one of these: reproduce it
deliberately by deleting `globalThis.window` in an `afterAll` and waiting a
few hundred ms, which turns the race into a deterministic failure.

## Assistant tool authorization (`lib/assistant/permission-gate.ts`)

Every assistant tool call passes through `authorizeToolCall(tool, ctx)`,
which returns `{ ok: true }` or `{ ok: false, reason }`. It is the single
gate: no signed-in `ctx.user` denies everything, a tool with no
`requiredPermission` is open to any signed-in user, and a gated tool is
checked with `hasPermission(user, permissionGroup, requiredPermission,
"any")` — so `requiredPermission` may be an array and any one key suffices,
and `store_owner`/`super_admin` keep the blanket allow `hasPermission`
already gives them everywhere else. Don't reimplement the role/fallback
logic here or gate tools ad hoc inside `execute`; declare
`requiredPermission` on the tool and let the gate do it, so the router can
answer with a `denied` reply instead of running the query.

**The one accepted exception: a permission that shapes an answer rather
than gating it.** `inventoryStatusTool` calls `hasPermission(…,
"view_cost_fields")` inside its own `execute()` and uses the result only to
decide whether the reply mentions total stock value; the counts themselves
are open to any signed-in user. Declaring `view_cost_fields` as the tool's
`requiredPermission` would instead refuse the whole "what's low on stock"
question to every cashier, which is the wrong answer. The rule is therefore
"the gate is the only place that *denies* a call" — a tool may still read a
permission to redact part of its own result, and when it does it must not
put the redacted value in the result object either (the tool zeroes
`stockValue` when the check fails, rather than trusting `format` to skip
it).

## Assistant routing pipeline (`lib/assistant/router.ts`)

`answer(utterance, ctx, brain?)` is the single entry point every assistant
turn goes through, and it is deliberately the only place that decides *what*
to say: a brain resolves the utterance to a `BrainOutcome`, the router turns
that outcome into an `AssistantReply`. The default brain is
`intentRouterBrain` (`intent-router-brain.ts`: normalize → `matchIntent`
against `INTENTS` → `buildArgs`); the parameter exists so tests can inject a
stub brain and so a future brain can be swapped in without touching the
reply/authorization/error handling around it.

- **`buildArgs` receives the normalized utterance as its own argument**, not
  smuggled through `captures`. A date-taking intent re-parses the full
  sentence with `parseDatePhrase`; it must not have to cast a magic key out
  of the captures bag.
- **Ambiguous candidates carry `{ tool, label }` only.** Disambiguation
  renders text ("Did you mean: … or …?"), it never runs a tool, so building
  full `ToolCall`s for candidates would be dead weight — and the reply names
  the human-readable `label`, never the internal tool name.
- **Errors never escape.** A throwing `execute()`/`format()` returns
  `buildErrorReply()` and logs via `devLog` only. This path writes no
  `audit_logs` row and calls no `logCrash()`: the assistant is a read-only
  convenience surface, and a crash report that itself becomes a syncable
  row is the exact shape of the A-27 incident above.
- **`REROUTE_ON_DENIAL` (`router-reroutes.ts`) is the one exception to "a
  denied call ends the turn".** It maps a tool name to a narrower fallback
  tool tried when the first is denied and the fallback *is* permitted — the
  cashier case: a sales-shaped question from a user without `view_reports`
  is answered with their own sales rather than refused. It ships empty and
  is populated as such pairs appear. The reroute is only ever a
  *narrowing*, and it must not silently answer a different question than
  the one asked: if the denied call carried a `date` arg that isn't
  `ctx.now`'s date, the rerouted reply appends an explicit note saying so.
  Keep that note — dropping it turns "you can only see today's, yours" into
  a confidently wrong answer about yesterday.
- **`TOOL_REGISTRY` is imported statically** here and in
  `fallback-replies.ts`. Nothing under `tools/` imports back from
  `router.ts`, so there is no cycle needing a dynamic `import()`.

**Testing gotcha: `store_owner` is not a useful role for a denial test.**
`hasPermission()` blanket-allows `store_owner`/`super_admin` regardless of
the permission group, so a test that expects `authorizeToolCall` to *deny*
must use a non-privileged role (e.g. `sales_staff`) with a
`permissionGroup` that lacks the key. Given a `store_owner` ctx the gate
returns `ok`, the tool runs, and the assertion fails against a perfectly
correct router.

## Assistant data tools (`lib/assistant/tools/inventory-tools.ts`)

A data tool reads the local database through the same query layer the UI
uses — `productStockTool` calls `getProductsWithStock()` and ranks the
catalog with `searchProducts()` from `lib/utils/search.ts` rather than
writing its own `LIKE` query, so the assistant's idea of "which product did
you mean" is the same one the POS search bar has (exact → starts-with →
token → fuzzy fallback, in that order), and a tie is reported as
alternates instead of silently picking one. Tools stay read-only: nothing
under `tools/` calls `insert`/`update`/`softDelete`.

`inventoryStatusTool` is the aggregate counterpart: `getStockBatchStats()`
for the low/critical/expiring/expired counts and the valuation, plus
`getLowStockAlerts()` for the (already `LIMIT 5`) named items, so the
assistant's numbers are the same ones the dashboard cards show. Note
`getStockBatchStats()` returns **a single row object, not an array** — it
already does `result[0]` internally, so destructuring it as `const [stats]`
yields `undefined`. It takes `ctx.expiryWarningDays` so "expiring soon"
means the same window as the store's own setting.

**Testing a data tool: seed the real schema, not the migrated one.**
`__tests__/assistant-inventory-tools.test.ts` is the reference harness — a
throwaway sql.js database running `SCHEMA_SQL`, injected via
`core.__setDatabaseForTesting()`. The trap is that `SCHEMA_SQL`'s
`CREATE TABLE products` / `CREATE TABLE stock_batches` have **no
`store_id` column**: it is one of the columns added at runtime by
`SYNC_COLUMN_MIGRATIONS` (`lib/db/schema-migrations.ts`), and
`__setDatabaseForTesting()` deliberately bypasses that migration pass. An
`INSERT ... (store_id, ...)` against a bare `SCHEMA_SQL` database therefore
throws `table products has no column named store_id`. Either run the
migrations too, or — simpler, and what this test does — call
`core.setActiveStoreId(null)` in `beforeEach` so the query's
`storeId ? " AND p.store_id = ?" : ""` branch drops out, and seed rows
without a store.

The same trap applies to `sales`: `SCHEMA_SQL`'s `CREATE TABLE sales` has no
`store_id` column either, so a sales-tool test seeds rows without one and
calls `core.setActiveStoreId(null)` — see
`__tests__/assistant-sales-tools.test.ts` and the older
`__tests__/get-recent-sales-date-range.test.ts`. Two further column facts
that bite when seeding it: `transaction_number` is `UNIQUE NOT NULL` (every
seeded row needs its own), and the money column is `total_amount`, not
`total`.

## Assistant sales tools (`lib/assistant/tools/sales-tools.ts`)

`mySalesTodayTool` ("my sales today") answers for the signed-in user only:
it passes `ctx.user?.id` and a `{ from, to }` of `toDateOnly(ctx.now)` to
`getRecentSales()`, so the day boundary is the store's local calendar day
and the filtering happens in SQL (the undated form of that query caps at
`LIMIT 100`, which would silently drop a busy cashier's earliest sales —
`get-recent-sales-date-range.test.ts` pins this). The reported total is
**net**: each row goes through `calculateNetSaleAmount(total_amount,
total_refunded)`, `total_refunded` being the `returns` subquery
`getRecentSales()` already computes, so a refunded sale doesn't overstate
the cashier's day.

Its `requiredPermission` is `process_sales` — the permission every user who
can ring a sale already has, and the narrow half of the reroute pair the
router's `REROUTE_ON_DENIAL` exists for: a cashier without `view_reports`
asking a sales-shaped question gets their own numbers rather than a refusal.
`getRecentSales()` also filters by `getActiveStoreId()`, so nothing here
needs its own store scoping.

## Running things

```
npm run dev              # Next dev server, 0.0.0.0:3000
npm run tauri dev        # (if configured) desktop app against the dev server
npm run build             # production Next build
npm run release           # scripts/release.ts: version bump + release flow
```

## Online storefront orders (`components/pos/online-orders-modal.tsx`)

Orders placed on the public storefront (`web/app/store/[store_slug]/`) are
fetched from the API, never synced into local SQLite — there is no
`online_orders` table in `lib/db/schema.ts`. Fulfilling one is what turns it
into local data.

**`useFulfillOnlineOrderMutation` writes locally FIRST, in one
`transaction()`, and only then calls the server. Don't re-invert that.** The
original order (server first, local writes after) meant any failure in the
local leg — a SQLite write error, the writer-tab lock, the app being killed
mid-loop, one item of several throwing — left the order server-side
`fulfilled` and therefore hidden from this modal's `pending`-only actionable
list, with no sale recorded and stock never deducted: revenue missing from
every report, inventory permanently overstated, silent and unrecoverable
through the UI. Now a server failure is a retryable error with correct local
books already queued in `_sync_queue`, and a local failure rolls back whole.
The retry is only safe because the server rejects a non-`pending` transition
with a 409. Full writeup: `docs/FIXED_BUGS.md` (SF-P2-5/SF-P3-6).

`apiClient.fulfillOnlineOrder()` sends `payment_confirmed: true` explicitly —
the server no longer infers payment from fulfilment, and "Fulfill & Deduct
Stock" is pressed at the counter as the goods are handed over and the money
is taken. `GET /app/online-orders` is now bounded to 50 newest-first with a
`has_more` flag; the modal renders whatever it's given, so a deeper history
needs a real paginated view.

## Publishing products to the online storefront

`products.show_online` defaults off. Three ways to change it, in increasing
bulk:

1. The per-product switch in `add-product-dialog.tsx`.
2. The **CSV/XLSX importer** (`lib/utils/product-import-export.ts`), which
   handles a `show_online` column with the header spellings owners actually
   type and `parseBooleanValue()`'s accepted values. An unrecognised or blank
   cell returns `undefined` and the product keeps whatever it has — never
   guess, or an ambiguous spreadsheet silently publishes a catalog to a public
   page. The exporter emits `Yes`/`No` under "Show in Online Store", the same
   spelling the importer reads, so export → edit → re-import is itself a bulk
   path.
3. The **"Online" dropdown** on the catalog toolbar
   (`components/products/bulk-show-online-action.tsx`), which follows that
   toolbar's existing convention of acting on the **currently-filtered set**
   ("what's on screen", same as Export) and falls back to the whole store when
   no filter is active. Hidden unless `storeProfile.online_store_enabled`.
   `setProductsShowOnline()` skips rows already in the target state so it
   doesn't queue a no-op sync push per product.

There is no row-checkbox bulk-selection pattern in the products table and
none was invented for this; the filtered-set convention already existed. The
spreadsheet reader/writer plumbing lives in `lib/utils/spreadsheet-io.ts` and
is re-exported from `product-import-export.ts` (that file was over the
350-line limit); import either path, they're the same symbols.

Changing `show_online`, `selling_price`, `name` or `is_active` server-side
dirties the owning store's storefront and schedules a full static rebuild
(~15 minutes at best) — see `laravel-server/AGENTS.md`. The UI copy says as
much, so don't promise instant updates anywhere.

## Online Payments settings panel (`components/settings/store/online-payments-section.tsx`)

Lets a store owner connect a Paystack subaccount so the storefront's `paystack`
checkout option (`web/`) becomes available — country select, bank select
(populated from `GET /store/payment-banks`), account number, an inline
"resolve" confirmation step, then `POST /store/payment-account`. Wired into
the Payment Methods settings panel alongside the existing
`PaymentAccountsCard`.

Two states, one component: a store whose pulled `storeProfile` already has a
`paystack_subaccount_code` gets the read-only **connected** view (bank code +
`****last4`, "contact support to change your bank details"), never the
onboarding form again — changing banks is deliberately a support path, and the
server 409s a second `POST /store/payment-account` anyway. The last-4 and bank
code are synced down for exactly this display.

**"We can't verify this" is not the same as "this account number is wrong."**
`POST /store/payment-account/resolve` returns `verifiable` alongside
`account_name`: `false` means Paystack has no resolver for that country at all
(Kenya/South Africa/Rwanda/Côte d'Ivoire) and is the **only** case where the
"I have double-checked these details" override may be offered — the server
refuses `confirmed_unverifiable` for a verifiable country (Nigeria/Ghana),
where a null `account_name` means the details are simply wrong. Never infer
either from a hardcoded country list in this app; the server reports it per
request.

**Never write `paystack_subaccount_code`/`paystack_subaccount_country`/
`paystack_bank_code`/`paystack_account_number_last4`/`paystack_fee_dirty_at`
locally as if this client owns them.** These five `stores` columns exist in
the local schema only so pull sync's dynamic column list doesn't break on an
unknown column (the same reason `storefront_dirty_at`/`store_slug_changed_at`
are mirrored — see `laravel-server/AGENTS.md`'s model `boot()` hooks
section). The subaccount is created **server-side** by
`PaystackSubaccountService::createSubaccount()`, which is the only source of
truth for whether a store has one; this panel's job is to call the
`/store/payment-*` endpoints and then rely on the next pull sync to bring the
real values down, not to write a locally-guessed subaccount code/masked
number into local SQLite and hope it matches. Treat this exactly like the
"server-only bookkeeping column" convention documented in
`laravel-server/AGENTS.md` — writing one of these fields via `insert()`/
`update()` from this client is a bug, not a shortcut.

## Current focus / recent work (update this section as work continues)

Most recent work (2026-09-29, latest) **re-investigated all twelve
catalog-only keys** left by the 2026-09-28 category-by-category pass, on the
premise that some had been dismissed too quickly. Two had: `run_daily_close`
is now wired to the Daily Close banner's backup/sync buttons (which were a
real data-export leak open to cashiers), and `print_product_labels` to a new
"Print Labels" item in the catalog detail panel's overflow menu, which
finally makes the long-finished barcode dialog reachable. The other nine were
confirmed dead and **removed from the catalog** outright.

Two of those nine came straight back the same day, by a different route:
`delete_products` and `delete_suppliers`. The removal finding was correct —
there really was no delete anywhere — but the owner's call was that this is
a **product gap, not a catalog-cleanup item**, so the features were built
(`deleteProduct()` / `deleteSupplier()`, a confirmation dialog each, gated
menu/action-row triggers) and both keys returned with their enforcement in
the same commit. Read their entries in the Inventory & Stock block for the
**deactivate-vs-delete** design: products get a hard guard (stock on hand,
open purchase order) because they have no deactivate state worth the blast
radius of adding one; suppliers get a debt guard plus a signpost to the
Inactive toggle they already have. The same day's other fix retired the dead
`/inventory/batches` route, which now redirects to the Catalog tab.

46 of the catalog's 47 keys now have a real call site; only `view_dashboard`
is catalog-only, and deliberately so. Read the Enforced permissions section —
especially "The category-by-category pass is complete", "Removed from the
catalog (2026-09-29)" and "The dead `/inventory/batches` route" — before
touching a permission key or re-adding a removed one.

Most recent work (2026-09-28, later) worked through a live client's
("Cynthia", construction-materials store) feedback list — see the
Category-picker, Receiving-cost-scale, Enforced-permissions and
Reports-on-screen-view sections above for the durable rules each item
produced. Deliberately skipped, with reasons: the `TabsList` status-filter
rails got no horizontal fade (their active-tab indicator is the cue, same
call as `components/ui/tabs.tsx`); three virtualized lists
(`pos-virtualized-product-grid.tsx`, `transaction-list.tsx`,
`audit-ledger-step.tsx`) got no scroll-to-top button because their scroll
element is owned by a parent/prop rather than the list itself; POS
Transaction History got no cashier filter (scope creep, Report Center now
covers the need); and `purchase_order_items.unit_cost` is still not
rewritten on receipt (see the receiving section for why).


Most recent work (later on 2026-09-23, ~20:35-23:07 — see `git log` for
full detail) was a second, evening bug-fix/small-feature batch working
directly through a store owner's live testing notes, then a full
`/code-review high` pass against the whole batch's diff:

- **Cashier dashboard metrics fixed properly**: the "Today's Sales" card
  was showing store-wide revenue to cashiers even though a separate "My
  Sales Today" card already existed right next to it — replaced with "My
  Transactions Today" (a count, scoped to the cashier). Both cashier-
  scoped cards were then found (by the same review pass) to be built on
  `getRecentSales(user?.id)` called **undated** — `LIMIT 100`, filtered
  for "today" client-side afterward — so a cashier ringing more than 100
  sales in one day had the earliest same-day ones silently dropped by the
  `LIMIT` before the "is today" filter ever ran. Fixed by using
  `getRecentSales`'s existing (previously unused by this hook)
  `dateRange` param, which filters in SQL and raises the cap to 500 — see
  `lib/hooks/use-my-today-sales.ts`.
- **Reseller vs. store-markup sales split**: the "Reseller sale" POS cart
  toggle was being used for two different business things — an actual
  reseller/agent sale (commission owed) and a store staff member simply
  pricing above normal for their own reasons (no commission, the code's
  own long-standing comment called this "the reseller toggle used purely
  as a price-override mechanism"). These now branch at the point of sale:
  new `sales.markup_type` (`'reseller' | 'store'`, default `'reseller'`
  so nothing about existing rows changes), a required choice before
  checkout when the reseller toggle is on
  (`validatePaymentReadiness` in `lib/hooks/use-pos-payment-helpers.ts`
  blocks otherwise), and a store-markup sale is **pre-settled at
  checkout** (no commission computed, `reseller_commission_redeemed`/
  `claim_type`/`redeemed_at`/`by` all set immediately) instead of sitting
  pending until someone remembers to click "Store Claims Markup" later.
  Distinct badges everywhere a reseller badge already showed (violet
  Handshake "Reseller" vs. blue Tag "Store Markup" — POS transaction
  list, dashboard Recent Activity), plus its own Transaction History
  filter, so an owner can audit every staff-applied markup separately
  from genuine reseller business. Gated behind the new `canUseMarkupSales`
  tier-AND-toggle combined gate — see the Licensing/tiers bullet above.
- **Cross-store transfer requests, now admin-controllable**: a new
  `stores.staff_can_request_transfers` toggle (default off, Settings →
  Multiple Stores) decides whether non-admin staff (specialist,
  `sales_staff`) can use the POS header's "Request stock from another
  store" button added in the earlier same-day batch — admin-tier roles
  (`checkIsAdmin`) can always request one regardless. The combined
  role+setting check is `checkCanRequestStockTransfer()`
  (`lib/context/auth-context.tsx`), extracted as a pure function so it's
  unit-testable independent of the plan-tier/store-count checks
  `pos-layout-header.tsx` also applies.
- **Cancellable stock-audit PDF export**: the PDF render already runs off
  the main thread in a Web Worker, so the app wasn't actually frozen at
  "Rendering PDF... (60%)" — but the full-viewport `LoadingOverlay` gave
  no way out, so a large audit read as an unrecoverable hang. Added an
  opt-in `onCancel` to `LoadingOverlay` and threaded an `AbortSignal`
  through `generateReportPdfBlob` (`lib/utils/report-pdf.tsx`) so
  cancelling actually terminates the worker.
- **Stale-chunk auto-recovery** and the **RSC-payload-served-as-a-page
  PWA bug**: see their own sections above.
- **Review-driven fixes worth internalizing as patterns**, beyond what's
  already covered above: (1) a `useEffect` resetting `isResellerSale`/
  `markupType` when `canUseMarkupSales` flips false mid-session — without
  it, a cart that already had the flag persisted true would lose the
  entire row (including its own reset control) while checkout stayed
  blocked, no way out short of discarding the cart; (2) the "Enable
  Markup Sales" settings switch had no plan-tier gate despite a comment
  elsewhere claiming it did — always grep for the actual usage a comment
  describes, don't trust it; (3) **the exact same "new client-synced
  column, no Laravel migration" failure class from the earlier same-day
  batch (see below) recurred immediately** for `sales.markup_type` and
  the two new `stores.*` toggles — see `laravel-server/AGENTS.md`, this
  is now a proven-recurring gotcha, not a one-off.
- **Verification**: full client (`vitest`, 778 tests) and server
  (`php artisan test`, 278 tests) suites green throughout; the server-side
  migration fix was verified by actually running the full migration chain
  against a throwaway sqlite db and checking the resulting columns/defaults,
  not just reviewing the migration file.

Before that, earlier the same day (2026-09-23, see `git log` for full
detail) was a large,
mostly-independent bug-fix/small-feature batch, largely driven by "what's
still annoying a cashier or a store owner" feedback. Notable pieces beyond
what's already covered above:

- **Cashier UX/permission sweep**: last-bought-price column on the
  Catalog (sourced from the most recently received, non-`ADJ-%` stock
  batch — see `getProductsWithDetails()`), customer deletion (soft
  delete, blocked while the customer has an outstanding balance),
  "remove from this device" on login-picker tiles (local-only, doesn't
  touch the account), Expenses surfaced to cashiers, and the profit-hiding
  sweep described in the Cashier visibility section above.
- **Reseller sales merged into Recent Transactions**: the old standalone
  admin-only "Reseller Commission" tab/panel (`FEATURE_ROADMAP_SPEC.md`'s
  2026-09-16/17 entry) is **gone** — reseller sales now show inline in
  `pos-transaction-history.tsx` with a badge + a "Sale Type" filter, and
  the redeem/store-claim actions live directly in
  `TransactionDetailsDialog` (admin-gated). If you find a stale reference
  to `reseller-commission-panel.tsx`, it's dead documentation.
- **Cross-store stock transfer**: a cashier can now request stock from
  another store directly from POS (`pos-layout-header.tsx`, gated on
  `checkCanProcessSales` + multi-store access) — it takes effect
  immediately (pull-only: the destination is locked to their own active
  store, they can't push stock out to an arbitrary one), flagged
  `stock_movements.status = "needs_review"` for the owner to check
  afterward (see the "Needs Review" badge in `stock-movement-*-row.tsx`).
- **Stock audit export**: split the single ambiguous "Print" action
  (PDF-then-`window.open`, which neither printed nor downloaded cleanly)
  into real Print (native dialog via `printNode()` against a hidden
  printable table), Download PDF, and new Export CSV/Excel.
- **Receipt logo position**: per-store "above"/"beside" toggle
  (`stores.receipt_logo_position`), Settings → Receipt.
- **PO fixes**: "Amount Paid" hidden entirely (not just disabled) when
  "Fully Paid" is selected, its submitted value taken directly from the
  order total rather than a possibly-stale field on both create and edit;
  the edit page's `totalAmount` now derives from `getLineTotal()`
  (`item.subtotal` only updates on cost edits, not quantity ones — a
  "Fully Paid" order with an edited quantity was persisting a mismatched
  `amount_paid`).
- **PWA offline precaching** and **audit-log correlation grouping**: see
  their own sections above.
- **Cross-repo lesson, hit live in production**: added a client column
  without its matching Laravel migration + `$fillable` entry breaks sync
  for every device touching that column, permanently, until fixed —
  happened twice in this session alone (`activity_logs.correlation_id`,
  and a years-old pre-existing case, `stock_movements.movement_type`
  being a MySQL `ENUM` that never actually matched the client's values).
  See `laravel-server/AGENTS.md`'s sync-engine section for the fuller
  writeup — read it before adding any new synced column.

Before that, the **Procurement revamp**: replacing one-at-a-time PO item
entry with the Moniebook-inspired bulk ledger table, and splitting
Standard vs. Immediate PO types. Design doc at
`docs/superpowers/specs/2026-08-29-procurement-revamp-design.md`,
implementation plan at
`docs/superpowers/plans/2026-08-29-procurement-revamp.md` (both worth
reading before touching this area again — they carry the "why" behind the
decisions summarized in Domain model essentials above). Key pieces, beyond
what's already covered above:

- `getActiveProductsForPO()` (`lib/db/queries/procurement.ts`) now returns a
  real `AVG(cost_price)` across active batches plus `stock_quantity`,
  fixing a prior bug where "cost" meant "most recently created batch's
  cost" and stock wasn't selected at all.
- `components/procurement/po-review-price-popover.tsx`: per-row sell-price
  + live margin % popover on Immediate Purchase rows, so cost and sell
  price can be set in one pass instead of a separate Product Catalog trip.
- Retired/deleted: `po-add-item-form.tsx`, `po-line-items-list.tsx`,
  `po-order-form-fields.tsx`, `po-summary-pane.tsx` — all superseded by the
  components named in the Domain model bullet above. If you find a stale
  reference to any of these, it's dead documentation, not a hint they still
  exist.

Before that, work focused on the **Inventory** area:

- Purchase order / receiving tables: refactored for readability, fixed
  input-border visibility, made the receive-goods ledger responsive
  (shortened headers on mobile, aligned padding, full-width inputs).
- **Stock audits reworked into a single "Ledger" flow**: removed the old
  Setup step and Standard (one-item-at-a-time) mode entirely. Now opens
  straight into a dense, QuickBooks-style table covering the whole catalog
  at once, with a category filter (top-left, defaults to All) and search as
  pure view filters, not scope gates, so switching categories mid-count
  never loses progress. Added live Diff Qty/Cost/Selling columns and widened
  the layout to 1280px to fit them comfortably.
- Product catalog filters consolidated from a long horizontal chip row into
  `FilterPill` dropdowns (Category, Inventory, including a new "Expiring
  Soon" state distinct from "Expired").
- Category management lives inline in Settings → Store Profile
  (`CategoriesCard`) as a grid of tiles (icon, editable name, live product
  count) instead of a separate "Manage Categories" modal — the modal
  (`manage-categories-dialog.tsx`) is gone. The Catalog page's "Manage
  categories" action now just navigates to Settings → Categories instead
  of opening it.
- Added `last_audited_at` tracking end-to-end (query → type → UI), with a
  staleness banner on the product detail panel.
- Renamed the "Ledger" inventory tab to "Movements" (it shows stock
  movement history, a different concept from the new audit "Ledger" mode,
  and the rename removes the resulting ambiguity).
- Activity Log rebuilt to match the Catalog page's look: search + `FilterPill`
  filters live inside the table's card, search is fuzzy (against action/table/staff),
  and raw rows (`INSERT`/`purchase_orders`) are humanized into sentences
  ("Created a purchase order") via `components/activity-log/describe-activity.ts`.
  Rows are clickable, opening a slide-in detail panel with the parsed audit payload.
- Migrated every remaining raw `<table>` in the app to the div/grid/ARIA
  pattern (`receive-ledger-table.tsx`, `audit-ledger-step.tsx`,
  `activity-log-page.tsx`, `online-orders-modal.tsx`, `customer-behavior-tab.tsx`)
  and added the shared `TablePagination` footer, see the UI conventions
  section above, which used to (incorrectly) describe `<table>` as fine to use.

**Known open threads / natural next steps** (not started, just discussed):
- Settings and Reports areas were flagged for the same
  Moniebook-reference-driven review the Procurement revamp got, but that
  review was deferred ("Procurement first, then settings, then reports" —
  only Procurement has actually happened so far).
- Invoice/attachment upload and a "vendor bill" toggle on Immediate
  Purchases (both present in Moniebook's flow) were explicitly scoped out
  of the Procurement revamp, not forgotten — see the design doc's
  Non-Goals section.
- QuickBooks/Moniebook CSV/XLS catalog import (real reference file:
  `QB POS Inventory Items Export.xls` under `refs/`) is still an open,
  unscoped feature idea from the same requirements-gathering session.

**Also still open, from the 2026-09-23 batch:**
- PO draft persistence resurfaced a UI gap rather than a data one: values
  now round-trip correctly, but nothing surfaces them anywhere except the
  edit screen's ledger table — no read-only summary view shows a resumed
  draft's saved overrides before you open it for editing.
- Audit Log's pagination count is still computed over ungrouped rows, so
  "25 of N" can show noticeably fewer than 25 visible entries on a page
  with a large sale in it (grouping is presentational-only by design, see
  the correlationId section above — the SQL/pagination layer was
  deliberately left untouched, this is the known cost of that choice).
- The PWA precache manifest includes every file in the static export
  (every route's HTML/JS chunks, both sql.js wasm binaries) with no
  curation — fine at current app size, but worth revisiting (a smaller
  "app shell only" manifest, lazy-caching the rest) if the export grows
  enough to make first-install download size a real complaint.

**Also still open, from the later 2026-09-23 evening batch:**
- **Rollout consideration, not a bug**: `markup_sales_enabled` defaults
  to 0, so every existing Pro/Enterprise store that was already actively
  using reseller-commission sales loses the POS "Reseller sale" row the
  moment this ships, until the owner finds and flips the new toggle in
  Settings → Register Configs. Deliberately not "fixed" by defaulting
  existing rows to on — that was an explicit requirement, not an
  oversight — but worth a release note / in-app notice if this actually
  ships, since it's a silent regression from that store's point of view.
- `getRecentSales`'s undated form is still capped at `LIMIT 100` for
  every other caller (`use-pos-data.ts`'s "recent activity" list, the
  base `pos-transaction-history.tsx` view before a date range is picked)
  — only the cashier-scoped "my sales today" path was moved to a dated
  query this batch. Same theoretical undercount risk exists anywhere
  else that reads it undated and a single user/store can exceed 100 rows
  in the relevant window; not fixed elsewhere because no other caller was
  reported as actually hitting it.
- `sw.js`'s catch-all stale-while-revalidate branch was fixed on
  2026-09-26 — see the PWA section above. `sw.js` still has **no test
  coverage** of any kind, which remains the real open item here.
