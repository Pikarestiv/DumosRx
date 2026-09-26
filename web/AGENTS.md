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
  an earlier version show a generic HTTP status instead). This was the SF-P1-2
  gap; the money-flow design it needed first is
  `docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md`.
  The `in_store`/`transfer` flows are unchanged.
- **`web/` has its own vitest test infrastructure now** (`vitest.config.ts`,
  `vitest.setup.ts`, `__tests__/`), added alongside the Paystack checkout
  work because this package previously had no test runner at all — it
  mirrors `client/`'s vitest setup. Any new `web/` component work should get
  test coverage under `npx vitest run` the same way `client/` does; don't
  assume `web/` is typecheck-only going forward.

Backend verification for anything touching `laravel-server/`:
```
cd ../laravel-server && ./vendor/bin/phpunit --testsuite=Feature
```
(**435 tests passing as of 2026-09-26's Paystack subaccount plan** — treat any
drop from that as a regression. The "89 tests" this line used to quote was
the count at the 2026-08-26 auth redesign and had been stale for a month; 399
was the count after that day's earlier storefront remediation, before the
subaccount work.)
