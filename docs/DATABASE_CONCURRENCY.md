# Database Concurrency (web/PWA build)

Investigation of the single-writer-tab lock, the full sql.js persistence lifecycle, and the
architecture options for replacing whole-blob IndexedDB persistence.

Scope: the **web/PWA build only**. The Tauri desktop/mobile build does not use sql.js or
IndexedDB at all — see [Tauri](#tauri-is-a-different-world-verified) below.

Background and history for the original cross-tab data-loss bug ("C1") live in
`docs/FIXED_BUGS.md:22-28` (the fix that introduced `tab-lock.ts`) and
`docs/FIXED_BUGS.md:9-11` (the follow-up review gap on the rehydrate-failure path). Note that
`docs/KNOWN_BUGS.md`'s current `C1` is an **unrelated** entry (pending Laravel migrations);
the C1 that `tab-lock.ts:2` and `core.ts:198-209` refer to by name has already been closed and
moved to `FIXED_BUGS.md`. This document does not repeat that history.

Everything below marked **(verified)** was read directly out of this repo at the cited
`file:line`. Everything marked **(unverified)** could not be checked from static analysis —
live browser support matrices, OS-level PWA process lifecycles, and actual runtime behaviour
of an installed app on the user's machine. Those are stated as hypotheses, not facts.

---

## 1. Diagnose the current symptom

**Symptom reported:** the PWA is installed and (the user believes) not open; opening DumosRx in
an ordinary browser tab still shows the read-only banner.

### 1.1 What the code actually does

The banner is rendered by `client/lib/db/DatabaseProvider.tsx:229-234` whenever `isReadOnlyTab`
is true. That state is set in two places: once from `isWriterTab()` right after
`initDatabase()` resolves (`DatabaseProvider.tsx:59`), and thereafter from the
`onWriterTabChange` subscription (`DatabaseProvider.tsx:119-126`). The toast with the exact
wording the user quoted comes from `DatabaseProvider.tsx:153-161`, fired by the
`dumos_db_read_only_write_blocked` event that `core.ts:555` dispatches from `assertWritable()`.

So the banner is a direct readout of `writerTab` in `client/lib/db/tab-lock.ts:25`. Tracing how
that gets set to `false`:

1. `initDatabase()` (`core.ts:113`) early-returns if `db` is already set (`core.ts:114`), so the
   election runs **exactly once per document**.
2. On the web path it calls `await initWriterLock(rehydrateFromIndexedDb)` at `core.ts:214`,
   deliberately *before* `runSchemaMigrations` (rationale at `core.ts:198-213`).
3. `initWriterLock` (`tab-lock.ts:92`) bails out to "everyone is a writer" if `navigator.locks`
   is absent (`tab-lock.ts:93-100`).
4. Otherwise it issues **one** request with `ifAvailable: true` (`tab-lock.ts:103-104`).
   - **Lock granted** → `setWriterTab(true)`, resolve the initial-role promise, and return
     `holdForever()` (`tab-lock.ts:105-109`). `holdForever()` is `new Promise(() => {})`
     (`tab-lock.ts:62-64`): the lock is held for the lifetime of the document and is only ever
     released by the browser destroying that execution context (`tab-lock.ts:58-61`). There is
     no `pagehide`/`beforeunload` release path anywhere in the codebase — `tab-lock.ts:61` says
     so explicitly, and a repo-wide grep for `beforeunload`/`pagehide` finds no DB-related
     listener (only `client/components/pwa-registrar.tsx:46` and
     `client/components/settings/billing/subscription-plans.tsx:59`, both `visibilitychange`
     and unrelated to the lock).
   - **Lock not available** (callback invoked with `null`) → `setWriterTab(false)`, resolve the
     initial-role promise, then queue a *blocking* request for the same lock
     (`tab-lock.ts:111-114`). When that queued request is eventually granted it calls
     `onPromoted()` (= `rehydrateFromIndexedDb`, `core.ts:247`), and only on a `true` result
     does it `setWriterTab(true)` and `holdForever()` (`tab-lock.ts:115-129`).

**Therefore: the banner appearing means `ifAvailable` returned `null`, which means some other
same-origin execution context in the same browser profile was holding `dumosrx-db-writer` at
the moment the new tab booted.** There is no code path that shows the banner for any other
reason. The question is only *which* context.

### 1.2 Ranked explanations

#### (a) A live PWA window/process still holding the lock — most plausible (partly unverified)

Web Locks are scoped per origin per storage partition. A desktop Chrome/Edge installed PWA runs
in the **same browser profile and same storage partition** as ordinary tabs of that origin —
which is exactly why `tab-lock.ts` works as a cross-surface lock in the first place, and why
the banner copy at `DatabaseProvider.tsx:232` says "another tab **or window**". So a PWA window
and a browser tab genuinely contend for the same lock. **(verified by design intent in code;
the storage-partition equivalence itself is standard browser behaviour but not something this
repo can prove — (unverified) for the user's specific Chrome/OS build.)**

The failure mode is that the PWA window is *alive but not visible*:

- **Minimized / hidden / behind other windows.** The document is fully alive and holds the lock.
- **macOS app semantics** (the dev machine here is darwin). A Chrome/Edge PWA appears as its own
  Dock app. Closing the last window usually terminates the app, but Cmd-H (hide), Cmd-M
  (minimize), or simply switching away leaves it running with a live document. **(unverified:
  exact per-browser, per-OS window-close→process-exit behaviour.)**
- **A frozen background page.** Chrome's Memory Saver / tab-freezing can freeze a backgrounded
  document. A frozen document is *not* destroyed, so it keeps the Web Lock, and — critically —
  it cannot run any JavaScript to hand it over. The current design has no way to reclaim a lock
  from a frozen holder, because `holdForever()` (`tab-lock.ts:62-64`) never yields and there is
  no `steal` option used anywhere. **(unverified: whether freezing actually applies here on the
  user's setup.)**
- **bfcache.** If the DumosRx document was navigated away from within its own tab/window
  (rather than closed), it may sit in the back/forward cache: alive, JS suspended, lock still
  held. Whether Chrome treats an outstanding Web Lock as bfcache-ineligible could not be
  verified offline — **(unverified)**, but if it does not, this is a silent lock leak that
  survives the user "closing" the app in every sense except destroying the tab.

#### (b) The service worker — ruled out (verified)

`client/public/sw.js` (321 lines) contains **no reference to `navigator.locks` at all**; the
only lifecycle APIs it touches are `self.skipWaiting()` (`sw.js:97`) and `self.clients.claim()`
(`sw.js:157`). It never imports the app bundle — it is a self-contained precache +
runtime-cache worker (`sw.js:46-119` install, `sw.js:121-160` activate, `sw.js:162-321` fetch).
`client/lib/db/*` is never loaded in worker scope anywhere in the repo.

`client/out/sw.js` is a **build artifact**: `/out/` is gitignored (`client/.gitignore:8`),
`git ls-files client/out` returns nothing, and `diff client/public/sw.js client/out/sw.js`
reports no differences. It is a verbatim copy and carries no extra code.

Worth stating the general fact anyway, because it constrains future design: Web Locks **are**
shared across every same-origin context including service workers and dedicated/shared workers.
So a service worker *could* hold `dumosrx-db-writer` — it just doesn't today. Any future move of
sql.js into a worker (architectures (b)/(c)/(e) below) makes the SW/worker a first-class lock
participant and its lifetime a first-class concern.

#### (c) Bugs in `tab-lock.ts` itself

The election logic does not spuriously mark a *fresh, uncontended* tab read-only — the
`ifAvailable` probe is a single non-blocking call and the initial-role promise is resolved
synchronously inside the callback on both branches (`tab-lock.ts:106-107` and
`tab-lock.ts:112-113`). So these are **not** the cause of the reported symptom. They are,
however, real latent defects found during this investigation and are listed here because they
are in the same file:

1. **`.catch()` can promote a read-only tab to writer on stale data (`tab-lock.ts:132-139`).**
   The `.catch` is attached to the *outer* request promise, which does not settle until the
   callback's returned promise settles. On the read-only branch the callback `await`s the inner
   queued request (`tab-lock.ts:114`). If that inner `navigator.locks.request` **rejects** (as
   opposed to `onPromoted()` throwing, which is caught locally at `tab-lock.ts:118-120`), the
   rejection propagates out of the callback, the outer promise rejects, and the `.catch` runs
   `setWriterTab(true)` at `tab-lock.ts:136` — turning this tab into a writer **without holding
   the lock and without having rehydrated from IndexedDB**. That is precisely the C1 data-loss
   shape the module exists to prevent, on a path the module's own doc comment
   (`tab-lock.ts:82-90`) assumes is closed. The `.catch` is correct for a failure of the
   *initial* probe; it should not also cover the promotion path.
2. **Promotion failure leaves the tab permanently read-only and the lock unowned
   (`tab-lock.ts:121-127`).** Returning from the callback releases the lock without re-queuing.
   The UI does tell the user to reload (`DatabaseProvider.tsx:136-143`), but if no other tab is
   queued, the lock sits free while every open tab still believes itself read-only until
   someone reloads.
3. **No holder-side release or handoff.** Reclaiming the lock depends entirely on the holder's
   execution context being destroyed (`tab-lock.ts:58-61`). There is no `steal`, no timeout, no
   heartbeat, and no BroadcastChannel. Against a frozen/bfcached/minimized holder (case (a)),
   the read-only tab has literally no recourse. This is the design gap that makes the reported
   symptom unrecoverable rather than merely annoying.

#### (d) Other candidates

- **A forgotten ordinary tab** in another Chrome window, a pinned tab, or a session-restored
  tab. Same origin, same profile → same lock. The user's mental model ("the PWA is closed")
  does not cover this.
- **Chrome's "Continue running background apps when Chrome is closed"** (tray icon on
  Windows/Linux; less applicable on macOS). Keeps background contexts alive after the visible
  UI is gone. **(unverified for this user's platform.)**
- **`chrome://inspect` / a detached DevTools window** attached to a page can keep that page
  from being discarded. Note DevTools attached to a *service worker* is irrelevant here, since
  the SW holds no lock (§1.2b).
- **Multiple PWA windows** — Chrome PWAs can open more than one window; each is its own
  document, and whichever booted first holds the lock.
- **Ruled out: `print-node.ts`'s hidden iframe** (`client/lib/utils/print-node.ts:45-53`). It is
  a transient, app-bundle-free document created only for printing and removed afterwards
  (`print-node.ts:42-43`); it never calls `initDatabase()`.
- **Ruled out: lock surviving a plain reload.** A same-tab reload destroys the old document
  before the new one's scripts run, so the lock is released and re-acquired. The one narrow
  exception worth knowing about is `pwa-registrar.tsx:60-79`, which force-reloads the tab on
  `controllerchange` after a deploy — a brief, self-correcting window.

### 1.3 Manual verification steps for the user

Run these in the order given; the first one that finds something is the answer.

1. **Chrome Task Manager** — `Shift+Esc` on Windows/Linux, or *Window → Task Manager* in the
   Chrome menu on macOS. Sort by *Task*. Look for any row named after the app (an installed PWA
   appears as `App: DumosRx` or similar) or any `Tab: DumosRx`. A row here = a live document =
   a lock holder. Note its **Process ID** column — you will want it for step 4. Also look for a
   `Service Worker: <origin>` row; per §1.2b it is *not* the lock holder, so seeing one is
   expected and harmless.
2. **`chrome://inspect/#pages`** — lists every live, inspectable page/document including
   installed-PWA windows that have no visible window. This is the surface that catches a
   minimized or frozen PWA the Task Manager row alone doesn't explain. (`#service-workers` on
   the same page lists live SW instances — again, useful for ruling the SW *out*, not in.)
3. **`chrome://discards`** *(optional)* — shows per-tab lifecycle state (Frozen / Discarded).
   A page listed as *Frozen* confirms hypothesis (a)'s frozen-holder variant.
4. **`navigator.locks.query()` in the DevTools console of the read-only tab:**

   ```js
   const s = await navigator.locks.query();
   console.table(s.held);     // who currently holds what
   console.table(s.pending);  // who is queued (this tab should appear here)
   ```

   You should see exactly one `held` entry with `name: "dumosrx-db-writer"` and
   `mode: "exclusive"`, and your own tab in `pending` with the same name. That alone proves the
   diagnosis in §1.1: something is holding it.

   **Correlating `clientId` to a real window.** `query()` gives you only an opaque `clientId`
   string — there is no API that maps it to a tab title, URL, or PID. Practical ways to close
   the gap:
   - **Elimination.** Run the same snippet in the console of *each* live DumosRx context you
     can find via step 2. The one whose own `navigator.locks.query()` shows *itself* in `held`
     (and, unlike your read-only tab, nothing of its own in `pending`) is the holder. If you can
     get a console on it, `await navigator.locks.query()` plus `location.href` and
     `document.visibilityState` identifies it conclusively.
   - **Self-tagging.** In the holder's console, `new BroadcastChannel('x').postMessage(...)`
     round-trips are unnecessary — simpler is to have each context print its own clientId once
     by comparing `query()` results across contexts.
   - **Process-level.** If elimination finds nothing inspectable, the holder is a context you
     cannot reach (frozen, bfcached, or a background process). Then use Task Manager's PID
     column against your OS process list (`ps` / Activity Monitor on macOS) to find and kill the
     stray renderer, or fully quit the PWA app (Cmd-Q on macOS, not just closing the window) and
     reload the browser tab. If the banner disappears after that, hypothesis (a) is confirmed.
   - **Definitive last resort.** Fully quit the browser (all windows *and* the PWA app), reopen,
     and load a single tab. If the banner is gone, the lock was being held by a context that
     survived what the user thought was "closing the app".

**Recommended conclusion to report back:** the lock is almost certainly held by a real, live
DumosRx document the user does not think is open (minimized/hidden/frozen PWA window, or a
forgotten tab), not by the service worker (ruled out at code level) and not by a lock that
"leaked" across a reload. The genuine *code* problem is not that the lock is acquired wrongly —
it is that `tab-lock.ts` provides no mechanism (§1.2c.3) to take it back from a holder that is
alive but unresponsive, and no diagnostics telling the user *which* window to go close.

---

## 2. The full sql.js database lifecycle

### 2.1 Startup

| Step | Location |
| --- | --- |
| `initDatabase()` entry; memoized on module-level `db` | `core.ts:113-114` |
| Tauri branch (see §2.6) | `core.ts:116-157` |
| `initSqlJs({ locateFile })` — WASM fetched from origin root | `core.ts:160-164` |
| Read the one and only blob: `get("dumosrx_db")` via idb-keyval | `core.ts:166` |
| One-time legacy `localStorage` → IndexedDB migration | `core.ts:169-180` |
| `new SQL.Database(savedData)` + `db.run(SCHEMA_SQL)` (idempotent `CREATE TABLE IF NOT EXISTS` pass) | `core.ts:182-187` |
| Corrupt blob → fall back to an empty DB (**the old blob is not backed up first**) | `core.ts:188-192` |
| No blob at all → fresh DB + schema | `core.ts:193-196` |
| Writer election — `await initWriterLock(rehydrateFromIndexedDb)` | `core.ts:214` |
| Schema migrations, with the persist callback gated on writer status | `core.ts:216-218` |

`idb-keyval` is imported in exactly one production file — `core.ts:7` (`import { get, set }`).
Every other `idb-keyval` reference in the repo is a `vi.mock` in a test. **So `core.ts` is the
single writer of the IndexedDB blob** (a real advantage for any of the architectures in §3).

The storage keys are:
- `dumosrx_db` — the live database (`core.ts:166`, `core.ts:251`, `core.ts:284`)
- `dumosrx_db_pre_restore_backup` — one-generation restore undo (`core.ts:830`, `core.ts:851`)

### 2.2 Schema migrations

`runSchemaMigrations(adapter, onLegacyCleared?)` — `schema-migrations.ts:781`. On web it is
called with `makeSqlJsAdapter(db)` and, **only if this tab is the writer**,
`saveDatabase` as the persist callback (`core.ts:218`). `clearLegacyTransactionsOnce`
(`schema-migrations.ts:724-726`) is the destructive one-time step that needs that callback.
The ordering rationale — elect first, migrate second, so a read-only tab can still fix up its
*own* in-memory schema without persisting anything — is spelled out at `core.ts:198-213` and
covered by `client/__tests__/read-only-tab-skips-migration-persistence.test.ts`.

### 2.3 Reads

`query()` — `core.ts:362-497`. Single shared sql.js connection, no reader isolation. Two
concurrency defences already live here and are worth understanding before proposing any change:
- a yield every `QUERY_YIELD_INTERVAL = 200` rows (`core.ts:323`, `core.ts:440-443`) so a large
  result set doesn't block paint, since sql.js runs on the main thread (`core.ts:425-427`);
- a `writeEpoch` torn-read detector (`core.ts:349-360`, checked at `core.ts:454-461`) that
  re-runs a read if a write landed while it was suspended at a yield, plus a
  `closed|finalized|bad parameter|api misuse|allocation failed` retry (`core.ts:485-489`).

These exist *because* sql.js has one connection shared by everything in the tab. Any
architecture that moves the engine off the main thread (§3b/§3c/§3e) makes most of this
machinery unnecessary, which is a real simplification argument.

### 2.4 Writes and persistence — where data loss is still possible

`execute()` — `core.ts:562-592`:
```
assertWritable()            core.ts:582   (throws on a read-only tab; Tauri bypasses)
db.run(sql, params)         core.ts:584
bumpWriteEpoch()            core.ts:588
if (!inTransaction) void saveDatabase()   core.ts:589-591
```

`transaction()` — `core.ts:676-758`: serialized through `transactionQueue` (`core.ts:623`,
reserved synchronously at `core.ts:680-687`), `assertWritable()` at `core.ts:703`,
`BEGIN`/`COMMIT`/`ROLLBACK` at `core.ts:707-741`, and exactly **one** `await saveDatabase()` in
the `finally` (`core.ts:744-747`) instead of one per statement.

`saveDatabase()` — `core.ts:281-304`: `db.export()` (a full re-serialization of the entire
database, `core.ts:283`) then `set("dumosrx_db", data)`. On failure it console.errors and
dispatches `dumos_db_save_failed`, rate-limited to once per 5 minutes
(`core.ts:278-279`, `core.ts:294-302`), surfaced as a toast at `DatabaseProvider.tsx:174-183`.

**Unpersisted-state windows (data-loss exposure):**

1. **Fire-and-forget saves.** `core.ts:590` is `void saveDatabase()` — not awaited. Between
   `db.run()` returning and the `set()` resolving, the write exists only in WASM memory. If the
   tab/process dies in that window (iOS killing a backgrounded PWA is called out explicitly at
   `base-helpers.ts:187-189`), the write is gone. `execute()`'s caller has already resolved
   successfully by then.
2. **Overlapping saves can regress.** Nothing serializes `saveDatabase()` calls. Two
   `void saveDatabase()` invocations from back-to-back `execute()`s each snapshot at a different
   moment; the IndexedDB `set()`s can complete in either order, so an **older** export can land
   on top of a newer one. The blob is not versioned, so this is silent. (Bounded in practice,
   because the next write saves again — but a crash right after an out-of-order save leaves the
   older state persisted.)
3. **The whole transaction body.** Everything written inside a `transaction()` block is
   unpersisted until the `finally` at `core.ts:746`. For a bulk import
   (`client/lib/db/queries/product-import.ts`) or a multi-batch sync push that can be a long
   window. This is a deliberate trade (`core.ts:745`) — one export instead of thousands — but it
   widens the loss window proportionally.
4. **No flush on exit.** There is no `pagehide`/`beforeunload`/`visibilitychange` handler that
   forces a save anywhere in the codebase (grep confirms: the only `visibilitychange` listeners
   are `pwa-registrar.tsx:46` and `subscription-plans.tsx:59`). Nothing tries to shorten
   windows 1–3 when the document is about to go away.
5. **Corrupt-blob fallback discards data.** `core.ts:188-192` replaces an unparseable blob with
   an empty database and then the first write persists that empty database over the corrupt one.
   The corrupt bytes — potentially recoverable — are not snapshotted anywhere first.

### 2.5 Other writers of the IndexedDB blob — including three that bypass the lock

| Path | Location | Honours `assertWritable()`? |
| --- | --- | --- |
| `execute()` | `core.ts:582` | ✅ |
| `transaction()` | `core.ts:703` | ✅ |
| Migration persist callback | `core.ts:218` (gated on `isWriterTab()`) | ✅ |
| `restoreDatabase()` — validates a candidate against a throwaway instance (`core.ts:808-825`), snapshots the outgoing DB to `dumosrx_db_pre_restore_backup` (`core.ts:830`), swaps `db`, then `saveDatabase()` (`core.ts:839-840`) | `core.ts:793-842` | ❌ **no `assertWritable()`** |
| `restorePreRestoreSnapshot()` → `restoreDatabase()` | `core.ts:850-855` | ❌ (inherits the above) |
| `resetDatabase()` — on web calls **`db.run("DELETE FROM …")` directly**, not `execute()` (`core.ts:1210-1215`), then `saveDatabase()` (`core.ts:1221`) | `core.ts:1203-1228` | ❌ **no `assertWritable()`** |
| `clearDatabaseForNewStore()` — same direct-`db.run` shape (`core.ts:1239-1249`), then `saveDatabase()` (`core.ts:1252`) | `core.ts:1234-1258` | ❌ **no `assertWritable()`** |

**This is a real hole in the single-writer guarantee.** A read-only tab showing the banner can
still run Settings → restore-from-backup, factory reset, or "link a new store" and overwrite the
shared blob wholesale — exactly the C1 clobber, from the surface most destructive to a user. The
entry points are `client/hooks/use-settings-sync.ts:67` (export),
`use-settings-sync.ts:116` (web restore), `use-settings-sync.ts:142`
(undo restore), and `client/app/setup/use-onboarding.ts:451` (onboarding local restore).

Read-only export paths, for completeness: `getDatabaseBinary()` (`core.ts:765-768`, web-only,
returns `null` under Tauri) drives the backup download at `use-settings-sync.ts:67`; dev/e2e
escape hatches are exposed on `window` at `core.ts:1141-1160`.

Sync-engine writes all go through the normal helpers and are therefore covered:
`sync-engine/pull.ts:171` / `pull.ts:519` open `transaction()`s and write via `execute()`;
`sync-engine/push.ts:465-470` explicitly batches rejected-item failures into one `transaction()`
to collapse N full `db.export()`s into one (`push.ts:452-458`).

Call-site scale, for the effort estimates in §3: **178** `query(...)` call sites, **51**
`execute(...)` call sites, **23** `transaction(...)` call sites across
`client/{lib,app,components,hooks}`, with 36 `.ts` files under `client/lib/db/`.

### 2.6 Tauri is a different world (verified)

`isTauri()` (`core.ts:78-84`) branches `initDatabase()` at `core.ts:116` into
`@tauri-apps/plugin-sql`, loading a real file-backed database with
`Database.load("sqlite:dumosrx.db")` (`core.ts:125`) and setting
`journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL` (`core.ts:136-138`).

Consequences, all verifiable in code:
- **sql.js is never instantiated** on Tauri; `SQL` stays `null` (`core.ts:24`, only assigned at
  `core.ts:161` and `core.ts:800`).
- **IndexedDB is never touched**; `saveDatabase()` is only called on the non-Tauri paths
  (`core.ts:590`, `core.ts:744-746`, `core.ts:1220-1222`, `core.ts:1251-1253`) and
  `core.ts:149` states plainly that Tauri writes land on disk directly.
- **The writer lock is never engaged.** `initWriterLock()` is called only after the Tauri branch
  has returned (`core.ts:214`), `assertWritable()` returns immediately under Tauri
  (`core.ts:553`), and `tab-lock.ts:12-14` documents the exclusion.
- **Concurrency is handled by SQLite itself**, further constrained by the vendored plugin fork
  capping the sqlx pool at `.max_connections(1)` (`core.ts:667-674`, referencing
  `src-tauri/vendor/tauri-plugin-sql/src/wrapper.rs`).
- Backup/restore is file-level there: `backupDatabaseToFile()` uses `VACUUM INTO`
  (`core.ts:865-897`) and `restoreDatabaseFromFile()` does a WAL checkpoint before copying
  (`core.ts:913-979`).

**The claim in the task brief is confirmed: essentially none of the concurrency problem in this
document applies to the Tauri build.** That matters for §3 — any web-side rearchitecture must not
regress the Tauri path, and the cheapest way to guarantee that is to keep the change entirely
inside the `!isTauri()` branches, which are already cleanly separated.

---

## 3. Five architectures, assessed against this codebase

### (a) Current Web Lock + graceful handoff

**Design.** A new window that finds the lock taken announces itself on a `BroadcastChannel`. The
current holder (i) `await saveDatabase()`, (ii) acks, (iii) sets itself read-only, (iv) releases
the lock. The new window then acquires the lock normally, and `rehydrateFromIndexedDb()` runs
before any write. If no ack arrives within a timeout, the new window re-requests with
`{ steal: true }`.

**What already exists (verified):**
- The election, the queued request, and the promotion callback — `tab-lock.ts:92-141`.
- `onWriterTabChange` (`tab-lock.ts:42-45`) and `setWriterTab` (`tab-lock.ts:30-34`) already
  drive the UI in both directions: `DatabaseProvider.tsx:119-126` flips the banner and toasts
  "This tab can now save changes." on promotion. **A demoted holder's UI already updates for
  free** — `setWriterTab(false)` fires the same listeners.
- `rehydrateFromIndexedDb()` (`core.ts:247-272`) already does the fresh-read-before-write step,
  already closes the stale instance (`core.ts:261`), and already returns a boolean the caller
  fails-closed on (`tab-lock.ts:121-127`).
- `onPromotionFailed` (`tab-lock.ts:53-56`) + its toast (`DatabaseProvider.tsx:136-143`) is the
  existing pattern for "tell the user to reload".
- The project already uses `window` CustomEvents for cross-layer signalling
  (`core.ts:298-300`, `core.ts:555`), so the UI plumbing idiom is established.

**What is net-new:**
1. A `BroadcastChannel("dumosrx-db-writer-handoff")` in `tab-lock.ts` — new module state, a
   message protocol (`REQUEST_OWNERSHIP` / `ACK_RELEASING` / `RELEASED`), and cleanup.
2. A holder-side handler that must `await awaitSettledTransactions()` (`core.ts:644-646`, which
   already exists for exactly this "wait until nothing is mid-flight" need) then
   `await saveDatabase()` then `setWriterTab(false)` then resolve `holdForever()`. **This is the
   structural change: `holdForever()` (`tab-lock.ts:62-64`) must become a deferred promise with
   an exposed `release()`, since today nothing can ever resolve it.**
3. A challenger-side timeout + `navigator.locks.request(LOCK_NAME, { steal: true }, …)`.
4. Fixing `tab-lock.ts:132-139` first (§1.2c.1) — a steal path makes the inner request far more
   likely to reject (a stolen holder's lock promise rejects with `AbortError`), which today
   would mis-promote a tab onto stale data.
5. Closing the three bypasses in §2.5, or a steal is pointless.

**Files touched:** `client/lib/db/tab-lock.ts` (substantial), `client/lib/db/core.ts` (small —
expose a save-and-quiesce helper), `client/lib/db/DatabaseProvider.tsx` (the prompt UI),
`client/__tests__/tab-lock.test.ts` (extend; it already stubs `navigator.locks` wholesale, see
`tab-lock.test.ts:6-9`, so `steal` and BroadcastChannel both need new stubs). Roughly 4 files,
~150–250 lines. **No change to any of the 178 query / 51 execute / 23 transaction call sites.**

**Failure modes.** Steal is genuinely dangerous: the stolen-from holder's `holdForever()`
promise rejects but its JS keeps running, and unless it reliably sets itself read-only *before*
the new holder starts writing, both tabs can export concurrently. Mitigation: the challenger must
wait one full save-cycle after stealing and must re-run `rehydrateFromIndexedDb()` — but if the
victim was frozen mid-transaction, whatever was in its `transaction()` block (§2.4 window 3) is
lost regardless. That loss is *silent*. Also: a frozen holder that later thaws will believe it is
still the writer; it must re-check via `navigator.locks.query()` or a broadcast on
`visibilitychange` before writing.

**Performance.** Unchanged — same one-DB-per-tab, same full-blob export. This fixes the
*usability* symptom, not the O(database size) save cost.

**Compatibility.** Web Locks `steal` and `BroadcastChannel` are broadly available on desktop
Chrome/Edge, installed PWA, Safari, and Android Chrome **(unverified — needs a live check,
particularly `steal` on Safari)**. Tauri: not engaged at all (§2.6).

**Suggested UI copy.** Replace the banner at `DatabaseProvider.tsx:229-234` with an actionable
prompt:

> **DumosRx is already open in another window.**
> Only one window can save changes at a time.
> [ Use this window instead ] [ Keep read-only ]

On clicking *Use this window instead*, while waiting:
> Saving and closing the other window's session…

On success, in the new window: reuse the existing promotion toast, "This tab can now save
changes." (`DatabaseProvider.tsx:123`).
In the old window (via `onWriterTabChange(false)`):
> **This window is now read-only.** Your work was saved. DumosRx is now active in another window.

On timeout/steal:
> The other window isn't responding. Taking over here — if it had unsaved changes, they may be
> lost. [ Take over anyway ] [ Cancel ]

### (b) SharedWorker owning the single sql.js instance

**Design.** One `SharedWorker` instantiates sql.js, owns `db`, owns `saveDatabase()`, and every
tab proxies `query`/`execute`/`transaction` over `port.postMessage`.

**Implementation.** The proxy boundary is remarkably clean here: `query()`, `execute()` and
`transaction()` are the *only* things the rest of the app touches (`core.ts:362`, `core.ts:562`,
`core.ts:676`), re-exported through `local-database.ts:8` and `index.ts:5-12`. But
`transaction(fn)` takes a **callback that runs in the caller** (`core.ts:676`) and does several
awaited `query`/`execute` round-trips inside it — that cannot be shipped to a worker. Each of the
23 `transaction()` call sites would have to either keep the lock in the worker for the duration of
the callback (round-tripping every inner statement, with the worker holding `BEGIN` open across
untrusted latency) or be rewritten as a declarative statement list. That is the expensive part.

Also needing rework: the torn-read/yield machinery (`core.ts:323-360`, `core.ts:440-461`) becomes
obsolete but must be deleted carefully; `__setDatabaseForTesting` (`core.ts:74-76`) and the
`window.*` hooks (`core.ts:1137-1160`, used by `client/e2e/fixtures.ts:71-82` and
`client/e2e/global.setup.ts:55-63`) all assume an in-process `db`; and every one of the ~90
`vi.mock("idb-keyval")` test files assumes the current synchronous-ish shape.

**Rough size:** new worker entry file, a message-protocol module, rewrite of `core.ts`'s public
surface, review of all 23 `transaction()` sites, e2e fixture rework. Materially larger than (a) —
call it a multi-day project, not a fix.

**Data-integrity.** Strictly better on the *tab-coordination* axis: one engine, one writer, no
election needed, so C1 is structurally impossible. But the whole-blob export problem is
unchanged (§3d), and a new failure class appears: **the browser can terminate a SharedWorker at
any time** (memory pressure, all ports closed, idle). A termination mid-transaction loses
everything since the last save. Recovery needs every tab to detect `port` death, respawn, and
re-hydrate — and the app must handle "your last operation may or may not have committed".

**Performance.** Good: the engine leaves the main thread, so the yield hack at `core.ts:440-443`
goes away and a 1900-row `getProductsWithDetails()` (called out at `core.ts:341-343`) no longer
blocks paint. But every row now crosses a structured-clone boundary; for thousands of rows that
is a real, measurable cost that partly offsets the win.

**Compatibility — the deciding factor.** SharedWorker is supported on desktop Chrome/Edge and
Firefox. **Android Chrome has historically not supported SharedWorker, and Safari dropped and
later restored it. (unverified — this must be checked against live data before anyone commits to
this design.)** If Android Chrome still lacks it, this option is disqualified outright for a POS
app that runs on Android handhelds, or requires shipping (c) as a fallback anyway — in which
case just ship (c). Tauri: unaffected (§2.6).

### (c) Leader-tab proxy over BroadcastChannel (no SharedWorker)

**Design.** Same proxy layer as (b), but the "single instance" is the tab that holds
`dumosrx-db-writer`. Followers send `{id, sql, params}` over `BroadcastChannel`; the leader runs
it against its live `db` and replies. Leadership already transfers correctly when the leader
closes — `tab-lock.ts:114-130` plus `rehydrateFromIndexedDb()` (`core.ts:247`) is precisely that
mechanism.

**vs (b).** Same proxy work at the `core.ts` boundary, same `transaction()` callback problem, but
with **universal browser support** (BroadcastChannel + Web Locks are available everywhere
SharedWorker is *not*), and it composes with what `tab-lock.ts` already does instead of replacing
it. Costs relative to (b): the engine stays on the leader's main thread (so `core.ts:440-443`'s
yielding is still needed, and a heavy query in a follower janks the *leader*'s UI), leadership
handover mid-flight must be handled (in-flight requests need replay or rejection after a leader
dies — nothing like that exists today), and the leader tab becomes a performance single point of
failure.

**Data-integrity.** The big structural win over today: followers stop having their own divergent
in-memory copies entirely, so there is nothing to clobber. The rehydrate-on-promotion step
(`core.ts:247-272`) becomes a full DB reload on every handover — correct, but on a large blob a
visible stall for every tab. A leader dying mid-`transaction()` loses that transaction (§2.4
window 3) with followers unaware.

**Effort.** Comparable to (b) minus the worker plumbing: new broadcast RPC module, `core.ts`
public-surface rewrite, the 23 `transaction()` sites, and a real story for in-flight requests at
handover. Also multi-day.

### (d) Optimistic versioning / CAS on the persisted blob

**Design.** Store `{ version, bytes }` instead of bare bytes at `dumosrx_db`. Every
`saveDatabase()` re-reads the stored version and refuses to write if it differs from the version
this tab loaded.

**Implementation is genuinely small.** `saveDatabase()` is 24 lines (`core.ts:281-304`) and the
key is read in exactly three places (`core.ts:166`, `core.ts:251`, `core.ts:284`) from one file.
Plus a compare-and-set wrapper — note idb-keyval's `set()` is not atomic across a read-modify-write,
so you'd want `update()` or a raw IDB transaction. Realistically one file, ~60 lines, plus a
migration to read old bare-`Uint8Array` blobs (`core.ts:166` already handles a
`localStorage`→IDB shape migration at `core.ts:169-180`, so the pattern exists).

**What it can and cannot do.** Work through the concrete scenario:

> Tab A and Tab B both load blob v5 (say, because the Web Lock failed, or because one of the
> §2.5 bypass paths let a read-only tab write). Both now hold a full, independent 40 MB SQLite
> image in WASM memory, both labelled "derived from v5".
>
> 09:00:00 — Tab A records a sale: `INSERT INTO sales`, `INSERT INTO sale_items`,
> `UPDATE stock_batches`, `INSERT INTO _sync_queue`, `INSERT INTO audit_logs` — one
> `transaction()` (`core.ts:676`), one `saveDatabase()` in its `finally` (`core.ts:746`).
> CAS succeeds: v5 → v6.
>
> 09:00:04 — Tab B receives a purchase order: its own `transaction()` writes
> `purchase_order_items`, new `stock_batches` rows, `stock_movements`. It calls `saveDatabase()`,
> reads the stored version, sees **v6 ≠ v5**, and refuses.
>
> Now what? Tab B's in-memory database contains (a) everything from v5, (b) Tab B's receiving
> writes, and — crucially — **not** Tab A's sale, because the two engines never shared anything.
> Tab A's v6 contains the sale but not the receiving.

The three available responses are all bad:

1. **Discard Tab B's writes and reload from v6.** The receiving silently vanishes after the UI
   already confirmed it. CAS has converted a silent *clobber* into a silent *rollback* — strictly
   better (v6's sale survives) but still user-visible data loss, and the stock movements were
   already queued for sync in `_sync_queue`.
2. **Let Tab B win** — that's today's behaviour, i.e. no fix at all.
3. **Merge.** Impossible with what is persisted. `db.export()` (`core.ts:283`) produces an opaque
   SQLite page image; there is no row-level diff, no per-row version column applicable across
   the whole schema, and no local write-ahead log. `_sync_queue` is *not* a usable replay log:
   it is a server-push queue keyed by `(table_name, record_id, operation, payload)`
   (`core.ts:1312-1316`), it does not cover every table (`LOCAL_WIPE_TABLES` at `core.ts:1170`
   shows what exists), it holds no ordering guarantees suitable for replay against a divergent
   base, and it is itself part of the data being clobbered. Building a real replay log is a
   separate, larger project than any option in this document.

**So: CAS detects divergence but cannot resolve it.** Its honest value is (i) turning a silent
overwrite into a loud, diagnosable error with the §2.4-window-2 out-of-order save bug fixed for
free, and (ii) acting as a *safety net under* the Web Lock rather than a replacement for it —
a "this should never happen, and now we'll know when it does" assertion. As a standalone fix it
is not sufficient.

**Performance.** One extra IndexedDB read per save; negligible next to the full `db.export()`.
**Compatibility.** Universal. Tauri: N/A (§2.6).

### (e) SQLite WASM on OPFS

**Design.** Replace sql.js + whole-blob IndexedDB with the official `sqlite-wasm` OPFS VFS (or
wa-sqlite). Persistence becomes real page-level file I/O: a 3-row `UPDATE` writes a few pages,
not a full 40 MB re-serialization.

**Why this is the only option that fixes the actual root cause.** Every other option manages
contention *around* a whole-blob export. This removes the whole-blob export. It deletes:
`saveDatabase()` entirely (`core.ts:281-304`), the debounce-vs-loss trade-offs in §2.4, the
`db.export()` memory spikes that `push.ts:452-458` already had to work around, and — if the
OPFS `SyncAccessHandle` pooling VFS is used — provides real SQLite file locking across contexts,
which makes `tab-lock.ts` unnecessary rather than merely better.

**Complexity.** The largest of the five. The engine API differs from sql.js's
`prepare/step/getAsObject/run/exec` (used at `core.ts:416-445`, `core.ts:584`, `core.ts:710`,
and throughout `schema-migrations.ts` via `makeSqlJsAdapter`), so `core.ts`'s internals are
rewritten. The OPFS VFS generally **requires a Worker** (`SyncAccessHandle` is worker-only), so
in practice this is (e)+(b) or (e)+(c) — inheriting the proxy-layer cost including the 23
`transaction()` call sites. Plus: `initSqlJs({ locateFile })` (`core.ts:161-164`) and the WASM
binaries in the precache manifest (`scripts/generate-precache-manifest.ts:17-22` includes "the
sql.js wasm binaries") both change; `restoreDatabase()`/`getDatabaseBinary()`
(`core.ts:765-855`) need file-level equivalents (closer to the Tauri ones at
`core.ts:865-979`); and `client/e2e/global.setup.ts:55-89`, which extracts and rewrites a binary
fixture via `window.getDatabaseBinary()`, needs replacing.

**Compatibility (all unverified — must be checked live).** OPFS with `SyncAccessHandle` is
available in recent Chrome/Edge and in Safari 17+/iOS 17+, but Safari's implementation has had
quota and stability caveats, and behaviour in an *installed PWA on iOS* specifically is the
riskiest unknown for this app. Android Chrome should be fine given Chromium parity. **Do not
commit to this without testing on a real iOS PWA install and a real Android handheld.** Tauri:
irrelevant — it already has a real file-backed SQLite with WAL (§2.6), which is, tellingly,
exactly what (e) is trying to reproduce in the browser.

**Migration path for existing users' data.** This is the part that must not be improvised. Every
existing web/PWA user has a `dumosrx_db` blob (`core.ts:166`) and possibly a
`dumosrx_db_pre_restore_backup` (`core.ts:830`). A one-time migration:

1. On boot, check OPFS for the new database file. If present, use it; the migration is done.
2. If absent, `get("dumosrx_db")` from IndexedDB (`core.ts:166`) — exactly as today.
3. If that returns nothing, create a fresh OPFS database and run `SCHEMA_SQL` — a new user, no
   migration needed.
4. If it returns bytes: acquire `dumosrx-db-writer` first (reuse `tab-lock.ts` — the migration is
   itself a write and must be single-writer), then write those bytes verbatim into the OPFS file.
   A SQLite image is a SQLite image; no transformation is needed. Open it, run `SCHEMA_SQL` and
   `runSchemaMigrations` (`schema-migrations.ts:781`) exactly as `core.ts:182-218` does today.
5. Verify before deleting: run the same sanity check `restoreDatabase()` already uses
   (`RESTORE_SANITY_CHECK_TABLES` at `core.ts:775`, checked at `core.ts:810-821`) plus a row-count
   comparison against the source on a few high-value tables (`sales`, `sale_items`,
   `stock_batches`, `_sync_queue`).
6. **Do not delete the IndexedDB blob.** Rename the key (`dumosrx_db_pre_opfs_backup`) and leave
   it for at least one release cycle. Storage quota is already a live concern in this app
   (`core.ts:285-291`, `sw.js:131-140`), so schedule deletion explicitly in a later release
   rather than never.
7. If any step fails, leave the IndexedDB blob untouched and fall back to the sql.js path for
   that user — which means shipping both engines side by side for at least one release. That dual
   maintenance is the real cost of (e), and it should be planned for, not discovered.

A device mid-migration that is killed (iOS backgrounding, per `base-helpers.ts:187-189`) must be
recoverable: because step 6 keeps the source and step 1 gates on the *verified* presence of the
OPFS file, an interrupted migration simply re-runs. Write the OPFS file under a temp name and
rename on success so step 1 can never see a half-written file.

---

## 4. Recommendation

### Short-term (does not remove or weaken `tab-lock.ts`)

The user's actual complaint is "I can't use the app and I don't know why". The lock is doing its
job; what's missing is a way out and a way to see what's happening. Three changes, in priority
order:

**1. Close the three lock bypasses (§2.5) — highest value per line, and a correctness bug today.**
- `client/lib/db/core.ts` → `restoreDatabase()` (`core.ts:793`): add `assertWritable()` before
  the `db.export()` snapshot at `core.ts:829`, so it fails before touching either key.
- `client/lib/db/core.ts` → `resetDatabase()` (`core.ts:1203`): the web branch calls
  `db.run()` directly at `core.ts:1214`, bypassing `execute()`. Add an `assertWritable()` at the
  top of the function (not per-table — you want it to refuse before deleting anything in memory).
- `client/lib/db/core.ts` → `clearDatabaseForNewStore()` (`core.ts:1234`): identical shape at
  `core.ts:1243`, same fix.
- Callers that must handle the new throw: `client/hooks/use-settings-sync.ts:116` and `:142`,
  `client/app/setup/use-onboarding.ts:451`. Ideally the UI disables these actions when
  `useDatabase().isReadOnlyTab` is true (the context already exposes it —
  `DatabaseProvider.tsx:227`) rather than relying on the throw.
- New test alongside `client/__tests__/read-only-tab-blocks-writes.test.ts`, which already
  establishes the pattern for asserting a read-only tab leaves the DB untouched.

**2. Fix the mis-promotion path in `tab-lock.ts` (§1.2c.1).**
- `client/lib/db/tab-lock.ts:132-139`: scope the `.catch` to the *initial* `ifAvailable` probe
  only. Concretely, wrap the inner `await navigator.locks.request(...)` at `tab-lock.ts:114` in
  its own `try/catch` that logs and leaves the tab read-only, so a rejection there can never
  reach the outer `.catch` and call `setWriterTab(true)` at `tab-lock.ts:136` on un-rehydrated
  data. Track whether the initial role has already been decided (a boolean beside `writerTab` at
  `tab-lock.ts:25`) and have the outer `.catch` refuse to promote once it has.
- Extend `client/__tests__/tab-lock.test.ts` with a case where the queued request rejects; it
  already stubs `navigator.locks` wholesale (`tab-lock.test.ts:6-9`), so this is a small addition.

**3. Make the banner diagnosable and actionable, and add a supervised escape hatch.**
- `client/lib/db/tab-lock.ts`: export a `diagnoseWriterLock()` that returns
  `await navigator.locks.query()` filtered to `LOCK_NAME` (`tab-lock.ts:17`), and expose it on
  `window` next to the existing `window.diagnoseLegacySchema` (`core.ts:1137-1139`) so support can
  ask a user to run one command.
- `client/lib/db/tab-lock.ts`: add `takeOverWriterLock()` — an explicitly user-initiated
  `navigator.locks.request(LOCK_NAME, { steal: true }, …)` followed by
  `rehydrateFromIndexedDb()` (reuse `core.ts:247`, do **not** skip it) and `setWriterTab(true)`
  only on a `true` result, mirroring `tab-lock.ts:115-129` exactly.
- `client/lib/db/DatabaseProvider.tsx:229-234`: turn the banner into the prompt drafted in §3a,
  with the *Use this window instead* button calling `takeOverWriterLock()` behind a confirmation
  that names the risk (the other window's unsaved transaction is lost).
- Optionally add the cooperative BroadcastChannel handshake from §3a so the common case (a live,
  responsive holder) is a clean save-then-handoff and `steal` is only the fallback. This is the
  larger half of the work and can land in a second pass.

**Also worth doing cheaply, from §2.4:** serialize `saveDatabase()` calls (chain them on a
module-level promise, the same idiom `transactionQueue` already uses at `core.ts:623-687`) to
close the out-of-order-save regression, and add a `pagehide` handler that fires a final
`saveDatabase()`. Both are inside `core.ts` and touch no call sites. The (d) version counter
fits naturally here too — as an assertion that fails loudly, not as a merge strategy.

**Explicitly not recommended short-term:** removing, loosening, or timing out the lock itself.
Every bypass in §2.5 is evidence that the lock is the only thing standing between this app and
the original C1 clobber.

### Long-term

**(e) SQLite WASM on OPFS, driven from a worker via (c)'s leader-election proxy** — i.e. (e)+(c),
not (e)+(b), because (c) works everywhere SharedWorker's Android Chrome support is in doubt
(§3b) and because it builds on `tab-lock.ts` instead of discarding it.

The justification is specific to this code, not general advice:

- The root cause is visible throughout `core.ts` as accumulated workarounds for one design flaw
  — persistence is a full `db.export()` of the entire database on every write. It forced the
  main-thread yield loop (`core.ts:425-443`), which forced the `writeEpoch` torn-read detector
  (`core.ts:325-360`), which forced the retry loop (`core.ts:454-489`); it forced
  `push.ts:452-458` to batch rejected items specifically to avoid one full re-serialization per
  item; and it forced `base-helpers.ts:186-198` to wrap three statements in a transaction purely
  to collapse three exports into one. Page-level persistence deletes the reason all of that
  exists.
- The target state is already proven inside this product. The Tauri build (§2.6) runs real
  file-backed SQLite with WAL, `busy_timeout`, and `synchronous = NORMAL` (`core.ts:136-138`) and
  has none of these problems. OPFS is the browser's version of that. Converging the two backends
  also shrinks the dual-backend awkwardness that `core.ts:20-26` already apologises for.
- The proxy layer is cheaper here than in most codebases: `query`/`execute`/`transaction` are the
  only public surface (`core.ts:362`, `:562`, `:676`), re-exported from two files
  (`local-database.ts:8`, `index.ts:5-12`), and `idb-keyval` is imported in exactly one production
  file (`core.ts:7`). The one genuinely expensive piece is the 23 `transaction()` call sites whose
  callbacks run in the caller (`core.ts:676`).
- **Sequencing:** do the short-term fixes first; then (c)'s proxy layer *on top of the existing
  sql.js engine*, which is independently valuable and independently testable; then swap the engine
  underneath it to OPFS with the §3e migration. Attempting (e) and the proxy in one change means a
  storage-format migration and an execution-model rewrite landing together on users' only copy of
  their pharmacy's data.

### Explicitly unverified

Stated here rather than buried above, because none of it could be checked from the repo:

- **Which context actually holds the lock on the user's machine.** §1 gives the most plausible
  ranking and the commands to settle it; it is a hypothesis until step 2/4 of §1.3 is run.
- **Whether closing a Chrome/Edge PWA window on macOS terminates the document**, and whether a
  minimized or frozen PWA window keeps its Web Lock in the user's specific browser version.
- **Whether Chrome treats a held Web Lock as bfcache-ineligible.** If it does not, a DumosRx
  document navigated away from within its own tab is a silent, long-lived lock leak.
- **Live browser support for:** `navigator.locks` `steal` (especially Safari), `SharedWorker` on
  Android Chrome (§3b — this single fact decides whether (b) is viable at all), and OPFS
  `SyncAccessHandle` on iOS Safari and in an installed iOS PWA (§3e).
- **Real-world size of a production `dumosrx_db` blob.** Every performance claim in §3 scales
  with it, and no production figure was available. The only in-repo hint is the ~1900-row
  `getProductsWithDetails()` referenced at `core.ts:341-343`.
- **Whether the out-of-order-save race (§2.4 window 2) has ever actually fired in production.**
  It is provable from the code but was not observed.
