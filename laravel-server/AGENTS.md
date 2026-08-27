# AGENTS.md: DumosRx Laravel Server

This file exists so any AI (or human) picking up this repo cold can get
oriented quickly. Keep it updated when architecture, conventions, or the
current focus of work change — see `client/AGENTS.md` and `web/AGENTS.md`
for the sibling packages' versions of this same file and the same
maintenance expectation. A stale doc here is worse than no doc: fix it in
the same change that makes it wrong, don't defer it.

## What this is

Laravel 11 (PHP ^8.2) API backing two separate frontends: **`client/`** (the
offline-first Tauri/Next.js POS app, synced via a bidirectional delta sync
engine) and **`web/`** (marketing site, store-owner dashboard stubs, and the
platform admin panel). Auth is Sanctum personal access tokens throughout —
no session-based web auth for the API itself.

Repo relationship: this is one of three sibling packages. `client/`'s
`scripts/verify-schema-sync.ts` diffs its local SQLite schema against this
repo's MySQL schema and expects `../laravel-server` to be checked out as a
sibling directory — don't rename or relocate this repo relative to `client/`
without updating that.

## Architecture

- **Controllers vs. Services:** Controllers (`app/Http/Controllers/Api/`)
  are routing/HTTP only; business logic belongs in `app/Services/`
  (`SubscriptionService`, `AdminAlertService`, `Payment/`, `Web/`). Don't
  let a controller grow business logic just because it's convenient —
  that's the one architectural rule `tests/Feature/ArchitectureTest.php`
  exists to keep honest (currently only asserts core tables exist; the
  Controller/Service separation itself is enforced by review, not a test).
- **Controller namespaces** roughly mirror caller: `Api/App/*` (client/,
  the POS sync+business endpoints), `Api/Web/*` (web/'s dashboard-adjacent
  endpoints), `Api/Admin/*` (platform admin panel), `Api/Public/*`
  (unauthenticated storefront).
- **Multi-tenancy — read this before adding any tenant-scoped endpoint:**
  tenant-owned data (products, categories, suppliers, customers, stock,
  sales, ...) is always stored under the **store owner's** `user_id`, never
  a staff member's own id. A staff user has `store_id` set; resolving which
  tenant they belong to means looking up `Store::where('id',
  $user->store_id)->value('user_id')`, not using `$user->id` directly. Use
  the `App\Http\Controllers\Concerns\ScopesToTenant` trait
  (`tenantOwnerId($request)`) — don't hand-roll this lookup. Before this
  trait existed, `ProductController`/`CategoryController`/
  `SupplierController`/`CustomerController` had no tenant scoping at all
  (any authenticated user could see every store's data) or scoped by the
  wrong id for staff accounts; see `tests/Feature/TenantIsolationTest.php`
  for the regression coverage and exact failure shape.
- **Roles & permissions (`User::hasRole()`/`hasPermission()`, `app/Models/User.php`):**
  `hasRole($role)` checks three things, any of which can match: the flat
  `role` string column, the `userRole` relation's `slug` (a `Role` model,
  separate from the `role` column), and a special-case alias where
  `role === 'store_owner'` also satisfies `hasRole('admin')`. `super_admin`
  bypasses `CheckPermission` and `CheckSubscription` middleware entirely.
  `hasPermission($slug)` checks two independent sources: the user's own
  direct `permissions()` (belongsToMany `Permission`), then falls back to
  permissions granted through `userRole`. Checked via the `permission:<name>`
  middleware alias (`CheckPermission.php`) for finer-grained gates
  (`create_accounts`, `grant_trials`, etc. for `platform_admin`/`agent`).
  Account-level gating (`is_active`, subscription status) is separate:
  `account_status` (`CheckAccountStatus`) and `subscription:<feature>`
  (`CheckSubscription`) middleware.
- **Plans/tiers:** `config/plans.php` defines tier limits (`stores`,
  `staff`, `inventories`) and feature flags per tier (`starter`, `pro`,
  ...); `-1` means unlimited. `SubscriptionService` enforces these
  (`enforceStaffLimits`, `getSubscriptionOwner`).

## Admin auth architecture (redesigned 2026-08-26)

`web/`'s platform admin panel keeps its access token in JS memory only
(never `localStorage`) and uses a separate, `refresh`-ability-scoped
Sanctum token — held **only** in an `HttpOnly`, `SameSite=Strict`
`drx_admin_session` cookie — to silently re-establish a session after a
page reload, via `POST /admin/session/refresh`
(`AuthController::refreshAdminSession()`, registered outside the
`auth:sanctum` group in `routes/api.php` since it has no bearer token to
check). This only applies when `login()`'s `device_name === 'web'`.

**Do not resurrect the old `AuthenticateFromCookie` middleware pattern.**
It used to be globally prepended to the `api` middleware group
(`bootstrap/app.php`) and silently promoted *any* ambient
`drx_admin_session` cookie into an `Authorization: Bearer` header for every
API route — combined with the cookie's old `SameSite=None`, that was a real
CSRF-shaped hole (a cross-origin page could trigger authenticated admin
requests with no token exfiltration needed). It's been deleted. If a future
feature seems to need "read auth off a cookie for a general route," that's
a sign to reach for a dedicated endpoint like `refreshAdminSession()`
instead — validate the cookie's token ability explicitly, don't promote it
into a blanket bearer credential.

`client/`'s desktop app uses a **completely separate**, unrelated,
bearer-token-based `/refresh` (`AuthController::refresh()`, unchanged,
still behind `auth:sanctum`) — don't conflate the two flows or assume a
change to one affects the other. Full detail (including the
impersonation/handoff subsystem, which is separate again) is in
`web/AGENTS.md`.

## Sync engine (server side)

`app/Http/Controllers/Api/App/SyncController.php` (~1000 lines — the
delta push/pull endpoint `client/`'s sync engine talks to) and
`app/Services/Web/SyncPayloadMapper.php`. See `tests/Feature/SyncEndpointTest.php`
for the expected push/pull contract. Any new syncable table/column needs a
migration here **and** the corresponding update on the `client/` side
(`client/lib/db/schema.ts` + sync engine coverage) — see `.agents/AGENTS.md`
§4 and `client/AGENTS.md` for the client-side half of this.

## Known gotcha: MySQL timezone vs. Laravel's UTC clock

See `.agents/AGENTS.md` §6 for the full writeup (Namecheap shared hosting's
MySQL runs `time_zone = SYSTEM`, ~4h behind UTC; raw `NOW()`/
`CURRENT_TIMESTAMP()` in SQL silently breaks the sync engine's
`updated_at`-based pull filter). Short version: never use MySQL's own
`NOW()` in raw SQL against this database — let Eloquent set timestamps.

## Testing

```
./vendor/bin/phpunit --testsuite=Feature   # 89 tests as of 2026-08-26 — treat any drop as a regression
php -l path/to/File.php                     # quick syntax check for a single file
```

`tests/Feature/` covers: tenant isolation (`TenantIsolationTest`), admin
account-security regressions (`AccountSecurityTest`), the handoff/
impersonation flow (`AuthHandoffTest`), sync push/pull (`SyncEndpointTest`),
storefront (`StorefrontControllerTest`), backups (`BackupControllerTest`),
dashboard stats, and core-tables-exist smoke checks (`ArchitectureTest`).
There is no `tests/Unit` suite currently — everything meaningful here
touches the DB, so it's covered as a Feature test instead.

## Running things

```
php artisan serve       # local dev server
php artisan migrate     # apply migrations
php artisan tinker      # also used by client/'s test:schema script
```
