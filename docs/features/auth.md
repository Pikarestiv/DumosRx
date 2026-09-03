# Authentication / Login

Routes: `app/login/page.tsx` → `app/login/use-login-page.tsx` (tab/mode
orchestration) → `components/auth/lock-screen.tsx` (account-tile PIN pad) /
`components/auth/traditional-login-form.tsx` (username+PIN "Sign In" form).
Session state lives in `lib/context/auth-context.tsx` (`AuthProvider`,
`useAuth()`); active-store state lives in `lib/context/store-context.tsx`
(`StoreProvider`, `useStore()`); auto-lock state is a separate Zustand store
in `lib/hooks/use-auto-lock.ts`. Local-first: every check here is a plain
SQLite (sql.js) read/write on-device (`getUserByUsernameOrEmail`,
`getUserPin`, `updateUserPin` in `lib/db/queries/auth.ts`), not a network
call to the Laravel backend — the backend is only involved for the
subscription-plan and PIN-recovery-sync checks described below.

Walked live against "Pikarestiv Stores 2" / "Pikarestiv Stores" (both on the
Pika Restiv / Store Owner account, PIN `1111`) on 2026-09-03.

## The clock-in / PIN-entry screen

`LockScreen` → `UserSelection` (`components/auth/user-selection.tsx`) is a
Netflix/Apple-TV-style avatar picker: one tile per entry in
`localStorage.dumos_recent_users` (max 5, deduped by username, newest
first — see `login()`'s update logic below), each showing first name + role,
plus a dashed "Someone else" tile that hands off to
`TraditionalLoginForm`'s full username/PIN "Sign In" form. With exactly one
recent user the copy reads "Select your profile to continue"; with more than
one it reads "Who's clocking in?" — this is the literal clock-in screen
named in this task's brief. **Confirmed live: this device currently has 3
recent accounts** (Pika Restiv / Store Owner, plus two pre-existing
"Sales Staff" fixture accounts — "Pika Store 1 Cashier 1" / "Pika Store1
Cashier2" — left over from the Settings task), so the 3-tile + "Someone
else" grid rendered exactly as coded. Selecting a tile shows `PinEntry`
(`components/auth/pin-entry.tsx`): a 4-digit `InputOTP` that auto-submits on
the 4th digit (no explicit "Unlock" click needed) via `attemptLogin`, which
takes the typed value directly rather than reading `pin` from closure state
(the codebase's own comment: `PinPad`'s `onSubmit` can fire before React
applies the last keystroke's state update).

There is no separate "store selection" step on this screen — which store is
active is orthogonal to which user is logging in (see Store/account
switching below); a staff member with a fixed `store_id` always resolves to
that store regardless of what was last active on the device.

## Correct PIN

Confirmed live twice (once via the lock-screen tile flow, once via
`TraditionalLoginForm`'s username+PIN form): a correct PIN calls
`login(username, pin)` (`auth-context.tsx`), which matches
`dbUser.pin === pin` on the local `users` row, sets `user` state, persists
`dumos_user`/`dumos_recent_users` to `localStorage`, marks
`sessionStorage.dumos_session_authenticated = "1"`, force-unlocks the
auto-lock store, logs `AUDIT_ACTIONS.LOGIN`, shows a "Welcome back, `name`!"
toast, and lands on `/dashboard`. Live: `DashboardOverview`'s own loading
skeleton (documented in `dashboard.md`) was visible for a moment immediately
after login — genuinely reproduced this time, unlike the Dashboard task's
"not independently reproduced" note, since login always starts from an
empty React Query cache (see Item #7 investigation below for why that
matters).

## Incorrect PIN

Confirmed live from both entry points. On a PIN mismatch, `login()` logs
`AUDIT_ACTIONS.LOGIN_FAILED` (`reason: "invalid_pin"`, attributed to the
target account's `record_id` since there's no session yet to attribute to),
clears the PIN field, triggers the OTP boxes' shake animation
(`hasError` → a 0.4s `x` keyframe transform), and shows an "Invalid PIN.
Please try again." (lock screen) / "Invalid credentials. Please try again."
(traditional form) toast. The user stays on the same screen — no redirect,
no account lockout after repeated failures observed (no attempt-count
throttling in the code beyond the PIN-recovery-sync cooldown described
next).

**Notable non-obvious behavior (read in code, not something a wrong-PIN
click can trigger directly, and not exercised live since it needs a real
cloud-linked store and a genuine web-dashboard PIN reset):** on a mismatch,
if this device has a cloud link (`auth_token` in `localStorage`) and hasn't
done so in the last 10s, `login()` pulls a sync once and rechecks the PIN
before actually failing — a PIN reset made via the web dashboard writes
straight to the cloud DB, and this closes the "device hasn't synced down
yet" gap without requiring the locked-out user to know to reload first.

## Logout

Two distinct actions, both reached via the account menu in the sidebar
footer (avatar + name + role, bottom-left) — confirmed live:

- **Switch Account** (`lib/hooks/use-account-actions.ts`,
  `handleSwitchAccount`) — calls `useAutoLockStore.getState().lockForSwitch()`
  and nothing else. Explicitly documented in the code as "not destructive:
  the local session/data stays intact, this just shows the same lock screen
  used for idle re-auth, forced to account-selection mode." No confirmation
  dialog (nothing is being cleared). This reuses the same `LockScreen` UI as
  auto-lock, just pre-populated with the account grid instead of defaulting
  to the current user's PIN entry.
- **Log out completely** (`handleFullLogout` → `performFullLogout`) — a real,
  destructive session end: clears `dumos_recent_users` from `localStorage`
  ("Clear lock screen history" — deliberately more than plain
  `auth-context`'s `logout()` does, per the function's own comment, which
  flags that a past drift once let one surface's logout leave the tile cache
  intact so it looked identical to Switch Account instead of actually ending
  the session), then calls `logout()` (clears `user`, `dumos_user`,
  `dumos_session_authenticated`, `queryClient.clear()`), then
  `router.push("/login")`. **Confirmed live:** if there are pending
  unsynced offline transactions (`getSyncQueueCount()`), a confirmation
  dialog appears first — "Unsynced Changes Detected... You have N offline
  transactions pending sync. If you log out now, another user logging into
  this device will sync them on their account. Are you sure you want to sign
  out?" (`components/dashboard/unsynced-logout-dialog.tsx`) — a real,
  well-designed guard against silently attributing one user's offline sales
  to whoever logs in next on a shared terminal. Confirming lands on
  `/login`'s full "Sign In" form (not the tile picker, since
  `dumos_recent_users` was just wiped) — correctly distinct from Switch
  Account's tile-picker landing.

**Caveat observed live:** immediately after confirming "Sign Out Anyway,"
the still-mounted `/dashboard` route briefly rendered a broken/empty shell —
empty stat-card skeleta with no shimmer, "Good morning," with no name, a
"Log in again" link where the account chip normally is — for well under a
second before the client-side redirect to `/login` completed. Not a data
leak (no real figures were shown, just empty containers) and not the item
#7 symptom (this is the opposite direction: a blank future state, not a
stale past one), but a rough edge worth a follow-up: the redirect effect
apparently fires after an intermediate render with `user: null` rather than
before one, producing one visible broken frame.

## Protected routes when logged out

Confirmed live: after "Log out completely," navigating directly to
`/settings/staff` (typed URL, not a link click) did **not** show Staff
Management, and did **not** immediately redirect to `/login` either —
instead it briefly rendered the Settings shell itself with only the
non-account-gated tabs visible (General/Security/Alerts; Business Info,
Staff, Payment Methods, etc. were absent from the sidebar, and there was no
account chip top-right), landed on the General tab's cosmetic
Appearance/Sidebar controls, and only then completed a client-side redirect
to `/login`. No real business data (staff names, store figures) was ever
exposed during that window — worth documenting as a UX rough edge (a
stripped shell flashes before the redirect, rather than the redirect
happening synchronously/server-side), not a data-security bug, since
`output: export` (this app has no server-rendered auth gate — see
`inventory.md`/`dashboard.md`'s repeated mentions of `generateStaticParams`)
makes a hard server-side redirect impossible here by construction.

## Store / account switching (multi-store, multi-staff)

This account has both switching mechanisms reachable, and both were
exercised live:

- **Store switcher** (`components/dashboard/header-store-switcher.tsx`,
  top-left of the header) — renders as a plain label when
  `availableStores.length <= 1`, or a dropdown (checkmark on the active
  store) once there's more than one. **Confirmed live: this account has two
  stores** — "Pikarestiv Stores 2" and "Pikarestiv Stores" — so the dropdown
  rendered. Selecting a different store calls `switchStore()`
  (`store-context.tsx`), covered in detail in the Item #7 section below.
- **Switch Account** (multi-staff-PIN switch) — see Logout above; this
  device has 3 real accounts (owner + 2 sales-staff fixtures). Selecting a
  different account and entering its PIN goes through the normal `login()`
  path (PIN-checked, cache-cleared, audit-logged), not a lighter "switch"
  code path — from the app's perspective this is just another login, whose
  target user happens to have a fixed `store_id` that may differ from
  whatever store was previously active. **Confirmed live:** logging in as
  "Pika Store 1 Cashier 1" (a Sales-Staff account fixed to "Pikarestiv
  Stores") correctly hid the Store Owner's Action Center and admin-only nav
  items (Procurement/Expenses/Reports/Activity Log/Settings) and swapped
  Quick Actions to the cashier's smaller set (New Sale, Close Register, Scan
  Barcode, Customers) — role scoping is correctly re-evaluated on every
  login, not just on first mount.

## Session / auto-lock interaction

`lib/hooks/use-auto-lock.ts` — a Zustand store persisted to
`localStorage.dumos_autolock` (`duration`, `isLocked`, `lastActivity`).
Settings > Security's "Auto-Lock Screen" dropdown (documented in
`settings.md`) sets `duration` in minutes; an inactivity-polling `setInterval`
(every 10s, checking `Date.now() - lastActivity` against `duration`,
gated on `canAutoLock` — a paid-tier feature) calls `lock()` once exceeded.
**Confirmed live via the manual trigger** (Ctrl/Cmd+L, `useLockShortcut` —
the same `lock()` call the idle timer itself uses, so this is a faithful
substitute for waiting out the real 5-minute default): triggering it
instantly overlays the same `LockScreen`/`PinEntry` UI used for a fresh
device landing, defaulting straight to the current user's PIN entry (not
account selection, since `forceAccountSelection` is only set by
`lockForSwitch()`, never by `lock()`). **This is a quick-unlock, not a full
logout**: `user` state, `dumos_user`, and
`sessionStorage.dumos_session_authenticated` are all left untouched by
`lock()` — only `isLocked: true` is set — so re-entering the correct PIN
just calls `unlock()` via the normal `login()` success path and returns
straight to the exact same dashboard state, no re-fetch-from-scratch weirdness
beyond what any `login()` call already does (see Item #7). A wrong PIN at
this screen behaves identically to a wrong PIN at initial login (shake +
toast, stays locked).

## Item #7 investigation: does an account/store switch show stale data?

**Background:** `docs/features/_known-bugs.md` item #7 is a user report —
"a small lag when one switches account or something where for a second or
so, after switching, the old account's dashboard is shown" — with a
candidate root cause already written up: `store-context.tsx`'s
`switchStore()` calls `queryClient.cancelQueries()` then
`queryClient.invalidateQueries()` (broad, deliberately untargeted — the
code's own comment explains switching stores is infrequent enough that
correctness matters more than avoiding a refetch), and `invalidateQueries()`
alone marks queries stale and triggers a background refetch **without**
clearing what's currently rendered — by default a component keeps showing
its last-known (now-stale) data until the refetch resolves. That is a real,
documented React Query behavior, and would produce exactly the reported
symptom if the refetch takes long enough to notice.

**What was actually tested live, three separate ways:**

1. **Store switcher** (`switchStore()`'s `invalidateQueries()` path,
   directly matching the candidate root cause) — switched between
   "Pikarestiv Stores 2" (1,514 products, ₦1,918,058 inventory value, 0
   sales) and "Pikarestiv Stores" (1,526 products, ₦7,501,375, 2 real
   sales in Recent Activity) **6 times**, alternating directions, using
   `browser_batch` to fire the click and take 3–4 screenshots back-to-back
   with no manual delay in between (the fastest round-trip this tooling
   allows, well under a second total). **Every single screenshot, including
   the very first one taken immediately after the click, already showed the
   fully correct new store's numbers** — Total Products, Inventory Value,
   Action Center card counts (which differ meaningfully between the two
   stores — e.g. "2 Items Expiring" only exists on one of them), and Recent
   Activity rows all matched the destination store on first paint. The old
   store's data was never observed rendering under the new store's header,
   at any point across 6 trials.
2. **Multi-staff account switch** (`login()`'s `queryClient.clear()` path —
   a *different* code path from `switchStore()`, and structurally can't
   show stale data by design: `clear()` removes cached data outright rather
   than marking it stale-but-displayable, so a slow refetch would show a
   loading skeleton, not old data) — switched from Store Owner (Pikarestiv
   Stores, admin dashboard) to "Pika Store 1 Cashier 1" (fixed to the same
   store, Sales-Staff role). Same rapid-screenshot technique: first
   post-login screenshot already showed the correct role-scoped UI (Action
   Center gone, nav items reduced, Quick Actions swapped) with the same
   store's correct figures — no stale owner-view flash, and also correctly
   *not* a generic loading skeleton once first rendered (only briefly
   visible right after the very first raw login, per the "Correct PIN"
   section above).
3. **Console/network check during switches:** `read_console_messages`
   showed no errors at any point across all switches — only expected
   `[StoreContext]` sync-related logs. `read_network_requests` found no
   relevant entries to inspect, because dashboard/store-profile data in this
   app is read from local sql.js, not fetched over HTTP — the store-switch
   refetch this task needed to time is a synchronous-feeling in-process
   query, not a network round-trip with its own latency budget.

**Conclusion: (c)/(a) — could not reproduce the reported flash as a live,
observable defect; the candidate mechanism is real but appears to resolve
too fast to notice in this environment.** `invalidateQueries()`'s
stale-then-refetch window is confirmed to exist by reading the code (it's
not a misdiagnosis), but empirically, every refetch in this app's
local-first architecture (sql.js reads, no network round-trip) completed
fast enough that no intermediate frame with the old store's data was ever
caught — not in six single-store-pair trials, and not via the structurally
different multi-staff path either. This reads as confirmed React-Query
stale-while-revalidate behavior that is, in practice on this store's data
volume and this test device, imperceptible — "working as designed," not a
data-correctness bug — rather than a confirmed reproduction of the user's
report.

**What this does *not* rule out**, stated plainly rather than glossed over:
the user's report may reflect conditions this session couldn't reproduce —
a slower device, a much larger local database (sql.js query cost scales
with row count; this store's ~1,500-product catalog may simply query fast
enough that the window is sub-frame), a real network-sync race (switching
stores also kicks off a background `sync()` call, which several console
logs showed firing concurrently with the switch — a slow/contended sync on
a real device could plausibly stretch the same refetch that resolved
near-instantly here), or simply a one-off perceptual effect (the toast/motion
animation drawing attention right as the switch happens). None of these
could be safely fabricated or tested further within this task's read-only,
no-app-code-changes scope.

**Suggested follow-up if this is ever reported again with reproduction
steps:** capture a screen recording (not manual screenshots — the ~1s
window this report describes could still be shorter than this session's
screenshot round-trip latency, meaning a real flash could have been missed
between calls) on the reporter's actual device, and/or add a
`placeholderData`/skeleton state to the store-switch transition
specifically (distinct from the initial-load skeleton already on
`DashboardOverview`) so that *if* a slow environment ever does hit the
stale window, the user sees a neutral loading state instead of either the
old store's numbers or a jarring pop-in — a UX improvement worth scoping
regardless of whether the underlying report reproduces, since
`invalidateQueries()`'s stale-render window is real by design even if this
session's evidence says it's currently fast enough not to matter.
