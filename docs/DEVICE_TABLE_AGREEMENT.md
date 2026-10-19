# Device Table Agreement, and Delivery Timing

Shipped 2026-10-18. Instrumentation only: nothing here writes to a business
table.

## Why

The only thing this system compared between a device and the cloud was stock.
`client/lib/db/sync-engine/stock-fingerprint.ts` sent three numbers and
`App\Services\Admin\StockDivergenceService` was the only comparator on the
server. For `expenses`, `categories`, `products`, `prescriptions`,
`purchase_orders`, `permission_groups` — every table the October sync-engine
bugs actually lived in — there was no instrument at all. Nine models were
hard-deleting where the device soft-deletes, so deletes never propagated, and
the panel read "Agrees" the whole time because it only ever looked at stock.

Two things are now measured: whether every device of a store holds the same
rows as the cloud, per table, and whether an edit is eventually delivered.

## The digest, and what it cannot detect

Per table, two integers: **the row count, and the sum of `_version` over those
rows.** The device also sends that table's unpushed `_sync_queue` depth.

A portable hash was the obvious thing to want and does not exist. MySQL has
`CONV`/`MD5`/`CRC32`; SQLite has none of them, and `CAST('a3f1' AS INTEGER)`
is `0` on both engines, so even a UUID prefix cannot be turned into a number
in portable SQL. The alternatives were:

- **Hash per row in application code on both sides.** Correct, and
  unaffordable: it means reading 2,700 product rows into JS on a mid-range
  Android phone and the same number into PHP on shared hosting, on every
  comparison. Rejected on cost.
- **One-level Merkle over 256 id-prefix buckets.** Would localise a
  divergence to ~11 rows and makes the per-batch cost drill-down easy later.
  Rejected for now as more payload and more server work than the question
  "does this table agree at all" needs; the same two aggregates computed
  `GROUP BY SUBSTR(id, 1, 2)` is exactly this, so it stays available.
- **Count plus `SUM(_version)`.** Chosen. `COUNT(*)` and `COALESCE(SUM(_version), 0)`
  are identical SQL on both engines, index-cheap, and order-independent.

Soft-deleted rows are counted on both sides. The device keeps them with
`_deleted = 1`; the server keeps them with `deleted_at` set. `_deleted` is
deliberately **not** in the digest: a server that hard-deletes where the
device soft-deletes loses the row entirely, which the row count already
catches, and leaving `deleted_at` out means the digest needs no per-table
knowledge of which models have the column.

**It detects:** a row the device has and the cloud does not, or vice versa
(the hard-delete class); a row left at the wrong `_version` (the raw-update
class); a table the device never pulled; a table scoped out of a pull by a
new `whereIn`.

**It cannot detect:**

- **Offsetting errors inside one table.** One row two versions ahead and
  another two behind sum to the same total. A single-row divergence is always
  caught; a pair that happens to cancel is not.
- **Identity swaps at equal count and equal version.** Two rows with
  different ids but the same versions are indistinguishable, because no `id`
  enters the digest.
- **Any field value.** The digest sees versions, not content. A row edited
  without bumping `_version` reads as agreement — the bucketed Merkle shape
  would not help here either; only a content hash would.
- **Quantity and money.** Stock keeps its own fingerprint, which does compare
  units and value at cost.
- **Divergence newer than the device's last report.** A row is a frozen
  snapshot (see "Snapshots", below).

A cheap digest that catches "a row is missing or at the wrong version" is
worth more than a perfect one nobody can afford to run. It is not a proof of
agreement, and the panel's copy says so.

## Cost

**25 tables are compared, not 26.** `audit_logs` is excluded on both sides —
see "The `audit_logs` false delta" below.

- **Payload:** 1,183 bytes for all 25 tables, measured by serialising a full
  report (`{"t","r","v","p"}` per table, short keys for exactly this reason).
  Delivery timing adds 114 bytes. Neither scales with catalogue size — the
  report is 25 rows whether the store has 50 products or 50,000.
- **Device:** 25 `COUNT(*) + SUM(_version)` scans plus one `GROUP BY` over
  `_sync_queue`. Throttled to **once per 15 minutes**
  (`THROTTLE_MS` in `table-fingerprint.ts`): an auto-sync runs every few
  minutes and scanning every synced table that often is not free on a phone.
  Outside the window `buildTableFingerprint()` returns `null` and the field is
  simply absent, so a report is only ever sent in the push that computed it —
  the server never compares a stale device reading against a live cloud.
- **Server:** 25 aggregates per *recorded* report, not per push, all on
  indexed `store_id` (the six child tables scope through their parent exactly
  as `SyncController::pull()` does). At a 15-minute throttle that is at most
  four reports per device per hour.

## Snapshots

Both sides are frozen into `device_table_reports.tables` at report time and
never recompared on read — A-274's lesson. Two devices measured on different
days are therefore compared against different cloud totals, and the panel
says so. A snapshot older than 48 hours reads "Stopped reporting" rather than
as a disagreement (A-252), and a device reporting zero rows against a
non-empty cloud reads "No local copy of this store" rather than as a total
divergence.

## What the operator sees

Both agreement panels render one `<table>` per device, dense, with
`tabular-nums` so the two sides line up digit-for-digit. The table panel's
columns are `Table | Device | Cloud | Diff | Status`; the stock panel is
transposed — `Units | Batches | Value` across, `Device / Cloud / Diff` down —
so the device's figure sits directly above the cloud's. Design rationale and
the layout rules live in `web/AGENTS.md`, "The agreement rows are tables, not
sentences".

Two properties matter for reading one correctly:

- **The `Diff` row or column is only drawn for a device we can currently
  compare.** A stale snapshot or a device with no local copy still shows its
  frozen Device and Cloud figures, with a badge saying which it is, but nothing
  subtracts them — a difference computed against a till that holds no copy of
  the store is the A-249/A-252 false alarm.
- **Every state carries a word, not just a colour**: `Still syncing`,
  `Catching up`, `Disagrees`, `Same rows, other edits` (with the signed version
  sum beneath), and `N queued` where the queue is what explains the drift.

## The four verdicts, and why a naive version delta was wrong

`TableAgreementService::verdict()` returns one of four values. The first
version of this feature had only three, and that was a false-positive
generator serious enough to make a healthy pharmacy read "diverged" all day.

**The bug.** `buildTableFingerprint()` runs at the top of `pushChanges()`,
*before* this push's UPDATEs are sent and before the response's `versions` map
reaches local rows. The server records its side *after* the outer commit —
correct for row counts, and `recordStockFingerprint()`'s own comment explains
why. So for every non-commutative UPDATE the push carries,
`server_version_sum = device_version_sum + N` and `version_delta = -N`. The
original `syncing` branch required `versionDelta >= 0`, so every such push fell
through to `diverged`. A price edit, a sale status change or a loyalty-points
update made `products`, `sales` and `customers` read "disagree" for most of the
day. `stock_batches` escaped only because a commutative quantity-only update
leaves `_version` alone.

The fix is **not** to move the server snapshot before the push loop: that puts
25 aggregate queries inside the push transaction on shared MySQL, which is the
transaction-length problem the 60s watermark lag exists to mitigate, and it
would do nothing for the cross-till case.

The four verdicts:

- **`agrees`** — both deltas zero.
- **`syncing`** — the drift fits inside that table's queued-edit count, in
  *either* direction: `abs(rowDelta) <= pending && abs(versionDelta) <= pending`.
  This is an **exact** bound, not a heuristic: `resolveUpdateConflict()` assigns
  `$modelVersion + 1` for an accepted non-commutative UPDATE — precisely one
  version per accepted change — and a queued INSERT contributes one row at
  `_version` 1. So N queued rows can account for at most N of drift either way.
  Reported immediately, with no delay, and it covers the device's own in-flight
  push, which is the common case above.
- **`behind`** — the device holds no more than the cloud
  (`rowDelta <= 0 && versionDelta <= 0`) by more than its queue explains.
  Usually another till's write this device has not pulled yet. **Not counted as
  a divergence on its own.**
- **`diverged`** — anything else, plus a `behind` that was already `behind` or
  `diverged` on this device's previous report.

**The two-consecutive-readings rule.** `record()` reads this device's own
previous snapshot and promotes `behind` → `diverged` only if that table was
already unsettled. Two readings at least 15 minutes apart means the device's
own pull did not clear it, which is the real signal — the A-282 lost-row class,
or the re-pull burst of a fix like A-284's. A single reading cannot distinguish
those from ordinary pull lag.

Because the verdict depends on the previous reading, it is **stored in the
snapshot** rather than recomputed on read; recomputing in `forStore()` would
quietly undo the promotion. `storedVerdicts()` falls back to computing on the
fly for a row written before the verdict was persisted.

**The delay this costs.** A genuine divergence is reported one reading late —
at least 15 minutes, and longer on an idle till, since a report only rides on a
push. That is the deliberate trade: the condition this detects is a row that is
already lost and will stay lost, so it is not time-critical, whereas a panel
that cries wolf on every price edit gets ignored within a day and then detects
nothing at all. The `syncing` bound above is what keeps the delay from applying
to the common case — a busy till's own pushes are explained immediately and
never enter the promotion path, so they cannot be promoted by two consecutive
readings either.

## Delivery timing

"Did the push work" was only ever measured per HTTP attempt, which reads the
same whether a device delivers in seconds or has been sitting on an edit for a
day.

- **Device:** `markSynced()` reads each accepted queue row's `created_at`
  before deleting it and buckets its age (`delivery-age.ts`: under 1m / 5m /
  1h / 1d, then over). Five counters in `localStorage`, drained into the
  queue-state report so each report describes the interval since the last one.
  `buildQueueStateReport()` also sends `oldest_queued_seconds` from
  `MIN(created_at)` — the single most useful number, and free, because the
  query was already counting the queue.
- **Support ticket:** two lines in the pasteable device report
  (`diagnostics-report.ts`), which *peeks* rather than drains; the per-push
  report owns the drain. The ticket's 60,000-character cap is why it is two
  lines and not a table.
- **Server:** `sync_health_daily.changes_queued_peak`, the deepest backlog any
  device of the store reported that day, set by
  `SyncFailureRecorder::recordQueuePeak()`. A **gauge, not a counter**:
  summing a device's queue depth across every push of a day would count the
  same waiting edit once per push. It sits beside `changes_accepted` so
  accepted-versus-queued reads as a ratio.

Two accepted limits of the histogram, both worth knowing before reading one:

- **A push that fails on the network loses that interval's histogram.**
  `drainDeliveredAges()` clears when the report is *built*, not when the server
  acknowledges it, so the counts under-report on exactly the bad days when
  delivery data matters most. Accepted rather than fixed: holding the drain
  until acknowledgement means carrying the drained copy through the retry path,
  and the oldest-unsynced-edit age — the number that actually matters on a bad
  day — is recomputed from `_sync_queue` every time and is never lost.
- **`localStorage` is per device, not per store.** A device signed into two
  stores mixes both stores' deliveries into one histogram, and the report is
  attributed to whichever store was active at report time. Accepted: the
  two-store till is rare, and the per-store signal people act on is the queue
  depth and the oldest-edit age, both of which are read from the store-scoped
  `_sync_queue`.

## Expect these on day one — they are not new bugs

**A-284 is fixed, and the first round after it costs a burst.** The pull now
delivers the line items of a soft-deleted sale or return, matching how they
were always counted, so `sale_items`, `return_items` and `sale_item_batches` no
longer read device-behind on every store holding a voided sale. The one-off
price is that each device re-pulls those rows once — low hundreds for a store
with a few hundred sales. A reading taken during that round can still show a
transient row delta on the three tables; the next one clears it. See
`docs/FIXED_BUGS.md` A-284.

**A-288 shows as a small positive row delta.** Legacy rows that have no cloud
`store_id` are counted on the device and excluded by the server's
`where('store_id', …)`, so an affected table reads `+N` until the backfill
lands. Another agent is building that backfill; it deliberately moves neither
`updated_at` nor `_version`, so there is **no pull burst** — a backfilled row
is not re-delivered to a device that already holds it, and only the row-count
half of the digest moves, which is the half that was wrong.

## The `audit_logs` false delta

`audit_logs` was in the first version's allowlist and produced a large
permanent false delta, because the comparison ran against **two different
physical tables**:

- A physical `audit_logs` table does exist
  (`2026_07_21_194736_align_schema_with_client_db.php`) but is unused legacy
  cruft that nothing writes to. The digest counted that.
- `getModelForTable()` maps the client's `audit_logs` onto `ActivityLog`, which
  has no `$table` override, so the pull actually delivers from
  **`activity_logs`**. That is the table holding the device's rows.

So the panel compared the device's whole activity log against a near-empty
different table. Worse than noise: a genuine activity-log divergence was
simultaneously undetectable, because the number reported had nothing to do with
the data it claimed to measure.

It is removed from `CountsSyncedTableRows::AGREEMENT_TABLES` **and** from the
device's own computation (`TABLES_NOT_COMPARED` in `table-fingerprint.ts`).
Dropping it client-side too was a deliberate call, not a leftover: the
fingerprint's only consumer is the push payload, so once the server stops
comparing it the digest has no reader at all, and `audit_logs` is the device's
longest-retained table (730 days) — the largest wasted scan of the 25. The
server-side allowlist remains the authority; the client constant names it.

Comparing against `activity_logs` instead was not attempted: server ids are the
server's own auto-increment bigints with the client id in
`properties->client_id`, so a row-count comparison would need that join and a
version sum has no meaning across the two id spaces.

The general hazard — code keyed by the client's sync table-name string rather
than by what `getModelForTable()` resolves to — is filed as **A-289**, which
also covers `applyPullCursor()`'s `Schema::hasColumn($table, '_synced_at')`.
Not fixed here; see that entry rather than this one for the one-place fix.

## Backward compatibility (§11), piece by piece

Every piece is additive and nothing is required.

| Piece | What a September bundle does |
| --- | --- |
| `table_fingerprint` in the push body | Never sends it. `recordTableFingerprint()` returns early on a non-array, no row is written, and `forStore()` reports `measured: false` — "No device has reported its tables yet", exactly as the stock panel already handles a device that never reported. |
| `device_table_reports` | A new table. Nothing reads or writes it for a device that does not report. |
| `oldest_queued_seconds`, `delivered_ages` | Absent from the report; both columns are nullable with no backfill, and the panel renders nothing rather than "delivered instantly". |
| `sync_health_daily.changes_queued_peak` | Defaults to 0 and is only ever raised by a device that reports a depth. Historical rows read 0, which means "not measured" for a day that predates this. |
| Web response fields | `oldest_queued_seconds` and `delivered_ages` are optional in `DeviceQueueReport`, so a bundle served against a server without the migration still renders. |
| Device-side schema | None. No local SQLite table or column was added, so there is nothing for an un-migrated device to miss. `digestFor()` swallows a per-table error, so a device whose column migration has not run reports every other table rather than nothing. |

**When the shims can go:** none of them need to. The absent-field path is the
permanent "this device has not reported" state, not a transition. The one
genuinely retirable thing is reading `changes_queued_peak = 0` as ambiguous
between "no backlog" and "predates this release"; that ambiguity expires once
`sync_health_daily` holds no rows older than 2026-10-18, i.e. after 30 days of
retention.

## Known limitation: `store_id` backfill asymmetry (A-288, mostly repaired)

The device's own schema migration backfills `store_id` on legacy rows
(`UPDATE <table> SET store_id = (SELECT id FROM stores) WHERE store_id IS NULL`).
The server's coverage is **partial, not absent**: `fix_sync_schema_drift` and
`add_store_id_to_activity_logs` both contain backfills, guarded by
`if (DB::getDriverName() !== 'sqlite')` — which is why they are invisible to
the test suite and easy to grep past. The genuinely un-backfilled set is the
**11 tables of `add_store_id_to_domain_tables`** (`products`, `sales`,
`customers`, `categories`, `suppliers`, `expenses`, `purchase_orders`,
`prescriptions`, `returns`, `stock_movements`, `supplier_payments`), which adds
the column with no backfill at all. `permission_groups` is immune — its
`store_id` is `NOT NULL` with an FK to `stores` — and the six child tables are
immune because the server scopes them through their parent rather than their
own column.

For an affected table a single-store device counts a legacy row the server's
`where('store_id', …)` excludes, which reads as a small positive row delta that
never clears.

**Repaired 2026-10-18 by `php artisan sync:backfill-store-ids`** (dry-run by
default; see `laravel-server/AGENTS.md`, "`store_id` backfill", for the
per-table owner derivation). It deliberately moves neither `updated_at` nor
`_version`, so a backfilled row does **not** re-deliver to devices that already
hold it and the version-sum half of the digest is unaffected — only the
row-count half moves, which is the half that was wrong.

Two residues keep `docs/KNOWN_BUGS.md` A-288 open rather than closing it:
`requested_products` carries no owner column of any kind, so its NULL rows can
never be attributed; and a row whose owning store cannot be derived with
certainty — a multi-store owner's — is left NULL and reported rather than
guessed. The actual row counts on production are still unmeasured (§12); the
dry run is that measurement and writes nothing.

The `audit_logs` row is no longer part of this panel at all — it was removed
from both sides of the comparison (see "The `audit_logs` false delta" above);
A-289 now tracks only the general physical-versus-sync table-name confusion.

## Schema parity

`npm run test:schema` could not be run: it needs a local `dumosrx` MySQL
database, none exists in this worktree, and creating one is forbidden (§12).
The check would be a no-op anyway — `device_table_reports`,
`device_queue_reports` and `sync_health_daily` are server-only instrumentation
tables that the sync engine neither pushes nor pulls, and no local SQLite
column was added.
