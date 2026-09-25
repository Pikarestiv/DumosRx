# AGENTS.md: DumosRx Web

This file exists so any AI (or human) picking up this repo cold can get
oriented quickly. Keep it updated when architecture, conventions, or the
current focus of work change — see `client/AGENTS.md` for the sibling
package's version of this same file and the same maintenance expectation.

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
npm run build    # static export build — /store/demo will fail to prerender
                  # in sandboxed/offline environments (unreachable
                  # dumosrx.test dev domain); this is pre-existing and
                  # unrelated to most changes, confirmed via git stash
npx tsc --noEmit # typecheck
```

The `/store/demo` prerender note above was re-confirmed on 2026-09-20 and is
accurate as written: the failure is a `ConnectTimeoutError` reaching
`dumosrx.test:443`, nothing more. A pre-launch review speculated it was
really the `params`-as-Promise bug in the two `[store_slug]` routes; it was
not. That bug was real and is now fixed, but it failed *silently* — the
build still exited 0 and emitted `/store/demo/index.html` as a rendered 404
page, because `params.store_slug` was `undefined`, the page fetched
`/storefront/undefined`, and `getStorefrontData` turned the miss into
`notFound()`. Two independent problems at the same URL.

To actually exercise these routes offline, point the build at a local stub
instead of reaching for the dev domain — `generateStaticParams` and the page
fetch both honor `NEXT_PUBLIC_API_URL`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8899/api/v1 npm run build
```

serving `GET /storefront-slugs` → `{"slugs":[...]}` and `GET
/storefront/<slug>` → `{"store":{...},"products":[...]}`. Worth doing for
any change to `app/store/[store_slug]/`: a typecheck cannot catch a params
regression here, since both routes declare their own local `params`
interface rather than Next's generated `PageProps`.

Backend verification for anything touching `laravel-server/`:
```
cd ../laravel-server && ./vendor/bin/phpunit --testsuite=Feature
```
(89 tests passing as of the auth redesign above — treat any drop from that
as a regression.)
