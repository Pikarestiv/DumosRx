# Activity Log (Superadmin)

Route: `app/admin/activity/page.tsx` (`AdminActivityLogPage`).

**Scope confirmation vs. the task brief's guess:** correct — this is a
platform-wide audit log over the `activity_logs` table across every store
and staff account, distinct from the store-owner-facing `client/` app's
own per-store Activity Log page. The page's own subtitle says as much:
"Every staff action across every store on the platform, in one place."

## Data flow

- `useAdminActivityLogs(page, search, action, storeId, userId, dateFrom, dateTo)`
  (`lib/api/admin-activity-hooks.ts`) → `GET admin/activity-logs?page=&search=&action=&store_id=&user_id=&date_from=&date_to=`
  → `AdminController::activityLogs` (`laravel-server/app/Http/Controllers/Api/Admin/AdminController.php:316`),
  gated by an inline `hasRole('super_admin')` check (route itself sits
  under the `permission:manage_platform` group in `routes/api.php:161`).
- Controller delegates to `AdminService::getActivityLogs()`
  (`laravel-server/app/Services/Admin/AdminService.php:733`), which builds
  a filtered/paginated `ActivityLog::with(['user.store', 'user.stores'])`
  query, excludes the internal `CLIENT_API_ERROR` action, and returns
  `{ data: [...], meta: { current_page, last_page, total, per_page } }` —
  flat at the top level, matching what the frontend (`response.data`,
  `response.meta`) expects. **No `data`/`meta` nesting bug here** (unlike
  the confirmed Products bug from a prior batch).
- The frontend only wires 3 of the 7 backend-supported filter params
  (`page`, `search` via the search box, `action` via the dropdown) into
  the UI. `store_id`, `user_id`, `date_from`, `date_to` are real,
  documented, working query params on the backend/hook signature with no
  corresponding UI control anywhere on this page — dead capability, not a
  bug (see Gap below).

## Live walkthrough

Tested at `http://localhost:3002/admin/activity` (already-authenticated
super_admin session, shared browser tab with no concurrent sibling task
this run).

- **Initial load:** table populated with real rows (LOGIN, UPDATE, INSERT,
  LOGOUT, LOGIN_FAILED, etc.), footer read "PAGE 1 OF 113". Confirmed via
  `php artisan tinker --execute="echo App\Models\ActivityLog::where('action','!=','CLIENT_API_ERROR')->count();"`
  → **5624** rows; `5624 / 50 per page = 112.48` → 113 pages. Exact match.
- **Search box** ("Search by user, email, or description..."): typing
  "LOGIN" triggered (debounced, confirmed via network tab)
  `GET admin/activity-logs?page=1&search=LOGIN`, 200 OK. Real, correctly
  wired.
- **Action Type filter dropdown:** every option correctly reissues the
  query with `&action=<VALUE>` (verified live for `PIN_CHANGED`, which
  correctly rendered "No activity found for this filter." — a real zero
  state, since no `PIN_CHANGED` log rows exist in this dev DB — and for
  `LOGIN`, which correctly repopulated). Selecting "All Actions" clears
  the param and reloads the unfiltered set.
- **Pagination:** clicking page "2" issued `GET admin/activity-logs?page=2`,
  200 OK, and the page number in the URL/response matched the button
  clicked.
- **Console:** no errors observed throughout (checked via
  `read_console_messages` with an unfiltered pattern after the walkthrough).

## Bug (fixed — reproduction of a previously-confirmed root cause, new surface): staff/cashier users' Store column shows "Platform" instead of their real store

**Severity:** Medium (data-display correctness — same root cause and
severity class as the already-logged Users-section bug, just a second,
previously-unchecked surface where it also manifests).

Live-observed on page 1 of the unfiltered Activity Log: a `LOGIN` row for
**"Pika Store 1 Cashier 1"** (a real `sales_staff` user, confirmed via
`php artisan tinker` to have `store_id` = `8f3c150c-53ca-456d-a008-b5571ee3f6fe`,
i.e. "Pikarestiv Stores") renders **Store: "Platform"** instead of that
store's name — while every other row on the same page, all belonging to
the store-owner account "Pika Restiv", correctly shows "Pikarestiv Stores 2".

**Root cause:** `AdminService::getActivityLogs()` resolves the log's store
via:
```php
$store = $log->user?->store ?? $log->user?->stores?->first();
```
Both `User::store()` (a `hasOne(Store::class)` with Laravel's default
inferred foreign key, `stores.user_id`) and `User::stores()` (`hasMany`,
explicit `user_id`) resolve to "stores this user **owns**" — not "the
store this user's own `store_id` column points at." For a store owner this
happens to work (they own a store whose `user_id` is their own ID); for
any staff-tier user (cashier, specialist, etc.) both relations are always
empty, since no `stores` row has `user_id` equal to a staff member's ID,
regardless of their real `users.store_id`. This is the exact same
relation-misuse root cause already documented for the Platform Users list
in `docs/features/superadmin/users.md` and `_findings-log.md` — confirmed
here as a second, independent call site (`AdminService::getActivityLogs`,
not `getGlobalUsers`) hitting the same underlying `User::store()` bug, so
any activity-log row generated by a staff/cashier action will always
mislabel its store as "Platform" instead of the real one.

**Evidence:** live screenshot capture of the row plus the pre-existing
`php artisan tinker` evidence in `users.md`/`_findings-log.md` establishing
the real `store_id`/store-ownership facts for this same user
("Pika Store 1 Cashier 1", `store_id` = `8f3c150c-53ca-456d-a008-b5571ee3f6fe`
= "Pikarestiv Stores").

**Fixed**, same fix as the Users-page bug: added `User::employerStore()`
(`belongsTo(Store::class, 'store_id')`) plus a `getDisplayStoreAttribute()`
accessor that prefers the owned store, falls back to the employer store.
`AdminService::getActivityLogs()` now resolves the log's store via
`$log->user?->displayStore ?? $log->user?->stores?->first()` and
eager-loads `user.employerStore` alongside `user.store`/`user.stores`.
Verified via PHPUnit
(`tests/Feature/Admin/AdminUsersStoreResolutionTest.php::activity_log_shows_a_staff_users_real_employer_store_not_platform`,
RED before / GREEN after) and live: a direct authenticated
`admin/activity-logs?search=Cashier 1` call now returns
`"store":{"id":"8f3c150c-...","name":"Pikarestiv Stores"}` for "Pika Store
1 Cashier 1"'s `LOGIN` rows instead of `"Platform"`. Full detail in
`_findings-log.md`'s `## Resolved` section.

## Gap: 4 of 7 backend filter params have no UI control

**Severity:** Low (missing capability, not a wiring bug).

`store_id`, `user_id`, `date_from`, `date_to` are all real, working query
params — `AdminController::activityLogs`'s OpenAPI annotation documents
all 7, and `useAdminActivityLogs()`'s hook signature already accepts all
7 — but `app/admin/activity/page.tsx` never surfaces UI for the last 4
(no store picker, no user picker, no date range picker). A superadmin
wanting to filter the platform-wide log down to one store or one user, or
to a date range, currently can't — they'd have to fall back to the free-text
search box, which only matches `description`/`action`/user
name-email-columns, not a store or a date range. Not a broken wire (the
backend and hook are both ready for it); a frontend feature gap.

## Not exercised / out of scope

No mutating actions exist on this page (it's read-only: search, filter,
paginate). Nothing was skipped for safety reasons — everything visible was
exercised.
