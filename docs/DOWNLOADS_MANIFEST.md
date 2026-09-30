# The downloads manifest (installer availability, version and size)

Two surfaces show per-platform installer links: the public marketing page
(`web/app/downloads/page.tsx`) and the platform-admin page
(`web/app/admin/downloads/page.tsx`). Both read the same shape, from two
different endpoints.

## Why the probe happens server-side

`downloads.dumosrx.com` sends no `Access-Control-Allow-Origin` header on
`updater.json` or on the binaries themselves, so a browser-side `fetch()` from
`dumosrx.com` is always blocked by CORS — confirmed live: it rejects with
`TypeError: Failed to fetch` even for a 200 response. `web/` is a statically
exported Next.js build (`output: "export"`), so it has no server runtime of its
own to proxy with. The Laravel API therefore does the cross-origin work (no
browser, no CORS) in `app/Services/DownloadsManifestService.php`.

`updater.json`'s own `platforms` key only lists Tauri auto-update targets
(currently just `darwin-aarch64`), not the full set of raw installers uploaded
to the CDN, so it is used only to read the current version string.
Per-platform existence and size come from HEAD-probing each platform's
conventional per-version URL, which is the authoritative signal.

## Two endpoints, one service (A-94)

| Endpoint | Auth | Caller | Caching |
| --- | --- | --- | --- |
| `GET /downloads/manifest` | none, `throttle:public-read` | `usePublicLatestRelease()` → public marketing page | server-side, 10 minutes |
| `GET /admin/downloads/manifest` | `auth:sanctum` + `permission:manage_platform` + `role:super_admin` | `useLatestRelease()` → admin page | none; the admin page is the place to see a live probe |

The public page used to call the admin endpoint through a single shared
`useLatestRelease()` hook. Because `base-client.ts` only attaches the admin
bearer token on `/admin*` paths, that call went out anonymous, answered 401,
and the 401 interceptor navigated the visitor off the marketing site to
`/login` (and from there to `app.dumosrx.com/login`) — the install/conversion
page was unreachable for the exact audience it exists for.

Rules to keep this fixed:

- The public page must use `usePublicLatestRelease()`; nothing outside
  `/admin*` may call an `admin/*` endpoint.
- The two hooks keep **separate** query keys (`["public-latest-release"]` vs.
  the account-scoped `["latest-release", scopeId]`) so neither can serve the
  other's cache slot.
- The public endpoint is unauthenticated, so it is cached server-side and
  carries a named limiter; it exposes nothing but the CDN URLs the marketing
  page already links to publicly.

## 401 handling is admin-only

`/admin` is the only authenticated surface on the `dumosrx.com` origin (its
access token is memory-only — see `web/AGENTS.md`). `base-client.ts`'s
`shouldRecoverFromUnauthorized()` therefore returns `false` for any non-`/admin`
pathname, so a 401 on a public page surfaces as an ordinary rejected promise
instead of a navigation. The session-refresh recovery itself (one shared
in-flight refresh, delegated to `useAdminAuthStore.initSession()` because the
refresh cookie rotates per use and the layout guard and login page share that
slot — the A-51 race fix) is unchanged.
