# In-app device diagnostics console — design

**Date:** 2026-10-08
**Status:** proposed, awaiting review
**Scope:** `client/` only for phase 1. No server change, no new credential.
**Related:** `docs/KNOWN_BUGS.md` A-176, A-193 · `docs/FIXED_BUGS.md` A-189, A-191, A-192, A-195

## Why

On 2026-10-08 a store reported "double counting". Diagnosing it took a full day,
and the single largest cost was that **nothing about a device's own sync state
is visible from inside the app**. Every one of these was a read-only query that
had to be relayed through the owner by hand, or guessed at:

| Needed | How it was obtained |
| --- | --- |
| Is this device behind the server? | a Sentry event that happened to have fired 15h earlier |
| What is in `_sync_queue`? | never obtained — inferred from a toast |
| Why do 50 changes keep failing? | never obtained; still unexplained |
| Is `_sync_state` stuck? | never obtained |
| What is in `_pending_stock_deltas`? | two ids, from a Sentry message string |
| Does batch quantity match its movement log? | hand-written SQL against production |
| Which build is this device running? | unanswerable at the time |
| Does this product's category resolve? | exported a CSV and diffed it offline |

The device holds all of it. None of it is reachable.

A second, sharper version of the same problem: a device whose sync is broken
also loses the ability to *report* that it is broken, because `logCrash()` ships
through the sync it depends on. The laptop in this incident had **zero** Sentry
events despite being badly diverged for days.

## What already exists

Most of the access path is built, which is why this is small:

- **Superadmin handoff into a store's app** — `app/auth/callback/page.tsx`,
  entered from the admin panel. Writes an impersonated profile under a key
  distinct from `dumos_user`.
- **`isImpersonatedSession()`** (`lib/utils/impersonation.ts`) — one source of
  truth, SSR-safe, used by the sync engine and UI alike.
- **Hard read-only enforcement** — `sync()` refuses outright for an impersonated
  session (`sync-engine/index.ts:97`), and `checkSyncHealth()` skips
  (`health-check.ts:122`). Gated at the engine, so no call site can bypass it.
- **`ImpersonationBanner`** with an "End Session" return trip.
- **`verifyStockIntegrity()`** (shipped 2026-10-08) and
  `diagnoseLegacySchema()` — both already read-only and production-safe.

So: the door exists and is already safe. This spec adds a room behind it.

## Goals

1. Every question in the table above answerable from the device, in-app.
2. Readable by a support person over a video call, and copyable as one blob to
   paste into a bug report.
3. Impossible to reach for ordinary staff, and impossible to use to *change*
   anything in phase 1.

## Non-goals

- **Remote commands.** Triggering a fold, a resync or a wipe from the admin
  panel is the separate remote-maintenance spec. Seeing a device is worth more
  than commanding one and is far safer to build.
- A new PIN or credential. See below.
- Anything server-side. The data is all local.

## Access model

**Reuse impersonation; do not add a superadmin PIN.**

A second credential that unlocks a surface inside a tenant's app would be the
most sensitive thing in the product, and it would be a second, separately
audited way in. Impersonation already carries the properties this needs: it is
minted by the admin panel, it is visibly banners-on-screen, it hard-disables
sync at the engine, and it has a return trip.

The console renders when `isImpersonatedSession()` is true. It is not in the
nav for anyone else, and the route itself re-checks rather than trusting that
nothing linked to it — the same belt-and-braces pattern `device-danger-zone.tsx`
uses for factory reset.

A store owner signed in normally does **not** see it. That is deliberate:
these panels show sync internals that invite destructive misinterpretation, and
the one existing precedent — Health Sync — is already a foot-gun whose name
invites exactly the wrong press.

## Design

A single route, `/settings/diagnostics`, with sections that are all pure reads.

### 1. Identity

`device_id`, the readable `getDeviceLabel()`, `BUILD_SHA`, `APP_VERSION`,
`store_id` and store name, active user, platform (Tauri vs PWA), `last_sync_time`,
and online status. This answers "which device am I even looking at", which took
a Sentry tag cross-reference during the incident.

### 2. Sync queue

`_sync_queue` grouped by table, with per-row `record_id`, `operation`,
`retry_count`, `next_retry_at` and `last_error`. The 50-conflicts loop was never
diagnosed because this view did not exist.

### 3. Sync state

`_sync_state` per table: `last_synced_at`, `server_cursor`, and a derived "this
table has not advanced in N hours" flag. Plus `_sync_conflicts` and
`_pending_stock_deltas` with their `attempts` counts.

### 4. Stock integrity

`verifyStockIntegrity()` output: counts per verdict, net unit delta, and the
worst-diverged batches with product names resolved. Already built; this just
surfaces it.

### 5. Data resolution

Counts that catch the class of bug A-189 and A-195 were: products whose
`category_id` resolves to no visible category, products with no batches,
batches with no movements. Each a number with a short explanation of what it
means, not a raw dump.

### 6. Copy as report

One button producing a plain-text blob of every section above, sized to paste
into a message. This is the part that actually shortens an incident: the
alternative is a support person reading numbers aloud off a screenshot.

## What this does not fix

It does not help a device that cannot be reached at all. Someone still has to
get to it, or walk the owner through opening the page. The remote-command spec
is what addresses that, and it depends on this one for the read half.

## Testing

- The route renders nothing and is unreachable without an impersonated session.
- Each section renders against a seeded local DB with known contents.
- Every query is read-only — asserted the way
  `stock-integrity-verify.test.ts` does it, by snapshotting the DB before and
  after.
- The copy-as-report output contains the identity block and does not contain
  the auth token or any customer-identifying data.

## Open questions

1. Should the owner see a reduced version — "your device is 1,495 products
   behind" — rather than nothing? It would have told Cynthia something was
   wrong days earlier. Against: it invites misreading, and the owner can do
   nothing about it. Leaning no for phase 1.
2. Does the copy-as-report blob need redaction beyond the token, given it
   contains product names and ids?
3. Should this route also be reachable in a *normal* session behind a
   build-flag, for developing it against a real local store?
