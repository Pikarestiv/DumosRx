# Admin Panel Phase 5 — Maintenance & Migration Runner

**Date:** 2026-10-07
**Status:** approved (design questions settled in-session; see Part 0)
**Predecessors:** Phase 1 (honest metrics + IA), Phase 2 (sync health), Phase 3
(subscription lifecycle). Phase 4 (trends) is deliberately deferred behind this
one because this phase closes an **active production incident**, A-170.

---

## Part 0. Why this phase exists, and what it is not

### The incident

`docs/KNOWN_BUGS.md` A-170. Three migrations —
`2026_09_27_000001_add_occurrence_count_to_activity_logs`,
`2026_09_27_000002_add_dedup_columns_to_feedback_table` and
`2026_10_02_000006_widen_feedback_fingerprint_column` — are all on
`origin/main`, written, reviewed, merged and deployed. Production was still
rejecting sync pushes for all three as recently as 2026-10-06, with 567 events
across 4 stores on the largest issue alone. Affected rows retry to the client's
5-attempt ceiling and are **never delivered**.

The cause is not a code defect. The backend deploys by FTP to shared hosting,
so the workflow uploads files and stops; production's schema only advances when
somebody manually requests `GET /migrate-db?key=…`. Nobody did.

### What this phase is not

It is **not** an automated deploy-time migration. That was offered and
declined: the operator will run migrations themselves. The deploy pipeline is
unchanged by this phase, and FTP stays (the non-atomic-upload risk is logged
separately as A-175 rather than fixed as a side effect of this work).

So this phase's job is narrower and more honest: **make the thing the operator
already has to do safe, visible, and impossible to forget.** Three properties,
in priority order:

1. **Visible.** Nothing anywhere can currently answer "is production behind?"
   That question gets a first-class answer on `/admin/operations`.
2. **Safe.** Running migrations on this host is genuinely dangerous — see the
   hazards in Part 4 — and the current mechanism is a secret in a URL that
   reseeds the database and reports its own failures as success (A-174).
3. **Recorded.** Every run leaves an audit trail naming who ran it and what
   was applied.

### The rule this phase inherits

Phase 1's rule still governs: **a metric that cannot be measured renders as
unavailable, never as a plausible-looking number.** Applied here: if the
migrator cannot be read, the panel says so. It never shows "0 pending" — the
single most dangerous false statement this feature could make, because it is
indistinguishable from "all good" and is exactly the lie that A-170 was.

---

## Part 1. What the operator sees

### A card on `/admin/operations`

One card alongside the existing health/sync cards, with three possible states:

| State | Rendering |
|---|---|
| Up to date | "Schema up to date", last applied batch and when |
| Behind | "**N migrations pending**", amber, with a link to the maintenance page |
| Unknown | "Migration status unavailable" — never "0 pending" |

The card is informational and carries no action. The action lives behind its
own page, because a destructive operation should not be one mis-click away from
a dashboard somebody loads to read a sync graph.

### A `/admin/maintenance` page

super_admin only. It lists each pending migration by name, in the order the
migrator will apply them, and marks the ones that **alter or remove existing
data** rather than only adding to it. Below the list, one action: **Run pending
migrations**.

The confirmation is a Shadcn `AlertDialog` (§9 forbids `window.confirm`) and it
is explicit rather than generic: it names the count, and when any pending
migration is destructive it says so in those terms — "2 of these 5 alter or
remove existing data. On this host a migration that fails midway cannot be
rolled back." A confirmation nobody reads is not a safety control, so it states
the specific risk rather than asking "Are you sure?".

After a run, the page shows what was applied, the migrator's output, and
**re-reads the pending list** so the operator sees the new state rather than
trusting the response.

---

## Part 2. Backend

### Endpoints

Both `role:super_admin`, inside the existing `permission:manage_platform` admin
group:

```
GET  /api/v1/admin/maintenance/migrations       → status + pending list
POST /api/v1/admin/maintenance/migrations/run   → applies pending migrations
```

### `AdminMaintenanceService`

Reads migrator state directly rather than parsing `migrate:status` output:

- ran: `app('migrator')->getRepository()->getRan()`
- files: `app('migrator')->getMigrationFiles(database_path('migrations'))`
- pending: the difference, in migrator order

`getRepository()->getRan()` throws if the `migrations` table itself is missing
or unreadable. That is the "unknown" state, and it propagates as unknown — not
as an empty pending list.

### Destructive-operation detection

For each **pending** migration file, the service scans the body of its `up()`
method for `dropColumn`, `dropIfExists`, `->drop(`, `renameColumn`,
`Schema::rename`, `truncate` and `delete(`. A match marks that migration
`alters_existing_data: true`.

This is a deliberately **conservative, syntactic** check, and the spec states
its limits plainly: it reads source text, so it can produce a false positive
(the word appears in a comment) and it can miss a destructive raw-SQL
statement. It is a warning that makes the operator look, not a guarantee. It is
worth having anyway because the alternative — no signal at all — is what the
current endpoint offers. 9 of this repo's 156 migrations contain destructive
operations in `up()`, so the case is not hypothetical.

### Running migrations

```php
Artisan::call('migrate', ['--force' => true]);
```

Three properties, each fixing a defect of the endpoint it replaces (A-174):

- **No `--seed`, ever.** The command and its options are a literal in this
  method. Nothing about the invocation comes from request input — no command
  name, no flags, no paths. (§8 forbids dynamic lookup from input, and a
  migration runner is the last place to make an exception.)
- **A failure returns a non-2xx status**, with the migrator's output in the
  body. The current endpoint returns HTTP 200 on failure, which is what would
  make any automation on top of it report success over a broken schema.
- **The response carries the post-run pending list**, so "did it finish?" is
  answered by state rather than by the exit path taken.

Every run writes an `ActivityLog` entry (`MIGRATIONS_RUN`) with the actor and
the applied migration names — on both success and failure, because a failed
migration is the more important one to have a record of.

### Retiring `GET /migrate-db?key=`

Deleted from `routes/web.php` in this phase, along with the `MIGRATE_DB_KEY`
reference in `laravel-server/AGENTS.md`'s "Running things" section, which
currently documents it as the way to migrate production. Leaving both the old
and new paths alive would mean the insecure one stays the one people reach for,
and the stale doc would keep pointing at it.

---

## Part 3. Gating

Four layers, exactly as Phase 3 established, because this is the most
consequential action in the panel:

1. **Route middleware `role:super_admin`** — the control. Everything else is UX.
2. **Nav item** gated to match, per `web/AGENTS.md`'s rule that a nav item's
   gate must match its page's narrowest endpoint gate.
3. **Page guard** — `checkIsSuperAdmin(user?.role)` before rendering or
   fetching anything, so a bookmark or a pasted link gets an explicit "only
   available to super admins" instead of a generic failed-to-load screen.
4. **The action itself** is super_admin-gated server-side; the button being
   hidden is presentation, never protection.

A custom platform role holding `manage_platform` + `view_platform_data` — the
A-141 shape — must be **refused**, and the test for that must prove it reached
the `role:super_admin` layer rather than being turned away by the outer group
gate. (Phase 3's reviewer mistakenly flagged the inverse; `AdminRoleService::createRole()`
grants `manage_platform` itself, so the assertion has to be explicit.)

---

## Part 4. Hazards this feature cannot remove, and must therefore surface

These are properties of the host, not of this code. The spec records them
because a maintenance UI that hides them is worse than no UI.

- **MySQL DDL is not transactional.** A migration that fails midway cannot roll
  back. The confirmation dialog says this; the docs say it; the feature cannot
  fix it.
- **PHP execution limits.** A long migration can exceed the request timeout on
  shared hosting. The HTTP response is then lost *while the migration may still
  be applying*. This is why the response carries a re-read pending list and why
  the page re-reads after a run: the operator's source of truth is the state,
  not the request outcome. Documented in `laravel-server/AGENTS.md` as part of
  this phase.
- **Timestamps.** §7 applies to anything this writes: the `ActivityLog` entry
  is written by Eloquent in UTC. No `NOW()` in any SQL this phase adds.
- **No backup step.** This feature does not take one and must not imply it has.
  The dialog's wording is about what the operator should do beforehand for a
  data migration, not a reassurance.

---

## Part 5. Testing

Backend:

- the pending list matches the migrator's real state, and its order is the
  migrator's apply order
- a missing/unreadable `migrations` table yields **unknown**, never an empty
  pending list
- destructive detection flags a fixture migration containing `dropColumn` in
  `up()` and does not flag a purely additive one
- the run invokes `migrate` **without** `--seed` — asserted at the invocation,
  since this is the defect that made the old endpoint unsafe to automate
- a failing migration returns a non-2xx status and still writes its
  `ActivityLog` entry
- `role:super_admin` enforced on both endpoints for `platform_admin`, `agent`
  and a custom `manage_platform` role, with the custom-role test proving it
  cleared the group gate first
- `GET /migrate-db` no longer routes

Frontend:

- the page guard renders the refusal and issues **no request** for a non-super_admin
- the operations card renders "unavailable" rather than "0 pending" on an
  unknown status
- the confirmation is an `AlertDialog`, and the destructive warning appears only
  when a pending migration is flagged
- dates in DD/MM/YYYY via `formatDateToDDMMYYYY` (§6)

Plus, per §9's "backend verification isn't UI verification": a real logged-in
browser smoke test of the gate as super_admin and as a lesser role, in the same
pass — not as a follow-up.

---

## Part 6. Out of scope

- Any deploy-pipeline change, including an automated migrate step (declined
  in-session; the operator migrates manually).
- FTP → rsync (logged as A-175).
- `migrate:rollback`, `migrate:fresh`, `db:wipe` or seeding from the panel. The
  runner applies pending migrations and does nothing else; a rollback on a host
  without transactional DDL and without a backup step is not a button.
- Phase 4 (trends), Phase 6 (activity feed) — unchanged, still queued.
