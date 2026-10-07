# AGENTS.md: DumosRx Web

This file exists so any AI (or human) picking up this repo cold can get
oriented quickly. Keep it updated when architecture, conventions, or the
current focus of work change — see `client/AGENTS.md` for the sibling
package's version of this same file and the same maintenance expectation.
The standing rule for that (docs ship in the same change as the code,
including moving a fixed finding from `docs/KNOWN_BUGS.md` into
`docs/FIXED_BUGS.md`) lives in `.agents/AGENTS.md` §2, not here.

## What this is

`web/` is the **public marketing site + store-owner dashboard + platform
admin panel** for DumosRx, a Next.js 16 (App Router) app statically exported
(`output: "export"` in `next.config.ts`, deployed via FTP — see
`trailingSlash: true` and `images.unoptimized`). It is a *separate* Next.js
app from `client/` (the offline-first Tauri POS app) and a separate repo
concern from `laravel-server/` (the API both talk to).

Rough map of `app/`:
- Public/marketing pages (`page.tsx`, `faq`, `support`, `terms`, `privacy`, `downloads`)
- `(auth)`, `login`, `register`, `forgot-password`, `reset-password` — store-owner auth
- `dashboard/` — now redirect-only stubs pointing at `client/`'s deployed app
  (`getAppURL()`); the real dashboard UI was migrated to `client/` and this
  folder was deliberately gutted, not abandoned mid-work
- `admin/` — the **platform admin panel** (super_admin / platform_admin /
  agent roles): stores, staff, billing, broadcasts, feedback, system config,
  impersonation. This is the security-sensitive part of this package.

Tech stack: Next.js 16 App Router, React 19, TypeScript, Tailwind, Zustand
(`lib/store/`), TanStack Query, axios (`lib/api/`), react-hook-form + zod.

## Admin auth architecture (redesigned 2026-08-26 — read before touching auth)

**Do not put the admin access token back in `localStorage`.** This was
audited and fixed because the old design kept the *same* plaintext Sanctum
token duplicated in both `localStorage["drx_admin_token"]` and an
`HttpOnly` cookie, promoted to a bearer header for every API route by a
now-deleted middleware (`AuthenticateFromCookie`) with `SameSite=None` and
zero CSRF protection — a real CSRF-shaped hole plus no actual XSS
defense-in-depth (both storage locations were equally readable/exploitable
together). The current design:

- **Access token**: held only in memory, in `useAdminAuthStore`
  (`lib/store/use-admin-auth-store.ts`, `token` field). `persist`'s
  `partialize` deliberately excludes it from localStorage — don't remove
  that exclusion, and don't add a new `localStorage.setItem` for it anywhere
  (login form, impersonation handoff, base-client interceptors — all of
  these were fixed to use the zustand store instead).
- **Refresh**: a separate, `refresh`-ability-scoped Sanctum token lives
  *only* in the `drx_admin_session` cookie (`HttpOnly`, `SameSite=Strict`,
  never appears in any JSON response). Because the access token doesn't
  survive a page reload, `useAdminAuthStore.getState().initSession()` calls
  `POST /admin/session/refresh` on mount (`admin/layout.tsx`,
  `admin/login/page.tsx`) to silently re-establish a session from that
  cookie — this replaced the old pattern of checking `localStorage` then
  calling `/user` (which cascaded into a doomed `/refresh` 401 on every
  cold, logged-out visit).
- **Backend**: `laravel-server/app/Http/Controllers/Api/AuthController.php`
  — `login()` mints the access token normally but only mints the
  refresh-ability cookie token when `device_name === 'web'` (i.e. this app,
  specifically — not `client/`'s desktop app, which has its own, unrelated,
  bearer-token-based `/refresh` flow via `client/lib/api/token-manager.ts`
  and must not be touched by changes here). `refreshAdminSession()` is the
  new cookie-only endpoint (`POST /admin/session/refresh`, registered
  outside the `auth:sanctum` group in `routes/api.php` since it has no
  bearer token to check). `logout()` now also revokes the refresh token and
  clears the cookie.
- **The old `AuthenticateFromCookie` middleware is gone** (deleted, and its
  global registration removed from `bootstrap/app.php`). Nothing should
  ever again silently promote an ambient cookie into an `Authorization`
  header for general API routes — that was the actual vulnerability.
  `PersonalAccessToken::findToken()` is called directly, only inside
  `refreshAdminSession()`/`logout()`, on the cookie's raw value.

- **Dashboard-shell access gate (`checkCanAccessAdmin`, fixed 2026-10-02,
  A-141):** `use-admin-auth-store.ts`'s `checkCanAccessAdmin(user)` decides
  whether the login form/layout guard let a session into `/admin` at all.
  It used to hardcode the 3 built-in platform role slugs, which bounced
  every custom platform role created via the admin-delegation "create
  role" UI even after the backend granted it access — it is now
  `checkHasPermission(user, "manage_platform")`, the literal frontend
  mirror of the `permission:manage_platform` gate wrapping the entire
  `/admin/*` route group server-side (`laravel-server/AGENTS.md`'s
  delegation section). Never go back to a role-slug allow-list here: a new
  custom role must never need a frontend code change to sign in.

**Known adjacent surface that intentionally was *not* touched:**
- `app/admin/stores/page.tsx` (impersonation) and
  `app/admin/handoff/page.tsx` (return-from-impersonation) use a *different*
  mechanism: one-time handoff codes (`AuthHandoffController`,
  `webApiClient.createHandoffCode`/`consumeHandoffCode`) that wrap an
  already-minted token for cross-origin transfer to `getAppURL()`. These
  were updated only to read/write the token via `useAdminAuthStore` instead
  of the now-removed `localStorage["drx_admin_token"]` key — the handoff
  code mechanism itself is unchanged and out of scope.
- `AdminStoreController::restoreSession()` (`/admin/restore-session`) is
  dead code from the current UI's perspective — `useRestoreSessionMutation`
  in `lib/api/admin-hooks-stores.ts` is defined but never called anywhere.
  Left in place (in case it's wired up later) but hardened in the
  2026-09-24 review: it now sets `drx_admin_session` via the same shared
  `ManagesAdminSessionCookie::buildAdminSessionCookie()` helper
  `login()`/`refreshAdminSession()` use (`Strict`), not a hand-rolled
  `SameSite=None` copy. `AdminStoreController::impersonateStore()` — used
  live by `app/admin/stores/page.tsx` above — previously had the same
  hand-rolled `SameSite=None` cookie write; it's removed entirely there,
  since the impersonation flow only ever consumes the JSON body's `token`
  for the handoff-code exchange, never this cookie. See
  `docs/FIXED_BUGS.md`.
- `client/`'s login/refresh flow (`client/lib/api/token-manager.ts`) is
  entirely separate and was deliberately left untouched — it's bearer-token
  based, has no cookie dependency, and silently refreshes only after 7 days
  via `refreshTokenSilently`.

## Storefront checkout: redirect lock and named reprice removals (A-105/A-106)

- **Don't clear `loading` on the Paystack branch.** `window.location.href = ...`
  starts a navigation but keeps running JavaScript, so the old
  `finally { setLoading(false) }` re-enabled "Place Order" for the whole
  interval before the browser unloaded — a second tap minted a second,
  orphaned payment intent (A-105). `handleSubmit` now tracks a local
  `redirectStarted` flag (the `finally` skips the reset) plus a `redirecting`
  state the button honours and labels ("Redirecting to Paystack...").
- **`useCartRepricing` names what it removed.** It splits the reprice result
  into `removed` (absent from the catalog response) and `repriced`, and names
  the items in each toast instead of the old blanket "Some prices or items in
  your cart changed" (A-106). The structural half of A-106 is **not** fixed:
  `GET /storefront/{slug}` is still capped at `MAX_STOREFRONT_PRODUCTS = 300`
  while `checkout()`/`priceCart()` are uncapped, so a catalogue past 300
  products can still drop a legitimately purchasable item — the customer now
  at least sees which one. The real fix is a cart-scoped pricing endpoint
  (`POST /storefront/{slug}/price-cart` taking item ids); log it there if it
  gets built.

## Storefront money is formatted from the store's own currency (PG-4)

`GET /storefront/{slug}` returns `store.currency` (the store's ISO code,
falling back to the platform default only for a row with no currency at all —
see `StorefrontController::storeCurrency()`). `useCartRepricing` surfaces it as
`currency`, and `components/storefront/checkout-form.tsx` formats every amount
through **`lib/utils/currency.ts`'s `formatMoney(amount, currency)`** instead
of the three hardcoded `₦` literals it used to carry: a Ghana or Kenya store
charged in its own currency but displayed a naira sign at checkout. `currency`
is `null` until the catalog call resolves, and `formatMoney` falls back to NGN
for that window, so the summary can briefly show `₦` before the fetch lands —
acceptable because the submit button is disabled while `pricesLoading`.

`formatMoney` uses `Intl` `narrowSymbol` and degrades to the raw ISO code for a
currency with no widely-recognised symbol (KES renders as `KES`, GHS as `GH₵`)
rather than guessing.

**Still open, deliberately out of PG-4's scope:** the rest of `web/` keeps its
own hardcoded naira — `storefront-cart.tsx`, `product-card.tsx`, the
`referrals-*`/`plan-tier-card`/`subscription-config-tab` per-file `naira()`
helpers, `revenue-overview.tsx`, `lib/constants/subscription-plans.ts`. The
admin/subscription ones are genuinely naira (platform billing is NGN); the two
storefront ones are the same bug as PG-4 and should move to `formatMoney` when
the storefront product/cart views next get touched.

## Download and site URLs come from `lib/constants.ts` (A-104)

`DOWNLOAD_URL` and `WEB_APP_URL` are env-overridable
(`NEXT_PUBLIC_DOWNLOAD_URL`, `NEXT_PUBLIC_WEB_APP_URL`), so nothing under
`app/`, `components/` or `hooks/` may spell those domains out — a hardcoded
copy silently makes the override a no-op (a staging build pointing testers at
production binaries). Both Downloads pages now share
`FALLBACK_RELEASE_LINKS` from `lib/api/release-hooks.ts` instead of their own
literal defaults, and `app/layout.tsx`'s OpenGraph/Twitter metadata is built
from `WEB_APP_URL` like `app/sitemap.ts` already was.
`__tests__/no-hardcoded-domains.test.ts` scans those three directories and
fails on any new literal.

## Telemetry redaction and session-end cache hygiene (A-100/A-107)

`lib/api/logger.ts`'s `sanitizePayload` masks (never drops) sensitive values,
so a report keeps its shape and stays diagnosable. It matches two ways:
`SENSITIVE_KEY_FRAGMENTS` as substrings (`password`, `token`, `pin`,
`credentials`, `customer_*`) and `SENSITIVE_KEY_NAMES` as whole keys
(`email`, `phone`, `address`, …) so `store_name`/`product_name` survive while
a bare `email` does not. This matters because the response interceptor
reports **every** failed request's body to `/logs/client-error`, which is
unauthenticated on non-`/admin` paths, and the storefront checkout body is
the one place a member of the public types their name, phone, email and
delivery address (A-107). Adding a PII field to a public form means adding
its key here.

**Anywhere `sessionVerified` goes false, `useAdminStore.getState().reset()`
must run** — it is what removes the persisted `admin-storage` platform
summary (revenue, recent store names, owner emails) from `localStorage`.
Call sites: `logout()`, `initSession()`'s catch, and `base-client.ts`'s 401
refresh-failure branch. Previously only Sign Out cleared it, so a lapsed
session left the summary readable on a shared machine indefinitely (A-100).

## Numeric platform-config fields: draft/commit, never raw `Number()` (A-97/A-98)

`components/admin/numeric-config-input.tsx` (`NumericConfigInput`) is the only
way a number should reach platform config state. `onChange={(e) => Number(e.target.value)}`
is banned on these fields: `Number("") === 0`, so clearing a box to retype it
used to commit `0` instantly — a zero-day trial, a paid tier admitting no
staff, a 0% referral reward, a 0% platform commission (A-97). The component
holds the raw text as a local draft, commits only a value its `isAcceptable`
predicate accepts, shows the rejection inline, and **discards the draft on
blur** so what's on screen is always what would be saved (so a test that
clears a field and then types must clear again after touching another field).

Current call sites: `plan-tier-card.tsx` (prices, staff/store limits),
`subscription-config-tab.tsx` (`trial_days`), `storefront-commission-card.tsx`,
`marketing/referrals-settings-form.tsx`. Server-side floors mirror them in
`laravel-server`'s `SystemConfigController::validatePlanPricing()` /
`rejectZeroTierLimits()` — a staff/store limit of `0` is rejected outright
(`-1` means unlimited), as is `trial_days` outside 1–365.

**Storefront Commission has its own card** (`storefront-commission-card.tsx`,
split out of `subscription-config-tab.tsx`) because it needed the same
`try`/`catch` + `toast.error` shape as its siblings and a `ConfirmDialog`
naming the before/after rate: its save previously had no error handling at
all, so a 422 was indistinguishable from success (A-98). Every save handler
on this tab surfaces `error.message`; don't pass a bare `async` function to
`onClick`.

## `platform_admin`/`agent`: "My Stores", the scoped fleet view (A-113)

These two roles register stores (`create_accounts`) but must not see the
platform-wide fleet list — `GET /admin/stores` is `role:super_admin` because
its rows carry every store's revenue. They now get `/admin/stores/mine`,
backed by `GET /admin/stores/registered-by-me`
(`AdminStoreController::storesRegisteredByMe` → `AdminStoreService::getStoresRegisteredBy`),
which returns only stores whose owner carries the caller's id in
`users.registered_by_id` — the column `registerStore()` already sets — and
**no revenue fields at all**. The route is gated on
`permission:create_accounts`, the same permission that lets them register a
store, not on a role string; it must stay registered *above* `/stores/{id}`
or the wildcard swallows it. Coverage:
`laravel-server/tests/Feature/Admin/AdminRegisteredStoresScopeTest.php` and
`web/__tests__/admin-my-stores.test.tsx`.

Still missing for these roles (deliberately deferred, was the other half of
A-113): a UI for `grant-trial`/`activate-plan`. Note those routes are
`permission:grant_trials`, which `RolesAndPermissionsSeeder` grants
`platform_admin` but **not** `agent` — so that surface belongs to
`platform_admin` only, and the sidebar item would need `roles: ["platform_admin"]`.

## Admin nav: one role filter, two renderers (A-96)

`components/admin/sidebar-items.ts` owns both the `sidebarItems` list and
`visibleSidebarItems(role)`, the single role filter. An item with no `roles`
field is **super_admin-only** — that's the default, so only list `roles`
explicitly for what `platform_admin`/`agent` should see. Everything hidden
here is still enforced per-endpoint server-side; the filter exists so those
roles don't get dead links that only 403.

Two components render that list and **both must go through
`visibleSidebarItems`**: `admin-sidebar.tsx` (desktop, `hidden lg:flex`) and
`admin-header.tsx`'s mobile `Sheet`. The sheet is the *only* navigation below
1024px, and it previously mapped `sidebarItems` raw — so an agent on a tablet
saw the whole super_admin nav (A-96). `__tests__/admin-nav-role-visibility.test.tsx`
asserts both renderers agree; don't reintroduce a second copy of the filter.

**A nav item's gate must match its page's narrowest endpoint gate, not the
page's general area.** This rule has already been broken once, in admin Phase 1:
the new Operations item was gated `permissions: ["view_platform_data"]` because
it lives alongside Stores and Platform Users, but the only two endpoints it
calls — `GET /admin/health` and `GET /admin/errors` — are `role:super_admin` in
`routes/api.php`. A delegated role saw the link, clicked it, and got "Failed to
load system data" from a 403. Every backend test passed; only a logged-in
browser check caught it, which is why `.agents/AGENTS.md` §9 requires one for
nav changes. Before adding an item, read the routes its page actually calls.

## Admin information architecture (Phase 1, 2026-10-06)

Spec: `docs/superpowers/specs/2026-10-06-admin-panel-phase-1-design.md`.

- **`/admin/operations` is the single telemetry surface.** It owns
  infrastructure health, the live service probes, and the Sentry issue feed.
  Before Phase 1 this was split in two: a Settings "System Health" tab, and an
  `/admin/system` page that **was not in `sidebar-items.ts` at all** and so was
  reachable only by typing the URL — which is why the Sentry feed was built and
  then never seen. Don't re-add a second telemetry surface.
- **`/admin/system` is a redirect, not a deletion.** It `router.replace`s to
  `/admin/operations` so existing bookmarks resolve. Verified in a browser with
  a live session; note that a hard navigation to any `/admin/*` deep link first
  passes through the layout's `initSession()` restore, so the redirect only runs
  once that succeeds.
- **Operations is super_admin-only**, matching its endpoints (see the rule
  above). If `/admin/health` and `/admin/errors` are ever relaxed to
  `permission:view_platform_data`, relax the nav item in the same change.
- **Email Templates lives under Communications**, beside the broadcast and
  email-campaign tabs that consume templates — not under Platform Settings,
  where editing a template and sending it were two different pages.
- **`DefaultAccountManagerCard` moved the other way**, off the system page into
  Platform Settings, because it is configuration rather than telemetry.
  Settings' default tab is now `billing`.

### Unmeasurable metrics render as unavailable, never as zero

The phase's central rule, and the reason several of these components look
defensive. `AdminHealth`'s `loadAverage`, `memory` and `disk` are `| null`:
`null` means *this host could not measure it*, and the UI must say so
("Unavailable on this host"), never fall back to a `0` or a plausible string.
A zeroed progress bar reads as a healthy idle server; `'Unknown'` reads as a
value. Both are lies. This is not hypothetical — `shell_exec('free -m')` is
blocked on the Namecheap shared host, so the memory reading is `null` in
production, which is exactly what the admin should see.

The same rule governs money and counts: `Subscription Revenue` renders "No
payments yet" rather than `₦0`, and `sync_success_rate_today` renders "No sync
activity" rather than the optimistic `100%` the old UI defaulted to.
`__tests__/no-fabricated-metrics.test.ts` fails the build if any of the
literals Phase 1 removed (`"42ms"`, `|| '100%'`, `High Performance`,
`Status Page Pending`, `WebSocket`, `Global Inventory`) reappears under
`app/admin` or `components/admin`.

### A surface gated more narrowly than the layout needs its own page guard

`app/admin/layout.tsx` admits anyone holding `manage_platform`. So for any page
restricted *beyond* that — super_admin-only, or permission-specific — hiding the
nav item is not enough: a bookmark, a pasted link or a colleague's "have a look
at this" loads the page shell, fires the query, takes a 403, and renders a
generic "failed to load / Retry" screen. That is indistinguishable from an
outage, and the colleague files a bug.

`app/admin/subscriptions/page.tsx` is the pattern to copy: it checks
`checkIsSuperAdmin(user?.role)` **before rendering or fetching anything** and
returns an explicit "only available to super admins" state with a link back to
Overview. A refused role issues **no request at all** — pinned by
`__tests__/admin-subscriptions-gate.test.tsx`.

**This is presentation, not protection.** The route middleware is what refuses
the data; the guard is what makes the refusal legible. Never treat a page guard
(or a hidden button) as a security control. PG-15 is this same defect on
`/admin` — when fixing it, copy this pattern.

### Subscriptions (Phase 3, 2026-10-07)

Spec: `docs/superpowers/specs/2026-10-07-admin-panel-phase-3-subscription-lifecycle-design.md`.

- **A worklist, not a report.** Four buckets — expiring, trials ending, lapsed,
  payments needing attention — each row carrying the action that resolves it.
- **The actions are the existing ones.** `SharedGrantTrialDialog`,
  `SharedActivatePlanDialog` and `SendNotificationDialog` call the endpoints that
  already exist; this page adds no mutation endpoint and does not proxy any, so
  no action's authorisation can be widened from here. Buttons are **hidden via
  `checkHasPermission`, never disabled**.
- **Gated at four layers**: `role:super_admin` route middleware (the control),
  a nav item defaulting to super_admin-only, the page guard above, and
  per-action permission checks on both sides. super_admin-only is a v1 decision:
  these lists carry subscription money data, which `RegisteredStoreSummary`
  already withholds from `platform_admin`/`agent`. A scoped
  "my registered stores" view via `registered_by_id` is the logged follow-up.
- **`trial_conversion_rate` is `null` when no trials started** — render "No
  trials started", never `0%` (reads as "the trial is failing") or `100%`.
- `end_date` is a bare `YYYY-MM-DD`, so it goes through
  `formatDateOnlyToDDMMYYYY`; payment timestamps are ISO and go through
  `formatDateToDDMMYYYY`.
- **The tab labels carry `bucket_counts`** (`BucketTabsList`), so an operator can
  see where the work is without opening all four. The page owns the
  `useAdminSubscriptionLifecycle` call and passes the payload down to both the
  figures and the tabs — one query, not two. While it is loading, labels render
  bare: a count of zero is a fact, an absent payload is not.
- **Changing the day window resets paging.** A paginated list whose filter
  changes under it keeps asking for a page that no longer exists, and the panel
  then renders "Nothing needs attention here" over a bucket that has entries.
  `useResettingPage(days)` (in `hooks/`) is the seam; reach for it in any panel
  that pairs a page cursor with a filter control.

### Trends (Phase 4, 2026-10-07)

Spec: `docs/superpowers/specs/2026-10-07-admin-panel-phase-4-trends-design.md`.

- **There is no MRR, deliberately.** `subscriptions` holds no amount and no
  billing cycle, and nothing records whether a plan auto-renews, so the page
  reports **cash collected** — successful payments, labelled as such. Don't add
  an "estimated MRR"; that is the class of number Phase 1 deleted.
- **One line per currency, never a total.** This system holds no exchange rate,
  so a combined revenue line would be meaningless. `CashCollectedChart` renders
  per-currency lines and nothing else.
- **A trend must not rewrite its own past.** Store signups uses `withTrashed()`:
  a store that signed up in March and was deleted in August still signed up in
  March. Filtering soft-deleted rows would shrink past buckets every time
  someone deletes a store, so the chart's history would change under the reader.
  This is the opposite of Phase 1's "active stores", which correctly excludes
  them — because that answers *how many exist now*. Demo stores **are**
  excluded; a demo store is not a signup, and this is the first place `is_demo`
  changes a number.
- **Three distinct empty states, and they must not collapse into one.** An
  absent payload is *unavailable* (we could not look). A zero-filled bucket is
  *data* (we looked, there was nothing) and still draws. A window with no
  payments at all says "No payments recorded in this window" rather than
  rendering an empty grid, which reads as broken — that last one was found by
  the browser smoke test, not the suite.
- **Charts use `recharts`** with colours from the theme's `--chart-1..5`
  variables, never hex (§6). `TrendChart` owns axes, grid, tooltip and
  responsive config so the six charts don't each re-specify them.
- **Bucket labels are DD/MM/YYYY** for daily windows via
  `formatDateOnlyToDDMMYYYY` (which parses a bare `YYYY-MM-DD` without the UTC
  shift); monthly buckets render as "Oct 2026" rather than inventing a day.

### Maintenance (Phase 5, 2026-10-07)

Spec: `docs/superpowers/specs/2026-10-07-admin-panel-phase-5-maintenance-design.md`.

- **The runner lives on its own page, not as an action on Operations.** Applying
  schema changes to production should not be one mis-click away from a dashboard
  somebody opened to read a sync graph. `/admin/operations` carries an
  informational card only; `/admin/maintenance` carries the actions.
- **Gated at four layers**, same shape as Subscriptions: `role:super_admin` route
  middleware (the control), a nav item defaulting to super_admin-only, a page
  guard that runs before anything fetches, and server-side permission checks on
  the actions themselves.
- **An unknown migration status renders "unavailable", never "0 pending".** The
  API returns `pending_count: null` when it cannot read the migrator, precisely
  so the UI cannot render the one sentence that is indistinguishable from "all
  good" — that false statement is what A-170 consisted of.
- **Two separate actions, two separate confirmations.** Running migrations no
  longer seeds (A-174), so "sync roles and permissions" is its own button;
  a permission added to `RolesAndPermissionsSeeder` does not exist in production
  until someone presses it.
- **The confirmation states the specific risk, not "are you sure".** It names the
  count, names how many pending migrations alter existing data, says this host
  cannot roll back a half-failed migration, and warns that a timeout does not
  mean the migration did not apply. A dialog that always shows the worst case
  trains people to click through it, so the destructive warning appears only
  when the scan actually flagged something.
- **Dialogs are built on `components/ui/dialog` with `role="alertdialog"`**, not
  Radix AlertDialog — `web/` has no `@radix-ui/react-alert-dialog` dependency and
  its house primitive is `components/ui/confirm-dialog.tsx`. §9 requires a custom
  modal, not a specific library.
- **After a run, re-read rather than trust the response.** The run mutation
  invalidates the status query `onSettled`, not `onSuccess`.

### Sync health (Phase 2, 2026-10-06)

Spec: `docs/superpowers/specs/2026-10-06-admin-panel-phase-2-sync-health-design.md`.

- **Operations owns the platform view** (`SyncHealthCard`): today/7d success rate,
  refusals grouped by reason, and the worst-affected stores. The **per-store
  drill-down** lives on the store detail page, not a new route, because that is
  where the operator already is when a customer calls.
- **Reason strings are glossed, and the raw string stays visible.**
  `syncReasonLabel()` in `lib/api/admin-hooks-sync.ts` maps the server's
  vocabulary (`permission_denied`, `forbidden`, …) to a sentence an operator can
  act on, and the component renders the raw string underneath so a support
  conversation can quote it. An unrecognised reason falls back to the raw string
  **alone** — don't render it twice. The lookup uses `Object.hasOwn`, not a bare
  bracket index (§8).
- **A `null` rate means nothing synced in the window**, and renders "No sync
  activity" — never `0%`. A store with no history reads "Never synced", never
  "0% success". This is Phase 1's rule and the reason PG-16 existed.
- **What this surface cannot show.** It reports only what reached the server. A
  device sitting on a backlog that never transmitted is invisible here — logged
  as PG-17 (Phase 2b). Don't let the card's copy imply otherwise; its description
  says so explicitly.
- Dates go through `formatDateToDDMMYYYY` (§6); a default `toLocaleDateString()`
  silently produces US order.

### Admin money is per currency, never converted

`CurrencyStatValue` renders one `formatMoney` line per currency present and
takes an `emptyLabel` for its no-data state. Stores span NGN/GHS/KES/CFA, so a
single summed total is not an honest number and there is deliberately no FX
table — see `laravel-server/AGENTS.md` for the server-side half
(`App\Support\CurrencyTotals`). The Overview "Subscription Revenue" stat and the
Stores page "Total Stock Value" card both go through it.

Note that `stock_value_by_currency` is **absent, not empty**, for a
non-super_admin, because the server withholds platform money figures from
`platform_admin`/`agent`. Render the card only when the key is present;
defaulting to `{}` would tell those roles "no stock recorded", which is false.

## Delegated admin action buttons: hide via `checkHasPermission`, never disable

Every admin UI control that triggers one of the backend's delegated
`permission:*`-gated routes (suspend/unsuspend a store, deactivate/reactivate
a user, force a password reset, notify/bulk-notify, impersonate, broadcast
create/edit/delete/toggle — see `laravel-server/AGENTS.md` for the full
`permission:*` route list) must be wrapped in
`checkHasPermission(viewerUser, '<matching slug>')`, not just hidden behind
the sidebar nav entry (A-96's filter only keeps a role from landing on a page
it can't use — it does nothing once they're already on it, e.g. via a direct
URL). `checkHasPermission` (from `use-admin-auth-store.ts`) already returns
`true` unconditionally for `super_admin`, so callers never need a separate
`isSuperAdmin ||` check alongside it.

- **Hide the control, never disable it.** Matches the sidebar's own pattern
  (A-96) and every other role gate in this codebase — no new "disabled +
  tooltip" affordance was invented for this.
- **Two valid wiring shapes, pick based on how many permissions a component
  needs:** a component needing only one or two slugs computes them itself
  (`const { user } = useAdminAuthStore(); const canX =
  checkHasPermission(user, "slug")`) right where it's rendered — see
  `user-table.tsx`, `broadcasts-tab.tsx`, `app/admin/users/page.tsx`. A
  component whose parent already computes role-derived booleans for other
  reasons (`store-table.tsx` already computed `isSuperAdmin`/`canGrantTrials`
  before this convention existed) prop-drills the new booleans alongside the
  existing ones instead of introducing a second, inconsistent computation
  style in the same file (`canImpersonate`/`canManageAccountStatus` on
  `StoreRowActions`).
- **A super_admin-exclusive action (no `permission:*` slug at all, just
  `role:super_admin` on the route) still gates on `checkIsSuperAdmin`, not
  `checkHasPermission`** — don't invent a fake permission slug for it. The
  Communications page is the example: `admin/mail/send` and `admin/feedback`
  are both `role:super_admin` in `routes/api.php`, so the Mail Campaigns and
  User Feedback tabs' triggers and content in
  `app/admin/communications/page.tsx` are both wrapped in
  `checkIsSuperAdmin(user?.role)`, while the page itself (and its sibling
  Broadcasts tab) are reachable by anyone holding `send_notifications`. Any
  new tab added to a page whose nav entry is keyed off a narrower permission
  than "every tab inside it needs" has to be gated the same way — the nav
  filter only controls whether the page is reachable at all, not which of
  its tabs are.
- **Confirm/compose dialogs opened by a gated button don't need their own
  internal permission check** — `reset-password-dialog.tsx`,
  `deactivate-user-dialog.tsx`, `send-notification-dialog.tsx`,
  `store-dialogs.tsx`'s `SuspendStoreDialog`, etc. have no independent entry
  point, so gating lives entirely at the trigger that opens them.
- **A sidebar item that only exposes one delegated capability needs a
  matching `permissions: ["<slug>"]` entry**, same as `view_platform_data`
  already does for Stores/Users/Activity Log — e.g. `communications` needs
  `permissions: ["send_notifications"]` so a `platform_admin`/`agent` holding
  it can reach `/admin/communications` at all, even though that page also
  hosts a super_admin-only tab (gated per the point above, not by hiding the
  whole page from everyone else).

Covered by `__tests__/admin-action-permission-gating.test.tsx` (per-action
hidden/shown/super_admin-bypass cases across `StoreRowActions`, `StoreTable`'s
real slug mapping, `UserTable`, and `BroadcastsTab` including its per-row
menu) and `__tests__/admin-users-page-notify-all-gating.test.tsx`.

## Admin panel: store owners, staff, and the Store Details page

**The Platform Users list (`app/admin/users/page.tsx`) no longer shows staff
accounts.** It is a two-tab directory — *Store Owners* (the default) and
*Platform Team* — backed by the `account_type` param on `GET /admin/users`
(`owners` | `staff` | `platform`; see `laravel-server/AGENTS.md` for the
column-level definition of each). The Roles dropdown is scoped per tab from
`components/admin/users/user-directory-filters.ts`; staff-tier role slugs are
deliberately absent from it, because selecting one could only ever return an
empty list now. Switching tabs resets the role filter and the page number, and
the tab is forwarded to `BulkNotifyDialog` as `filters.account_type` so
"Notify All" reaches exactly the set whose count it quotes.

**Editing a user's profile** lives inside `UserProfileDialog`
(`components/admin/users/user-profile-dialog.tsx`) as a mode toggle, not a
separate dialog: the "Edit Profile" button is rendered only when
`checkIsSuperAdmin(useAdminAuthStore(...).user?.role)` is true, and it swaps
the read-only body for `user-profile-edit-form.tsx`. Keep the validation and
payload shaping in `user-profile-edit-validation.ts` (pure, unit-tested)
rather than in the component —`buildUserProfileUpdate()` sends **only the
fields that actually changed**, which is what keeps an unedited email from
tripping the server's uniqueness rule. The role control is a constrained
`Select` over `lib/constants/platform-roles.ts`'s `PLATFORM_ROLE_OPTIONS`,
shared with the create-platform-admin page so the two can't drift; never let
it become free text, and never add password/status/plan fields to this form —
the server `prohibited`s them and they each have their own row action. See
`laravel-server/AGENTS.md` for the self-demotion and last-active-super_admin
guards behind the endpoint. Covered by
`__tests__/admin-user-profile-edit.test.tsx`.

**Per-admin permission overrides** use the same mode-toggle shape: a "Manage
Permissions" button next to "Edit Profile" swaps the body for
`user-permission-overrides-form.tsx`, gated on `checkIsSuperAdmin(viewer) &&
selectedUser.role_slug !== "super_admin" && PLATFORM_ROLE_SLUGS.includes(
selectedUser.role_slug)` — platform roles only, so the button never appears
for a store owner or staff account even though neither is `super_admin`.
Each catalog permission (`PLATFORM_PERMISSION_OPTIONS`) gets a 3-state
`Select` — Inherited/Granted/Revoked, mapping to `null`/`true`/`false`.

**Only the rows the operator actually touches in that session are submitted**
(tracked in a `touchedPermissions` set) — this is not a style choice, it's
load-bearing: `GET /admin/users` doesn't serialize `effective_permissions`
(see `docs/KNOWN_BUGS.md` A-133), so every row starts at "Inherited" unless
the caller happens to already know better, and `null` (Inherited) deletes
that permission's `permission_user` override row server-side
(`AdminRoleService::setUserPermissionOverride`). Submitting every row
unconditionally — the first version of this form did — would silently wipe
out any pre-existing override (including a deliberate revoke) on the very
first save. The form shows a visible notice that its starting state isn't
confirmed from the server, for the same reason. Don't "simplify" this back
to submitting the whole `overrides` object; the display gap in A-133 is
cosmetic, but reverting the touched-only submission reopens a real
data-integrity bug.

**Staff are reached from two places instead**, both rendering the same
`components/admin/stores/store-staff-list.tsx` off the same
`useStoreStaff(storeId)` hook (`GET /admin/users?account_type=staff&store_id=`):
the Store Details page, and the owner's own `UserProfileDialog` (which shows
the section only when the row carries `is_store_owner`, using its new
`store_id` field). Don't add a second staff endpoint or a second list
component — one filter, one component, two mount points.

**Each staff row also shows last-synced info (2026-10-02)**: `lastSyncedAt`/
`lastSyncDevice` on the same `AdminUser` the list already fetches (no extra
request), plus a "Sync history" drill-down
(`components/admin/stores/staff-device-history.tsx`, a `Popover` fetching
`useStaffDevices(userId, open)` lazily — only once opened, via `GET
/admin/users/{id}/devices`) listing every device that staff member has ever
synced from. This is sync activity, not login activity — a staff member can
be logged in without having synced yet, so don't conflate it with the
existing `lastActive` field. See `laravel-server/AGENTS.md`, "Per-device
sync visibility", for where the data comes from.

**Store Details is a page, not a modal** (`app/admin/stores/details/page.tsx`,
reached at `/admin/stores/details/?id=<storeId>`; the old `ViewStoreDialog` in
`store-dialogs.tsx` is gone). Two things drove that:

- The content no longer fits a dialog — profile, owner, subscription, staff,
  contact specialist, sync health, storefront publish state, Paystack/payment
  config, recent transactions and recent activity, over a stat-tile row.
- **It is a query-param route, not `app/admin/stores/[id]/`, and that is not
  stylistic.** This app is `output: "export"`; a dynamic segment would need
  `generateStaticParams` to enumerate every store id at build time, which is
  both impossible for an admin panel and would bake customer ids into the
  static bundle. `/admin/handoff` is the existing precedent for reading state
  off the URL in a statically-exported admin route. Because the page reads
  `useSearchParams()`, it needs its own `<Suspense>` boundary — see the
  storefront section below for why `tsc`/`vitest` won't catch a missing one.

**Build the detail link with `adminStoreDetailPath()`** (`lib/admin-routes.ts`)
— never by hand. The fleet row click, the row kebab and the dashboard's Recent
Stores dialog all share it; the dialog used to deep-link to
`/admin/stores?search=<uuid>` instead, landing on a filtered list rather than
the store. The fleet row navigates on click, so the kebab's cell stops `click`
and `keydown` propagation; any new interactive control in a row must do the
same. Archive / restore / permanent-delete entries are super_admin-only in the
kebab and enforced again server-side, and the permanent one is gated on typing
`DumosRx`. See `docs/ADMIN_STORE_LIFECYCLE.md`.

The page fetches `GET /admin/stores/{id}` via `useAdminStoreDetail`; the fleet
list row (`AdminStoreSummary`) is not enough and must not be passed through
router state, since the page has to survive a reload and a pasted link.
Section components live under `components/admin/stores/details/`.

**Never trust a sync-originated column's declared type at a render site.**
Every column on `stores` originates on the Tauri client, where it is a SQLite
TEXT value, and reaches MySQL through `SyncController::push()` ->
`Model::forceFill()`. A declared `string[]` in `lib/types/admin-store-detail.ts`
describes the shape the server is *supposed* to send, not a runtime guarantee —
`enabled_payment_methods` arrived as a JSON **string** in production and
`.join()` on it took the entire admin panel down (see `docs/FIXED_BUGS.md` ->
A-29). `StorePaymentsCard` therefore narrows through
`normalizeEnabledPaymentMethods()` rather than indexing straight off the type,
and the field is typed `unknown` so the next person cannot skip the narrowing
by accident. Apply the same treatment to any other JSON-ish `stores` column
before rendering it.

## Error boundaries: `app/admin/error.tsx` and `app/global-error.tsx`

Until 2026-09-29 this app had **no error boundary anywhere**, so a single
uncaught render exception in any admin route replaced the whole document with
the browser's native "This page couldn't load" screen — no recovery, no
report, no breadcrumb. Two boundaries now exist and both must stay:

- `app/admin/error.tsx` — the per-route boundary for everything under
  `/admin`. Renders a recovery card wired to the `reset()` prop.
- `app/global-error.tsx` — the last resort for a crash in the root layout
  itself. It must render its own `<html>`/`<body>` (Next replaces the whole
  document at this level), which is why it uses inline styles and no shared
  UI components: a boundary that depends on the tree it is catching for is
  not a boundary.

Both report through `reportClientError()` from `lib/api/logger.ts` — the
channel that already backs `POST /logs/client-error`. **Do not add a second
error-reporting pipeline**; there is no Sentry SDK on this origin (the Sentry
references in `app/admin/system/page.tsx` read the *client* app's issues
through the admin API, they do not instrument `web/`). Reporting is guarded by
a ref keyed on the error identity so a re-render does not re-report.

## Broadcasts: the "Also send by email" toggle

`components/admin/broadcasts/broadcast-dialogs.tsx` carries a `send_email`
switch alongside the in-app announcement fields. Two things about it are load-
bearing and easy to break:

- The email **only ever fires when the broadcast is created**. The edit dialog
  therefore passes `isEdit` to `BroadcastFormFields`, which renders the switch
  disabled with copy saying so. Don't re-enable it there: `PUT
  /admin/announcements/{id}` persists the flag but never sends, so an enabled
  switch would silently promise a resend that never happens.
- The helper copy says store owners only for a reason — the server skips every
  staff account, because staff are created with a placeholder
  `<username>@local.dumosrx.com` address. Full recipient-resolution rules are
  in `laravel-server/AGENTS.md`.

The field itself rides the existing `BroadcastFormData` payload through
`webApiClient.createBroadcast()`/`updateBroadcast()`; no separate endpoint
sets it.

`components/admin/broadcasts/broadcast-email-tools.tsx` renders under the
switch, **only in the create dialog and only while the switch is on** —
previewing or testing an email nobody is sending makes no sense, and the edit
dialog can't send one at all. It does have its own two endpoints, both of
which create no broadcast (see `laravel-server/AGENTS.md`):

- "Preview Email" fetches `POST /admin/announcements/preview-email` and drops
  the returned HTML into a `sandbox=""` `srcDoc` iframe, so the admin sees the
  server-rendered mailable — header, footer and all — rather than the raw text
  already in the form. It's fetched on demand, hence the explicit "Refresh"
  button: the pane does not follow later edits on its own.
- "Send Test" posts `POST /admin/announcements/test-email` to one address,
  defaulting to `useAdminAuthStore`'s logged-in email but overridable. The
  input's Enter key is deliberately intercepted (`preventDefault`) — it sits
  inside the create `<form>`, so an unhandled Enter would dispatch the real
  broadcast instead of sending a test.

## Storefront checkout: the three states of a Paystack return (A-95)

`components/storefront/checkout-form.tsx` handles a `?reference=`/`?trxref=`
return from Paystack. The customer has already paid by then, so **none of the
three outcomes may render the ordinary `Delivery & Payment` form** — its
"Place Order" button creates a *second* order for a cart that is still full,
and "Pay Online" takes a second real charge. The panels live in
`components/storefront/checkout-reference-panels.tsx`:

- **Confirmed** — `POST /storefront/{slug}/checkout` succeeds: the
  `sessionStorage` pending entry is removed, the cart is cleared, and the
  customer is pushed back to the store.
- **Orphan reference** (no pending entry in `sessionStorage` at all — a new
  tab, a different session, cleared storage): `OrphanReferencePanel`. Nothing
  local can identify the order, so the reference is quoted and the customer is
  told to contact the store.
- **Failed confirmation** (there *was* a pending entry, but the POST failed):
  `FailedConfirmationPanel`. Distinct state (`failedReference`), not the
  orphan one. It quotes the reference, says the payment may have gone through,
  and offers **Retry confirmation**, which re-posts the retained pending
  entry. The retry is safe because `StorefrontController::checkout()` rejects
  a reference already consumed by an `OnlineOrder` or a `PaymentTransaction`
  with a 422, so a retry can never create a second order. The pending entry is
  therefore deliberately **kept** on failure — don't "clean it up".
  A 422 body carrying `refunded: true` (the server refunded an unfulfillable
  paid checkout) switches the copy to refund wording and removes the retry
  button, since a refunded payment must not be re-confirmed.

The auto-confirm effect is guarded by an `autoConfirmedReference` ref, so one
reference is confirmed at most once per mount no matter how often the
component re-renders; only the explicit retry button posts again.

## Public pages must only call public endpoints (A-94)

`base-client.ts` attaches the admin bearer token **only** when
`window.location.pathname.startsWith('/admin')`, because `/admin` is the one
authenticated surface on this origin. Two consequences that are easy to
re-break:

- A public/marketing page (`downloads`, `faq`, `support`, the landing page,
  the storefront) may only call endpoints that are unauthenticated
  server-side. Calling an `admin/*` endpoint from one sends an anonymous
  request that answers 401. If a public page needs data an admin endpoint
  already returns, add a public route on the server and a **separate hook** —
  don't share one hook across both surfaces. The Downloads page is the worked
  example: `usePublicLatestRelease()` vs. `useLatestRelease()`, documented in
  `docs/DOWNLOADS_MANIFEST.md`.
- 401 handling is admin-only. `shouldRecoverFromUnauthorized(pathname, url)`
  gates the whole refresh-and-redirect branch of the response interceptor on
  an `/admin*` pathname, so a 401 on a public page is an ordinary rejected
  promise. Previously it refreshed and then navigated to `/login` from
  anywhere, which threw anonymous visitors off the marketing site entirely.
  There is no non-admin refresh path any more (this origin stores no
  non-admin bearer token), and the admin path still shares one in-flight
  refresh via `useAdminAuthStore.initSession()` — that shared slot is the
  A-51 race fix, covered by `__tests__/admin-session-refresh-race.test.tsx`;
  don't give the interceptor its own `POST /refresh` back.

## Running things

```
npm run dev      # Next dev server
npm run build    # static export build — fails outright in a sandboxed/offline
                  # environment, by design since 2026-09-26 (see below)
npx tsc --noEmit # typecheck
npx vitest run   # unit tests (new as of the Paystack subaccount plan — see below)
npm run verify:storefront-output   # post-build storefront guard (see below)
```

**`npm run build` now fails hard when the API is unreachable, on purpose.**
`getStorefrontSlugs()` used to swallow every failure and return the single
`demo` placeholder, which exited 0 and let the deploy's FTP *sync* delete
every live `/store/<slug>/` directory from production (`SF-P0-1`). Two
deliberate escape routes exist, and nothing else:

```
STOREFRONT_ALLOW_EMPTY=1 npm run build           # build the demo placeholder only
NEXT_PUBLIC_API_URL=http://127.0.0.1:8899/api/v1 npm run build   # build against a stub
```

`STOREFRONT_ALLOW_EMPTY=1` is for offline/sandbox work and also skips
`verify:storefront-output`. Use it when you genuinely don't care about the
storefront routes; use the stub (below) when you're changing them.

Historical note, since it comes up: the old "`/store/demo` fails to
prerender offline" behaviour was a `ConnectTimeoutError` reaching
`dumosrx.test:443`, nothing more. A pre-launch review speculated it was
really the `params`-as-Promise bug in the two `[store_slug]` routes; it was
not. That bug was real and is now fixed, but it failed *silently* — the
build still exited 0 and emitted `/store/demo/index.html` as a rendered 404
page, because `params.store_slug` was `undefined`, the page fetched
`/storefront/undefined`, and `getStorefrontData` turned the miss into
`notFound()`. Two independent problems at the same URL. Neither now exits 0.

To actually exercise these routes offline, point the build at a local stub
instead of reaching for the dev domain — `generateStaticParams`,
`generateMetadata` and the page fetch all honor `NEXT_PUBLIC_API_URL`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8899/api/v1 npm run build
```

serving `GET /storefront-slugs` → `{"slugs":[...]}` and `GET
/storefront/<slug>` → `{"store":{...},"products":[...]}`. Worth doing for
any change to `app/store/[store_slug]/`: a typecheck cannot catch a params
regression here, since both routes declare their own local `params`
interface rather than Next's generated `PageProps`.

**Before changing anything under `app/store/[store_slug]/`, read
`docs/STOREFRONT_REVIEW.md`** (2026-09-26 audit of the whole storefront
surface; 15 of its 16 findings were fixed the same day, and it carries a
per-finding status). The storefront contract as it now stands:

- **The page is frozen at build time, full stop.** There is no `revalidate`
  anywhere in these routes and there must not be: under `output: "export"`
  there is no server, so `next: { revalidate: 60 }` was inert and its
  `// Cache for 60 seconds` comment actively misleading (`SF-P3-1`). A
  storefront is stale until the next **full site rebuild**, which the API
  triggers via `storefront_dirty_at` → `RebuildStorefrontIfDirty` →
  `repository_dispatch` → `deploy-web.yml` (~15 minutes at best). What does
  and doesn't dirty a storefront is documented in
  `laravel-server/AGENTS.md`.
- **Build-time fetch failures are fatal, not degraded.** `getStorefrontSlugs()`
  throws; `getStorefrontData()` (`lib/api/storefront-data.ts`, shared by both
  routes) returns `null` **only** for a 404/403 — a store genuinely not
  published — and throws `StorefrontFetchError` for a 5xx, a network failure
  or a non-JSON body, so the last good deploy stays live instead of being
  overwritten with a rendered 404. **Don't "helpfully" catch either of these.**
- **`verify:storefront-output` runs between the build and the FTP sync** in
  `deploy-web.yml`. It re-asks the API for the slug list and asserts each one
  has an `out/store/<slug>/index.html`. Keep it before the sync step: the
  whole point is to abort *before* anything is uploaded or deleted.
- **Both routes have `generateMetadata`** (`lib/storefront-metadata.ts`), so a
  store's link previews as the store and not as DumosRx. It reuses the same
  `getStorefrontData()` call the page makes — Next memoizes the fetch per
  render, so don't add a second one. `app/sitemap.ts` / `app/robots.ts` emit
  real files under `output: "export"` + `trailingSlash: true`; both were
  verified in a real build, and both take their base URL from
  `lib/constants.ts`'s `WEB_APP_URL`, never a hardcoded domain.
- **Next's `.next/cache` fetch cache can mask a storefront fetch failure**
  across successive local builds — a previously-successful response is
  replayed and the build passes. `rm -rf .next` before trying to reproduce
  one. CI checks out fresh, so the real pipeline is unaffected.
- **`checkout-form.tsx` now offers a third `paystack` radio**, shown only
  when `GET /storefront/{slug}`'s `online_payment_available` flag is true
  (read off the reprice fetch already in flight — no second request; the
  flag reflects whether the store has a connected Paystack subaccount, see
  `laravel-server/AGENTS.md`'s subaccount section). Selecting it reveals a
  required email field; on submit the form calls
  `POST /storefront/{slug}/checkout/initialize`, stashes the pending
  order's `formData`/`items` under `sessionStorage`
  (`dumos_pending_checkout_${storeSlug}`), and redirects the whole page to
  Paystack's returned `payment_url` — this is a full navigation away from
  the app, not a modal/iframe. **Return handling is `sessionStorage`-based,
  not a server round-trip:** on remount, a `useEffect` reads
  `?reference=`/`?trxref=` off `useSearchParams()`, and if it finds a
  matching pending-checkout entry it POSTs
  `/storefront/{slug}/checkout` with `payment_method: 'paystack'` and the
  reference, clearing the `sessionStorage` entry on success. A failed
  confirm shows a toast naming the payment reference so the customer has
  something to quote the store — don't let that detail regress (a past fix,
  `ef2e0512`, exists specifically because `AxiosError instanceof Error` made
  an earlier version show a generic HTTP status instead). **A reference with
  no pending entry is never a silent no-op:** a customer returning in a new
  tab/session (or with storage cleared) gets a dedicated panel quoting the
  reference and telling them to contact the store, never the ordinary
  empty-cart view — they have paid, and the reference in the URL is the only
  thing that can find their money. A 422 from the confirm call may also carry
  `refunded: true`, meaning the order became unfulfillable after payment and
  the server has already refunded it (see `laravel-server/AGENTS.md`). This was the SF-P1-2
  gap; the money-flow design it needed first is
  `docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md`.
  The `in_store`/`transfer` flows are unchanged.
- **`web/` has its own vitest test infrastructure now** (`vitest.config.ts`,
  `vitest.setup.ts`, `__tests__/`), added alongside the Paystack checkout
  work because this package previously had no test runner at all — it
  mirrors `client/`'s vitest setup. Any new `web/` component work should get
  test coverage under `npx vitest run` the same way `client/` does; don't
  assume `web/` is typecheck-only going forward.
- **Neither `tsc --noEmit` nor `vitest` catches a missing Suspense boundary
  around `useSearchParams()`.** The checkout return-handling `useEffect`
  above shipped without one and passed every check this repo normally
  runs — `tsc`, `vitest`, the reviewed diff — until the actual `next build`
  failed in CI (`⨯ useSearchParams() should be wrapped in a suspense
  boundary`, only surfaces at static-export prerender time). Any page-level
  component that calls `useSearchParams()` directly needs its own
  `<Suspense>` wrapper in the page (see `app/store/[store_slug]/checkout/
  page.tsx`) — run a real `npm run build` (per the local-stub instructions
  above) whenever touching one, not just `tsc`/`vitest`.

Backend verification for anything touching `laravel-server/`:
```
cd ../laravel-server && ./vendor/bin/phpunit --testsuite=Feature
```
(**539 tests passing as of 2026-09-29's admin owner-vs-staff split** — treat any
drop from that as a regression; it was 447 at the 2026-09-26 Paystack
subaccount plan. The "89 tests" this line used to quote was
the count at the 2026-08-26 auth redesign and had been stale for a month; 399
was the count after that day's earlier storefront remediation, before the
subaccount work.)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
