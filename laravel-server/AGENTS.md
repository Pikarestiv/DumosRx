# AGENTS.md: DumosRx Laravel Server

This file exists so any AI (or human) picking up this repo cold can get
oriented quickly. Keep it updated when architecture, conventions, or the
current focus of work change — see `client/AGENTS.md` and `web/AGENTS.md`
for the sibling packages' versions of this same file and the same
maintenance expectation. A stale doc here is worse than no doc: fix it in
the same change that makes it wrong, don't defer it. The standing rule for
that — including moving a fixed finding from `docs/KNOWN_BUGS.md` into
`docs/FIXED_BUGS.md` in the same change — lives in `.agents/AGENTS.md` §2.

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
- **Admin platform services — one domain each, never a god-service.** The
  original `AdminPlatformService` carried six unrelated responsibilities in
  590 lines (past §4's 350-line limit) and was split in Phase 1 of the admin
  panel work (`docs/superpowers/specs/2026-10-06-admin-panel-phase-1-design.md`):
  `AdminSummaryService` (the Overview payload), `AdminHealthService`
  (health probes + the Sentry issue feed), `AdminCatalogService` (global
  product list, catalog metrics, standardization) and `AdminActivityService`
  (platform-wide activity log + global search). `AdminPlatformController`
  is a thin delegator over the four. Add a new admin aggregation as its own
  service rather than growing one of these — Phases 2-6 (sync health,
  subscription lifecycle, trends, maintenance runner) each add one.
  - `AdminFleetMetricsService` holds fleet-wide roll-ups; `AdminRevenueService`
    is the **canonical definition of platform revenue** (successful
    `PaymentTransaction` rows). Overview's old "Platform Revenue" stat summed
    `Sale::total_amount`, i.e. tenant GMV — never reintroduce that as a
    platform-revenue figure.
  - **Money is reported per currency and never converted.** `App\Support\CurrencyTotals::fromPairs()`
    is the single grouping helper; it uppercases ISO codes and buckets blank
    ones under `NGN`. There is deliberately no FX table — a converted total
    would mean owning stale-rate risk. Note that `stores.currency` and
    `payment_transactions.currency` are both `NOT NULL` (the former defaults
    to `'NGN'`), so a true null is unreachable; the helper's fallback guards
    blank strings and future callers, not existing rows.
  - **Overview's people and subscription counts are store-owner-scoped.**
    "Active Users" counts `role = 'store_owner'` only, with active store staff
    (`admin`, `manager`, `specialist`, `sales_staff`, `auditor`) on its
    sub-line; platform roles (`super_admin`, `platform_admin`, `agent`) appear
    in neither. It previously counted everyone except `super_admin`, i.e. the
    platform's own staff plus every store's employees. "Active Subscriptions"
    counts **distinct `user_id`**, not subscription rows, and excludes trials
    (they get the sub-line) — a row count reported one owner once per
    subscription they had ever held.
  - **Sync recency is not account status.** `AdminSummaryService`'s recent-stores
    map keeps `sync_status` under its own key, separate from the store's real
    `status` column, because an earlier version overwrote `status` with the
    recency guess and left Recent Stores contradicting the Store Fleet list for
    the same store. A clock-skewed offline device can push a future
    `last_sync_at` (the sync controller trusts the client's clock), so it is
    clamped to `now()` before the diff.
  - **Host readings live behind `App\Support\HostMetrics`, and that seam is
    load-bearing.** `loadAverage()`, `memory()` and `disk()` each return `null`
    when the host cannot measure them, and `AdminHealthService` takes the class
    by constructor injection so tests can bind a stub and exercise **both**
    branches. Without the seam the honesty tests were tautologies: they asserted
    whichever branch the machine running the suite happened to take, so the
    production case (`shell_exec` disabled on the shared host) was exercised
    nowhere, and a regression to a zero-instead-of-null reading could not fail
    the build. Keep new host-dependent readings behind this class.
  - **`databaseConnectMs` must issue a real statement.** It runs
    `DB::select('select 1')`, not `DB::connection()->getPdo()`: `getPdo()`
    returns the already-resolved PDO instance (auth middleware has hit the DB
    long before this runs), so timing it brackets a property read and reports
    ~0ms on every host, healthy or not. The figure replaced a hardcoded
    `"42ms"`, so a number that cannot vary is the same defect wearing a
    different value.
  - **The activity-log reads in `getSystemHealth()` are guarded.** The Database
    probe exists to report a dead connection; reading `ActivityLog` unguarded
    straight after the timer meant a genuinely-down database threw a
    `QueryException` out of the method and the operator got a generic 500
    instead of "Database: Degraded" — the one case the probe is for.
  - **There is no `database.load` figure.** The old one was
    `min(100, max(5, $activityRowsInLastMinute * 2))` rendered as a percentage
    bar: it floored an idle platform at 5% and saturated at 100% after ~50 rows,
    and was not a load measurement in any unit. It was removed in Phase 1's
    review pass alongside the fake CPU percentage. Don't reintroduce a
    synthesised percentage here; report `database.status`, or a real figure
    such as `Threads_connected` against `max_connections`.
  - **`AdminHealthService::getRecentErrors()` needs `SENTRY_API_TOKEN`**, an
    internal-integration token scoped to `event:read`/`project:read`. It must
    never reach the browser: `web/` is a static export with no server of its
    own to keep a secret in, which is why this is proxied server-side at all.
- **Controller namespaces** roughly mirror caller: `Api/App/*` (client/,
  the POS sync+business endpoints), `Api/Web/*` (web/'s dashboard-adjacent
  endpoints), `Api/Admin/*` (platform admin panel), `Api/Public/*`
  (unauthenticated storefront).
- **Multi-tenancy — read this before adding any tenant-scoped endpoint:**
  tenant-owned data (products, categories, suppliers, customers, stock,
  sales, ...) is always stored under the **store owner's** `user_id`, never
  a staff member's own id. A staff user has `store_id` set; resolving which
  tenant they belong to means looking up `Store::where('id',
  $user->store_id)->value('user_id')`, not using `$user->id` directly.
  **`stores.user_id` is authoritative and `users.store_id` is only the
  fallback, never the other way round.** A non-null `users.store_id` does
  NOT prove the caller is staff: owners created before 2026-09-22 carry a
  stale one (see `docs/FIXED_BUGS.md` A-127), so branching on it first
  silently narrows a multi-store owner to one store. Resolve ownership by
  asking whether the user owns any `Store` **first**, and only consult
  `users.store_id` for a user who owns none —
  `SyncController::resolveOwnershipIdentity()` is the reference
  implementation, and the migration
  `2026_10_01_000000_clear_store_id_on_store_owners` clears the historical
  poisoning. Use
  the `App\Http\Controllers\Concerns\ScopesToTenant` trait
  (`tenantOwnerId($request)`) — don't hand-roll this lookup. Before this
  trait existed, `ProductController`/`CategoryController`/
  `SupplierController`/`CustomerController` had no tenant scoping at all
  (any authenticated user could see every store's data) or scoped by the
  wrong id for staff accounts; see `tests/Feature/TenantIsolationTest.php`
  for the regression coverage and exact failure shape.
  **Service classes are the trait's blind spot.** `ScopesToTenant` takes a
  `Request`, so classes under `app/Services/` can't use it and hand-roll the
  same lookup instead — `Web/DashboardService` and `Api/App/SaleController`
  both repeat it across several methods, which is exactly how one copy drifts.
  `DashboardService::resetData()` (the destructive `POST /dashboard/reset`)
  scoped every delete by `$user->id` directly until 2026-09-26: harmless for a
  `store_owner` (their own id *is* the tenant owner id) but a silent zero-row
  no-op returning `{"status":"success"}` for the real, assignable non-owner
  `admin` staff role the controller's gate also admits. It now goes through a
  private `tenantOwnerId($user)` mirroring the trait; regression coverage in
  `tests/Feature/DashboardResetScopingTest.php`. Note the other three methods
  in that file (`getSummary`/`getStats`/`getWidgetSnapshot`) still resolve by
  `$user->id` — read-only and lower-stakes, so deliberately not changed in
  that pass, but they are the same latent shape. `TenantScopingArchitectureTest`
  only scans controllers, so nothing catches this class of drift in a service
  mechanically: extract the resolution into one shared helper rather than
  adding a fourth inline copy.
- **Roles & permissions (`User::hasRole()`/`hasPermission()`, `app/Models/User.php`):**
  `hasRole($role)` checks three things, any of which can match: the flat
  `role` string column, the `userRole` relation's `slug` (a `Role` model,
  separate from the `role` column), and a special-case alias where
  `role === 'store_owner'` also satisfies `hasRole('admin')`. `super_admin`
  bypasses `CheckPermission` and `CheckSubscription` middleware entirely.
  `hasPermission($slug)` resolves in four ordered steps, and the order is the
  whole security model — do not reorder it:
  1. `hasRole('super_admin')` → `true` unconditionally, before anything else
     is read. A super_admin can never be locked out of anything by any
     permission edit.
  2. A direct `permission_user` row for this user+slug → return that row's
     `granted` boolean and stop. **A `granted = false` row denies even when
     the user's role grants the slug.** This denial-overrides-role rule is
     the single most important semantic in the delegation feature: the
     per-admin override UI writes `false` rows, and a role default can never
     win them back. Deleting the row (not writing a third state) is what
     restores "inherited".
  3. The `userRole` relation's `permission_role` rows (plus the
     `store_owner` → `admin` role alias).
  4. Finally, a fallback through the flat `role` **string** column, resolved
     to a `Role` by slug — this exists because plenty of accounts carry a
     `role` string with a null `role_id`, so skipping it would silently
     under-grant them.
  Checked via the `permission:<name>` middleware alias
  (`CheckPermission.php`), which has the same `super_admin` bypass.
  Account-level gating (`is_active`, subscription status) is separate:
  `account_status` (`CheckAccountStatus`) and `subscription:<feature>`
  (`CheckSubscription`) middleware.
- **Platform admin delegation (the 5-slug catalog, 2026-10-01).**
  `User::DELEGATABLE_PERMISSIONS` is the *entire* catalog a superadmin can
  hand out from the admin panel, and what each slug gates:
  `view_platform_data` (the stores/users/activity-log read endpoints),
  `send_notifications` (per-user notify, bulk notify, the broadcast/announcement
  group), `reset_user_passwords` (force-reset), `manage_account_status`
  (suspend/reactivate a store or a user) and `impersonate_store`.
  - **Enforced by omission, not by a deny-list.** A never-delegatable action
    (delete a user/store, edit another admin's profile/role, coupons and
    referral payouts, the subscription/platform config endpoints) simply has
    **no `permission:*` slug wired to its route** — it stays
    `role:super_admin`. There is therefore no deny-list that a future change
    could weaken by accident, and no `permission_user` row that could ever
    grant one. Adding a 6th delegatable slug means: seed the `Permission`,
    add it to `DELEGATABLE_PERMISSIONS`, put `permission:<slug>` on the route,
    add it to `web/lib/constants/platform-permissions.ts`, and gate the
    matching button/nav entry in `web/`. Never introduce a slug for an action
    on the never-delegatable list.
  - **`grant_trials` is a pre-existing exception, not part of the catalog.**
    `RolesAndPermissionsSeeder` has granted it to `platform_admin` since long
    before the delegation work, and the grant-trial/activate-plan routes are
    `permission:grant_trials`. It is deliberately not editable from the
    Admin Permissions matrix (which only ever renders the 5 catalog slugs),
    but it *is* included in the serialized `effective_permissions` so the UI
    can gate its buttons on the real capability — see
    `User::SERIALIZED_PERMISSIONS` (= the 5 catalog slugs plus the
    pre-existing `create_accounts`/`grant_trials`).
  - **Two columns back this:** `permission_user.granted` (boolean, default
    `true` — step 2 above) and `roles.is_system` (`true` for the 3 seeded
    platform roles, which can never be renamed or deleted; `false` for every
    custom role created through the UI).
  - **`AdminRoleController` endpoints, all `role:super_admin`:**
    `GET /admin/roles` (the matrix; `super_admin`'s own row is deliberately
    filtered out of `AdminRoleService::listRoles()` because toggling it has no
    runtime effect), `POST /admin/roles`, `PUT /admin/roles/{role}/permissions`,
    `DELETE /admin/roles/{role}` (refused while any user still holds it), and
    `PUT /admin/users/{id}/permission-overrides`.
  - **`effective_permissions` is appended per response, never globally.** It
    costs ~4 queries per slug to resolve, so it is NOT in `User::$appends`:
    the auth responses that the admin panel reads its capability set from
    (login, `/refresh`, both `/admin/session/refresh` branches, the handoff
    exchange) and the permission-override response call
    `->append('effective_permissions')` explicitly. Do not put it back in
    `$appends` — `StaffController`'s collections and `SyncController`'s
    `users` pull would each pay it per row. Coverage:
    `tests/Feature/EffectivePermissionsAppendSitesTest.php`.
  - The custom-role list is dynamic end to end:
    `UpdatesUserProfiles::platformRoleSlugs()` is what `PUT /admin/users/{id}`
    and the create-platform-account endpoint validate `role` against, and
    `web/` merges `GET /admin/roles` with its 3 built-ins
    (`mergePlatformRoleOptions()`) rather than hardcoding a whitelist.
  - **Every custom role carries `manage_platform` too (2026-10-02 fix,
    A-141).** The entire `/admin/*` route group sits behind
    `permission:manage_platform` (`routes/api.php`), but `manage_platform`
    is not one of the 5 catalog slugs `createRole()` accepts — so a role
    created through the UI with, say, only `view_platform_data` used to get
    403'd on every single admin call regardless of which catalog slugs it
    held. `AdminRoleService::createRole()` now always syncs
    `[...$permissionSlugs, 'manage_platform']`; `updateRolePermissions()`'s
    existing "preserve non-catalog permission ids" logic (originally there
    to protect `platform_admin`/`agent`'s `create_accounts`/`grant_trials`)
    already keeps it from being stripped when the matrix is edited, and
    `listRoles()`'s catalog intersect already keeps it out of the matrix
    checkboxes — no new code needed for either. Migration
    `2026_10_02_000004_backfill_manage_platform_onto_custom_roles` grants it
    to any custom role created before this fix. `manage_platform` was also
    added to `User::SERIALIZED_PERMISSIONS` (new `PLATFORM_ACCESS_PERMISSION`
    const) so it reaches `effective_permissions` the same way `grant_trials`
    does. Covered by `AdminRoleServiceTest`,
    `BackfillManagePlatformOntoCustomRolesMigrationTest` and the two new
    custom-role cases in `DelegatedRouteAuthorizationTest`.
  - **Frontend gate is `manage_platform`, not a role-slug allow-list.**
    `web/lib/store/use-admin-auth-store.ts`'s `checkCanAccessAdmin(user)`
    used to hardcode `role === "super_admin" || "platform_admin" || "agent"`,
    which bounced any custom-role user at the login form/layout guard even
    after the backend fix above. It's now
    `checkHasPermission(user, "manage_platform")` — the literal mirror of
    the server-side route gate — so a new custom role never needs a
    frontend change to be let into the dashboard shell. See
    `web/__tests__/admin-auth-permission-helpers.test.ts`.
- **Plans/tiers:** `config/plans.php` defines tier limits (`stores`,
  `staff`, `inventories`) and feature flags per tier (`starter`, `pro`,
  ...); `-1` means unlimited. `SubscriptionService` enforces these
  (`enforceStaffLimits`, `getSubscriptionOwner`).

## Staff credentials: the PIN and the web password are unrelated

`users.pin` (bcrypt, `User::hashPin()`) and `users.password` are two separate
credentials for two separate surfaces, and **neither is ever derived from the
other**. The PIN unlocks the POS and is verified entirely client-side against
the hash the sync pull ships down — `/login` is never involved in staff POS
auth (the client's only `/login` call is `linkCloudAccount()`, the store
owner's cloud-account link). The password is only for `web/`'s dashboard.

`users.password` is therefore **nullable**, and that is the default state of a
staff account: `StaffController::store()` and the sync-push `users` INSERT both
leave it NULL unless a real password was supplied, and
`AuthenticatesSessions::login()` rejects a null/empty-password account before
it ever reaches `Hash::check()`. Both paths used to fall back to
`Hash::make($pin)` (or `Hash::make('1234')`), which handed every PIN-only staff
account a live `/login` credential with a 10,000-value keyspace on the
predictable `<username>@local.dumosrx.com` address the same method generates.
Do not reintroduce a fallback: if a staff member needs the web dashboard, an
owner sets a real password on create or via `PUT /staff/{id}`. Covered by
`tests/Feature/StaffPinDerivedPasswordTest.php`.

**The PIN has no default either.** `pin` is **required** on `POST /staff` and a
missing one is a 422, because the same rule applies with more force to the
higher-value credential: the PIN is what actually authorises POS actions
(voids, refunds, sales under that identity, and every `sales.cashier_id` and
audit-log attribution that follows). The endpoint used to fall back to the
literal `'1234'`, which the sync pull then shipped to every device as a live,
publicly-guessable till credential (A-89). `required` rather than a generated
PIN because no in-repo caller relies on the old default — `web/` has no
staff-creation form any more and `client/` creates staff locally and syncs
them — so there is nothing to disrupt and no one-time secret to hand back in a
response body.

## No tenant-facing endpoint may create a lockout only a super_admin can undo

`users.is_active = false` and `stores.deleted_at` both make `CheckAccountStatus`
403 every request in the protected group, and the only way back out of either
is a super_admin call (`POST /admin/users/{id}/reactivate`,
`POST /admin/stores/{id}/restore`). So a self-service endpoint that can reach
those states from inside the tenant is a support ticket by construction, and
two of them could:

- **`DELETE /staff/{id}` / `is_active: false` on `PUT /staff/{id}`** refuse two
  targets with a 422: the **tenant owner** and the **caller themselves**. The
  owner's own row is deliberately visible and editable through these endpoints
  (the web staff table's "Main Account"), and `manage_staff` is not
  owner-exclusive — so any admin- or manager-role staff member could deactivate
  the owner and take the whole tenant offline, with nobody left inside it able
  to reverse that (A-85). `AdminUserController::deactivateUser()` refuses
  self-deactivation for the same reason. Both pinned by
  `tests/Feature/StaffSelfLockoutGuardTest.php`.
- **`DELETE /stores/{id}`** refuses with a **409** when it is the caller's last
  remaining store, because `Store` soft-deletes and one "Remove store" click
  otherwise bricked a paying single-store account (A-84). When it does archive
  a store it stamps `deleted_by_id`/`deletion_reason` the way
  `AdminStoreDeletionService::archiveStore()` does, so the state is not silently
  different from an admin-archived one.

`CheckAccountStatus`'s `STORE_ARCHIVED` 403 distinguishes the two cases —
`archived_by: 'owner' | 'administrator'`, with matching `reason` text — since
telling an owner who just removed a branch themselves that "an administrator
archived this store" guarantees a support ticket that starts from the wrong
premise. Pinned by `tests/Feature/StoreSelfDeletionGuardTest.php`.

## Admin: owner vs. staff accounts, and the store detail endpoint

Two different columns decide what a user "is", and mixing them up has already
caused one shipped bug (`AdminUsersStoreResolutionTest`):

- **Owner** — `stores.user_id` points at them (`User::stores()`/`store()`).
- **Staff** — their own `users.store_id` points at a store
  (`User::employerStore()`). An owner's `store_id` is *supposed* to be null,
  so the two read as complementary — but **do not rely on that for
  authorization**: accounts created before 2026-09-22 carry a stale
  `store_id` on the owner's own row (`docs/FIXED_BUGS.md` A-127, and the
  repair migration that clears it). Ask `stores.user_id` first.
- **Platform account** — neither (super_admin / platform_admin / agent).

Two *other* user columns look adjacent and are not: `referred_by_id` is the
customer **referral program** pointer (an unrelated store owner who signed up
through the caller's link) and `registered_by_id` is platform attribution.
Neither is a staff relationship, and neither may ever widen a staff query:
`DashboardService::getSummary()`'s `staff` array used to `orWhere(
'referred_by_id', …)`, so a referred owner was returned to the caller as one
of their employees, email and last-login included — cross-tenant PII through
an ordinary authenticated endpoint (A-83). Referral data has its own scoped
endpoint (`GET /subscription/referral-stats`, name/store/status only).
Pinned by `tests/Feature/DashboardStaffScopingTest.php`.

`GET /admin/users` exposes that distinction through **`account_type`**
(`owners` | `staff` | `platform`; omit it for every account, which is what
every pre-2026-09-29 caller gets) and **`store_id`** (accounts affiliated with
one store, as its owner *or* its staff). The two combine:
`?account_type=staff&store_id={id}` is "this store's team" and is the single
source the admin panel uses for a staff list — both on the Store Details page
and in a store owner's profile dialog. An unrecognized `account_type` is a
422, never a silently-ignored filter. Each row now also carries `store_id`
(the resolved owned-or-employer store) and `is_store_owner`.

`filters.account_type` is accepted by `POST /admin/users/bulk-notify` too, and
the web panel always sends it: the dialog quotes the filtered list's own total
as the recipient count, so without it "Notify All Filtered" would mail a wider
set than the number shown.

`GET /admin/stores/{id}` (`AdminStoreDetailService`, super_admin only, 404 for
an unknown id) is the single-store payload behind the admin panel's Store
Details page: store profile, owner, current subscription, account manager,
sync health, storefront publish state, Paystack subaccount/payment config,
entity counts, the last 5 payment transactions and the last 8 activity-log
entries. It deliberately does **not** embed the staff list — that is the
`/admin/users` filter above, so one implementation serves both surfaces. Its
revenue figure comes from `AdminStoreService::revenueSubquery()`, shared with
the fleet list so the two can't drift apart.

Its `business_metrics`/`operational_metrics` blocks come from
`AdminStoreMetricsService`, a separate class for the file-size rule; every
sales figure in it reuses the same store scoping as `revenueSubquery()`.

`operational_metrics.last_active_at`/`last_active_human` name a timestamp;
`last_active_by` (`AdminStoreOperationalMetricsService::lastActive()`) names
the person behind it. The three candidate signals (`stores.last_sync_at`,
the latest sale's `cashier_id`, the latest `activity_logs.user_id`) already
disagree on who acted, so the method takes the most recent of the three and
resolves *that one's* actor — a sync has no actor, so it reports "Device
sync" instead of a name.

`operationalMetrics()`/`businessMetrics()` are split across two services
(`AdminStoreOperationalMetricsService`/`AdminStoreMetricsService`) purely
for the file-size rule — the former depends on the latter for
`salesQuery()`/`money()` rather than duplicating them. Both route every
timestamp through `clampToNow()`: an offline POS device's wall clock can
drift or be misconfigured, and the sync pipeline trusts whatever
`created_at`/`updated_at` it pushes with no server-side validation, so
"Last Active"/"Sync Health" could otherwise read a future time from a
clock-skewed device. `stockValueRaw()` scopes `stock_batches` via
`product_id -> products.store_id` rather than the batch's own `store_id`,
which is not authoritative on real data — see `docs/KNOWN_BUGS.md` `A-145`
for the deeper, still-open quantity-accuracy issue this doesn't fix.

`Store` uses `SoftDeletes`. Archiving a store (`DELETE /admin/stores/{id}`)
only stamps `deleted_at`, so the global scope drops it from the fleet list,
sync and every other Store query until `POST /admin/stores/{id}/restore`.
The irreversible `DELETE /admin/stores/{id}/purge` lives in
`AdminStoreDeletionController`/`AdminStoreDeletionService`; it requires the
literal `confirmation` string `DumosRx` **server-side**, and it clears every
table carrying a `store_id` by schema introspection because almost none of
those columns has a real foreign key. See `docs/ADMIN_STORE_LIFECYCLE.md`.

Two things restore and purge now guarantee, both from A-40/A-41 and both
detailed in that file: every archive/restore/purge `ActivityLog` row is
written **inside** the action's own transaction and carries `store_id`, and a
restore reports `was_suspended`/`suspension_reason`/`warning` because
archiving never cleared `stores.status`. And a standing note for whoever
changes the schema: `stores.store_slug`/`stores.device_id` are unique across
archived rows too, which is the only reason `restoreStore()` needs no
collision check — make either index soft-delete-aware and that check has to
be added in the same change.

Covered by `tests/Feature/Admin/AdminUsersAccountTypeFilterTest.php`,
`tests/Feature/Admin/AdminStoreLifecycleAuditTest.php`,
`tests/Feature/Admin/AdminStoreDetailTest.php`,
`tests/Feature/Admin/AdminStoreSearchAndMetricsTest.php` and
`tests/Feature/Admin/AdminStoreDeletionTest.php`.

**Gotcha this surfaced, worth remembering anywhere a freeform array is
validated:** adding a nested rule (`filters.account_type`) alongside the
array rule (`filters`) makes `$request->validate()`'s return value rebuild
`filters` from the *nested rules only*, so the un-ruled `role`/`search` keys
vanish from `$validated`. `bulkNotify` silently notified every account for one
commit because of it. Read that kind of bag off `$request->input('filters')`
after validating, not out of `$validated`.

## Editing a platform user: the two guards that must stay on the service

`PUT /admin/users/{id}` (`AdminUserController::updateUser` →
`AdminUserService::updateUserProfile()`, implemented in the
`Concerns\UpdatesUserProfiles` trait) is the only way to edit an existing
account's profile, and a super_admin may edit *any* account including
another super_admin's. Two things make that safe, and both live on the
**service**, not the controller, so a future second call site cannot skip
them:

- **`assertNotSelfRoleChange()`** — a super_admin cannot change their own
  `role`. Other fields on their own account are still editable; only the
  role is frozen. (The pre-existing self-deactivation guard in
  `deactivateUser` sits on the controller instead; this one deliberately
  does not follow it down to the layer, because the service is the actual
  write.)
- **`assertNotLastActiveSuperAdmin()`** — before any role change away from
  `super_admin` on *any* user, the count of other `super_admin` rows with
  `is_active = true` must be non-zero. Deactivated and soft-deleted
  super_admins do not count, so demoting the last usable one is refused
  even when dormant rows exist. Nothing enforced this before 2026-10-01 —
  the platform could be left with no reachable super_admin.

Both throw `ValidationException`, which is why
`AdminBaseController::withErrorResponse()` now re-throws that one exception
type instead of folding it into its generic 500: a guard rejection has to
surface as its own 422 with its message intact.

**Scope is deliberately narrow:** `first_name`, `last_name`, `phone`,
`email`, `role` only. Password, `is_active`/status and plan/trial fields are
`prohibited` in the request rules — they each already have a dedicated
endpoint (`reset-password`, `deactivate`/`reactivate`,
`grant-trial`/`activate-plan`), and silently ignoring them would let a
caller think a password change had taken effect. `role` is restricted to
`AdminUserService::PLATFORM_ROLES` (`super_admin|platform_admin|agent`);
store-tenant roles are tenant-owned and are not assignable here.

The audit row (`USER_PROFILE_UPDATED`) is the first admin-user action to use
`activity_logs.properties` for a real before/after diff, and it records
**only the fields that actually changed** — an update that changes nothing
writes no log at all. Note `A-131` in `docs/KNOWN_BUGS.md`: the
`'status' => 'success'` key every one of these `ActivityLog::create()` calls
passes is not a real column and is silently dropped, so never assert on it.

Covered by `tests/Feature/Admin/AdminUserProfileUpdateTest.php`.

## Deleting a platform user: the guard sits on the service, not the dialog

`DELETE /admin/users/{id}` (`AdminUserController::deleteUser` →
`AdminUserService::deleteUser()`) is a super_admin-only, destructive
(soft-delete, despite the UI copy calling it permanent) endpoint. Before
2026-10-08 the only friction was a client-side type-the-email confirmation
dialog — the service deleted whatever id it was given, including the
caller's own account and other platform accounts.

`AdminUserService::assertDeletionAllowed()` now runs first, inside the same
transaction, before the target's stores are archived or the user row is
touched, so a refused deletion leaves no partial side effect and writes no
`USER_DELETION` activity log entry:

- Refuses when the target id equals `Auth::id()` — the caller cannot delete
  themselves, last-super_admin-or-not.
- Refuses when the target's `role` is in `PROTECTED_ROLES`
  (`super_admin|platform_admin|agent`) — any platform account, not only the
  caller's own.

Both branches throw the existing `App\Exceptions\StoreActionBlockedException`
(the same one `AdminStoreDeletionService` throws for store archive/purge
refusals, kept to one error shape across both destructive admin flows)
rather than a new exception type.
`AdminUserController::deleteUser()` catches it and returns 422 with the
message intact, mirroring `AdminStoreDeletionController`; without that catch
`AdminBaseController::withErrorResponse()` would fold it into a generic 500.
Ordinary deletions (a store owner, a staff account) are unaffected — staff
own no stores, so the owner-stores archive loop never touches their
employer's store. Covered by
`tests/Feature/Admin/AdminUserDeletionGuardsTest.php`.

## A voided sale is not revenue — including on the admin surfaces

`Sale` uses `SoftDeletes`, and a voided or `POST /dashboard/reset`-cleared
sale is **excluded from every revenue figure the product quotes**, admin panel
included. The store owner's own dashboard gets that for free (`DashboardService`
goes through Eloquent, so the global scope applies), but the two admin revenue
helpers read the table through `DB::table('sales')` for their correlated
legacy-`cashier_id` fallback and so bypass it: for as long as that went
unnoticed, the admin fleet list and Store Details page quoted ₦500,000 and 50
orders for a store whose own dashboard said ₦0, and
`average_order_value`/`active_days`/the 6-month trend were all derived from
the inflated numbers (A-86).

Both helpers — `AdminStoreService::revenueSubquery()` and
`AdminStoreMetricsService::salesQuery()` — now carry
`->whereNull('sales.deleted_at')`, and they are the single source for every
consumer of those figures. **Any new raw-builder query over `sales` (or any
other soft-deleting table) must add that filter explicitly**; prefer Eloquent
unless a correlated subquery forces the builder. The third revenue site,
`AdminPlatformService::summary()`, uses Eloquent `Sale::sum()` and already
agrees. Pinned by `tests/Feature/Admin/AdminStoreSearchAndMetricsTest.php`.

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

- **Pull paging and tenant scoping:** `pull()` pages by a keyset cursor on
  `(updated_at, id)` (`page_cursor`), falling back to the legacy
  `page_offset` for older clients, and the six parent-scoped child tables
  scope through a **Builder** subquery — never `->pluck('id')`, which
  inlines every id the tenant owns as bound literals on every page. The
  tenant scope is resolved once per request by `resolvePullTenantScope()`.
  Read `docs/SYNC_PULL_PAGINATION.md` before changing any of it;
  `tests/Feature/SyncPullPaginationTest.php` is what guards it.
- **`quantity` is derived, never accepted — except through
  `reconcileQuantities()`.** `push()` forces `stock_batches.quantity = 0` on
  INSERT and strips it from every UPDATE; the column only ever moves via
  `applyStockBatchDeltas()` replaying `stock_movements`. That invariant is
  what makes concurrent multi-device writes commute, and it stays. The one
  sanctioned exception is `POST /app/sync/reconcile-quantities`
  (`reconcileQuantities()`, A-148): an explicit, client-triggered repair for
  a batch whose opening stock never produced a movement row (a bulk import
  predating `a36b00e7`), which would otherwise sit at server-side 0 forever
  with no way to self-heal. It takes `{batches: [{id, quantity}]}`, batch-loads
  every requested `StockBatch` and its product's `store_id` in two queries
  total (never one query per batch — a per-row `StockBatch::find()` +
  `authorizeChangeTarget()` lookup was the first draft and would have been
  ~3 queries per batch, found too slow for exactly the large-catalog stores
  this exists to repair), resolves each row's store from that map and falls
  back to the batch's own `store_id` only when the product link itself can't
  resolve one (the `in_array($storeId, $allowedStoreIds)` check right after
  still blocks any cross-tenant write either way), skips any batch already
  matching the snapshot (that's what makes it idempotent), and writes the
  corrected value via a conditional `UPDATE ... WHERE id = ? AND quantity = ?`
  rather than an absolute `save()` — the batch was read outside the write's
  own transaction, so a concurrent `push()` moving its real quantity in
  between must be detected (0 rows affected) rather than silently clobbered;
  a detected race skips that batch for this run rather than guessing. On a
  real difference it also writes an explaining `stock_movements` row in the
  same transaction: `movement_type = 'sync_reconciliation'`, the signed
  delta, `reason = 'Automatic stock quantity reconciliation'`. Each store
  touched gets one summary `ActivityLog` (`STOCK_QUANTITY_AUTO_RECONCILED`,
  `properties => ['batches_reconciled', 'total_quantity_delta']`) — the
  per-batch truth lives in `stock_movements`, matching how
  `AdminStoreDeletionService::purgeStore()` summarizes. The record is
  permanent and honestly labelled; an earlier draft that wrote no record was
  rejected as audit-log tampering, so do not make it silent. The response
  also includes a `movements` array (full row per correction) - the client
  needs this to seed its own local copy before its next pull, which is what
  actually stops the *reporting* device from double-applying its own
  correction (see client/AGENTS.md's `pull.ts` note; it is not a
  movement-type check in `pull.ts`, and should never become one again). The
  client excludes this one type from the owner's own movement lists and
  stock-value summaries (see `client/AGENTS.md`), and the regular-user
  notification bell (`NotificationController`) and the little-used
  `GET /stock-movements` ledger both exclude it too, but the admin panel's
  `stock_activity.movements` count and the super-admin global alert feed's
  own allowlist deliberately still leave it countable/visible there, as the
  true total each claims to be. `tests/Feature/SyncReconcileQuantitiesTest.php`
  guards all of it.
- **Per-device sync visibility (`user_devices` table, 2026-10-02).** `push()`,
  `pull()` and `counts()` each call `UserDeviceTracker::touch()`
  (`App\Services\Web\UserDeviceTracker` — deliberately its own class, not a
  private method on `SyncController`, so this addition doesn't widen that
  file's own file-size-rule violation any further), which upserts one row
  per (`user_id`, `device_id`) pair from the `X-Device-Id`/`X-Device-Label`
  headers the client already sends. **The `$storeId` passed in must already
  be ownership-verified** (`resolvePushStoreId($request, $user)` — `push()`
  and `counts()` always did this; `pull()` originally passed the raw,
  unverified `X-Store-Id` header straight through, letting a forged header
  attribute a device's sync history to a store it never touched — found on
  review, fixed before the first commit, see
  `tests/Feature/UserDeviceTrackingTest.php`'s
  `a_pull_call_never_trusts_an_unverified_x_store_id_header...` case). Never
  pass a request header to it directly. Throttled to roughly once a minute
  per pair (skips the write if the existing row's `last_synced_at` is under
  a minute old) so this is not a write on every single sync tick; wrapped in
  try/catch so a failure here can never fail the sync request it's
  piggybacking on. Purely an admin-support record — never consulted for
  sync correctness, authorization, or anything client-visible.
  `AdminUserService::getGlobalUsers()` batches the most-recently-synced
  device per row of the staff/users list (`lastSyncedAt`/`lastSyncDevice`,
  one query for the whole page via `AdminUserDeviceService::latestDevicePerUser()`
  — again its own class for the same file-size reason, injected into
  `AdminUserService`'s constructor — not one query per row); `GET
  /admin/users/{id}/devices` (`AdminUserDeviceService::getUserDevices()`,
  called directly from `AdminUserController`, not routed through
  `AdminUserService`) backs the Store Staff list's full per-device
  drill-down. `device_label` is best-effort client-side UA sniffing
  (`client/lib/utils/device-label.ts`) purely for admin readability — never
  trust it for anything security- or correctness-relevant, unlike
  `device_id`. `tests/Feature/UserDeviceTrackingTest.php` and
  `tests/Feature/Admin/AdminUserSyncVisibilityTest.php` guard it.
- **The `stores` response is scoped to the authenticated IDENTITY, not to
  the account — and the client prunes against it.** `stores` is exempt from
  the last-synced cursor and the 500-row cap (`fetchPullPage()`), so the
  client treats it as a complete snapshot and soft-deletes any local store
  the response omits. But `resolvePullTenantScope()` (via
  `resolveOwnershipIdentity()`) resolves `$ownedStoreIds` to
  `[$user->store_id]` for a user who owns no store of their own — i.e.
  every genuine staff account — and to `Store::where('user_id', $ownerId)`
  for anyone who does own one, whatever their `store_id` says (that
  precedence was the other way round until A-127). So a staff session's
  pull returns exactly one store while the account may own several. That combination cost a live
  two-store owner a store in the switcher (2026-09-29); the client now
  refuses to prune unless the signed-in identity has no `store_id`
  (`client/AGENTS.md`, "The `stores` prune, and how a store disappears").
  Pinned by
  `SyncEndpointTest::test_pull_sync_stores_snapshot_is_narrowed_to_a_staff_users_own_store`.
  Any change that narrows the `stores` list further — or that adds another
  table the client is allowed to treat as authoritative-by-absence — has to
  be reasoned about on both sides, in the same change.
- **Plan-tier sync interval is per RUN, not per request:** `validateSync()`
  throttles on `stores.last_sync_at` against the tier's `sync_interval`, but
  one client `sync()` call is many requests (50-change push batches, paged
  pulls). The client sends one `X-Sync-Run-Id` per `sync()` call; the run's
  first request is checked and the rest are exempt, recorded on
  `stores.last_sync_run_id`/`last_sync_run_started_at` and honoured for at
  most `SYNC_RUN_MAX_MINUTES`. `?manual=1` (a real "Sync Now" click only —
  the background daemon does **not** send it) still bypasses the interval.
  `tests/Feature/SyncRunThrottleTest.php` guards all of this.
- **Table-name mismatches:** the client's sync table name doesn't always
  match the real MySQL table — check `getModelForTable()` in
  `SyncController.php` first. E.g. client `audit_logs` → server model
  `ActivityLog` → real table `activity_logs`. Add any new column to
  `activity_logs`, not a nonexistent `audit_logs` table.
- **`tests/Feature/SyncSchemaParityTest.php`** parses `client/lib/db/schema.ts`'s
  raw `CREATE TABLE` SQL via regex to assert every column the server's
  `getModelForTable()` claims to sync actually exists server-side. It does
  **not** strip SQL comments — a `--` comment line inside a `CREATE TABLE
  (...)` block in `schema.ts` gets parsed as a bogus column and fails this
  test. Don't add inline `--` comments inside `schema.ts`'s CREATE TABLE
  bodies; put explanatory comments in `schema-migrations.ts`'s ALTER-TABLE
  array instead (real JS, `//` comments are fine there).
- **A synced column added only on one side is a live production incident,
  not just a lint failure — and this has now recurred three separate
  times in the same week (2026-09-23):** `activity_logs.correlation_id`,
  `stock_movements.movement_type`'s incomplete `ENUM`, and (same day,
  later batch) `sales.markup_type` +
  `stores.staff_can_request_transfers`/`markup_sales_enabled` all shipped
  client-side and got caught — the first two live in production sync
  errors, the third by a `/code-review high` pass before it ever shipped.
  **Treat "does this new synced column have a matching Laravel migration
  in the same change?" as a mandatory checklist item for any PR that
  touches `client/lib/db/schema.ts`, not something to catch on review.**
  A device that writes to a client-only column fails every subsequent
  sync push for that row with `Unknown column` (stays queued locally,
  retrying forever, never reaching the server). Always add BOTH the
  client schema/migration AND a matching Laravel migration in the same
  change; the most recent example migrations to copy the idempotent
  `Schema::hasColumn(...)` guard pattern from are
  `2026_09_23_000006_add_markup_type_to_sales.php` and
  `2026_09_23_000007_add_staff_transfer_and_markup_toggles_to_stores.php`
  (or search `database/migrations/` for "Server-side counterpart to the
  client's" more generally).
  **Note on `$fillable`:** `SyncController::push()` writes every incoming
  row via `$model->forceFill($payload)`, which bypasses `$fillable`
  entirely — so a missing `$fillable` entry is *not* what breaks sync (a
  missing DB column is). Add the `$fillable`/`$casts` entry anyway,
  immediately, in the same change: other mass-assignment paths in this
  codebase (e.g. web-dashboard controllers using `fill()`/`create()`) do
  respect it, and a column that's `forceFill`-writable but not
  `$fillable` is a silent trap for the next person who writes a normal
  Eloquent update against the same model.
- **Server-authoritative columns need an explicit push-side strip, not just
  a `$fillable` exclusion** (same reason as the `forceFill` note above).
  `normalizePushPayload()` holds the per-table strip lists:
  `USER_SYNC_FORBIDDEN_FIELDS`/`sanitizeUserSyncPayload()` for `users`,
  `STORE_SYNC_FORBIDDEN_FIELDS` for `stores` (every `paystack_*` column —
  settlement destination and the fee-dirty flag — plus the account-state
  columns `status`/`suspension_reason`/`is_demo`, which only
  `AdminStoreService` may write, and the `*_seeded_at` server-seeding
  watermarks), and `stock_batches.quantity`
  inline in `push()`. `authorizeChangeTarget()` admits **any** caller whose
  allowed stores include the row — staff, not just the owner — so a money-
  routing column riding the generic push is a settlement-redirect hole, not a
  theoretical one. Anything only a dedicated endpoint or a console command may
  set belongs in one of those lists in the same change that adds it.
  Coverage: `tests/Feature/SyncStoresPaystackFieldGuardTest.php`.
- **Write authorization is checked on all three operations, and INSERT is the
  one that needs its own resolver.** `push()` gates UPDATE and DELETE with
  `authorizeChangeTarget()` (which inspects the *stored* row) and INSERT with
  `authorizeInsertTarget()` (which inspects the *incoming payload*, because
  there is no stored row yet). Both funnel through the same
  `resolveChangeStoreId()` table map, so read scoping, UPDATE/DELETE scoping
  and INSERT scoping cannot drift. INSERT needed the separate resolver because
  six child tables — `stock_batches`→`product_id`, `sale_items`→`sale_id`,
  `sale_item_batches`→`sale_item_id`, `return_items`→`return_id`,
  `prescription_items`→`prescription_id`,
  `purchase_order_items`→`purchase_order_id` — carry no `store_id` of their
  own, so `normalizePushPayload()`'s `STORE_ID_BACKFILL_TABLES` check can't see
  them; for as long as the INSERT branch had no check at all, a product id
  harvested off the unauthenticated `GET /storefront/{slug}` was enough to
  plant phantom stock or fabricated sale line items in a stranger's tenant
  (A-77). **A new child table whose tenant scope comes from a parent FK must
  be added to `resolveChangeStoreId()` in the same change**, or it lands
  unchecked on every operation. **A new table carrying its own `store_id`
  must be added to `STORE_ID_BACKFILL_TABLES` as well as
  `resolveChangeStoreId()`**
  — the two lists are not interchangeable: the resolver gives a table
  authorization scoping, while `STORE_ID_BACKFILL_TABLES` is what backfills a
  payload that omitted `store_id` and what refuses one naming a foreign
  store. A table in the resolver but not the list accepts an INSERT with no
  `store_id` and writes it `NULL`, which `pull()`'s store scoping then hides
  from every device permanently — and, less obviously, accepts an **UPDATE**
  naming a foreign `store_id`, because `authorizeChangeTarget()` clears it
  from the *stored* row's ownership and `forceFill()` then hands the row to
  the other tenant. Both halves came from the 2026-09-05 schema-drift sweep,
  which added these `store_id` columns and updated only the read side: A-164
  for the two loyalty-config tables, A-166 for `stock_audits`,
  `held_transactions`, `loyalty_transactions` and `customer_payments`.
  `STORE_ID_BACKFILL_TABLES` and `resolveChangeStoreId()`'s
  `$directStoreTables` now hold the same 21 tables (the six parent-FK child
  tables reach the resolver through its own per-table branches instead);
  keep them that way.
  - **The backfill half of that list is INSERT-only; the foreign-store
    refusal half is not.** `normalizePushPayload()` runs for every operation,
    and a client UPDATE never resends `store_id` (ownership is immutable
    client-side), so an unconditional backfill reassigned a row to whichever
    store happened to be active for that push — a real outcome for a
    multi-store owner flushing writes queued before a store switch, and one
    `authorizeChangeTarget()` cannot catch, because it resolves ownership
    from the loaded model *before* `forceFill()` applies the payload. On
    UPDATE/DELETE an empty `store_id` is now dropped from the payload
    instead. `$change['operation']` alone is not a sufficient gate: the
    "INSERT for an existing id becomes an UPDATE" rewrite in `push()` happens
    *after* this call, so `push()` separately drops a merely-backfilled
    `store_id` at the point it performs that rewrite. Don't collapse either
    half back into an unconditional backfill (A-164).
  - Both resolvers fail **open** on a parent that resolves to *no* store
    (a child pushed before its parent in the same batch, or a legacy row
    predating the `store_id` backfill) and **closed** on a parent that
    resolves to a store outside the caller's scope. Don't "tidy" the
    fail-open away — `backfillStoreIdOnLegacyRows` is still live for
    accounts with local DBs older than its ship date.
  - `normalizePushPayload()`'s foreign-`store_id` rejection is deliberately
    **not** gated on `$currentStoreId`. It used to be, which meant a caller
    who owns no store yet (`resolvePushStoreId()` → null) had an explicit
    foreign `store_id` accepted verbatim.
  Coverage: `tests/Feature/TenantIsolationTest.php` (child-table INSERT under
  a foreign parent, plus the store-less caller) and
  `tests/Feature/SyncPushOwnershipTest.php` (UPDATE/DELETE).
- **A MySQL `ENUM` column for a client-controlled string field is a
  recurring footgun, not a one-off bug:** `stock_movements.movement_type`
  was created as an `ENUM` back in 2024 that never actually matched every
  value the client sends (`transfer_out`/`transfer_in` were never in the
  list) — every stock transfer silently failed to sync from day one until
  caught and fixed 2026-09-23 (converted to `VARCHAR`). If a client column
  is free-form (no fixed, server-enforced set of values), don't constrain
  it with a server-side `ENUM` — the two lists *will* drift.

## `PermissionGroupSeeder` is a hand-maintained port of a client constant

`app/Services/PermissionGroupSeeder.php`'s `DEFAULT_GROUP_PERMISSIONS`,
`CATALOG_VERSION` and `DEFAULT_GROUP_PERMISSION_ADDITIONS` must match
`client/lib/constants/permissions.ts` key-for-key. They silently drifted by
20 keys over two days (the client was maintained through every permission
pass; this file was only ever edited for removals), which would have frozen
every server-seeded store on the pre-expansion permission lists.
`tests/Feature/PermissionCatalogParityTest.php` parses the TypeScript and
fails on any drift — it lives here rather than in vitest because the Checks
workflow's `client` job has no PHP, while the `server` job has the whole
repo. `ensureCatalogBackfilled()` and `SyncController`'s terminal
`permission_denied` rejection (`SyncPushPermissionDeniedException`, thrown by
`sanitizePermissionGroupSyncPayload`'s two privilege checks always, and by
`normalizePushPayload()`'s cross-tenant `store_id` guard only when
`storeBelongsToTenantOwner()` is false — otherwise that guard throws the
retryable `SyncPushForbiddenException` instead, see A-167) are documented in
full in `client/AGENTS.md`'s "Catalog versioning and the default-group
backfill" — read that before touching either, especially before adding any
exemption to that sanitizer: one was tried and removed on 2026-09-29 because
`validateSync()` backfills the server before any pushed change is processed,
which made the exemption both unreachable and a hole.

**Every authorization refusal on the push path must carry a machine-checkable
reason.** `push()`'s per-change catch falls back to `$e->getMessage()` for any
other exception type, and the client only treats a reason it recognizes as
terminal (`NON_RETRYABLE_CONFLICT_REASONS` in
`client/lib/db/sync-engine/push.ts`). A bare `\RuntimeException` therefore
turns a permanent refusal into an infinite retry loop and a permanently stuck
`_sync_queue` row — see `docs/FIXED_BUGS.md` A-161, where the cross-tenant
`store_id` guard did exactly that in production. Throw
`SyncPushPermissionDeniedException` (or return a structured `'reason'` the way
the `forbidden` branches do), never a bare throw, for anything the caller is
simply not allowed to do.

**And the reason must say whether the refusal is absolute or session-relative.**
The client drops *and settles* (`_synced = 1`, unrecoverable by any pull or
requeue) on `permission_denied`, but only parks on `forbidden`. So
`permission_denied` is reserved for a refusal no session of that account could
ever accept — another tenant's store, a store that does not exist, a
soft-deleted one — while a refusal that merely reflects the *current* session's
narrower envelope must be `SyncPushForbiddenException`. Both extend
`SyncPushRefusalException`, which is what `push()`'s catch maps to a reason.
The trap is `resolveOwnershipIdentity()`: it gives a staff session one store
where it gives an owner all of them, and `_sync_queue` is device-global with no
identity, so any guard reading `$allowedStoreIds` is session-relative unless
you check otherwise — `storeBelongsToTenantOwner()` is that check. See
`docs/FIXED_BUGS.md` A-167, which found real transactional rows being destroyed
this way, and A-168 for the two sites deliberately left terminal.

## Known gotcha: MySQL timezone vs. Laravel's UTC clock

See `.agents/AGENTS.md` §6 for the full writeup (Namecheap shared hosting's
MySQL runs `time_zone = SYSTEM`, ~4h behind UTC; raw `NOW()`/
`CURRENT_TIMESTAMP()` in SQL silently breaks the sync engine's
`updated_at`-based pull filter). Short version: never use MySQL's own
`NOW()` in raw SQL against this database — let Eloquent set timestamps.

## Model boot() hooks for cross-cutting, debounced side effects

`app/Models/Store.php`'s `boot()` (added 2026-09-23) is the pattern to
follow for "something must happen whenever a column changes, regardless of
which endpoint/sync path changed it": a `static::saving()` closure can
silently revert just one dirty attribute back to its original value
(without failing the whole save — other legitimately-changed fields in the
same request/sync push still persist) to enforce a business rule like a
cooldown; a `static::saved()` closure can stamp a "dirty" bookkeeping flag
via a **raw `DB::table(...)->update(...)`, not another `$model->save()`**
(a second `save()` would re-fire these same boot events). A scheduled
command (`App\Console\Commands\RebuildStorefrontIfDirty`, `routes/console.php`)
then debounces the actual expensive side effect (a GitHub Actions
`repository_dispatch` triggering a full site rebuild) by batching however
many rows went dirty since its last run into one action, instead of firing
per-change. `store_slug_changed_at`/`storefront_dirty_at` are deliberately
**not** in `$fillable` — they're server-only bookkeeping columns, set only
by these hooks, never accepted from a client sync payload (client mirrors
them in its own schema only so pull sync's dynamic column list doesn't
break on an unknown column — see `client/AGENTS.md`).

**The pipeline as it stands after 2026-09-26's storefront remediation**
(`docs/STOREFRONT_REVIEW.md`, SF-P2-2/SF-P2-3 — read that file before
extending or relying on any of this):

- **What dirties a storefront.** `Store::boot()`'s `saved()` hook fires on
  `Store::STOREFRONT_PUBLISHED_FIELDS` (`online_store_enabled`, `store_slug`,
  `name`, `logo_url`, `phone`, `email`, `address`, `location` — i.e. exactly
  what the public page renders) and on a `status` → suspended transition
  (tested via `Store::isSuspended()` — see "stores.status casing" below).
  `Product::booted()` mirrors it for the other half of what a customer sees:
  `created` when `show_online`, `updated` on
  `name`/`selling_price`/`show_online`/`is_active`, and `deleted` when
  `show_online`. Keep those two field lists in step with
  `web/app/store/[store_slug]/page.tsx` and `StorefrontProductResource` — a
  column the page renders but neither list names is a silently-stale page.
  Both write via raw `DB::table()->update()`, never `->save()`, and
  `Product`'s is narrowed to stores with `online_store_enabled` so a bulk
  product sync writes nothing for the accounts that publish no storefront.
- **The stamp is always refreshed, not only set when null.** That is
  load-bearing, not sloppiness: the confirmation callback below clears flags
  stamped at or before the dispatch moment, so a change landing mid-build has
  to move the timestamp past that cutoff or it would be cleared without ever
  shipping.
- **Flags are cleared on deploy *success*, not on dispatch acceptance.**
  `repository_dispatch` returns 204 as soon as GitHub queues the event, so the
  old clear-on-204 lost the pending rebuild permanently whenever a build
  failed. `deploy-web.yml` now calls back
  `POST /internal/storefront/rebuild-complete`
  (`Api/Internal/StorefrontRebuildController`) after a successful FTP sync,
  authenticated by an `X-Storefront-Rebuild-Token` header matched with
  `hash_equals` against `config('dumos.storefront.rebuild_token')` — the
  inbound counterpart to `config/dumos.php`'s outbound GitHub token, and a
  dedicated endpoint with an explicit header check rather than anything
  ambient (see the admin-auth section above on why this app never promotes an
  ambient credential). The dispatch timestamp lives in `SystemConfig` under
  `storefront_rebuild_requested_at` specifically to avoid adding a synced
  column to a table `client/` mirrors.
- **`STOREFRONT_REBUILD_TOKEN` unset ⇒ the old clear-on-dispatch behaviour.**
  Deliberate, so the API `.env` and the GitHub Actions secret can be set in
  either order without a window where every scheduled run fires another full
  rebuild. **Both sides need setting for the confirmation loop to engage at
  all.** While a rebuild is outstanding and unconfirmed the command refuses to
  dispatch another until
  `dumos.storefront.rebuild_confirmation_timeout` (default 45 min) has passed.
- **Coverage:** `tests/Feature/StorefrontRebuildPipelineTest.php` (15 tests,
  `Http::fake()`) is the file to extend for anything in this area.

Note also that the storefront's online-payment flow (`initializeCheckout`/
`StorefrontPaymentIntent`) was wired up end-to-end 2026-09-26 (SF-P1-2) via
per-store Paystack subaccounts — see the dedicated section below for the
onboarding flow, fee semantics, propagation cadence, and the refund decision.
Full design: `docs/superpowers/specs/2026-09-26-storefront-paystack-subaccounts-design.md`.

## Sync push refusals are recorded once, from `$failed`, after the outer commit

`push()` refuses changes from **eight** separate sites, every one of which
appends to the same `$failed` array that is returned in the response. Recording
reads that assembled array **once**, after the outer `DB::commit()`, beside
`sendFirstSyncAlert()`.

- **The contract for a new refusal path is "append to `$failed`"** — which every
  existing path already honours — not "remember to log at your new throw site".
  Recording at each site would mean eight call sites rebuilding store/user
  context, and a ninth added later would silently go unrecorded.
- **After the commit, deliberately.** A push whose outer transaction rolls back
  applied nothing, so recording earlier would leave failure rows describing
  changes that were never committed.
- **Wrapped in `try`/`catch`, deliberately.** A sync that succeeded must never be
  reported as failed because telemetry could not be written. `SyncFailureRecorder`
  throwing is logged and swallowed, and `SyncPushFailureRecordingTest` pins that
  the push still returns 200.
- **The recorder is resolved from the container at the hook, not injected.**
  `SyncController` has no constructor on purpose: `SyncSchemaParityTest` does
  `new SyncController()` directly, and adding one broke it. Leaving the public
  signature untouched meant no existing test had to be edited to accommodate the
  change.
- **Store attribution uses `resolvePushStoreId()`**, the same resolver
  `touchStoreLastSyncAt()` uses. Any other lookup mis-attributes a multi-store
  owner's failures to the wrong branch — the exact bug that resolver exists to
  prevent.
- **The operation is recovered by `table_name|record_id`, never by `id`.** A
  change entry's `id` is optional and real client pushes omit it entirely (see
  `SyncPushSessionScopedRefusalTest`), so keying on `id` would record a null
  operation for virtually every production refusal.
- **`sync_failures.store_id` carries no foreign key on purpose**, so
  **archiving** a store (a soft delete) leaves its recorded refusals intact —
  which matters, because an archived store is often exactly the one being
  investigated. **A purge does delete them**, and deliberately:
  `AdminStoreDeletionService::storeScopedTables()` discovers every table with a
  `store_id` column rather than reading a list, so both new tables are hard-
  deleted along with the rest of the store's data. That is the right behaviour
  for a purge — it is the "erase this tenant" operation — but it means the
  absent foreign key buys retention across *archival only*, not across purge.
- **Reasons are canonicalised before they are stored.** `SyncFailureRecorder`
  writes only the controller's own stable slugs; anything else (an exception
  message reaching `$failed` from the `catch` at the bottom of the per-change
  loop, or from the stock-delta pass) becomes `server_error` and the detail goes
  to the log. Three reasons, all load-bearing: a `QueryException` message runs
  to several hundred characters and would blow the `string(255)` column under
  `strict => true`, aborting the whole recording **including the tally** and
  silently inflating the success rate for the one store actually failing; the
  message embeds the failing SQL *and its bindings*, so customer names, phones
  and amounts would land in an observability table and be rendered in the admin
  UI; and a free-text reason makes `failures_by_reason` unbounded.
- **Recording failure rows and updating the tally are independent.** Each is
  wrapped separately, because losing the tally is worse than losing the rows:
  it removes the store from the denominator entirely.
- **Conflicts are not refusals.** `version_conflict` and `stale_timestamp` are,
  in `push()`'s own words, "a routine, expected occurrence in multi-device
  sync". They are recorded in `sync_failures` for forensics but counted in
  `changes_conflicted`, not `changes_refused`, so a healthy three-terminal store
  can still read 100%. A success rate that no working store can ever reach is
  one operators learn to ignore.
- **The daily bucket comes from the application clock** (`now()->startOfDay()`),
  never a database-side date — see the §7 timezone section below. Note the bucket
  is a Carbon, not a `Y-m-d` string: the model's `date` cast stores
  `Y-m-d H:i:s`, so a string lookup never matches an existing row and every
  second push of the day violates the unique constraint.
- **Phase 2 is observation only.** It must not change what the server accepts,
  refuses or returns. `SyncPushFailureRecordingTest` pins the response shape.

## A refused push still counts (PG-18)

The sync tally has two paths, and both must fire or the metric lies:

- `recordPushOutcome()` — the per-change hook, after the outer commit.
- `recordRejectedPush()` — the whole-request path, for a `validateSync()`
  refusal or an outright failure, which never reach the loop.

Without the second, a store whose plan lost `cloud_sync` contributed **zero**
rows and the platform success rate read 100% while that store synced nothing.
If you add another early return to `push()`, it needs the same call, or you
have reintroduced exactly this.

The outer catch is `\Throwable`, not `\Exception`, on purpose: an `\Error`
was previously uncaught, so the request died with no rollback and no record.

## Sync commands: acting on a device (stuck-data Phase 4)

`SyncCommandService` is the only thing in the system that lets an operator act
on a customer's device. The guards are the feature, not decoration.

- **A closed vocabulary**: `retry`, `send_payload`, `abandon`. Dispatch is a
  `match`/`switch` on both sides; an unrecognised action is refused, never
  dispatched. Commands touch `_sync_queue` and nothing else — a compromised
  admin panel must not become a way to edit or destroy store data.
- **`abandon` is governed by an ALLOWLIST** (`feedback`, `audit_logs`), not a
  denylist. A business record exists only on the device that made it, so
  discarding a queued sale or stock movement permanently loses revenue data
  or falsifies stock. A table added later therefore defaults to "cannot
  abandon" rather than silently becoming discardable. **Enforced in three
  places** — the server refuses to issue it, the client refuses to apply it,
  and the UI does not render the control — because a client must never rely
  on a server check it cannot see.
- **super_admin only, never delegatable**, and every issue writes a
  `SYNC_COMMAND_ISSUED` activity log.
- **Handed out once.** `pendingFor()` marks commands `sent` as it returns
  them, so a device that syncs twice before acting cannot apply one twice.
  Outcomes are scoped to the reporting device: one device cannot close
  another's command.
- **Eventually consistent by construction.** Commands ride on the push
  response and apply on the device's next sync — which, for a store whose
  plan disables sync, may be never. The UI must distinguish *queued* from
  *applied* or operators will fire the same command repeatedly.
- **Applying a command can never roll back a push.** It runs outside the
  batch transaction and its results are reported on the following request.

## Device queue reports (stuck-data Phase 3)

`DeviceQueueReportService`. `_sync_queue` is client-only — the server has
never seen a stuck row, which is what being stuck means — so devices report
their own queue on each push: depth, and the rows past the retry ceiling.

- **Metadata only, never payloads.** Table, record id, attempt count, reason.
- **The raw `last_error` is never stored.** It embeds the failing SQL and its
  bindings — customer names, amounts — so the server canonicalises it to a
  known slug and keeps only that, exactly as `SyncFailureRecorder` does.
  The client sends it un-canonicalised because it has no reason catalogue;
  the storage boundary is where that is enforced.
- **The list is capped at 50 per device, but `stuck_count` carries the true
  total** and the UI says "showing the first N of M". A cap must never be able
  to understate the problem.
- **Recording can never fail a sync** — wrapped and logged, like the stock
  fingerprint.
- **Silence is not health.** `forStore()` returns `measured: false` for a
  store no device has reported for, and the panel says nothing can be
  concluded rather than "nothing is stuck".

## Device stock fingerprints (stuck-data Phase 1)

`StockDivergenceService` answers "which devices disagree with the cloud about
stock, and by how much" without anyone counting shelves — the question A-173
and A-176 raised and nothing could answer.

- **A fingerprint, not an upload.** Each push carries
  `stock_fingerprint: {batch_count, quantity_sum}` for the active store. The
  server computes the same two numbers from its own rows and stores **both
  sides** in `device_stock_reports`, keyed `(store_id, device_id)`. Sending
  every batch quantity on every sync was the obvious design and is far too
  much data.
- **Both sides are snapshotted at write time**, never recomputed on read, so a
  stored comparison cannot change meaning later.
- **A matching fingerprint is evidence of agreement; a differing one is proof
  of disagreement.** It cannot say *which* batch differs — that needs the
  per-device queue/payload work in later phases.
- **Recording can never fail a sync.** The call is wrapped and logged; a
  reporting problem must not cost a store its push.
- **Unmeasured is not agreement.** `forStore()` returns `measured: false` for a
  store no device has reported for, and the UI says "agreement is unknown"
  rather than implying everything is fine. This is the single place this
  feature would most easily break Phase 1's rule.
- Gated on `view_platform_health` — operational, not commercial.

**Client side:** `client/lib/db/sync-engine/stock-fingerprint.ts`. Note that
`stock_batches.store_id` exists only because `runSchemaMigrations()` adds it
to every `STORE_SCOPED_TABLES` entry — it is NOT in `SCHEMA_SQL`, so a test
that seeds from `SCHEMA_SQL` alone must add the column or the query silently
returns nothing.

## What may be delegated, and what must never be

`role:super_admin` on a route means "no role configuration can ever reach
this". That is a strong statement and it was being used for everything,
including read-only screens, which made "let an operator see more without
letting them do more" impossible to express in the roles UI.

Since 2026-10-07 the read-only platform surfaces are permissions instead:

- `view_platform_health` — `/admin/health`, `/admin/errors`, `/admin/sync/*`
- `view_platform_revenue` — `/admin/trends`, `/admin/marketing/revenue`,
  `/admin/stores/{id}/billing-history`
- `view_subscriptions` — `/admin/subscriptions/*`

All three are in `User::DELEGATABLE_PERMISSIONS`, so a custom role can hold
them and `AdminRoleService` can grant them.

**What stays `role:super_admin`, and why it must:**

- **Anything that can grant a permission** — `/admin/roles*`,
  `/admin/users/{id}/permissions`, `/admin/users/{id}/permission-overrides`.
  A delegated admin who can edit roles can grant themselves every other
  permission, so delegating these delegates everything. This is the one rule
  here that is not a judgement call, and
  `AdminDelegatablePlatformViewsTest::test_role_and_permission_editing_cannot_be_delegated`
  fails loudly if it is ever relaxed.
- **Destructive or platform-wide actions** — the migration runner, store
  purge/restore, global product catalog edits, system config, referral
  credit adjustments, outbound mail.

The principle: **restrict what an operator can DO, not what they can SEE** —
except where seeing is itself the risk (money and customer data), which is
why revenue is its own permission rather than folded into
`view_platform_data`.

## Who may see whose activity

`AdminActivityService` and `AdminActivityFeedSources` both hide
**super-admin actions from everyone below super_admin**. Role changes,
subscription overrides and migrations are privileged operational detail, not
peer accountability.

Operators still see their whole peer group — another platform_admin's and
every agent's actions, plus all store-level activity. An own-actions-only
view was considered and rejected: the value of an audit log is noticing what
somebody *else* did, and a log that only reflects you back cannot do that.

The filter **fails closed** for an unauthenticated or direct service call, so
a test that exercises the `role` parameter has to `actingAs()` a super admin
or it will silently assert against a filtered set.

## Trends: what the schema can and cannot support (Phase 4)

`AdminTrendsService` + `AdminChurnTrendService` + `App\Support\TimeSeries`.

- **MRR is not derivable and must not be invented.** `subscriptions` has
  `plan_name`, `start_date`, `end_date`, `status`, `is_trial` — **no amount, no
  billing cycle**. Billing cycle exists only inside
  `payment_transactions.metadata` for manually activated plans, and nothing
  records auto-renewal. Cash collected (successful `payment_transactions`, per
  currency) is what the data supports. Adding `billing_cycle`/`amount` to
  `subscriptions` is a deliberate cross-repo project with an incomplete
  backfill, not a side effect of a charts change.
- **Historical buckets are immutable.** Store signups uses `withTrashed()` on
  purpose: counting the *event*, not the current population. A past bucket that
  shrinks when a row is soft-deleted makes the chart rewrite its own history.
  `AdminTrendsTest::test_a_soft_deleted_store_still_counts_in_the_month_it_signed_up`
  is the guard; confirmed RED against the `withoutTrashed()` version.
- **Window boundaries come from PHP, bucket labels from the row.** §7 applies:
  `TimeSeries` generates the range with `now()`, never MySQL's clock. Formatting
  a stored column is fine; letting the DB decide "now" is not.
- **Zero-fill is not cosmetic.** A `GROUP BY` omits empty months, which makes a
  line jump the gap as though it never existed. `TimeSeries::fill()` fills every
  bucket, and a filled zero is a measurement — distinct from a series that could
  not be computed.
- **Churn lives in its own service** because it is the only series that cannot
  be answered in SQL: grace resolves in PHP through
  `SubscriptionService::subscriptionState()`, the single definition this repo
  gates live traffic on. It carries Phase 3's `CANDIDATE_LIMIT` and a per-owner
  memo; without the memo, 40 owners with 3 lapsed subscriptions each cost 368
  queries, and `AdminTrendsTest`'s budget test holds that line.

## Subscription lifecycle: one resolver, and it is not the `status` column

`SubscriptionService::subscriptionState(User $owner)` returns `trialing`,
`active`, `in_grace`, `lapsed` or `none`, and is the **only** definition of an
account's lifecycle state. It is built *on top of*
`resolveEffectiveSubscription()` — the same method `CheckSubscription`,
`hasFeature()`, `checkLimit()`, `enforceStaffLimits()` and `SyncController` gate
live traffic on — so the admin panel and the application can never disagree
about who is subscribed.

- **Never re-derive the grace window.** `subscriptionState()` reads `end_date`
  only to *classify* the row `resolveEffectiveSubscription()` already chose. If
  that method's grace logic changes, this follows automatically. A second source
  of truth for grace is how this subsystem has already gone wrong twice.
- **Never decide liveness from `subscriptions.status`.** See the section below:
  nothing wrote `expired` until `subscriptions:expire` existed, and
  `grace_period` has never been written at all.
- **Lifecycle state is a property of an owner, not a subscription row.** An
  owner holding an expired subscription *and* a current one is not lapsed.
  `AdminSubscriptionLifecycleService`'s four worklists all resolve to distinct
  owners; counting rows is what made the Overview report 7 active subscriptions
  for a single account.
- **`lapsed` and `none` are deliberately distinct.** Never-subscribed is a sales
  problem, lapsed is a retention problem, and one combined bucket is a list
  nobody can act on.
- **Grace is deliberately not expressed in SQL.** Each worklist narrows with a
  query (a `whereBetween` on `end_date`, a `whereIn` on payment status) and then
  filters the candidates through `subscriptionState()`. Narrowing first keeps the
  in-PHP pass bounded; expressing grace in SQL would be the second definition
  this section forbids. `CANDIDATE_LIMIT` caps that candidate set so a platform
  with years of expired rows cannot hydrate all of them in one request.
- **Resolve an owner once per request.** Because grace is resolved in PHP, every
  owner in a candidate set costs queries. `effectiveSubscriptionWithState()`
  returns the row and its classification from a single resolution (prefer it to
  calling `resolveEffectiveSubscription()` and `subscriptionState()` in
  sequence, which resolves twice), and `AdminSubscriptionLifecycleService`
  memoises per owner id for the life of the request — `figures()` touches the
  same owner from up to four buckets. Without both, 60 lapsed owners cost 920
  queries; with them, under 250. `AdminSubscriptionQueryBudgetTest` holds that
  budget, so a change that reintroduces per-bucket resolution fails loudly
  instead of quietly scaling with the store count.
- **The lifecycle endpoints are `role:super_admin`**, matching their nav item —
  see `web/AGENTS.md` for the four-layer gate and, in particular, why a surface
  gated more narrowly than `admin/layout.tsx` needs its own page guard.

## `subscriptions.status` is not self-maintaining — always pair it with `end_date`

Until 2026-10-06 **nothing transitioned a subscription out of `active` when its
`end_date` passed.** `status` only ever changed when an admin granted a trial or
activated a plan, both of which explicitly expire the account's prior rows
(`AdminUserService`, `AdminStoreService`). Every other row stayed `active`
forever, so an owner accumulated one permanently-`active` row per subscription
they had ever held. The admin Overview's "Active Subscriptions" counted rows and
reported 7 for a single account.

- **Why nothing broke:** every access-control and billing reader already pairs
  the status check with `end_date` — `CheckSubscription`, `SubscriptionService::resolveEffectiveSubscription()`,
  `SyncController`, `SubscriptionController`, `StorefrontController`,
  `AdminStoreService`'s plan filter. Only code that read `status` alone (a
  count, a group-by) was wrong. **Keep it that way: never gate access on
  `status` by itself.**
- **`subscriptions:expire`** (`ExpireLapsedSubscriptions`, scheduled daily at
  02:00) now closes the gap. Its first run is also the backfill for historical
  rows.
- **It deliberately expires only past `end_date` + `grace_period_days`, not past
  `end_date`.** `resolveEffectiveSubscription()` finds the grace-window row with
  a `status = 'active'` filter in *both* of its branches, so expiring a row the
  moment `end_date` passed would silently cut the grace period to zero — which
  is the failure that previously deactivated staff and sent suspension
  notifications to accounts merely mid-renewal. If you ever change the grace
  source, change it in both places.

## `POST /subscription/verify-license` is scoped to the caller's own account

The license key is not a secret in the threat model that matters here: `GET
/subscription/status` returns it in plaintext to the store's own users, so it
travels through support chats and screenshots. Verification therefore may
never be "does this key exist" — it looks the subscription up **by key *and*
by `user_id`, resolved through `SubscriptionService::getSubscriptionOwner()`**
so a staff member verifies their employer's key and nobody else's. Before
that, any authenticated user could present a stranger's `enterprise` key, have
a `License` row created for *their* `machine_id` against the victim's
subscription, and be answered `valid: true, plan: enterprise` — an entitlement
bypass plus a write into another tenant's `licenses` rows (A-87). A key that
exists but isn't the caller's returns the same 404 as an unknown one, so the
endpoint never confirms a key as valid-but-not-yours.

`last_check_in` is stamped **after** the `is_active` check, not before: a
deactivated device must not leave a fresh check-in behind on its way to a 403.
Pinned by `tests/Feature/VerifyLicenseOwnershipTest.php`. `.agents/AGENTS.md`
§8 covers the client-side JWT/anti-backdating half of the licensing system.

## Coupon usage is reserved under a lock, not counted at activation

`max_uses`/`max_uses_per_user` are counted from `coupon_usages`, and those rows
used to be written only when a subscription **activated** — so validity was
evaluated against a count that moved after the money was already committed, with
no lock anywhere. Twenty concurrent checkouts on a `max_uses: 1` launch coupon
all passed, all got the discount, and all activated at it; a double-submitted
100%-off coupon minted two overlapping active subscriptions (A-80).

The rule now matches the referral-credit one below: **the discount is reserved
where it is granted.** `SubscriptionService::reserveCoupon()` takes a
`lockForUpdate()` on the coupon row, re-validates inside that transaction and
writes the `CouponUsage` row before returning, so a second caller blocks and
then sees the real count. `initiatePayment()` uses it for both branches, stamps
`metadata.coupon_usage_id` on the `PaymentTransaction`, and the reservation is
then either **linked** (`attachCouponUsageToSubscription()`, at
`$finalAmount <= 0` self-activation and at `activateSubscriptionFromTransaction()`)
or **released** (`releaseCouponUsage()`, on an `initializeTransaction()` failure
and in `failTransaction()`, stamped `coupon_usage_released` so it is idempotent
across the verify and webhook paths). Activation never creates a usage row for a
transaction that carries a `coupon_usage_id` — the legacy create branch is only
for transactions started before reservations existed.

**No `UNIQUE (coupon_id, user_id)` index was added**, deliberately:
`max_uses_per_user` is a column and is legitimately greater than 1, so the index
would enforce a cap the product does not have. The lock is the enforcement
point; anything new that grants a coupon discount must go through
`reserveCoupon()` rather than `validateCoupon()`, which is now only a read-only
check. Pinned by `tests/Feature/CouponUsageReservationTest.php`.

## Referral credits on a subscription checkout are reserved, not deferred

`SubscriptionController::initiatePayment()` **deducts** the credits a paid
checkout applies at initiation and stamps `metadata.credits_reserved`, rather
than only recording `metadata.credits_applied` and deducting at activation.
The rules that follow from that, all of which matter:

- **Never let bookkeeping block an activation.**
  `activateSubscriptionFromTransaction()` runs inside a `DB::transaction()`
  that performs the `status` → `'success'` transition, so anything that
  throws in there rolls back the activation of an *already-paid*
  transaction — and the provider's webhook then retries the same failure
  forever, stranding a paying customer with no subscription and no code path
  that can ever give them one (A-79). `settleAppliedCredits()` therefore
  skips reserved credits entirely and, for a legacy transaction created
  before reservation existed (`credits_applied` with no `credits_reserved`),
  clamps to the balance actually available and logs the shortfall instead of
  throwing. Anything new added to that transaction must follow the same rule.
- **Every path out of a pending transaction releases the reservation.**
  `failTransaction()` is the single writer of `status = 'failed'`, shared by
  `verifyPayment()` and `PaymentController::processSuccessfulPayment()`'s
  amount/currency-mismatch branch. It marks failed and refunds under the same
  row lock, and stamps `credits_released` so the release is idempotent across
  whichever of the two gets there first. A new failure path must call it
  rather than writing `status` itself. `initiatePayment()`'s own catch block
  releases the reservation too, for a provider that fails at initialization.
- **A valid signature proves who sent the payload, never what was paid.**
  Both webhook handlers compare the reported amount *and* currency against
  the row the charge was minted for before activating anything: without it a
  genuine ₦100 charge — or a charge in a weaker currency — activates a
  ₦100,000 plan. Two facts that are easy to get wrong:
  **units** — Paystack reports the minor unit (kobo), matching its initialize
  payload (`$amount * 100`) and its verify response (`/100`), while
  Flutterwave reports the major unit; everything this app stores an expected
  amount in is the major unit, so only Paystack is converted (one place:
  `PaymentController::reportedMajorUnitAmount()`). And **tolerance** — the
  comparison allows 0.01, because `payment_transactions.amount` can carry
  sub-kobo precision from coupon-percentage arithmetic (e.g. 13124.124) while
  a provider only ever settles whole kobo (13124.12); a strict `<` rejects a
  genuine full payment.
- **An amount/currency mismatch on a SUCCESSFUL charge is refunded, and a
  human is always told.** Marking the transaction `failed` is not an outcome
  on its own: the provider says the money moved, so leaving it there kept a
  customer's payment with no subscription, no refund and nothing but a
  `Log::warning` (PG-3). Both observers of a mismatch — the webhook's branch
  in `PaymentController::processSuccessfulPayment()` and
  `verifyPayment()`'s — now delegate to
  **`App\Services\Payment\PaymentMismatchHandler`**, which re-reads the
  transaction and bails if a concurrent observer already activated it (never
  refund a charge that bought a live subscription), attempts a full refund
  via `PaymentService::refundTransaction()`, records the outcome under
  `metadata.mismatch_refund`, and fires an `AdminAlertService` alert **either
  way** so a failed refund is still chased by hand. A verification that simply
  answers "not successful" is *not* a mismatch and is not refunded — it still
  goes straight to `failTransaction()`. Per A-110, the refund (a third-party
  HTTP call) and the alert (synchronous mail) both happen outside
  `failTransaction()`'s transaction, never with its row lock held. Pinned by
  `tests/Feature/PaymentMismatchRefundAlertTest.php`.
- **Every webhook event other than a successful charge is now visible (PG-9).**
  Both handlers used to process `charge.success` / `status: successful` and drop
  everything else on the floor — no log, no alert. A refund, dispute or
  chargeback raised in the provider's own dashboard therefore left the
  subscription active and nobody in DumosRx any the wiser.
  `PaymentController::recordUnhandledEvent()` is the single `else` branch of
  both handlers: it logs at `info` for ordinary noise (`transfer.success`, a
  plain failed charge, `subscription.*`) and, for anything whose event/status
  string reads as a refund/dispute/chargeback, logs at `warning` **and** fires
  an `AdminAlertService` alert. It always returns 200 — a 4xx/5xx only makes
  the provider redeliver forever.
  - **Matched on wording, not an event-name list, deliberately.** The needles
    are `refund`, `dispute`, `chargeback`, `charge_back`, `reversal`,
    `reversed`, tested against Paystack's `event` and against Flutterwave's
    `event` + `data.status` concatenated. Paystack's names are known
    (`refund.processed`, `refund.failed`, `charge.dispute.create|remind|
    resolve`); **Flutterwave's are not verified anywhere in this codebase** —
    the Flutterwave handler never read `event` at all before this, only
    `data.status`. Substring matching covers whichever spelling actually
    arrives without a guess that would silently miss. If you ever confirm
    Flutterwave's real event names against a live payload, write them down here
    before narrowing the match.
  - **This is visibility, not automation.** Nothing is refunded, reversed or
    cancelled automatically; the alert says so explicitly and tells the
    operator to reconcile by hand. `recordUnhandledEvent()` runs before any
    transactional work in either handler, so the A-110 rule (never
    `AdminAlertService::send()` under a DB transaction or row lock) holds.
  - Covered by the PG-9 block in `tests/Feature/PaymentWebhookTest.php`.
- **`User::addCredits()`/`deductCredits()` take a row lock.** Both are
  read-modify-write on `users.referral_credits`; without
  `lockCreditBalance()` two concurrent grants/spends both read the same
  balance and the second `save()` silently discards the first.
- Releases are recorded with type `'earned'`, not a new type:
  `referral_credit_transactions.type` is a MySQL `ENUM('earned', 'spent',
  'admin_adjustment')`, and adding a value means a migration (see the ENUM
  footgun note in the sync section).
- Coverage: `tests/Feature/SubscriptionCreditReservationTest.php`, including
  the two-concurrent-checkouts race that produced the original stranding.

## `stores.status` casing: never compare it with `===`

`stores.status` holds `'Active'`/`'Suspended'` — capitalised. That is the
canonical *stored* form and must stay that way, because two other packages
compare it exactly and are deployed separately from this API:
`client/lib/licensing/licensing-manager.ts` gates its suspension lock screen
on `profile.status === "Suspended"` (and `client/lib/api/base-client.ts`
writes that literal locally on an `ACCOUNT_SUSPENDED` 403), and `web/`'s
admin store table/detail/dashboard badges branch on `=== "Suspended"`.
Lower-casing the column would silently un-gate the desktop app's lock screen
on every already-installed client.

Server-side, however, nothing may compare the raw value: `AdminStoreService`
wrote `'Suspended'` while four read sites compared `=== 'suspended'`, so
suspension was a complete no-op on the storefront and on the
`storefront_dirty_at` rebuild trigger for as long as both existed (A-74).
The rule that replaces it:

- **Reads go through `Store::isSuspended()`** (PHP, `strcasecmp`) or
  **`Store::scopeNotSuspended()`** (query builder). Never `$store->status ===
  '…'` and never a bare `where('status', …)` on a suspension check.
- **Writes go through `Store::STATUS_SUSPENDED`/`STATUS_ACTIVE`**, not
  string literals.
- The scope uses `LOWER(...)` deliberately: MySQL's default collation is
  case-insensitive but SQLite's — which the test suite runs on — is not, so a
  bare `where('status', '!=', 'suspended')` gives *different answers in test
  and in production*. That divergence is exactly why the original bug stayed
  invisible (the slug list looked correct while the live endpoints did not).
  Any new status comparison must be written so both engines agree.
- `tests/Feature/StoreSuspensionEnforcementTest.php` pins both halves: the
  stored value itself (`'Suspended'`, so the casing contract with `client/`
  and `web/` can't drift) and casing-agnostic enforcement across the
  storefront, the slug list, `storefront_dirty_at` and `CheckAccountStatus`.

## `CheckAccountStatus` resolves the store per *request*, not per account

Multi-store is a supported, plan-gated state, so "is this account blocked?"
has no single answer for an owner: one store can be suspended while another
trades normally. The middleware therefore resolves **which store this request
is acting on** exactly the way `SyncController::resolvePushStoreId()` does —
`X-Store-Id` (or a `store_id` input) when the caller's tenant owns it, else
the caller's own `users.store_id` — and blocks only on that store. It used to
take `Store::where('user_id', …)->first()` with no `orderBy`, so which store
got enforced was whatever the storage engine returned first: suspending one
store of a two-store account enforced nothing half the time, and archiving
one 403'd the owner out of the untouched sibling with a message naming a
store the admin never touched (A-76).

- Every lookup is `withTrashed()`: an archived store must still be able to
  answer "blocked", otherwise archiving silently un-suspends.
- A request that names **no** store (an owner calling `/user`,
  `/dashboard/summary`, …) is blocked only when **every** owned store is
  suspended or archived. If anything is still in good standing the request
  proceeds and per-store scoping rejects the rest — an account-wide 403 is
  never inferred from one store's state.
- Enforcement and scoping must keep using the same resolution rule. If
  `resolvePushStoreId()` changes, change this middleware with it, or a store
  can be synced under a scope whose status was never checked.
- Pinned by `tests/Feature/MultiStoreAccountStatusTest.php`.

## Storefront online payment: Paystack subaccounts

Each store that wants to take real money on its storefront gets its own
Paystack **subaccount**, created programmatically from the owner's own bank
details — the owner never sees Paystack directly, and DumosRx never holds
customer money in its own account (the alternative, platform-collects-then-
payouts, was rejected: it needs a ledger, KYC and payout reconciliation, a
much bigger project). A storefront checkout charge is split automatically at
the point of payment by Paystack itself, so the store's share settles
straight to their own bank account.

- **Onboarding flow** (`PaystackSubaccountService`, store-owner endpoints on
  `Api/Web/StorePaymentAccountController`): `GET /store/payment-banks?country=` wraps Paystack's
  bank-list endpoint — **note this isn't universally available across
  Paystack's six supported countries**; it's documented for Nigeria, Ghana,
  Kenya and South Africa, not confirmed for Rwanda or Côte d'Ivoire, and
  returns `[]` rather than throwing when Paystack has nothing, which the
  client is expected to render as a plain bank-name text field rather than a
  dropdown. `POST /store/payment-account/resolve` wraps Paystack's
  resolve-account endpoint, which is Nigeria/Ghana-only (`RESOLVE_COUNTRIES`);
  it returns `null` (not a fabricated guess) everywhere else, and that's a
  normal outcome, not an error — never logged as a failure. It also reports
  `verifiable`, and that distinction is load-bearing: **`confirmed_unverifiable`
  is accepted only for a country outside `RESOLVE_COUNTRIES`.** Inside it, a
  null resolution means the account details are wrong, so the override is
  refused with a 422 rather than letting a typo'd Nigerian account through the
  escape hatch built for Rwanda/Côte d'Ivoire/Kenya/South Africa.
  `POST /store/payment-account` calls
  `createSubaccount()` and persists only the subaccount code, country, bank
  code, and the **masked last 4 digits** of the account number — the full
  number is never stored beyond what the create call needs in flight. This
  endpoint is idempotent (409 once a store already has a subaccount, no
  Paystack call made) and re-resolves the account server-side even though
  the client already called `/resolve` — never trust a client-sent
  confirmation of someone else's bank details alone.
- **The resolve endpoint is a name-lookup oracle, and is limited as one
  (PG-5).** `account_number`/`bank_code` are free-form: ownership is checked on
  the *store*, never on the account being resolved, so the endpoint will turn
  any account number in Nigeria or Ghana into its holder's name using the
  platform's own Paystack credentials. On the authenticated group's shared
  `throttle:60,1` that was 60 free lookups a minute per owner. It now carries
  its own `throttle:bank-account-resolve` (**8/min, keyed on the user id, not
  the IP** — an IP key would let one account rotate through proxies, and a
  household of owners behind one NAT would share a budget they shouldn't).
  Eight is deliberately above real onboarding (resolve, fix a typo, resolve
  again) and far below anything usable for enumeration. Don't fold this route
  back into the group limiter, and don't re-key it to the IP.
  `PaymentRouteThrottleTest` asserts both the named limiter and that it trips
  well under 60.
- **A created subaccount must never be orphaned (PG-7).** `createSubaccount()`
  makes a real, permanent object at Paystack *before* the store row is updated,
  and the "does this store already have one?" 409 check reads only
  `stores.paystack_subaccount_code`. A failed local save therefore used to
  leave a live remote subaccount with nothing pointing at it, and the local
  idempotency check quietly lying — the owner's obvious next move (submit
  again) would create a *second* one. `linkSubaccountToStore()` now retries the
  local write 3 times with a short backoff and, if it still fails, logs
  `Log::critical` with the subaccount code, store id, bank code and last 4,
  fires an `AdminAlertService` alert, and returns a **500 whose message tells
  the owner to contact support and explicitly not to resubmit**. Don't soften
  that wording into "please try again" — the retry is the duplicate.
  - **Not done, and deliberately:** making the idempotency check ask Paystack
    whether a subaccount for this bank/account pair already exists. Paystack
    does expose `GET /subaccount`, but its exact list/filter semantics for
    matching on `settlement_bank` + `account_number` weren't verified against
    the live API, and guessing a matcher here risks *reusing* a subaccount
    belonging to a different store. If this is ever built, verify the response
    shape and paging against Paystack's live API first, and match on the
    account pair rather than `business_name` (store names are not unique).
  - Covered by `test_a_transient_failure_saving_the_subaccount_code_is_retried`,
    `test_an_unsavable_subaccount_code_is_logged_and_alerted_rather_than_silently_orphaned`
    and `test_a_failed_local_save_does_not_invite_a_retry_that_would_create_a_second_subaccount`.
- **`percentage_charge` is the platform's cut, not the store's** — a real,
  easy-to-get-backwards fact worth stating plainly. `createSubaccount()`
  passes the current `storefront_platform_fee_percentage` (a `SystemConfig`
  float, one global rate for every store) as `percentage_charge`; Paystack
  takes that percentage for DumosRx and settles the rest to the store.
- **Fee-rate propagation.** A superadmin edits the rate via
  `SystemConfigController`; that same request stamps `paystack_fee_dirty_at`
  on every store with a connected subaccount. `App\Console\Commands\
  SyncSubaccountFeeRates`, registered in `routes/console.php` at the same
  cadence as `RebuildStorefrontIfDirty`, calls `updateSubaccountFee()` for
  each dirty store, clears the flag on success, and leaves it dirty (retried
  next run) on failure — escalating to `AdminAlertService::send()` after
  repeated consecutive failures for the same store, the same escalation path
  the sync engine already uses, not a second alerting mechanism.
- **Currency is per-store, never the global `payment.currency`.** A
  storefront charge is minted, stamped on the `StorefrontPaymentIntent`, and
  verified against **`stores.currency`** (`StorefrontController::
  storeCurrency()`, the single source for all three). `config('payment.
  currency')` is only a fallback for a store row with no currency at all —
  using it as the expected value at verify time (as the first cut did) makes
  every non-NGN store charge successfully and then fail verification, taking
  the customer's money with no order to refund against. Same per-record shape
  as `PaymentController::processSuccessfulPayment()`'s subscription webhook,
  which compares against `payment_transactions.currency`. Covered by
  `test_a_non_ngn_store_completes_the_initialize_to_verify_round_trip` and
  `StorefrontPaystackLifecycleTest` (a KES store, end to end).
- **The storefront charge is pinned to Paystack; nothing hardcodes the
  provider afterwards.** `PaymentService::initializeTransaction()` falls back
  to Flutterwave when Paystack's initialize returns a non-2xx, which is
  intentional for **subscriptions** and wrong for the storefront:
  `initializeFlutterwave()` takes no `$subaccount` and hardcodes
  `'currency' => 'NGN'`, so a transient Paystack 5xx used to charge the
  customer in naira into the platform's own Flutterwave balance with no
  payout split — and because `checkout()`'s verify and
  `refundUnfulfillableCheckout()` both passed a literal `'paystack'`, that
  charge could then never be verified or refunded (PG-1). The storefront now
  calls **`PaymentService::initializeStorefrontTransaction()`**, which is
  Paystack-only and throws if the admin has disabled Paystack, and every
  later lookup of that charge reads **`$intent->provider`** rather than a
  literal. Do not reintroduce a cross-gateway fallback on the storefront
  path without also giving Flutterwave a subaccount/currency equivalent.
  Pinned by `tests/Feature/StorefrontProviderPinningTest.php`, which also
  asserts the subscription fallback is still in place.
- **A storefront payment is reconciled server-side, not only by the
  customer's browser.** `StorefrontPaymentIntent.status` is a five-value
  lifecycle: `pending` → (`paid` | `consumed` | `refunded` | `abandoned`).
  `pending` and `paid` are the two **claimable** states
  (`StorefrontPaymentIntent::CLAIMABLE_STATUSES` — use it, don't compare to
  `'pending'` by hand); `checkout()` consumes either one.
  - **The webhook.** `PaymentController::processSuccessfulPayment()` looks the
    reference up in `storefront_payment_intents` **before**
    `payment_transactions` and hands a match to
    `App\Services\Storefront\StorefrontPaymentReconciler`. Before this, a
    genuine signed `charge.success` for a storefront charge matched no
    `PaymentTransaction` and was silently dropped, so the only confirmation
    path was the customer's own browser returning with intact
    `sessionStorage` (PG-2). A matching amount/currency marks the intent
    `paid`; a mismatch is refunded and alerted, same rule as the subscription
    side.
  - **The webhook deliberately does NOT create the order.** `online_orders`
    requires `customer_name` and `customer_phone`, which only the return-flow
    POST carries — the webhook has nothing but `customer_email`. Inventing
    those would hand the store an order it can't act on *and* burn the
    reference, so the genuine confirmation (whenever it arrives, even days
    later) would then be rejected as already used. Marking `paid` instead
    makes the money durable, keeps the reference claimable, and gives the
    sweep something concrete to escalate. If contact details ever move onto
    the intent at initialize time, revisit this — the webhook could then
    complete the order outright.
  - **The sweep.** `App\Console\Commands\SweepStorefrontPaymentIntents`
    (`storefront:sweep-payment-intents`, hourly in `routes/console.php`,
    window from `payment.storefront_intent_stale_minutes`, default 60)
    re-verifies every `pending` intent past the window against the provider:
    a confirmed one becomes `paid` and alerts, a provider answer of
    not-successful becomes `abandoned`, and an *unreachable* provider is left
    strictly alone (never `abandoned` — `PaymentService`'s `unknown` result
    means the money may well have moved). It then alerts once per `paid`
    intent nobody ever turned into an order, stamped with
    `reconciliation_alerted_at` so an hourly schedule doesn't re-mail the
    same one forever. A stale intent is never auto-refunded: the customer may
    still be mid-return, and a human deciding between "contact them to
    finish the order" and "refund" is the right call for money that did
    arrive.
  - Pinned by `tests/Feature/StorefrontPaymentReconciliationTest.php`.
- **A paid-but-unfulfillable confirm refunds itself.** `checkout()` prices the
  cart and re-checks availability *after* the customer has already paid at
  Paystack (nothing is reserved at initialize time — availability is only
  netted against pending orders). If stock has gone or a product was
  deactivated during that detour, `refundUnfulfillableCheckout()` verifies the
  payment really succeeded, refunds it, marks the intent `refunded`, and
  returns a 422 carrying `refunded` so the storefront can say so — never a
  bare stock error on a charged customer. It returns null (caller falls
  through to its own error) when there is nothing paid to refund, so an
  unpaid/failed reference is never refunded and its intent stays `pending`
  for a retry.
- **`paystack_reference` is prohibited on a non-Paystack order (PG-6).**
  `online_orders.paystack_reference` is unique across *every* payment method,
  and the replay guard in `checkout()` deliberately checks it regardless of
  `payment_method`. Those two facts together meant a cash/`transfer` order that
  merely *carried* a reference consumed it permanently — a customer (or
  anyone) could post `payment_method: in_store` with a reference minted for a
  real Paystack cart, get a cash order, and leave the genuine paid
  confirmation to be refused as "already used". The field now carries
  `prohibited_unless:payment_method,paystack`, so such a request 422s before
  anything is created or consumed and the reference stays spendable. The
  prohibition is on a *non-empty* value, so a client that always sends the key
  as `null` is unaffected. Covered by
  `test_checkout_rejects_a_paystack_reference_on_a_non_paystack_order` and
  `test_a_reference_refused_on_a_cash_order_is_still_usable_for_the_real_paystack_checkout`.
- **Refunds are real, but not clawed back from the store.**
  `OnlineOrderController`'s cancel-a-paid-order path now calls
  `PaymentService::refundTransaction()` (which delegates to
  `PaystackSubaccountService::refundTransaction()`), falling back to the
  original log-and-notify-the-store behaviour only if that provider call
  itself fails. **Accepted, deliberate cost:** Paystack's own refund
  behaviour on a split transaction draws the refund from DumosRx's main
  balance once the subaccount side has settled (typically within a day or
  two), not automatically clawed back from the store. This was confirmed
  with the user as an accepted v1 cost of running the platform rather than
  something to build a Transfer/Transfer-Recipient claw-back for now —
  revisit only if refund volume ever makes automating it worth the extra
  integration surface. A **successful** refund also moves the order's own
  `payment_status` to `'refunded'` (added to the `online_orders` enum by
  `2026_09_26_000003`); a **failed** one deliberately leaves it `'paid'`,
  because the money is still owed and the flag-and-notify path is what makes
  that reconcilable. Anything summing paid online orders as revenue must
  therefore treat `'refunded'` as not-revenue rather than assuming three
  values.
- **The cancel transition is committed under a row lock before the provider is
  called, and a provider "already refunded" counts as success.** The
  pending-only guard is a check-then-write, so without a lock two concurrent
  cancels (staff double-tapping, or the POS retrying a request whose response
  was lost) both read `pending`, both wrote `cancelled` and both called the
  refund API — a double payout, or, when Paystack rejected the second, a
  *correct* refund falling through to the manual-refund flag with
  `payment_status` still `'paid'` (A-82). `markFulfilled()` now takes the
  transition inside `DB::transaction()` + `lockForUpdate()` and the loser gets
  the 409, so only one caller ever reaches the provider; the refund happens
  after that commit (never with a lock held across a third-party call) and
  `payment_status` is written in its own short transaction on the outcome.
  `PaystackSubaccountService::refund()` maps an "already refunded"/"fully
  reversed" rejection to `success: true, already_refunded: true` — the money is
  back, which is the outcome asked for — and the duplicate store notification is
  suppressed for that case. A genuine failure (unknown reference, provider
  error) still falls through to flag-and-notify. Pinned by
  `tests/Feature/OnlineOrderCancelRefundLockTest.php`.

**Carbon 3 gotcha:** `diffInMonths()` (and the other `diffIn*` methods)
return a **signed** value (`$other - $this`) in Carbon 3, unlike Carbon 2's
absolute-value default. `now()->diffInMonths($pastDate) < N` is always
true (permanently negative) — this exact bug shipped and was caught before
merge in the slug-cooldown check above. Prefer `now()->lt($date->addMonths(N))`
style comparisons over `diffIn*() < N` to sidestep the sign question
entirely.

## The other unauthenticated surface (not the storefront)

Five routes sit at the top of `routes/api.php` outside every auth group, and
each now carries its own named limiter for the same Laravel-11 reason the
storefront ones do (see the next section):

- **`GET /system-configs/{key}`** (`throttle:public-read`, 120/min/IP) returns
  a value **only for the keys in `SystemConfigController::PUBLIC_KEYS`** —
  `subscription_plans`, `global_suggestions`, `require_email_verification`,
  `smartsupp_key`, `social_links`. Anything else is a **404** for everyone
  except a `super_admin` bearer token (resolved explicitly with
  `$request->user('sanctum')`, since the route is outside `auth:sanctum`). This
  matters because the sibling `PUT /admin/system-configs/{key}` stores
  arbitrary JSON under arbitrary keys: before the allow-list, every one of them
  — `referral_program`, `default_account_manager_id`,
  `storefront_rebuild_requested_at` — was world-readable. **Adding a config key
  that a logged-out client needs means adding it to `PUBLIC_KEYS` with a
  comment naming the reader**; the admin panel needs no change, because its
  requests carry a super_admin token.
- **`POST /support`** (`throttle:public-write`, 5/min/IP) — persists a
  `Feedback` row and emails every platform admin.
- **`GET /downloads/manifest`** (`throttle:public-read`) — per-platform
  installer URL, existence and size for the marketing Downloads page, which is
  anonymous by definition. It shares `DownloadsManifestService` with the
  `super_admin`-gated `GET /admin/downloads/manifest` and caches its CDN probe
  for 10 minutes (the admin endpoint deliberately does not, so an admin sees a
  live probe). The public page used to call the admin route and got a 401 plus
  a forced redirect off the site — see `docs/DOWNLOADS_MANIFEST.md` (A-94)
  before merging the two back together.
- **`GET /announcements`** (`throttle:public-read`) — the active-broadcast
  feed. It sat outside every limiter until A-108; because Laravel 11 applies no
  `throttle:api` floor, an unauthenticated poll was an unmetered full-table
  read. Its result set is also bounded by
  `BroadcastController::PUBLIC_FEED_LIMIT`.
- **`POST /logs/client-error`** (`throttle:client-error-log`, 30/min/IP) —
  writes to `laravel.log` on shared hosting, plus an `activity_logs` row when a
  token happens to be present. Every field is length-capped
  (`ActivityLogController::MAX_*`), and `details` is capped in **bytes** by
  `App\Rules\EncodedSizeAtMost` — Laravel's `max:` on an array counts elements,
  which is no defence against one key holding a megabyte.

`tests/Feature/PublicSurfaceHardeningTest.php` covers all of this (the
downloads manifest in `tests/Feature/PublicDownloadsManifestTest.php`) and, like
`StorefrontThrottleTest`, deliberately does not disable `ThrottleRequests`.

## Manual backup uploads: size, type, quota and retention

`Api/Web/BackupController` stores tenant uploads under
`backups/{owner_id}/` on the local disk of a **shared** host, so every limit
lives in `config/backups.php` rather than in the controller:

- `max_upload_kilobytes` and `allowed_extensions` are the `max:`/`extensions:`
  validation rules on `POST /backups/upload`. It previously validated only
  `required|file` (A-109).
- `tenant_quota_kilobytes` is enforced in `assertWithinQuota()` by summing the
  tenant's existing files before accepting a new one; over quota is a 422 on
  the `backup` field, not a 500.
- `retention_days` drives `backups:prune` (`App\Console\Commands\PruneBackups`,
  scheduled nightly at 03:00 in `routes/console.php`). It **always keeps each
  tenant's newest backup** regardless of age — a store that has not synced in a
  year still has a restore point, which is the entire point of the feature.

## Public storefront endpoints

`Api/Public/StorefrontController` is the only unauthenticated tenant-data
surface in the app. Three things about it are easy to undo by accident:

- **Every route carries its own named limiter.** Laravel 11 dropped
  `throttle:api` from the default `api` group and `bootstrap/app.php`
  deliberately does not call `throttleApi()` (a platform-wide floor would
  change every other route as a side effect), so a new public storefront route
  with no `throttle:` group is completely unmetered. Current groups:
  `storefront-read` (120/min/IP, both GETs), `storefront-order` (5/min/IP,
  order placement), `storefront-checkout` (15/min/IP, the Paystack initialize
  step). `tests/Feature/StorefrontThrottleTest.php` asserts all four routes and
  deliberately does **not** disable `ThrottleRequests` — `StorefrontControllerTest`
  does, which is exactly why this gap was invisible for so long, so add
  limiter coverage there, not here.
- **The provider webhook routes carry `throttle:webhooks` (PG-8).**
  `POST /webhooks/paystack` and `POST /webhooks/flutterwave` sat outside every
  limiter, which under Laravel 11 means completely unmetered — each call runs an
  HMAC-SHA512 over the raw body and a `provider_reference` lookup, so an
  unauthenticated flood was free CPU and free queries. The limiter is
  **300/min/IP, deliberately loose**: a provider legitimately bursts (a
  settlement batch, a replay of a backlog after an outage) and a 429 just makes
  it redeliver forever. Don't tighten it toward the 5-15/min the storefront
  limiters use. Asserted by `tests/Feature/PaymentRouteThrottleTest.php`, which
  checks both routes carry the group *and* that the limit stays generous.
- **`storefront-read` is generous on purpose.** The static-export build pulls
  the slug list plus every storefront from one GitHub runner IP in a single
  pass, about two requests per store. 120/min leaves headroom for roughly 50
  live storefronts; past that, raise it or give the build pipeline a token
  before deploys start 429ing.
- **Catalog and stock are scoped by `store_id`, not just the owner's
  `user_id`.** Multi-store is a supported, plan-gated state and one owner's two
  storefronts are separate shops. `storeProducts(Store)` is the single helper
  both `show()` and `priceCart()` use; it tolerates legacy `store_id IS NULL`
  rows from before the 2026-08-14 backfill. `availableQuantity()` scopes the
  `StockBatch` sum the same way **and** subtracts everything already committed
  to `pending` online orders — online orders don't deduct stock at placement
  (POS staff do, on fulfilment), so without that subtraction the last unit
  sells to everyone who asks. `checkout()` re-runs the check inside its
  transaction after a per-store `lockForUpdate()`, which is what makes it hold
  under REPEATABLE READ.

`OnlineOrderController::markFulfilled` is the other half of that lifecycle:
only a `pending` order can transition (409 otherwise, so the client's retry is
safe), and `payment_status` is only promoted to `paid` when the caller passes
`payment_confirmed: true`. The POS client writes its local sale and stock
deductions **inside one transaction, before** calling this endpoint — don't
re-invert that ordering; see `docs/FIXED_BUGS.md` (SF-P2-5) for what the old
order cost.

## Outbound third-party API calls

Convention: `Illuminate\Support\Facades\Http::withToken(...)`, never a raw
`curl`/`GuzzleHttp` client — see `AdminPlatformService::getRecentErrors()`
(Sentry) or `RebuildStorefrontIfDirty` (GitHub) for the pattern (short
`->timeout()`, try/catch, log-and-continue on failure rather than throwing).
Credentials go in `config/dumos.php` (a project-specific config file, this
app doesn't use `config/services.php`) reading from `.env` via `env()` —
never call `env()` directly outside a config file. There is **no confirmed
queue-worker process running in production** (no `queue:work` in any
schedule/cron, no Horizon, no supervisor config — `QUEUE_CONNECTION=database`
is set but nothing has been confirmed to drain the `jobs` table on the
shared host): don't dispatch a `ShouldQueue` job for something that must
actually run — do it synchronously (fast, timeout-guarded) or via
`routes/console.php`'s `Schedule::command(...)`, which the OS cron does
reliably run.

**The payment services are no exception, and they are the ones that matter
most.** Guzzle's default request timeout is 0 — wait forever — and every
Paystack/Flutterwave call went out that way while every other outbound call in
the app carried a short one (A-81). `POST /storefront/{slug}/checkout/initialize`
is unauthenticated, so a blackholed provider socket pinned a PHP-FPM worker per
hung checkout until the pool (small, on shared hosting) was gone and the whole
API — sync included — stopped answering. Both `PaymentService` and
`PaystackSubaccountService` now funnel every call through a single private
client factory carrying `->timeout(10)->connectTimeout(5)`; add new calls
through that factory, never a bare `Http::withToken(...)`.
`tests/Feature/PaymentProviderTimeoutTest.php` asserts that at the source level
(the options are invisible on a faked request, so behaviour alone can't pin it).

**A verification that never reached the provider is `unknown`, not failed.**
`verifyPaystack()`/`verifyFlutterwave()` catch `ConnectionException` and return
`['success' => false, 'unknown' => true]`, and consumers must branch on that
*before* their failure handling: the money may well have moved, so the correct
answer is "we don't know yet" — a **503**, no order booked, no
`PaymentTransaction` marked failed (`failTransaction()` on a timeout would
declare a possibly-successful payment dead) and a message telling the customer
not to pay again. `StorefrontController::checkout()` and
`SubscriptionController::verifyPayment()` both do this.

**Mail is always `Mail::to(...)->send(...)`, never `->queue(...)`** — a
direct consequence of the constraint above, stated as its own rule because a
`->queue()` call fails *silently*: nothing checks a return value, nothing
inspects the `jobs` table, and the caller still reports success. The last two
`->queue()` call sites were converted on 2026-09-26:
`AdminAlertService::send()` (the sync engine's own superadmin
failure-escalation path — the mechanism meant to surface *other* silent
failures) and `Api/Admin/MailController::send()` (the admin broadcast-email
feature, which additionally returned "Emails have been queued for sending"
unconditionally).

**Five mailables still `implement ShouldQueue`** (`WelcomeEmail`,
`AdminCustomMail`, `AdminNotification`, `PasswordResetEmail`,
`PasswordChangedEmail`) despite every call site using `->send()` — and
Laravel's `Mailer::sendMailable()` queues any `ShouldQueue` mailable
regardless of which method the caller used, so this is **not** actually
inert code the way it looks. It only sends immediately today because
**production's `.env` sets `QUEUE_CONNECTION=sync`** (confirmed 2026-10-01;
the sync driver executes a "queued" job in the same request, so a mailable
never actually reaches the `jobs` table) — not because the interface is
dead weight. The repo's own `.env.example`/local `.env` both default to
`QUEUE_CONNECTION=database`, which *would* reproduce the exact silent-loss
failure mode this rule exists to prevent, for any of these five mailables,
the moment someone "fixes" that drift between local and production without
also removing `ShouldQueue` or adding a real worker. Confirmed via a
2026-10-01 investigation that attempted to add `ShouldQueue` to
`SuperAdminAlertMail` for the same (reverted) reason — see `docs/KNOWN_BUGS.md`'s `A-125`. Copy the `->send()` pattern from
`RegistersAccounts`/`RecoversPasswords`/`SendEndOfDaySummaries` for any new
mail path, and don't add `ShouldQueue` to a mailable here on the assumption
that it's a no-op — it is only a no-op because of this specific, fragile
production config.

**Corollary — never `->send()` inside an open transaction.** Because the send
is synchronous, a slow or unreachable SMTP server holds the transaction (and
every `lockForUpdate()` row lock it took) open for the full mail timeout. This
is what A-110 was: `SyncController::touchStoreLastSyncAt()` fired the
first-sync admin alert before push()'s outer `DB::commit()`, so the client's
batch timed out and retried against still-locked rows. The method now returns
the first-synced `Store` and `push()` calls `sendFirstSyncAlert()` *after* the
commit; `tests/Feature/SyncFirstSyncAlertTest.php` pins that by asserting
`DB::transactionLevel()` at `MessageSending` time. Any new mail call on a
write path has to sit after the commit, not inside it.

## Broadcast emails (`broadcasts.send_email`)

A broadcast (`Broadcast`, `BroadcastController`) is delivered in-app by
default: `client/` polls `GET /announcements` and renders a banner or a bell
notification. `broadcasts.send_email` (nullable boolean, default `false`)
additionally emails it. `BroadcastController::store()` delegates to
`App\Services\Admin\BroadcastEmailService::sendForBroadcast()`; the controller
itself holds no sending logic.

- **Store owners only, never staff.** Recipients are resolved as
  `User::whereHas('stores')` — i.e. the user actually owns a row in `stores`
  (`stores.user_id`), the same ownership relation the multi-tenancy model is
  built on. `hasRole('admin')` is deliberately **not** the test: `admin` is
  also a real assignable *staff* role, so it would pull in non-owners. Any
  address ending in `@local.dumosrx.com` is then excluded, because
  `StaffController::store()` auto-generates exactly that placeholder for staff
  accounts created without an email — mail to it would only bounce. Skipped
  recipients are silently dropped, never an error.
- **Target types.** `specific` narrows to the named `user_ids` (a staff id
  named there resolves to nothing and is skipped); `all`, `pharmacies` and
  `stores` all resolve to the same set once the store-owner filter is applied,
  which mirrors `index()`'s in-app targeting where `pharmacies`/`stores` are
  the store-owner-facing types.
- **Fires once, at creation, never on update.** `update()` persists the flag
  but never sends — flipping `send_email` on an existing broadcast, or editing
  its text, must not re-mail everyone who already received it. The admin
  panel's edit dialog therefore renders the toggle disabled with that
  explanation. If a resend is ever genuinely wanted, the answer is a new
  broadcast, not a new code path here.
- **Expired/inactive broadcasts send nothing.** The service re-checks the
  record through `Broadcast::scopeActive()` (`is_active` **and**
  `expires_at` null or in the future) before sending, so a broadcast created
  already-dead is silently skipped.
- **No new mailable.** It reuses `AdminCustomMail` (`title` as subject,
  `message` as body) via `Mail::to(...)->send(...)` per the rule above,
  chunking recipients 100 at a time and catching per-recipient failures with a
  `Log::error` — the same shape as `Api/Admin/MailController::send()` and
  `AdminUserService::bulkNotify()`. Those paths have no extra throttling and
  neither does this one.
- **Two compose-time companions, neither of which creates a `Broadcast`.** Both
  live in the same `announcements` route group, so they inherit its
  `auth:sanctum` + `permission:send_notifications` gate unchanged (nested
  inside the outer `permission:manage_platform` group) — there is no extra
  throttling, matching `mail/send` and `users/bulk-notify`, and none was
  added: the gate is the control. The platform admin delegation work
  replaced the group's prior `role:super_admin` with `permission:send_notifications`,
  so a `platform_admin`/`agent` holding that permission reaches them too.
  The group briefly also carried `subscription:broadcast_create`, a tenant
  subscription-feature-flag gate that was dead code under `role:super_admin`
  (only `super_admin`, who bypasses `CheckSubscription` entirely, ever
  reached it) and was never actually seeded on any plan tier
  (`SystemConfigSeeder` has no `broadcast_create` key anywhere) — so once
  `role:super_admin` was dropped it became a permanent, unconditional 403 for
  every `platform_admin`/`agent`. Removed entirely rather than patched: this
  is an authorization concern and `permission:send_notifications` is already
  the real, functional control, with no `subscription:*` gate paired with a
  role/permission check anywhere else in this file.
  - `POST /admin/announcements/preview-email` (`previewEmail()` →
    `BroadcastEmailService::renderPreview()`) takes `title`/`message` and
    returns `{subject, html}`, where `html` is
    `(new AdminCustomMail(...))->render()` — the **real** mailable, not a
    re-implementation, so the preview can't drift from what ships. Sends
    nothing. The admin panel renders it into a fully sandboxed
    (`sandbox=""`) `srcDoc` iframe in the create dialog.
  - `POST /admin/announcements/test-email` (`sendTestEmail()` →
    `BroadcastEmailService::sendTest()`) takes `title`/`message`/`email` and
    sends exactly **one** `AdminCustomMail` via `Mail::to($email)->send()` to
    that one validated address. It never touches the store-owner recipient
    query, so no real recipient can be reached, and because it writes no
    record it leaves the fires-once-at-creation rule untouched. A send failure
    is a `Log::error` + 500, not a silent success.
- Coverage: `tests/Feature/Admin/BroadcastEmailTest.php` (the broadcast send
  itself) and `tests/Feature/Admin/BroadcastTestEmailTest.php` (preview +
  test-send: one mail to the named address, no `Broadcast` row, no store owner
  reached, 401/403 without admin auth, and recipient-email validation).

## Migrations: the test suite cannot tell you whether one will apply (2026-10-07)

The whole suite runs on **SQLite**. SQLite has no index key-length limit, no
storage engines, and a far looser view of column types than MySQL — so a
green suite says nothing about whether a migration can be applied to the
production database. This is not hypothetical: `create_sync_commands_table`
passed 1165 tests and then died on the live box, four bytes over the server's
key limit, *after* two sibling migrations had already applied. MySQL DDL is
not transactional, so a mid-migration failure leaves a half-built schema and
an unrecorded `migrations` row, which blocks every later migration until
someone cleans it up by hand.

**Budget every index at 3072 bytes under utf8mb4**, i.e. four bytes per
character — InnoDB's limit in DYNAMIC row format, which is what both
databases now use:

| declaration | indexed bytes |
|---|---|
| `uuid('x')` → `char(36)` | 144 |
| `string('x', 64)` | 256 |
| `string('x', 191)` | 764 |
| `string('x')` (default is 191, set in `AppServiceProvider`) | 764 |
| anything non-character | small, treat as 8 |

`tests/Feature/SchemaIndexKeyLengthTest.php` enforces this by parsing the
migration source, and names the limits of that approach in its own docblock.
3072 bytes is 768 characters across one index, so in practice anything close
to it is worth questioning on design grounds long before the server's
opinion matters. **Do not relax the budget to make an index fit** — shorten
the column, which is almost always the right-sized change anyway.

**The budget was 1000 until 2026-10-07, and the history matters.** 1000 is
MyISAM/Aria's limit, and it is the number production reported when
`['store_id', 'device_id', 'status']` with `device_id` at 191 came to
144 + 764 + 96 = **1004** and the migration died four bytes over. Chasing
that limit is what uncovered the real problem: `config/database.php` had
`'engine' => null`, the host's `default_storage_engine` is MyISAM, and so
**all 63 production tables were MyISAM** — meaning every transaction,
savepoint and row lock in this codebase was a silent no-op in production
while every SQLite-backed test passed. Both databases are now InnoDB and
`'engine' => 'InnoDB'` is pinned (and guarded by
`tests/Feature/DatabaseEngineIsPinnedTest.php`, since a null engine fails
invisibly). Full account: `docs/FIXED_BUGS.md` A-179 and A-178b.

**Two engine rules that follow from it.** Never leave `'engine'` unset — a
new table silently inherits whatever the host prefers. And if you ever
convert a table, pass `ROW_FORMAT=DYNAMIC` explicitly rather than trusting
`innodb_default_row_format`: InnoDB's COMPACT format caps an index at 767
bytes, and `device_stock_reports`/`device_queue_reports` carry a 908-byte
unique key that would have failed.

**Before shipping a migration**, read it back against the table above. A
migration is the one change in this repo that the test suite cannot verify
for you.

## Testing

```
php artisan test                            # 1167 passing as of 2026-10-07 — treat any drop as a regression
php -l path/to/File.php                     # quick syntax check for a single file
```

**Setting an env var inside a test means writing all three channels.**
`env()` resolves through phpdotenv's default adapter chain, and the order is
`ServerConstAdapter` (`$_SERVER`) **first**, then `EnvConstAdapter` (`$_ENV`),
then `PutenvAdapter` — the first adapter that holds the name wins. Loading a
`.env` that declares a key writes it into all three, so a test that sets only
`putenv()` and `$_ENV` is silently overridden by the `$_SERVER` copy and
`env()` keeps returning the `.env` value. Always set (and clear)
`putenv()`, `$_ENV[...]` and `$_SERVER[...]` together —
`DatabaseSeederTest`'s `setSeedSuperAdminPassword()` /
`clearSeedSuperAdminPassword()` helpers are the pattern to copy.

**This is also the shape of the local-vs-CI split to check first when a test
passes locally and fails in CI.** The Checks workflow runs
`cp .env.example .env`, so tests execute against **`.env.example`, not the
`.env` on your machine** — a key the example file declares (even empty, e.g.
`SEED_SUPER_ADMIN_PASSWORD=`) exists in CI's `$_SERVER` and does not exist in
yours. That was the entire cause of `DatabaseSeederTest`'s CI-only failure;
it looked order-dependent and was not, and `--order-by=random` never
reproduced it. To reproduce a CI-only failure locally, back up `.env`,
`cp .env.example .env && php artisan key:generate`, run the suite, and restore.

**Every unspecified-length indexed `string()` column is actually
`VARCHAR(191)`, not Laravel's native 255 — and SQLite will never catch it
if you get this wrong (A-149).** `AppServiceProvider::boot()` sets
`Schema::defaultStringLength(191)` globally (an old-MySQL/MariaDB
`utf8mb4` index-prefix compatibility shim). A migration that writes
`$table->string('col')->index()` with no explicit length silently gets
191 chars, not 255 — `feedback.fingerprint` did exactly this, and the
client's `MAX_FINGERPRINT_LENGTH` (`client/lib/utils/error-truncation.ts`)
assumed 255, so a sync push failed outright on anything 192-255 chars
long. Always pass an explicit length (`$table->string('col', 255)`) on any
indexed string column meant to hold more than a short label, and when the
client enforces a max length on a string that round-trips to a
server column, verify the two actually agree — don't assume Laravel's
"default." Worse: `phpunit.xml` runs everything against SQLite in-memory,
which has no real `VARCHAR` length enforcement regardless of the declared
length (`Schema::getColumns()` reports a bare `"varchar"` there, never
`"varchar(N)"`), so an ordinary insert-based test for this class of bug
passes identically whether the column is 191 or 255. A real regression
guard has to inspect the live MySQL schema directly and skip itself
when that connection isn't reachable — see
`FeedbackFingerprintColumnWidthTest`, same pattern `SyncPushRowLockTest`
already uses for `lockForUpdate()` (another behavior SQLite can't exercise).

`tests/Feature/` covers: tenant isolation (`TenantIsolationTest`), admin
account-security regressions (`AccountSecurityTest`), the handoff/
impersonation flow (`AuthHandoffTest`), sync push/pull (`SyncEndpointTest`),
storefront (`StorefrontControllerTest`, plus `StorefrontThrottleTest` and
`StorefrontRebuildPipelineTest`), backups (`BackupControllerTest`),
dashboard stats, and core-tables-exist smoke checks (`ArchitectureTest`).
There is no `tests/Unit` suite currently — everything meaningful here
touches the DB, so it's covered as a Feature test instead.

## Running things

```
php artisan serve       # local dev server
php artisan migrate     # apply migrations — LOCAL DEV DB ONLY, see below
php artisan tinker      # also used by client/'s test:schema script
```

**Production migrations are a deliberate manual step, and nothing runs them
for you.** The hosting plan does support SSH (confirmed 2026-10-07 — an
earlier version of this section wrongly stated it did not, and A-170 in
`docs/KNOWN_BUGS.md` records what that cost), but the deploy pipeline is
code-only **by choice**: the owner runs migrations themselves rather than
having a merge to `main` migrate production. Don't add a deploy-time
migrate step without asking.

Since Phase 5 the path is the admin panel's **Maintenance** page
(`/admin/maintenance`, super_admin only), backed by
`POST /api/v1/admin/maintenance/migrations/run` →
`AdminMaintenanceService::runPendingMigrations()`. It runs `migrate --force`
and **nothing else**, returns a non-2xx on failure, and writes a
`MIGRATIONS_RUN` activity-log entry on both success and failure.
`GET /migrate-db?key=…` was deleted in the same change (A-174: it reseeded
on every call, reported failures as HTTP 200, and carried its secret in a
query string) — do not reintroduce it or a variant.

- **`--seed` is deliberately not part of migrating.** The old route ran
  `migrate --seed --force`, so `DatabaseSeeder` — which *creates a
  super-admin account* — fired on every production migration. Migrating no
  longer seeds. Because `RolesAndPermissionsSeeder` was the way a newly
  declared permission actually reached production, it gets its own
  separately-confirmed action (`POST /maintenance/roles/sync` →
  `db:seed --class=RolesAndPermissionsSeeder --force`, audited as
  `ROLES_PERMISSIONS_SYNCED`). **If you add a permission to that seeder, say
  so in your handoff** — someone has to press that button for it to exist in
  production.
- **Still true, and still the thing that bites:** a written migration is not
  a live one. Verify with `php artisan migrate --pretend` against local
  first, and tell the user production needs the deploy **and** the
  Maintenance-page run. Don't assume "I wrote the migration" means "it's
  live" — that assumption is what A-170 cost.
- **Resolve the migrator by alias, never by type-hint.** `MigrationServiceProvider`
  is deferred, so constructor-injecting `Illuminate\Database\Migrations\Migrator`
  makes the container auto-wire it and 500 with *"Target
  [MigrationRepositoryInterface] is not instantiable"* — **on a real HTTP request
  only**. The whole PHPUnit suite passes either way, because the test harness
  boots Artisan and that registers the provider. `AdminMaintenanceService` calls
  `app('migrator')` for this reason, and
  `AdminMaintenanceStatusTest::test_the_migrator_is_resolved_by_alias_not_constructor_injected`
  guards it at the source level, the same workaround `PaymentProviderTimeoutTest`
  uses for an assertion behaviour cannot make. This bug shipped green and was
  caught only by the §9 browser smoke test.
- **A timeout does not mean nothing happened.** PHP's execution limit can
  cut the request while the migration is still applying, so the response is
  not the source of truth; the run's reply and the page both re-read the
  pending list afterwards. Check that, not the request outcome.
- **MySQL DDL here is not transactional** and this host has no backup step,
  so a migration that fails midway cannot roll back and is repaired through
  phpMyAdmin. The runner flags pending migrations whose `up()` contains
  `dropColumn`/`drop`/`rename`/`truncate`/`delete` so the operator sees
  which ones alter existing data before confirming — a conservative
  source-text scan, so treat it as "look closer", never as a safety
  certificate.
