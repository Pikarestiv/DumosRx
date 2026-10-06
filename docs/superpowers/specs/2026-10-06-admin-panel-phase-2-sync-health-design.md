# Admin Panel Phase 2 — Sync Health Observability

**Date:** 2026-10-06
**Status:** Design approved, pending spec review
**Packages touched:** `laravel-server/`, `web/`
**Predecessor:** `docs/superpowers/specs/2026-10-06-admin-panel-phase-1-design.md`

## Intent

DumosRx is offline-first, so "my data isn't syncing" is the most likely support
call — and today the platform operator has no way to answer it. There is no
admin view of sync failures, no record of why the server refused a change, and
no history of whether a store syncs at all.

This is not a hypothetical gap. Every sync defect in the recent record —
A-161, A-162, A-165, A-166, A-167 — was the same invisible shape: rows sitting
in a device's queue, refused by the server, never landing. A-162 remains
*unresolved* precisely because nobody can see which store id those five frozen
payloads carry. Each was found through a Sentry crash report or a customer
complaint, never through the admin panel.

Phase 2 makes the server **record** why it refuses a change, and surfaces that
per store.

## The constraint that shapes this phase

**The data does not exist yet.** The server computes a refusal `reason` for
every rejected change, returns it in the push response, and then discards it.
Nothing is persisted.

Worse, the metric Phase 1 shipped for this is dead: **`SYNC_SUCCESS` is never
written anywhere in either package.** The only reference to it in the codebase
is `AdminSummaryService`'s read. The Overview's "Sync Success Rate (24h)"
therefore renders "No sync activity" permanently. Phase 1's rule — an
unmeasurable metric renders as unavailable — means it is not *lying*, but it is
a dead row. Phase 2 gives it a real source.

**What the server can see:** `stores.last_sync_at`, `last_sync_run_id`,
`last_sync_run_started_at`, and the per-change refusal reasons it computes
(`forbidden`, `permission_denied`, `unsupported_operation`,
`quantity_received_exceeds_ordered`, and the conflict reasons).

**What the server cannot see at all:** `_sync_queue` and `_sync_state` are
client-side SQLite tables. Queue depth, backlog age, retry counts and per-table
cursors exist **only on the device**. The server has no idea a store is sitting
on 500 stuck rows.

That blind spot is accepted for this phase and closed in Phase 2b (below).

## Decisions taken during design

- **Server-side recording now; client-reported telemetry later.** Phase 2 ships
  without a desktop release, so visibility arrives immediately rather than
  trailing client adoption. The cost is explicit: a device whose rows never
  reach the server stays invisible, which means **Phase 2 would not, on its own,
  have caught A-162**. Phase 2b adds client-reported queue depth.
- **Persist failures and conflicts only; count successes in a daily tally.**
  Pushes are constant and a row per change would mean millions on shared
  hosting. Refusals are rare and are the rows worth keeping.
- **Keep the failing record id.** A per-sync-run summary was considered and
  rejected: it bounds growth equally well but discards the one field you
  actually chase when debugging (which record, in which table, for which store).
- **Pull-side errors are out of scope.** They are mostly 500s, already visible
  in Sentry and on the Operations page's error feed.

## Part 1 — Recording

### Where

One hook in `SyncController::push()`, placed **after the outer `DB::commit()`**,
beside the existing `sendFirstSyncAlert()` call.

`push()` has **eight** separate sites that append to `$failed` (lines 262, 413,
447, 525, 611, 634, 663 and 1212 at time of writing). Recording at each one
would mean eight call sites, each rebuilding store/user context, and a ninth
added later would silently go unrecorded. Recording once from the assembled
`$failed` array makes the contract "append to `$failed`" — which every path
already honours — rather than "remember to log".

Rejected alternatives: per-throw-site recording (above); and firing a domain
event per refusal with a listener persisting it, which is cleaner in principle
but buys only indirection while `QUEUE_CONNECTION=sync` runs listeners inline.
The event shape stays available as the upgrade path if write volume ever
justifies moving recording off the request.

### Why after the commit

Two reasons, one correctness and one precedent:

- A push whose **outer** transaction rolls back applied nothing. Recording
  before the commit would leave failure rows describing changes that were never
  attempted against committed state.
- `sendFirstSyncAlert()` already documents the "must run AFTER push()'s
  `DB::commit()`" rule for its own reasons (a synchronous SMTP send inside the
  transaction held every `lockForUpdate()` row lock open for the SMTP timeout).
  The new hook sits in the same place for a related reason and should be
  documented together.

**Recording failures must never fail the push.** The hook is wrapped in
`try`/`catch` and logs on error, exactly as `sendFirstSyncAlert()` swallows
alert failures. A sync that succeeded must not be reported as failed because
telemetry could not be written.

### Context resolution

- **Store:** `resolvePushStoreId($request, $user)` — the same resolver
  `touchStoreLastSyncAt()` uses. Using any other lookup would mis-attribute a
  multi-store owner's failures to the wrong branch, which is the exact bug that
  resolver was introduced to fix.
- **User:** `$request->user()`.
- **Operation:** `$failed` entries carry `id`, `table_name`, `record_id` and
  `reason` but **not** `operation`. The hook rebuilds it by indexing the
  in-scope `$changes` array by `id` and looking up `$change['operation']`
  (`INSERT`/`UPDATE`/`DELETE`). This keeps the single-hook property rather than
  editing eight appends.

## Part 2 — Storage

### `sync_failures`

One row per refused change.

| Column | Notes |
|---|---|
| `id` | uuid, matching the project's convention |
| `store_id` | nullable — a refusal can precede store resolution |
| `user_id` | nullable — the pushing session |
| `table_name` | |
| `record_id` | the failing row; the field a per-run summary would have lost |
| `operation` | `INSERT` / `UPDATE` / `DELETE` |
| `reason` | the stable reason string the client also receives |
| `created_at` | |

Indexes: `(store_id, created_at)` for the per-store drill-down, and
`(reason, created_at)` for "what is failing platform-wide right now".

**`store_id` is deliberately not a foreign key with cascade delete.** A refused
change is forensic evidence; archiving a store should not silently destroy the
record of why its data never landed. (`ForeignKeyCascadeEmulator` and
`AdminStoreDeletionService` already handle store teardown explicitly — the
deletion path must be updated to decide about these rows rather than inheriting
a cascade by accident.)

### `sync_health_daily`

The lightweight success tally, upserted once per push.

| Column | Notes |
|---|---|
| `store_id` + `date` | unique together |
| `pushes` | number of push calls |
| `changes_accepted` | sum of `processed` |
| `changes_refused` | sum of `count($failed)` |

Growth is stores × days, so it stays small on the Namecheap box while giving a
real success rate and a trend line.

**The `date` bucket must come from PHP (`now()->toDateString()`), never from
MySQL.** `.agents/AGENTS.md` §7 documents that this host's MySQL runs on a
`time_zone = SYSTEM` clock observed at ~4 hours behind UTC, so a bucket derived
from `CURDATE()`/`NOW()` would assign four hours of every evening's pushes to
the wrong day — and the resulting success-rate series would be quietly wrong in
a way nobody would notice. Eloquent generates UTC correctly; the general rule in
§7 ("never use MySQL's `NOW()`/`CURRENT_TIMESTAMP()` in raw SQL against this
database") applies to the upsert too.

**`AdminSummaryService` switches its sync-rate read to this table** as part of
this phase. That is a concrete deliverable, not a side effect: the Overview's
"Sync Success Rate (24h)" currently queries `ActivityLog` for a `SYNC_SUCCESS`
action that nothing in either package writes, so it is dead on arrival and stays
dead until this change lands.

### Retention

`sync:prune-failures`, registered on the existing scheduler in
`routes/console.php` (which already runs eight commands, so no new
infrastructure), deleting `sync_failures` rows older than 90 days. The retention
window is a constant, not a config surface — a setting nobody tunes is a setting
that rots. `sync_health_daily` is small enough to keep indefinitely.

## Part 3 — Services and API

Per Phase 1's established boundary (one domain service each, never a
god-service):

- **`SyncFailureRecorder`** (`app/Services/Sync/`) — the write path. Takes the
  `$failed` array, the resolved store/user and the `$changes` lookup; performs
  one bulk insert plus the daily upsert. Separated from `SyncController` so it
  is testable without driving a full push.
- **`AdminSyncHealthService`** (`app/Services/Admin/`) — the read path:
  platform-wide failure counts by reason over a window, the per-store health
  list, and a single store's recent failures.

Endpoints, both under the existing `permission:manage_platform` admin group:

- `GET /admin/sync/health` — platform summary: 24h/7d success rate from
  `sync_health_daily`, failure counts grouped by reason, and the stores with the
  most refusals.
- `GET /admin/sync/stores/{id}` — one store's recent failures (paginated at 50
  per §8), its `last_sync_at`, and its daily accepted/refused series.

**Gate:** `role:super_admin`, matching `/admin/health` and `/admin/errors`. Per
Phase 1's rule — *a nav item's gate must match its page's narrowest endpoint
gate* — the Operations surface this lands on is already super_admin-only, so the
two agree by construction. This is the rule PG-14 and PG-15 were logged against;
Phase 2 must not add a ninth violation.

## Part 4 — Admin surface

- **Operations gains a Sync section** — Phase 1 made Operations the single
  telemetry surface, so this belongs there rather than in a new top-level item.
  Shows the 24h success rate, a failure-reason breakdown, and the worst-affected
  stores.
- **Per-store drill-down from the Store Fleet row**, because that is where the
  operator is standing when a customer calls. Reachable from the existing store
  detail page rather than a new route.
- **Reason strings are rendered with a plain-English gloss** (`permission_denied`
  → "Refused: the pushing session had no access to that store"), because the raw
  strings are engineering vocabulary. The gloss is a frontend lookup keyed by
  reason, with the raw string shown alongside so a support conversation can
  quote it.
- Money/percentage rendering follows Phase 1: an unmeasurable figure renders as
  unavailable, never as zero. A store with no sync history shows "Never synced",
  not "0% success".

## Part 5 — Testing

Per `.agents/AGENTS.md` §9, sync operations must be covered:

- **Every refusal path reaches the recorder.** A test per reason string
  (`forbidden`, `permission_denied`, `unsupported_operation`, a conflict, and
  the stock-delta failure at line 1212) driving a real push and asserting a
  `sync_failures` row with the right `reason`, `table_name` and `record_id`.
  This is the test that makes the single-hook design safe.
- **Multi-store attribution**: a push from an owner with two stores records
  against the store named by `X-Store-Id`, not an arbitrary first store.
- **A recorder failure does not fail the push** — the push still returns 200 and
  its `processed` count when the insert throws.
- **Nothing is recorded when the outer transaction rolls back.**
- **The daily tally** accumulates across multiple pushes on the same date and
  starts a new row on the next date, with the bucket asserted against a
  PHP-generated UTC date rather than the database's clock (§7).
- **The Overview's sync success rate reads `sync_health_daily`**, asserted by a
  test that records a push and then sees a non-null rate on the summary — the
  regression guard against shipping another metric whose source nothing writes.
- **Prune** deletes beyond the window and leaves rows inside it.
- **Browser smoke test**, signed in as super_admin, confirming the Sync section
  renders real recorded failures and the per-store drill-down resolves. §9 is
  explicit that backend verification is not UI verification.

`npm run test:schema` **is** required: two new tables. Per `.agents/AGENTS.md`
§5, any new table must be reflected in the client's local schema and the sync
engine's push/pull coverage — these two are **server-only telemetry and must
never sync to the client**, which is itself the thing to assert, so the schema
test does not start reporting them as drift.

## Explicitly out of scope

- **Client-reported queue depth, backlog age and retry counts (Phase 2b).**
  This is the piece that would catch the A-162 class. It needs a `client/`
  change and ships on the desktop release cycle.
- Pull-side error recording.
- Alerting or thresholds on sync failure rates (Phase 6's territory).
- Any change to sync behaviour itself. Phase 2 is **observation only**: it must
  not alter what the server accepts, refuses, or returns. A diff that changes a
  reason string or a refusal condition is out of scope by definition.

## Success criteria

1. Every path that refuses a change leaves a `sync_failures` row naming the
   store, table, record and reason.
2. The Overview's sync success rate reads from real recorded data instead of a
   lookup nothing writes.
3. An operator taking a "my data isn't syncing" call can open one store and see
   whether it syncs, when it last did, and what has been refused.
4. Recording cannot fail a sync, and cannot change what a sync does.
5. No file added or modified exceeds 350 lines.
6. The new endpoints' gate matches their nav item's gate.
