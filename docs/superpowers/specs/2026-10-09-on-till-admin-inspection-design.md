# On-till admin inspection session

**Date:** 2026-10-09
**Status:** design approved, not implemented

## Why

An admin or superadmin needs to stand at a store's own till, sign in with
their own credentials, and see what that device believes — read-only, plus a
section only they ever see.

This is not impersonation. The existing impersonation handoff runs on the
admin's own laptop, against the admin's own local database, so it reads the
wrong device entirely. The 2026-10-08 incident (958 products at exactly twice
their opening stock, correct on the server) was invisible from the server and
invisible from the admin's machine. The only device that held the evidence was
the till on the counter.

The diagnostics console (`components/settings/device-diagnostics.tsx`) and
`foldStockQuantities()` already exist. They have never run on a device that had
the problem. This is the access path that lets them.

## Non-goals

- **Offline admin access.** v1 is online-only, stated plainly in the UI. An
  inspection session is authenticated server-side on every entry; there is no
  cached admin credential on the till, by design.
- **General write access.** Not a "fix it from here" mode, for any role
  including superadmin. See *Repair actions* below: a fixed allowlist of named
  operations, never free editing.
- **Replacing impersonation.** The admin-panel handoff keeps working for
  looking at a store's *data*. This is for looking at a *device*.

## Entry

The admin uses the normal lock screen: back → "someone else" → types their
admin email.

The client decides locally which login to attempt, with no secret in the
bundle and no gesture:

1. The identifier contains `@` (cheap pre-filter), **and**
2. `getUsersByUsernameOrEmail()` returns no row — no user on this device, in
   any of its stores, has that username or email.

Then and only then the client attempts the admin path, online. Everything else
falls through to the existing login, unchanged and still fully offline.

The second condition is load-bearing. `lib/db/queries/auth.ts:26` already
accepts an email as an ordinary login identifier (`const field = isEmail ?
"email" : "username"`), so a store owner signing in with their email must keep
working offline. The lookup is deliberately not store-scoped, which is what
makes it cover every store on a multi-store till.

**Known constraint:** an admin whose email is also on a local user record on
that device cannot reach the admin path — they get the local PIN login
instead. Admins must use an admin email that is not on any local user record.
Operational rule, not a code path.

## The till access code

The admin does **not** type the password that opens the platform panel for
every tenant. A till is hardware the store controls and can be keylogged,
screen-recorded or watched; whatever is typed there should be worth as little
as possible to whoever captures it.

Each admin holds a separate **till access code**: scoped to read-only
inspection, usable only against a store device, online only, and useless
anywhere else in the platform.

Server side:

- New table, one row per code: `admin_id`, `code_hash`, `label`,
  `last_used_at`, `revoked_at`, `created_at`. Per-admin, rotatable, revocable
  without touching the admin's real credentials.
- Hashed at rest like a password. Never recoverable, only reissued.
- Issued and revoked by the admin themselves from the admin panel
  (`/admin/settings`), never for another admin; an artisan command remains as
  the bootstrap path for the first code.
- `POST /api/app/admin-till-session` takes the email, the code, the store id
  and the device id; returns an **opaque session id** plus the admin's
  identity. Rate-limited per IP, per device and per admin.

**The session is deliberately not a Sanctum token.** `restoreSession()` and
`AuthHandoffController::create()` both resolve a Personal Access Token from the
request *body* without checking its abilities, so a narrowly-scoped token read
off a till would launder into a durable full superadmin session — see
`docs/KNOWN_BUGS.md` A-199. An opaque id is not a `PersonalAccessToken`, so
`findToken()` never resolves it and both paths are dead by construction. It
also gives the audit log its exit duration for free.

**Lifetime:** 20 minutes idle, extended by interaction, with a visible
countdown and a "Stay signed in" button at two minutes remaining — the session
never ends silently. A four-hour hard cap sits on the session row, so the
server has the final say and a tampered device clock cannot extend it.

## Failure messaging

One message for every rejection — not an admin, no such account, wrong code,
revoked code, no network: **"Wrong password"**, with the same wording and the
same timing. The form must not become a way to learn which emails are admins.

Offline is the one exception, because it is actionable and leaks nothing: say
that admin access needs an internet connection.

## The session is an overlay, never a replacement

An inspection session layers on top of whatever the till was already doing.
`loginFromHandoff` is the precedent — it deliberately does *less* than
`login()`.

It must not:

- call `setDbUser()`, or otherwise move the local DB's current-user pointer
- touch `dumos_user`, the active store, or the sync token
- clear or wipe local data (`clearDatabaseForNewStore()` is called only from
  `app/setup/use-onboarding.ts`, never from login — verified)
- log the staff user out or end their shift
- disable the till's sync

Sync keeps running throughout. Freezing it would change the thing the admin
came to measure.

On exit the staff session resumes exactly as it was.

## Read-only enforcement

Enforced at the mutation layer, not by hiding buttons. A single guard in the
`insert()` / `update()` / `softDelete()` helpers refuses while an inspection
session is active — one choke point every write already goes through.

Gating the UI alone is how a "read-only" mode ends up writing through some
path nobody remembered. Buttons are still hidden or disabled, but that is
courtesy, not the control.

Repair actions (below) are the only exception, and each is named rather than
general.

## Repair actions

Read-only is the rule for every role, superadmin included. Pure read-only is
nonetheless too strict: the tampered-clock override has to write something, so
the model is read-only **plus a fixed allowlist of named repairs**.

Each entry is a known, idempotent, individually audited operation. v1 carries
two:

- **`fold_stock_quantities`** — rebuilds diverged batch quantities from the
  movement log, locally. Writes quantities directly rather than through
  `update()`, so it queues nothing and never claims the server's number.
- **`override_clock_lockout`** — clears a tampered-clock lockout. Available to
  `platform_admin` and above. Requires the online session by construction,
  which was the original requirement: the owner is a plausible tamperer, so no
  owner PIN can lift it.

A resync and a health sync are plausible later entries;
`sync-engine/sync-commands.ts` is the existing prior art for named commands.

Nothing outside the allowlist can write, and the allowlist is a literal list
in code, never assembled from input (root `AGENTS.md` §8). Every invocation is
audit-logged with the admin, device, store and outcome.

The reason for an allowlist rather than a write-capable admin mode: a device
stops being evidence the moment someone can type into it, and anything written
on a till syncs upward and becomes the server's truth with no record of what
was typed. A named action is reviewable afterwards; a free-text edit is not. A
stolen till access code also then buys a list of harmless repairs rather than
write access to a tenant.

## Visibility and audit

- A persistent on-screen banner for the whole session, the way impersonation
  has one. Staff always know when someone else is looking at their till.
- Entry and exit written to the audit log server-side: admin id, store id,
  device id, duration.
- Auto-expiry, so a till left on a counter does not sit unlocked. Exit also on
  explicit sign-out and on app restart.

## Backward compatibility (§11)

Additive throughout: a new table, a new endpoint, a new client branch that
only fires on an input the current code already rejects (an email matching no
local user fails login today). No shared contract changes shape, so an old
bundle in the field behaves exactly as it does now — it simply cannot start an
inspection session. Nothing to shim, nothing to retire.

## Testing

- The discriminator: owner's email matching a local user still logs in
  offline; an email matching nothing attempts the admin path; a username never
  does. This is the regression that protects offline login.
- The overlay: after entry and exit, `dumos_user`, the active store, the sync
  token and the staff session are byte-identical to before.
- Read-only: `insert()`, `update()` and `softDelete()` all refuse during a
  session; the fold still works.
- Uniform failure: wrong code, unknown email and non-admin email produce the
  same response.
- A real logged-in browser smoke test, per root `AGENTS.md` §9 — this spans a
  server permission model and a frontend rendering around it, which is exactly
  the case where backend-only verification misses the bug.

## Settled, deliberately not built

- **No access-granting by the store owner.** An admin standing at the till is
  the access grant. Adding an owner-side approval would mean an admin
  investigating a store cannot work without the cooperation of the person
  whose store is under investigation. The protections are physical presence
  plus the till access code, not consent.
- **The clock override belongs to `platform_admin` and above**, via the
  allowlist above. Read as platform admins *and* superadmins, superadmin being
  the broader role; say so if you meant platform admins only.
