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
- **Write access.** Not a "fix it from here" mode. The one write is the
  support-triggered local fold, which is already gated and queues nothing.
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
- `POST /api/app/admin-till-session` takes the email, the code, the store id
  and the device id; returns a short-lived inspection token plus the admin's
  identity. Rate-limited per device and per admin.

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

The local fold is the one deliberate exception: it writes quantities directly
rather than through `update()`, queues nothing, and is already gated.

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

## Open

- Whether a store owner should be able to grant access from their side, so an
  admin is not asking a cashier to hand over a till on their say-so.
- Superadmin override of a tampered-clock lockout, noted earlier and still
  pending; it will likely want this same session.
