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

- **Payload:** 1,226 bytes for all 26 tables, measured by serialising a full
  report (`{"t","r","v","p"}` per table, short keys for exactly this reason).
  Delivery timing adds 114 bytes. Neither scales with catalogue size — the
  report is 26 rows whether the store has 50 products or 50,000.
- **Device:** 26 `COUNT(*) + SUM(_version)` scans plus one `GROUP BY` over
  `_sync_queue`. Throttled to **once per 15 minutes**
  (`THROTTLE_MS` in `table-fingerprint.ts`): an auto-sync runs every few
  minutes and scanning every synced table that often is not free on a phone.
  Outside the window `buildTableFingerprint()` returns `null` and the field is
  simply absent, so a report is only ever sent in the push that computed it —
  the server never compares a stale device reading against a live cloud.
- **Server:** 26 aggregates per *recorded* report, not per push, all on
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

A device with unpushed edits for a table is ahead of the cloud by design.
`TableAgreementService::verdict()` reads a table as `syncing`, not `diverged`,
when the row delta is within that table's queue depth. Without it the panel
is noisy on every till that is mid-sync, and a noisy instrument gets ignored.

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

## Known limitation: `store_id` backfill asymmetry

The device's own schema migration backfills `store_id` on legacy rows
(`UPDATE <table> SET store_id = (SELECT id FROM stores) WHERE store_id IS NULL`);
the server leaves `store_id` NULL on rows that predate
`add_store_id_to_child_domain_tables`. For the 20 directly-scoped tables, a
single-store device therefore counts a legacy row the server's
`where('store_id', ...)` excludes, which reads as a small positive row delta
that never clears. The six child tables are immune because the server scopes
them through their parent. Not fixed here: the fix is a server-side backfill of
`store_id`, which writes to business tables and is out of scope for
instrumentation. Logged in `docs/KNOWN_BUGS.md` as A-288.

## Schema parity

`npm run test:schema` could not be run: it needs a local `dumosrx` MySQL
database, none exists in this worktree, and creating one is forbidden (§12).
The check would be a no-op anyway — `device_table_reports`,
`device_queue_reports` and `sync_health_daily` are server-only instrumentation
tables that the sync engine neither pushes nor pulls, and no local SQLite
column was added.
