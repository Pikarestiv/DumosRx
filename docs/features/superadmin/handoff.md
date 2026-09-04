# Superadmin: Handoff

`web/app/admin/handoff/page.tsx` is not a navigable section (no sidebar
entry) — it's a one-time landing page that completes a cross-origin
"impersonate a store, then return to the superadmin session" round trip.
Its name in the sidebar-free URL space made it unclear from the task brief
alone what it did; investigation (source read + live exercise) confirmed
it's the return leg of Stores' "Impersonate (Admin)" action, which was
otherwise out of this batch's declared scope (Stores was covered in an
earlier batch) but had to be exercised here to test Handoff meaningfully,
since Handoff has no standalone entry point of its own.

## How the round trip works

`AuthHandoffController` (`laravel-server/app/Http/Controllers/Api/AuthHandoffController.php`)
implements a short-lived (60s TTL), single-use, atomic-pull (`Cache::pull`)
code exchange: `POST /auth/handoff` wraps an already-valid bearer token in
an opaque random code; `POST /auth/handoff/consume` burns that code and
returns the real token. Two different frontend apps (`web/` — superadmin,
`client/` — store dashboard) use this because they're different origins in
production (`dumosrx.com`/`app.dumosrx.com`) with no shared `localStorage`.

Full flow, as implemented:
1. Superadmin clicks **Impersonate (Admin)** on a store (`app/admin/stores/page.tsx handleImpersonate`) → mints *two* handoff codes in parallel: one wrapping the impersonated store-owner's fresh token (`data.token` from `POST admin/stores/{id}/impersonate`), one wrapping the superadmin's own current token (`adminToken`, the "return" code) → hard-navigates to `{getAppURL()}/auth/callback?code={userCode}&return_code={returnCode}`.
2. `client/app/auth/callback/page.tsx` consumes `code`, logs the browser in as the impersonated store, stashes `return_code` in `localStorage`, redirects to `/dashboard`. An `ImpersonationBanner` renders with an "End Session" button.
3. Clicking **End Session** (`client/components/dashboard/impersonation-banner.tsx`) consumes the stashed `return_code` to get the admin's real token back, re-wraps it in a *fresh* code, and hard-navigates to `{WEB_APP_URL}/admin/handoff?code={code}`.
4. **This is where `web/app/admin/handoff/page.tsx` runs**: it consumes that final code and restores the superadmin session (`setToken`/`setUser`), then `router.replace("/admin/stores/")`.

## Live test performed (self-scoped to the seeded "Smoke Test Store" — a real, dedicated demo/test account, not a real customer)

Exercised the full loop end to end from the live UI, since Handoff has no
code path reachable except through this flow:

1. Set `localStorage.dumos_app_url = "http://localhost:3000"` in the
   superadmin origin first (see finding below — required for this to work
   in dev at all) and re-authenticated.
2. Clicked **Impersonate (Admin)** on "Smoke Test Store" (owner "Smoke
   Tester", flagged `Demo` in the Store Fleet list) — deliberately not one
   of the two real "Pikarestiv Stores" accounts, which have a real linked
   email (pikarestiv@gmail.com).
3. Landed on `localhost:3000/auth/callback?code=...&return_code=...`,
   which (see finding below) briefly rendered a **false** "Missing handoff
   code" error, but the underlying exchange had actually already
   succeeded — navigating directly to `/dashboard` confirmed a genuine,
   correctly-scoped impersonated session ("Impersonation Mode" banner,
   store data for the impersonated account).
4. Clicked **End Session** → got a **real** failure this time ("Failed to
   return to admin session" toast) and was logged out of the superadmin
   panel entirely. Root-caused below.
5. Re-authenticated as `super_admin` normally; confirmed "Smoke Test
   Store" was back to its normal `Active` status on the Store Fleet list
   (impersonation ending, even via the failure path, didn't leave the
   store or the account in a broken state).

## Bug: `getAppURL()` defaults to the real production domain, with no on-panel way to override it post-login — the very first live attempt silently hit production

`web/lib/constants.ts`: `APP_URL = process.env.NEXT_PUBLIC_APP_URL ||
"https://app.dumosrx.com"`. `NEXT_PUBLIC_APP_URL` is unset in this dev
environment's `web/.env.local`. `getAppURL()` checks a `localStorage`
override (`dumos_app_url`) first, but the *only* UI that can set it is
`ServerSelector`, which is mounted on the **login page**
(`components/auth/admin-login-form.tsx`), not anywhere inside the admin
panel itself once logged in.

**Live-observed consequence**: this task's Chrome session started already
authenticated (an existing tab, session pre-established before this task
began — never went through the login form, so `dumos_app_url` was never
set). The *first* live "Impersonate" click therefore hard-navigated the
browser to `https://app.dumosrx.com/auth/callback?code=...` — the real
production app — which correctly rejected the code with `410 Code expired
or already used` (production has no knowledge of a code minted against
this local dev backend's cache), but not before a real handoff code (a
genuine, if short-lived and by-then-burned, bearer-token wrapper) had been
sent over the network to production infrastructure from a dev testing
session. No account compromise occurred (the code was already consumed by
the failed attempt / expired before any misuse was possible, and it was
scoped to a `Demo`-flagged test store's owner token, not a real user), but
this is a real, easily-reproduced footgun: **any dev session that hasn't
explicitly used the login page's Server Config dropdown to point "App URL"
at localhost will silently leak handoff codes to the real
`app.dumosrx.com` on every impersonation attempt**, with no local-panel
warning that this is about to happen. Confirmed root cause via
`web/lib/constants.ts:16-22` and reproduced the failure live before
setting the override and retrying successfully.

## Bug: `client/app/auth/callback/page.tsx` (and, by the same code pattern, `web/app/admin/handoff/page.tsx`) can show a false "Missing handoff code" error even when the underlying login succeeds

Live-reproduced with network evidence. Sequence from `read_network_requests`
after the Impersonate → callback round trip:

```
POST /auth/handoff            200   (mint userCode)
POST /auth/handoff            200   (mint returnCode)
POST /auth/handoff/consume    200   ← the real, successful exchange
```

Yet the browser visibly rendered "Missing handoff code. The link may have
expired." — the error branch that `client/app/auth/callback/page.tsx`'s
effect takes when `searchParams.get("code")` is falsy, which is a
**different, earlier code path than the try/catch around the actual
consume call** (i.e., not a caught exception from the real, successful
`200` request above). The file's own code comment explains the intended
safeguard: `window.history.replaceState()` strips `code`/`return_code`
from the URL immediately, before the async exchange, specifically so a
second render's `searchParams` won't re-see them — but the effect still
depends only on `[]` (run-once-on-mount) and, per the comment, that's only
safe because Next.js "patches window.history to keep its router state in
sync," which the comment itself flags as capable of producing a **second,
now-empty** `searchParams` snapshot if the effect ever ran twice (e.g.
React 18 Strict-Mode's intentional dev-mode double-invoke of effects,
which was very likely what happened here — the underlying login/token
exchange from the first run visibly succeeded in the background per the
network log and the subsequent `/dashboard` load working correctly, while
a second run of the same effect read the already-stripped URL and set the
literal "Missing handoff code" error over top of it). Practical impact:
a real user (or admin) completing a legitimate handoff, in a dev/Strict
Mode environment, sees a scary "your link expired" error screen despite
having actually been logged in successfully underneath it — pure UX/
correctness noise, not a security issue, but confusing enough that this
task nearly stopped and reported the flow as fully broken before checking
`/dashboard` directly. `web/app/admin/handoff/page.tsx` (this task's actual
target file) implements the *identical* pattern (`window.history.replaceState`
before the async consume, `useEffect(..., [])`, same class of comment
acknowledging the exact same race) — its return-leg use of this code was
not independently re-verified as double-firing (the failure observed on
that leg was the `return_code` TTL expiring from manual testing latency,
see below, not a repeat of this exact symptom), but the code is
structurally identical and equally exposed to the same class of bug.
Because React Strict Mode's double-invoke is a development-only behavior
(disabled in production builds), this specific failure mode is likely
**not** visible to real end users in production — but it is a live,
reproducible correctness gap in this dev environment and a fragility the
code's own comments show the author was aware of and tried, incompletely,
to guard against.

## Not a bug (environment/timing): "Failed to return to admin session" on End Session

The final `POST /auth/handoff/consume` calls in the network log returned
**410** (code expired or already used) when clicking **End Session** after
several minutes of manual investigation (screenshots, source reads,
re-login) had elapsed since the `return_code` was minted. `AuthHandoffController`
sets a firm 60-second TTL (`Cache::put(..., self::TTL_SECONDS)`,
`TTL_SECONDS = 60`) with no renewal. This is very likely simple TTL
expiry from human-speed manual testing, not a code defect — a real
machine-speed impersonate→work→end-session cycle would comfortably fit in
60 seconds. Logged for awareness (a superadmin who leaves an impersonated
session idle for over a minute before ending it will hit this same "Failed
to return to admin session" error and be logged out of both accounts,
needing to log back into the superadmin panel from scratch) but not
treated as a bug given the TTL is clearly an intentional, documented
security control (`AuthHandoffController`'s own docblock: "short-lived
opaque code safe to put in a redirect URL").

## Not independently re-verified: `web/app/admin/handoff/page.tsx`'s own consume call in isolation

Because the return leg failed on TTL/expiry (above) before reaching
`web/app/admin/handoff/page.tsx` with a still-valid code, this task did
not get a clean, successful live observation of *this specific file's*
success path (toast "Session Restored", redirect to `/admin/stores/`).
The forward leg (`client/app/auth/callback/page.tsx`, structurally
identical code) was confirmed to work correctly end-to-end (real login,
real dashboard access) once the false-error UI issue above is looked past.
Source read of `web/app/admin/handoff/page.tsx` shows no divergence from
that pattern — same `consumeHandoffCode`, same store-hydration
(`setToken`/`setUser`), same redirect — so it's assessed as almost
certainly working the same way, just not independently confirmed via a
successful live round trip within this task's session.

## Console/network

No console errors observed on either `/auth/callback` or `/admin/handoff`
across all attempts. All `/auth/handoff` and `/auth/handoff/consume` calls
returned expected status codes given the state of each code (200 for
fresh/valid, 410 for expired-or-reused, matching
`AuthHandoffController`'s documented contract exactly).
