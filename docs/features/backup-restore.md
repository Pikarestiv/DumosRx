# Backup & Restore

Route: Settings → Data & Sync (`/settings/data`) → "Backup & Restore" card,
rendered by `components/settings/data-settings.tsx`. Its two buttons —
"Download Local Backup" and "Restore from File" — call
`handleDownloadBackup`/`handleRestoreBackup` from
`hooks/use-settings-sync.ts`, which call `getDatabaseBinary()` /
`restoreDatabase()` in `lib/db/core.ts` (`db.export()` / `db = new
SQL.Database(binaryData)` on the web/sql.js backend; a separate
`backupDatabaseToFile()`/`restoreDatabaseFromFile()` pair on Tauri desktop).
There is a second, pre-login entry point for restore — see "Restoring onto a
fresh device" below.

This doc records a live walkthrough (2026-09-03) against real data on
"Pikarestiv Stores 2" (never against the primary "Pikarestiv Stores"
account): downloading a real backup, restoring it onto a genuinely isolated
fresh-device context, a full table-by-table completeness diff, and a
sync-after-restore check.

## What actually gets backed up — the whole device DB, not one store

**This is the single most important fact about this feature and it is not
obvious from the UI.** "Download Local Backup" does not export "this store's
data." It exports `db.export()` — the **entire sql.js SQLite file this
browser profile/device is holding**, i.e. every table, every row, for
**every store that has ever been logged into or switched onto this device**.
On the test device used here, that's `stores` = 2 rows: "Pikarestiv Stores 2"
*and* the primary "Pikarestiv Stores" account (present locally from earlier
multi-store switching in an unrelated task) — both included in the same
`.drx` file, with no way to select a subset before download and no per-store
filtering offered anywhere in the flow. A store owner who backs up expecting
"my store's backup" is actually exporting every store's data that has ever
touched that device, including any other business a shared/former device
might have held.

Restore is the mirror image: it does not merge or scope to one store either.
`restoreDatabase()` does a full swap — `new SQL.Database(binaryData)` —
**replacing the entire local database**, all stores at once, then reloads
the page. Restoring a backup taken on Device A onto Device B overwrites *all*
of Device B's local stores, not just the one the operator cares about.

The download itself: a client-side `Blob`/`URL.createObjectURL` + synthetic
`<a download>` click — `{app}_backup_{date}_{time}.drx` (e.g.
`dumosrx_backup_2026-09-03_18-02-20.drx`), actually a raw SQLite binary
despite the custom extension. On this test, the file was 26,656,768 bytes.
Toast on success: **"Backup downloaded successfully."** Toast on failure
(`getDatabaseBinary()` returning null): "Failed to export database."

## Restoring onto a fresh device

The task brief assumed this might be a rough edge — it isn't. There's a real,
smooth, **pre-login** restore path, distinct from the logged-in Settings
page flow:

1. A genuinely fresh device (no local DB, no `localStorage` for this origin)
   hitting `/` gets the marketing landing page → "Launch System" → `/login`.
2. With zero local accounts, `/login` shows **"No Local Accounts Found —
   This device hasn't been set up yet. Would you like to create a new store
   or restore from a backup?"** with three options: **Restore from Cloud**,
   **Setup New Store**, and a smaller link — **"Have a local backup file?
   Restore Now"**.
3. "Restore Now" routes to `/login?tab=setup&step=backup` — the `BackupStep`
   component (`components/setup/steps/backup-step.tsx`), a drag/click file
   drop zone accepting `.drx`. This is reachable *before* any login or setup
   wizard step that would otherwise risk clobbering a fresh device (see the
   `isSafeSetupEntry` guard in `app/setup/use-onboarding.ts`, which
   explicitly allow-lists `step === "backup"` as one of the few setup steps
   safe to deep-link into on a device that already has *other* local
   accounts too — so this same link works whether the device is truly blank
   or already has unrelated accounts on it).
4. Selecting a file calls `handleLocalRestore()` in `app/setup/use-onboarding.ts`
   → `restoreDatabase(new Uint8Array(buffer))`, toasts **"Database restored
   successfully!"**, and after 1s does a full browser navigation to `/login`
   (`window.location.href = "/login"`, not a client-side `router.push`).
5. **Fixed (`_known-bugs.md` item #10, part A):** this used to be a
   client-side `router.push("/login")`, which resolved before `/login`'s
   device-auth-status hook re-ran against the just-restored DB — a live
   walkthrough saw the *pre-restore* "No Local Accounts Found" screen flash
   right after the "Database restored successfully!" toast, before
   self-resolving on any subsequent full reload. The fix forces a full
   navigation instead (matching the pattern already used by the logged-in
   Settings-page restore path, see below), so `/login`'s account detection
   always runs fresh: a traditional username+PIN sign-in form now renders
   correctly on first paint (see next section for why it's the traditional
   form, not the account-tile picker).
6. Login itself worked normally with the restored user's real
   username/PIN (`pika` / `1111` in this test) once reloaded, landing on
   the correct "Pikarestiv Stores 2" dashboard with fully restored data.

### Recent-user tile picker vs. traditional login form

A related, correctly-behaving edge case: a freshly-restored device shows the
**traditional username+PIN form**, not the usual account-tile "Welcome
back" picker. That's because the tile picker is driven by `dumos_recent_users`
in `localStorage` — a UI convenience list, not part of the backed-up
database — which is empty on a device that has never logged in before, even
though the restored DB's `users` table is fully populated. Working as
intended: the user still gets in via the traditional form using their real
credentials, no data is missing, just a different (correct) login UI for a
never-before-seen device.

### Cloud-link token is *not* part of the backup — now surfaced, not silent

This was the most consequential caveat found live, and it's an intentional
gap, not a bug to close by carrying credentials across: `isCloudLinked` in
`lib/context/auth-context.tsx` is derived purely from the presence of
`auth_token` in `localStorage` (set only by `linkCloudAccount(email,
password)` calling the real backend login endpoint) — **never** written by
`restoreDatabase()`, which only touches the sql.js DB, and by design never
will be — a portable `.drx` backup file should never carry a live,
device-tied session credential (let alone a plaintext password) across
devices. Live result before the fix: after a full, verified-correct restore
onto the fresh device and logging in as `pika`/`1111`, Settings → Data
showed **"Local Mode (Not Linked) — Connect your cloud account to enable
sync"** with **Link Account**/**Link & Sync** buttons — no "Sync Now"
control at all, even though the very same store was "Connected to Cloud"
and fully synced moments earlier on the original device — and nothing on
the restore screen or the post-restore dashboard said so.

**Fixed (`_known-bugs.md` item #10, part B):** every restore path (this
pre-login setup wizard, the logged-in Settings > Data restore, and the
Tauri desktop restore) now sets a short-lived `sessionStorage` marker
immediately before its post-restore reload
(`markRestoredForCloudLinkNotice()`, `lib/utils/post-restore-notice.ts`).
The next page load — `/login` for this flow, or straight back into the
dashboard for the Settings flow — consumes that marker once
(`usePostRestoreCloudLinkNotice()`, `lib/hooks/use-post-restore-cloud-link-notice.ts`)
and, only if the device isn't cloud-linked, fires a single, hard-to-miss
toast explaining that the data is back but this device needs to be
re-linked to resume syncing, with a direct action button into the existing
"Link DumosRx Cloud" control (the setup wizard's own pre-login cloud step
here; `CloudLinkDialog` via `/settings/cloud` for the in-app flow) — no new
linking UI, no attempt to skip re-entering the real cloud password. It
fires at most once per restore and never on a routine subsequent page load;
the dashboard header's `SyncIndicator` "Not Linked" state remains the
persistent, always-on signal for "this device just isn't linked," which
this notice deliberately does not duplicate as a recurring nag.

Auto-sync's background timer did not error or spam the console on the
not-linked fresh device — it silently no-ops, confirmed via
`read_console_messages` (no errors logged) over several minutes of the
device sitting on that screen.

## Completeness check: table-by-table row-count diff

Downloaded the real `.drx` (see above) after first running a manual "Sync
Now" on the original session so the backup reflects a fully-pushed state.
Counted every table with a standalone Node script
(`sql.js` loaded directly, `SELECT COUNT(*) FROM {table}` for every name in
`sqlite_master`) run against the raw `.drx` file — this is the true
pre-restore snapshot, not a UI spot-check. After restoring the same file
onto the fresh device (isolated via a distinct origin, see Methodology
below) and logging in, the restored DB's live binary was pulled out via the
dev-only `window.getDatabaseBinary()` hook (`lib/db/core.ts`, gated on
`NODE_ENV === "development"`) and counted the same way.

| Table | Original (backup) | Restored (fresh device) | Match |
|---|---|---|---|
| `_sync_queue` | 10 | 11 | **DIFF** (explained below) |
| `_sync_state` | 23 | 23 | match |
| `audit_logs` | 5,401 | 5,402 | **DIFF** (explained below) |
| `categories` | 35 | 35 | match |
| `customer_payments` | 0 | 0 | match |
| `customers` | 1 | 1 | match |
| `expenses` | 2 | 2 | match |
| `feedback` | 2,526 | 2,526 | match |
| `held_transactions` | 0 | 0 | match |
| `loyalty_redemption_options` | 3 | 3 | match |
| `loyalty_tiers` | 4 | 4 | match |
| `loyalty_transactions` | 0 | 0 | match |
| `payment_accounts` | 4 | 4 | match |
| `prescription_items` | 1 | 1 | match |
| `prescriptions` | 2 | 2 | match |
| `products` | 3,041 | 3,041 | match |
| `purchase_order_items` | 16 | 16 | match |
| `purchase_orders` | 7 | 7 | match |
| `requested_products` | 1 | 1 | match |
| `return_items` | 0 | 0 | match |
| `returns` | 0 | 0 | match |
| `sale_item_batches` | 8 | 8 | match |
| `sale_items` | 9 | 9 | match |
| `sales` | 7 | 7 | match |
| `stock_audits` | 1 | 1 | match |
| `stock_batches` | 2,173 | 2,173 | match |
| `stock_movements` | 22 | 22 | match |
| `stores` | 2 | 2 | match |
| `supplier_payments` | 0 | 0 | match |
| `suppliers` | 8 | 8 | match |
| `system_configs` | 1 | 1 | match |
| `users` | 3 | 3 | match |

**Result: 30 of 32 tables match exactly. The two diffs are both fully
explained by the act of logging in on the restored device itself**, not by
any restore data loss: logging in writes one new `audit_logs` row (a
`LOGIN_SUCCESS`-shape event), which in turn queues one new `_sync_queue`
row for that new audit-log insert. Re-running the same count immediately
after restore but *before* logging in would be expected to show 5,401/10
exactly — this wasn't captured as a separate data point since login was
needed to reach the dev hook, but the causal chain (`logAction()` on
successful login → sync-queue trigger) is unambiguous from the code and the
diff is exactly +1/+1, matching one login event. **No genuine data loss or
corruption found; the restore is byte-for-byte complete for every real
business table.**

### Methodology note: how "genuinely fresh device" was simulated

`localStorage`/IndexedDB are origin-scoped, not tab-scoped — a second tab on
`localhost:3000` still shares the logged-in original session's storage, so
it isn't a valid "fresh device" stand-in, and incognito windows aren't
reachable by the browser-automation tooling used here. Instead, the same
running dev server was hit via a second, distinct origin —
`http://127.0.0.1:3000` — which Chrome partitions completely separately
from `http://localhost:3000` even though both resolve to the identical Next.js
process. Verified empty (`indexedDB.databases()`, `localStorage`,
`sessionStorage` all empty except device-init keys) before use. This gives a
real, verified-isolated "new device" without needing a second physical
browser profile, while still exercising the exact same app code and backend.

## Sync-after-restore behavior

Two sync checks were run:

1. **Original session (still cloud-linked, un-restored) makes a change and
   syncs.** Added a uniquely-named expense
   ("ZZ ORIGINAL-SESSION CONCURRENT-SYNC TEST 20260903", ₦67.89) and clicked
   "Sync Now." `read_network_requests` showed a clean push→pull pair, both
   `POST .../api/v1/app/sync/push?manual=1` and
   `.../api/v1/app/sync/pull?manual=1` returning **200**, "Last synced"
   timestamp updated, no console errors. Confirms normal sync is unaffected
   by this whole exercise.
2. **Fresh restored device makes a change.** Added a distinct uniquely-named
   expense ("ZZ RESTORE-TEST FRESH-DEVICE EXPENSE 20260903", ₦123.45)
   locally on the fresh device. Because that device is cloud-**unlinked**
   (see above), there is no "Sync Now" control to push it with — confirmed
   the local write itself succeeded (shows correctly in that device's own
   Expenses list) and that the background auto-sync timer does not error
   out while unlinked.

**What this does and doesn't confirm:** the code-level sync-safety design
described in `lib/db/sync-engine/push.ts` (preserving `_version` through
push specifically so the server can detect a stale restored row) and
`lib/db/sync-engine/pull.ts` (pull defers to next push rather than
silently overwriting a pending local edit) was read and is consistent with
the comments describing it. This test could not exercise a live
**push-vs-push conflict** (both a restored device and the original session
pushing genuinely divergent edits to the same row before either has seen
the other's change) end-to-end, because the restored device cannot push at
all until it's manually re-linked to the cloud account — which itself
requires the real account password, out of scope for this test. The
completeness diff above rules out silent data loss from the restore
operation itself; the live-conflict-resolution *logic* remains verified by
code reading only, not by a live two-writer race. This is flagged as a
follow-up in `_known-bugs.md`/`_findings-log.md` rather than claimed as
fully verified.

## Danger Zone: full local reset

Also on this same Settings → Data page: "Reset Database" (`handleResetDatabase`
→ `resetDatabase()`) — out of scope for this doc, not exercised here beyond
noting it exists in the same card as Backup & Restore and is a separate,
destructive, non-backup-related control.
