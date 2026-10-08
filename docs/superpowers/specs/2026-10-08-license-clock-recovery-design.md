# License clock-discrepancy recovery — design

**Date:** 2026-10-08
**Status:** §1 and §4 implemented 2026-10-08; §2 outstanding
**Touches:** `client/lib/licensing/licensing-manager.ts`, `client/components/auth/license-guard.tsx`, `laravel-server` (a time endpoint or an existing response header)

> `.agents/AGENTS.md` §8 forbids altering the `LicenseGuard` anti-backdating
> logic without explicit instruction. This document proposes; it does not
> authorise implementation.

## The incident

A store owner's laptop ran roughly 12 hours fast. While it was skewed,
`checkLicenseStatus()` wrote that future time into `stores.last_monotonic_time`
on every run. The owner then corrected the system clock, and the device locked
itself out of the POS permanently:

```ts
// licensing-manager.ts:58
if (profile.last_monotonic_time && nowIso < profile.last_monotonic_time) {
  return { isValid: false, isClockTampered: true, ... };
}
```

Real time is now *earlier* than the watermark, which the guard reads as a
deliberate rollback. The behaviour is correct for its threat model — an
offline device must not be able to win back an expired licence by moving its
clock — but it cannot distinguish a malfunctioning clock from an attack, and
the product offers no way back.

## Why nothing currently recovers

| Path | Why it fails |
| --- | --- |
| "Check Again" | `performCheck({refreshFromCloud:true})` runs `sync(true)` then re-reads local state. The comparison is local `new Date()` against a local watermark. **No server time is ever consulted.** |
| Sync | `last_monotonic_time` is listed in `DEVICE_LOCAL_PULL_COLUMNS` (`pull.ts:69-71`) and stripped from every pulled `stores` row, by design. The server can never correct it. |
| Factory reset | `stores` is not in `LOCAL_WIPE_TABLES` (`core.ts:1077`), so the row and its watermark survive. |
| Waiting | Works, but only once real time passes the watermark — unbounded, since the watermark is however far the clock jumped. |

The one mercy is that the tamper branch returns *before* step 2, so the
watermark is frozen rather than still climbing.

## Goals

1. A device whose clock agrees with the server must never stay locked.
2. A runaway clock must not be able to poison the watermark in the first place.
3. No offline device may clear the lock by local action alone — the existing
   threat model is preserved.

## Proposed design

### 1. Server time becomes the arbiter on "Check Again"

The sync pull response already carries `server_timestamp`. Capture it on every
successful sync into a local `last_server_time` / `last_server_time_seen_at`
pair, then extend the check:

- If `|localNow − serverNow|` is within a tolerance (suggest 5 minutes), the
  local clock is trustworthy. If the watermark is ahead of both, it was poisoned
  by a previously skewed clock: **reset the watermark to server time and clear
  the lock.**
- If local and server disagree beyond tolerance, keep the lock and tell the user
  the real difference (e.g. "your clock is 11h 48m ahead of ours").
- Offline with no fresh server time, behaviour is unchanged — locked.

This makes the button do what users already expect it to do, and it cannot be
exercised offline, so it grants an attacker nothing.

### 2. Bound the watermark on write

`updateStoreMonotonicTime()` should refuse a value more than a small margin
ahead of the last known server time. A clock that jumps forward then cannot
write a watermark that takes hours to age out. This is the fix that prevents
recurrence; §1 only repairs devices already poisoned.

### 3. Clearing a clock lock always requires online access

**Invariant: a clock-discrepancy lock can only ever be cleared by reaching the
server.** There is deliberately no offline override — no PIN, no support code,
no manual unlock.

An earlier draft proposed an owner-PIN override and that was wrong. In this
threat model the store owner *is* the adversary: backdating the clock to extend
an expired licence is an owner's action, not a cashier's. Gating the override on
the owner PIN would hand the escape hatch to precisely the person it exists to
stop.

**Accepted consequence:** a device that is simultaneously offline *and*
clock-broken cannot sell until it gets online, even briefly. That is a real cost
to a shop with bad connectivity, and it is accepted knowingly rather than
overlooked. It also raises the stakes on §2: bounding the watermark is what stops
a device reaching that state at all, so §2 is the higher-priority half of this
work, not §1.

Anyone revisiting this should treat "let them unlock it locally, just log it" as
already considered and rejected.

**Planned exception — platform staff, once admin/superadmin login exists.** A
DumosRx superadmin signed into a store's app should be able to override a clock
lock. That does not weaken the model: the adversary here is the store owner, and
a superadmin is not the owner. It must ride on the same audited impersonation
path as the rest of the support surface rather than a separate credential, and
every override must be written to `audit_logs`. Deferred until that login
exists — see the device-observability spec.

### 4. Surface the numbers

The lock screen shows `Device ID` and `Last Valid Date`. It should also show the
recorded watermark and the observed local time, so the next person diagnosing
this does not need the source code to understand what happened.

## Non-goals

- Changing how licence expiry itself is computed.
- Trusting any client-supplied clock value server-side.
- Removing the monotonic check. It stays; it gains a reconciliation path.
- Any offline route out of a clock lock, including an owner-PIN or support-code
  override. See §3.

## Testing

- Watermark ahead + local clock agrees with server → lock clears, watermark reset.
- Watermark ahead + local clock disagrees with server → stays locked, message states the delta.
- Watermark ahead + offline → stays locked, with no control on screen capable of clearing it (regression guard for the threat model).
- A device that clears a clock lock online, goes offline, and backdates again → locks again.
- `updateStoreMonotonicTime()` refuses a write beyond the forward bound.
- Expired-but-honest licence still renders children rather than locking (current behaviour, already covered by `license-guard-lock-screen-title.test.tsx`).

## Open questions

1. Tolerance for "clock agrees with the server" — 5 minutes is a guess; it needs
   to survive a device that has been offline for days with ordinary RTC drift.
2. ~~Does `server_timestamp` already flow somewhere reachable?~~ **Resolved:**
   the public `GET /health` endpoint already returns `{status, timestamp}`
   unauthenticated, so it is reachable even while a full sync is failing. No new
   endpoint was needed.
3. How should the lock screen word the online requirement, so a shop with no
   connectivity understands what is needed rather than reading it as a dead end?

## Implementation notes (2026-10-08)

Shipped:

- `client/lib/licensing/server-clock.ts` — `readServerClock()` against
  `GET /health`, 8s timeout, returns null offline or on any failure.
  `CLOCK_AGREEMENT_TOLERANCE_MS` is 5 minutes.
- `reconcileClockWithServer()` in `licensing-manager.ts` — the only route out of
  a clock lock. Resets the watermark to server time **only** when the local
  clock agrees with the server and the watermark is ahead of it.
- `license-guard.tsx` — "Check Again" attempts reconciliation before re-reading
  local state, and surfaces the refusal reason. The lock screen now shows the
  device's own clock and the recorded watermark (§4).
- Copy changed to say the lock can only be cleared online.
- Tests: `client/__tests__/license-clock-reconciliation.test.ts` (5 cases,
  including the offline-stays-locked and clock-still-wrong guards).

Still outstanding — **§2, bounding the watermark on write.** This is the half
that prevents a device reaching the locked state at all, and it is the harder
one: a purely local forward bound cannot distinguish a clock that jumped from a
device that was legitimately switched off for a week. The approach to try is a
monotonic reference (`performance.now()`) captured alongside server time at each
sync, so elapsed time can be measured without trusting the wall clock within a
session. Not attempted yet.
