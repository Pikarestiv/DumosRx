# Superadmin Login

Route: `app/admin/login/page.tsx` → `AdminLoginPage`, rendering
`components/auth/admin-login-form.tsx` (`AdminLoginForm`) inside a
`Suspense` boundary. Session state lives in `lib/store/use-admin-auth-store.ts`
(`useAdminAuthStore`) — the access token is **memory-only** (never persisted
to `localStorage`), so any full page reload starts with `token = null` and
relies on a refresh-cookie round trip to restore the session (see below).

Walked live against the shared dev backend (`localhost:8000`) on
2026-09-03/04, using the seeded `admin@dumosrx.com` / `Admin123#`
(`super_admin`) account from `laravel-server/database/seeders/DatabaseSeeder.php`.

## Form

`AdminLoginForm` — Zod schema (`loginSchema`) requires a valid email and a
password of at least 6 characters, validated client-side before submit.
Fields: **Admin Identifier** (email, `Mail` icon), **Security Clearance Key**
(password, show/hide toggle via `Eye`/`EyeOff`), a **Server Config**
(`ServerSelector`) control below the submit button for pointing the app at a
different backend host, and an **Authenticate & Access** submit button.

On submit, calls `webApiClient.login(values)` → `POST /login` (real Laravel
route, `routes/api.php` line 35, `AuthController::login`, throttled via the
`auth` rate limiter, `Limit::perMinute(5)->by($request->ip())`,
`app/Providers/AppServiceProvider.php`). On success, the form checks
`checkCanAccessAdmin(response.user.role)` — if the authenticated user isn't
`super_admin`/`platform_admin`/`agent`, it throws "Access Denied:
Administrative privileges required." client-side rather than storing the
token. On accept, `setToken`/`setUser` populate the auth store and the app
routes to `/admin` for `super_admin` or `/admin/referrals` for
`platform_admin`/`agent` (the `/admin` Overview page calls `admin/summary`,
which is `super_admin`-gated server-side, so routing non-super-admins
straight there would just 403).

## Verified live

- **Invalid credentials** (correct-shaped email, wrong password): submit
  hits `POST http://localhost:8000/api/v1/login`, real backend responds
  **422**, and the form renders `Alert` with title "Security Violation" and
  body "Invalid credentials." — a real backend-driven error, not a client
  stub.
- **Rate limiting is real and live**: after a small number of attempts in
  quick succession (5/min/IP, see above), the same endpoint returned **429**
  with body message "Too Many Attempts." surfaced verbatim in the same
  "Security Violation" alert. Cleared it with `php artisan cache:clear`
  (the rate limiter's cache-backed counter) to continue testing rather than
  waiting out the window — confirms this is a genuine, unmocked
  `RateLimiter::for('auth', ...)` throttle, not a UI-only guard.
- **Valid login**: `admin@dumosrx.com` / `Admin123#` → `POST /login` 200,
  redirected to `/admin` (Overview), which then fired real
  `GET admin/summary` (200) and other admin-scoped calls with the new
  bearer token attached.
- **Logout**: sidebar logout icon clears the session and returns to
  `/admin/login` with no stale session bleed-through (confirmed by
  reloading directly afterward — the login form rendered, no auto-redirect).
- **Session-restore-on-reload**: navigating directly to an authenticated
  route (`/admin/stores`) after a full page reload (fresh memory, no token)
  briefly showed the login page, then a `POST admin/session/refresh` (200,
  cookie-authenticated, no bearer token — matches the route comment in
  `routes/api.php` line 41–43) fired automatically and the app landed back
  in the authenticated app without re-entering credentials. This matches
  `AdminLoginPage`'s `initSession()` effect and its inline comment ("Same
  reasoning as the admin layout guard: the access token is memory-only, so a
  reload always starts with none. Try to restore via the refresh cookie").
  **Caveat**: on one occasion during this walkthrough, a full-reload restore
  landed on `/admin/marketing` instead of the originally-requested
  `/admin/stores` — not reproduced consistently enough across repeated
  attempts to isolate a root cause live (could be a stale/queued
  `router.push` from a preceding, still-in-flight interaction in the same
  tab rather than the login/session-restore logic itself); flagged as a
  minor, unconfirmed observation in the findings log rather than a
  pinned-down bug.
- **Version badge**: footer shows `v{APP_VERSION}-{DEV|PROD}` based on
  `NEXT_PUBLIC_APP_ENV`; since this task's dev server was started without
  that env var set, the badge read `V0.0.35-PROD` even though the server was
  genuinely local/dev — a test-environment artifact of how this task started
  the server, not an app bug (the ternary itself is correct).

## Not exercised live

- **"Forgot password" / password-reset link**: the login form has no such
  control — there is no forgot-password entry point on this screen at all.
  Noted as an absence, not a bug (superadmin accounts are presumably
  provisioned/reset by another superadmin via the Users → Force Password
  Reset flow, not self-service).
