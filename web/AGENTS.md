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

**Staff are reached from two places instead**, both rendering the same
`components/admin/stores/store-staff-list.tsx` off the same
`useStoreStaff(storeId)` hook (`GET /admin/users?account_type=staff&store_id=`):
the Store Details page, and the owner's own `UserProfileDialog` (which shows
the section only when the row carries `is_store_owner`, using its new
`store_id` field). Don't add a second staff endpoint or a second list
component — one filter, one component, two mount points.

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
