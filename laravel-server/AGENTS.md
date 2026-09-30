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
  (`User::employerStore()`). An owner's `store_id` is never set to their own
  store, so the two are complementary, never overlapping.
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

`Store` uses `SoftDeletes`. Archiving a store (`DELETE /admin/stores/{id}`)
only stamps `deleted_at`, so the global scope drops it from the fleet list,
sync and every other Store query until `POST /admin/stores/{id}/restore`.
The irreversible `DELETE /admin/stores/{id}/purge` lives in
`AdminStoreDeletionController`/`AdminStoreDeletionService`; it requires the
literal `confirmation` string `DumosRx` **server-side**, and it clears every
table carrying a `store_id` by schema introspection because almost none of
those columns has a real foreign key. See `docs/ADMIN_STORE_LIFECYCLE.md`.

Covered by `tests/Feature/Admin/AdminUsersAccountTypeFilterTest.php`,
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
- **The `stores` response is scoped to the authenticated IDENTITY, not to
  the account — and the client prunes against it.** `stores` is exempt from
  the last-synced cursor and the 500-row cap (`fetchPullPage()`), so the
  client treats it as a complete snapshot and soft-deletes any local store
  the response omits. But `resolvePullTenantScope()` resolves
  `$ownedStoreIds` to `[$user->store_id]` for any user carrying one (every
  staff account), and only to `Store::where('user_id', $ownerId)` for a
  store_id-less owner identity — so a staff session's pull returns exactly
  one store while the account may own several. That combination cost a live
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
  own, so `normalizePushPayload()`'s `$tablesWithStoreId` check can't see
  them; for as long as the INSERT branch had no check at all, a product id
  harvested off the unauthenticated `GET /storefront/{slug}` was enough to
  plant phantom stock or fabricated sale line items in a stranger's tenant
  (A-77). **A new child table whose tenant scope comes from a parent FK must
  be added to `resolveChangeStoreId()` in the same change**, or it lands
  unchecked on every operation.
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
`sanitizePermissionGroupSyncPayload`'s two privilege checks) are documented in
full in `client/AGENTS.md`'s "Catalog versioning and the default-group
backfill" — read that before touching either, especially before adding any
exemption to that sanitizer: one was tried and removed on 2026-09-29 because
`validateSync()` backfills the server before any pushed change is processed,
which made the exemption both unreachable and a hole.

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
unconditionally). The mailables still `implement ShouldQueue` — harmless, and
left in place for a future real worker — so that interface's presence is
**not** a signal that queueing is safe here. Copy the `->send()` pattern from
`RegistersAccounts`/`RecoversPasswords`/`SendEndOfDaySummaries` for any new
mail path.

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
  `auth:sanctum` + `subscription:broadcast_create` + `role:super_admin` gate
  unchanged — there is no extra throttling, matching `mail/send` and
  `users/bulk-notify`, and none was added: the gate is the control.
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

## Testing

```
php artisan test                            # 539 tests as of 2026-09-29 (admin owner-vs-staff split + store detail endpoint) — treat any drop as a regression
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

**Production has no SSH/direct `artisan` access.** The shared host is
reached only through the app itself: migrations run via a protected route,
`GET https://<production-domain>/migrate-db?key=<MIGRATE_DB_KEY>`
(`routes/web.php`, guarded by `config('app.migrate_db_key')` /
`MIGRATE_DB_KEY` env — 403s without the correct key). This means **new
migrations do nothing on production until (a) this branch is deployed and
(b) someone hits that route** — always verify pending migrations first
with `php artisan migrate --pretend` against local, and flag to the user
that production still needs the deploy+route step; don't assume "I wrote
the migration" means "it's live."
