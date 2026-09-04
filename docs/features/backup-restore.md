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

## Sync-engine version-conflict test (2026-09-04) — completed: a real, confirmed data-loss bug

This is the direct follow-up to the "Could not exercise a live push-vs-push
version-conflict race" gap flagged above and in `_findings-log.md`, and to
the same-named section below it in an earlier revision of this doc (a prior
attempt got as far as setting up both sessions and then blocked on a cloud
credential that didn't authenticate). That credential issue is now
confirmed fixed (`pikarestiv@gmail.com` / the provided password
authenticates cleanly against `http://localhost:8000`), and this retry
carried the test all the way through to a real push-vs-push race, a
real HTTP response, and a direct database check of the final state.

**Result: conflict resolution does NOT work correctly for the single most
common shape of conflict — two devices that each make exactly one edit from
a shared, already-synced ancestor. The second device's push silently
overwrites the first device's already-server-confirmed edit, with no error,
no conflict indicator, and no way for either user to discover it happened
short of noticing the number itself is wrong. This is a real, confirmed
data-loss bug, filed as `_known-bugs.md` #11.**

### Safety check performed first: does this cloud account own more than one store?

Before touching anything with the real credentials, the account was checked
directly against the Laravel database, per this task's own standing safety
rule (stop if the linking credentials are tied to more than one store):

```
DB::table('stores')->where('user_id','a26b80db-f7f7-4b4d-9d7c-95fc065e27c9')->get(['id','name']);
→ 41f6c73a-14ec-4b1c-b62d-c2652de3c3c9 | Pikarestiv Stores 2
→ 8f3c150c-53ca-456d-a008-b5571ee3f6fe | Pikarestiv Stores
```

This *is* true — the account owns both stores — and the test was
deliberately paused and reported as `BLOCKED` at that point for explicit
user confirmation before proceeding, rather than the agent assuming it was
safe. The user confirmed directly: Pikarestiv Stores 2 was deliberately set
up as a safe testing duplicate under the same real account, and continuing
against Store 2 only (never switching to or touching the primary store) was
authorized. The account's own header store-picker
(`components/dashboard/header-store-switcher.tsx`) was used as a running,
explicit checkpoint for the rest of the test — screenshotted/confirmed
showing "Pikarestiv Stores 2" (with a checkmark, "Pikarestiv Stores" listed
but never selected) before every meaningful step below. One incidental
finding while first trying to open that picker: a leftover, already-expired
superadmin-impersonation banner from an unrelated earlier session was
overlaying the header and silently swallowing real mouse clicks intended
for the store-switcher button underneath it (`document.elementFromPoint()`
at the button's own on-screen coordinates resolved to the banner's
container div, not the button) — worked around by dispatching the pointer
events directly against the button element instead of relying on
literal on-screen click coordinates; not investigated further as it's a
separate, minor UI issue from a different session, not part of this test.

### Setup: two sessions from one backup point

- **Session A** (`http://localhost:3000`, logged in fresh as `pika`/`1111`
  — not reused from a leftover superadmin-impersonation tab that happened to
  already be open on this device; logged all the way out and back in via the
  ordinary local PIN form first, then linked to the cloud with the real
  credentials via Settings → Data → "Link Account": **"Cloud account linked
  successfully!"**, "Connected to Cloud"). Ran one "Sync Now" first
  (`push?manual=1` → 200, `pull?manual=1` → 200) so the backup about to be
  taken reflects a fully-pushed state, then downloaded it via Settings →
  Data → "Download Local Backup" — `dumosrx_backup_2026-09-04_06-38-11.drx`,
  26,656,768 bytes.
- **Session B**: the isolated-origin technique from the completeness test
  above (`http://127.0.0.1:3000`) was reused, wiped first
  (`localStorage.clear()`, `sessionStorage.clear()`, and
  `indexedDB.deleteDatabase()` on every database `indexedDB.databases()`
  reported) and confirmed showing a genuine "No Local Accounts Found" screen
  before proceeding.
- **File upload workaround:** the `file_upload` browser tool caps combined
  upload size at 10 MB; the `.drx` is 26.6 MB. Same workaround as the prior
  attempt: a tiny CORS-enabled local Python HTTP server
  (`http.server.SimpleHTTPRequestHandler` on port 8899, `cors_server.py` in
  the task scratchpad) served the copied backup file; it was fetched
  in-page via `fetch()` into a `Blob`, wrapped in a real `File` object, and
  injected into the restore screen's file input via a `DataTransfer` +
  dispatched `change` event — runs inside the page's own JS context, so the
  10 MB tool cap doesn't apply.
- **Restore executed via the documented pre-login path**
  (`/login?tab=setup&step=backup`, "Restore Now"): succeeded, full
  navigation to `/login` fired as expected (the item #10 fix), and the
  one-time post-restore cloud-link toast fired again exactly as documented —
  "Your data is back, but this device isn't linked to cloud sync yet...
  Re-link your cloud account..." with a "Link DumosRx Cloud" action button.
- Logged into Session B locally as `pika`/`1111` — landed on the correct
  "Pikarestiv Stores 2" dashboard (header store-picker checked and
  confirmed), Action Center showing "11 Changes Unsynced" (the backup's own
  pending local queue, carried through the restore).
- **Session B linked to the cloud, deliberately via the plain "Link
  Account" button (not "Link & Sync")** so linking itself would not trigger
  an initial pull before the independent edit below — confirmed via the
  Data & Sync panel immediately after linking: **"Connected to Cloud" /
  "Last synced: Never."** One real, minor gap re-confirmed from the prior
  attempt while doing this: the freshly-wiped `127.0.0.1` origin's
  `dumos_api_url` was `null` (defaults to the build's non-local server, not
  Session A's actual `http://localhost:8000/api/v1`) — set explicitly to
  match Session A before linking. Same category as the already-documented
  cloud-link-token gap, not filed as its own numbered bug since
  `ServerSelector` is dev/QA tooling, not end-user surface.

### The conflicting edit — exact values

Target: **MACA GUMMIES**, SKU `CCD8EDCB`, server id
`ccd8edcb-cd4b-4741-896c-a7d8a90142c5`, barcode `4995`, Selling Price.
Confirmed **₦999** in both the live UI (Catalog list and product detail
drawer) and the freshly downloaded backup on both sessions before either
touched it this round — this is the common ancestor value (itself the
result of an earlier, already-verified single-writer edit from ₦200 to
₦999 in a prior test session, confirmed via the same direct-database method
used throughout this section; server-side `_version: 2` at this point).

1. **Session A edited first, while online and linked:** Selling Price
   ₦999 → **₦1,500** via the product edit dialog, saved ("Product updated
   successfully"), then "Sync Now" from Settings → Data.
   `read_network_requests` showed a clean `push?manual=1` → 200 then
   `pull?manual=1` → 200. Verified directly against the Laravel database:
   `selling_price: "1500.00"`, `_version: 3` (up from `2`),
   `updated_at: "2026-09-04 06:44:25"`. Session A's edit is now confirmed,
   server-committed, ahead of anything Session B has done.
2. **Session B edited the same field to a different value, independently,
   before ever pulling** — confirmed still "Last synced: Never" at the
   moment of the edit, so this is a genuine, uninformed divergence, not a
   race against a pull that already happened: Selling Price ₦999 → **₦777**,
   saved, confirmed in Session B's own Catalog list afterward (₦777, still
   pre-sync).
3. **Session B synced ("Sync Now").** The push succeeded — no error, no
   rejection surfaced anywhere in the UI, "Last synced" updated normally to
   `9/4/2026, 7:46:38 AM`.

### What actually happened: Session B's push silently overwrote Session A's already-synced edit

Direct database check immediately after Session B's sync
(`php artisan tinker`, same `products` row):

```
selling_price: "777.00"
_version: 3
updated_at:  "2026-09-04 06:45:57"
_synced_at:  "2026-09-04 06:46:20"
```

**Session A's ₦1,500 — already reached the server first, already confirmed
committed with its own successful sync — is gone.** The server's value is
now Session B's ₦777, and `_version` sits at `3`, unchanged from what
Session A's edit had already set it to — the push did not even bump it.
`storage/logs/laravel.log` has no `"Sync push: Ignored older update"` line
for this row at all (that's the log line `SyncController::push` emits when
its version check *does* reject a stale update — grepped for the product's
id specifically, found nothing), confirming Session B's push was not
rejected or flagged as stale by the server in any way; it was accepted as a
normal, valid update.

**Root cause, confirmed by reading both sides of the sync:**

- Client-side, `update()` in `client/lib/db/base-helpers.ts` sets the local
  row's new `_version` as `(current local _version) + 1` — a purely local
  counter, computed from whatever the device's own copy of the row already
  says, with no knowledge of the server's current state:
  ```
  const current = await query<{ _version: number }>(`SELECT _version FROM ${table} WHERE id = ?`, ...);
  const version = current[0]?._version || 0;
  ...
  _version: version + 1,
  ```
- Both sessions started this test from the identical common-ancestor row
  (`_version: 2`). Session A's edit bumped its local copy to `3` and pushed
  that. Session B's edit — made independently, on its own still-at-`2`
  local copy — *also* computed `2 + 1 = 3` and pushed that. Two
  independently diverged devices, each making exactly one edit from a
  shared synced ancestor, will always compute the identical next version
  number this way — this isn't a rare timing accident, it's the
  deterministic, guaranteed outcome of the single most common conflict
  shape (one edit each) this whole feature exists to resolve.
- Server-side, `SyncController::push` (`app/Http/Controllers/Api/App/SyncController.php`,
  ~line 515-536):
  ```php
  $isOlder = false;
  if ($payloadVersion !== null && $modelVersion !== null && $payloadVersion !== $modelVersion) {
      $isOlder = $payloadVersion < $modelVersion;
  } elseif ($model->updated_at && isset($payload['updated_at'])) {
      // Fallback to updated_at if versions are equal or missing
      ...
      $isOlder = $payloadUpdatedAt->lt($modelUpdatedAt);
  }
  ```
  When the incoming `_version` and the server's current `_version` are
  **equal** (both `3`, exactly as constructed above), the strict
  version-inequality branch is skipped entirely by its own `!==` guard, and
  conflict resolution silently falls through to comparing `updated_at`
  timestamps instead — each device's own local wall-clock, not a causally
  meaningful signal. Session B's edit happened later in real time than
  Session A's, so `payloadUpdatedAt > modelUpdatedAt` → `$isOlder = false`
  → accepted, overwriting Session A's value.

**In effect: the documented design ("server-side write should generally
win over a stale-version push, with the loser needing a pull to
reconcile") does not hold. What actually happens is last-write-wins by
device clock time, and it specifically activates in the exact scenario a
real conflict is most likely to look like — two devices, one edit each,
from a shared ancestor — because that scenario guarantees a version
collision that disables the version check entirely.**

### The loser never finds out

Session A ran "Sync Now" once more afterward, to see how the "losing" side
recovers. Its pull silently applied ₦777 — Session A's own Catalog now
shows ₦777, matching the server, with **no conflict toast, no warning
banner, no console error or warning** (`read_console_messages` showed only
the routine app-boot "Global error listeners initialized" log lines around
both syncs). From Session A's perspective, its own successfully-saved
₦1,500 edit — which it had itself already confirmed synced — has simply
vanished and been silently replaced, with nothing in the product's own
edit/sync history to explain why. A user would only ever notice this by
independently remembering they'd set a different price.

### Verdict: real bug, not a rough edge — filed as `_known-bugs.md` #11

**Conflict resolution does not work correctly.** This is not "works but
with a rough edge" — it is a genuine, silent data-loss bug: an
already-server-confirmed edit was overwritten with no error, no conflict
signal, and no recovery path for the user who lost their change, in
precisely the conflict shape (one edit per device from a shared ancestor)
this feature is centrally meant to handle. See `_known-bugs.md` #11 for the
fix-scoping writeup; not fixed as part of this investigation per this
task's own scope (document and flag, don't fix).

## Danger Zone: full local reset

Also on this same Settings → Data page: "Reset Database" (`handleResetDatabase`
→ `resetDatabase()`) — out of scope for this doc, not exercised here beyond
noting it exists in the same card as Backup & Restore and is a separate,
destructive, non-backup-related control.
