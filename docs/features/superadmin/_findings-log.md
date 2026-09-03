# Superadmin Panel — Smoke-Test Findings Log

Running log for the superadmin panel (`web/`, distinct app from the
store-owner-facing `client/` app, which was fully smoke-tested separately —
see `docs/features/_findings-log.md`). Same structure as that log:
`## Resolved` / `## Open`, newest entries at the bottom of each section.

This log spans multiple batches of this effort. Batch: Products/Marketing
(sections: Global Products, Marketing). Batch: Login/Stores/Users (sections:
Login, Stores, Users). No fixes were made in either batch — investigation
and documentation only, per each task's explicit scope.

## Resolved

*(none yet — every batch so far has been investigation-only)*

## Open

### Products: `/admin/products` list and pagination are always empty despite a real 200 response and real data

`AdminController::products` (Laravel) returns
`{"products": {"data": [...], "meta": {...}}, "metrics": {...}, "categories": [...]}`
— nesting the paginated `data`/`meta` one level under a `products` key. The
frontend (`app/admin/products/page.tsx`, `AdminProductsResponse` in
`lib/types/admin.ts`) expects them flat at the top level, matching every
other admin list endpoint in this app (e.g. `admin/stores`). Result: the
Global Products table always shows "No products found in the global
catalog" and the header always reads "Global Catalog: 0 SKUs", regardless
of the 3,041 real products in the dev DB. Metrics and categories (which are
already top-level in both response and type) render correctly and are
unaffected. Confirmed via a direct authenticated `fetch()` from the page's
own console (`products.data.length === 10`, `response.data === undefined`).
See `docs/features/superadmin/products.md` for full detail. **Not fixed**
— out of scope for this investigation-only task.

### Products: "Stock Flag Rate" metric card renders a bare number where its siblings render a percentage

`AdminService::getProductMetrics()` returns `stockAlerts.rate` as a raw
number (unlike `mostStockedCategory.growth` and `compliance.rate`, which
the backend formats as `"N%"` strings). The frontend renders it verbatim
with no `%` appended, so the "Stock Flag Rate" card shows a bare "71" next
to two sibling cards correctly showing "-0.5%" and "0.4%". Minor
formatting inconsistency, not a data-correctness bug. See
`docs/features/superadmin/products.md`.

### Products: "PCN Compliance" card always says "Verified" regardless of actual compliance status

The backend computes a real `compliance.status` field (`'Verified'` above
90%, else `'Action Required'`), but `global-products-metrics.tsx`
hardcodes the literal word "Verified" in front of the rate instead of
reading `status`. Live-observed: card reads "Verified 0.4%" while the true
compliance rate is 0.4% and the backend's own `status` says "Action
Required" — the opposite of what the card claims. See
`docs/features/superadmin/products.md`.

### Products: per-row "View Details" / "Edit Product" / "Standardize Entry" actions are non-functional toast stubs

Confirmed via source read (`global-products-table.tsx`): all three dropdown
actions on each product row call `toast.info(...)`/`toast.success(...)`
with no API call, no mutation hook, and no navigation behind any of them.
Could not additionally confirm interactively since the table is always
empty (see the list/pagination bug above), but the absence of any hook
wiring in source is unambiguous. See `docs/features/superadmin/products.md`.

### Products: "Export Metrics" button is a stub

`handleExportMetrics` in `app/admin/products/page.tsx` is
`toast.info("Preparing export...")` with no follow-up — no download, no API
call. Confirmed live. See `docs/features/superadmin/products.md`.

### Products: "Standardize Catalog" is a real, unscoped, platform-wide mutation — deliberately not exercised

`AdminService::standardizeCatalog()` runs two unconditional `UPDATE`
statements across every product on the whole platform (default-filling
empty `generic_name`→`'General'` and `manufacturer`→`'Unknown'`), with no
dry-run/preview and no visible undo. This is real inventory data shared
with the store-owner-facing `client/` app. Correctly left unexercised per
this task's "look, don't submit" guidance for anything with real
platform-wide consequences. Route/controller/permission-gate verified
correct by source read. See `docs/features/superadmin/products.md`.

### Marketing: Coupons/Referrals create-and-mutate flows not independently exercised live (tab contention, not a product bug)

This task's Chrome session shared a tab group with a concurrently-running
sibling smoke-test task (Login/Stores/Users). Every dedicated tab opened
for a coupon create/edit/toggle/delete round-trip, or for visually loading
the Affiliates & Referrals tab, was navigated away from or closed by
outside activity within 1-3 tool calls, repeatedly, before the interaction
could complete. Verification fell back to: direct authenticated
`fetch()`/`curl` calls against the real backend using the session's own
bearer token (confirming exact response shapes and cross-checking against
`php artisan tinker` DB counts), plus full source reads of
`CouponController`, `ReferralController`, and the relevant frontend hooks
and components — all of which checked out as correctly wired to real
routes with no stubs. Not a bug; flagged so a future task with an isolated
browser session can complete the live create/delete round-trip if desired.
See `docs/features/superadmin/marketing.md`'s Caveats section.

### Marketing: no bugs found in Coupons or Referrals endpoint wiring

Both tabs' read endpoints (`admin/coupons`, `admin/referrals/summary`,
`admin/referrals`, `admin/referrals/transactions`, `admin/referrals/settings`)
return response shapes that exactly match what their frontend hooks/types
expect — unlike Products, there is no `data`/`meta` nesting mismatch here.
Live/DB cross-checks all agreed (0 coupons, 0 referred users, 0 referral
credit transactions, matching what each screen would show). See
`docs/features/superadmin/marketing.md`.

### Bug: staff/cashier users show "Platform Admin" as their affiliated store

**Section:** Users. **Severity:** Medium (data-display correctness, not a
security or data-loss issue).

Both `sales_staff` users on the shared dev backend ("Pika Store1 Cashier2",
"Pika Store 1 Cashier 1") show **Parent Store: Platform Admin** in the
Platform Users list and **Affiliated Store: Platform Admin** in their
detail-profile dialog, despite both having a real `users.store_id` pointing
at "Pikarestiv Stores" (confirmed via `php artisan tinker`).

**Root cause:** `AdminService::getGlobalUsers()`
(`laravel-server/app/Services/Admin/AdminService.php` line 710) does
`'store' => $user->store ? $user->store->name : 'Platform Admin'`, where
`$user->store` is `User::store()` (`app/Models/User.php` line 90), a
`hasOne(Store::class)` with the default (unspecified) foreign key — Laravel
infers `stores.user_id`, i.e. "the store this user **owns**," the same
relationship as the existing `User::stores()` (`hasMany`, explicit
`user_id`), not "the store this user's own `store_id` column points at."
For store owners this happens to resolve correctly (they own a store with
`user_id` = their own ID); for any staff-tier user (cashier, specialist,
etc.) it always returns `null`, regardless of their real `store_id`,
because no `stores` row has `user_id` equal to a staff member's ID. The
`'Platform Admin'` fallback — meant for users with genuinely no store at
all (e.g. the super_admin account) — then mislabels real store staff as
platform-level admins.

**Evidence:**
```
$ php artisan tinker --execute="App\Models\User::where('role','sales_staff')->get(['id','first_name','last_name','store_id'])->each(...)"
0f5d616a-d790-4825-82b5-6a5e107fc37a | Pika Store1 Cashier2 | store_id=8f3c150c-53ca-456d-a008-b5571ee3f6fe
ed26d57d-ffd9-430b-a669-28b607496d9d | Pika Store 1 Cashier 1 | store_id=8f3c150c-53ca-456d-a008-b5571ee3f6fe

$ php artisan tinker --execute="App\Models\Store::all(['id','name'])->each(...)"
8f3c150c-53ca-456d-a008-b5571ee3f6fe | Pikarestiv Stores   ← real store, not "Platform Admin"
```
Confirmed live in the browser: both rows and both dialogs display "Platform
Admin"; the store-owner row ("Pika Restiv") on the same list correctly
shows "Pikarestiv Stores 2".

**Suggested fix scope** (not implemented — investigation only): resolve the
`'store'` field via `$user->store_id` (a direct `find()`/`belongsTo` lookup
against `Store`) instead of the `store()` relation, which should probably
be renamed or left alone but not reused for this purpose. Full detail in
`docs/features/superadmin/users.md`.

### Bug: "Roles" filter on Platform Users list doesn't actually filter

**Section:** Users. **Severity:** Low (UX / dead control, not data
corruption).

The Users list's "Roles" dropdown (All Roles / Super Admin / Store Owner /
Specialist) updates its own trigger-button label when a role is selected,
but the underlying table never changes. `useAdminUsers(page, search)`
(`lib/api/admin-hooks-users.ts`) has no `role` parameter, and
`app/admin/users/page.tsx`'s `roleFilter` state is never passed into the
hook or used to client-side-filter `userList` — it's dead state connected
to nothing. Confirmed by selecting "Super Admin" while the list showed
mixed roles (store owners, sales staff) and observing zero change in the
rendered rows.

Not fixed — logged for a follow-up: either wire `roleFilter` into the
`admin/users` query (mirroring how Stores' status/plan filters already
work) or client-side filter `userList`, and add the backend query param if
choosing the former.

### Gap: "Notify All" button on Platform Users is a no-op

**Section:** Users. **Severity:** Low (dead control).

`app/admin/users/page.tsx` sets `_isBulkNotifyDialogOpen` (note the
underscore prefix, a convention this codebase uses elsewhere for
intentionally-unused values) via `setIsBulkNotifyDialogOpen(true)` when
"Notify All" is clicked, but no dialog component in the rendered tree reads
that state — there is no `BulkNotifyDialog` (or equivalent) mounted
anywhere on the page. Clicking the button produces no visible effect at
all. The backend route this presumably should call already exists and looks
complete (`POST admin/users/bulk-notify`,
`AdminController::bulkNotify`) — this is a frontend gap (missing dialog
wiring), not a backend gap.

Not fixed — logged for a follow-up: build/wire the missing bulk-notify
dialog, or remove the dead button if bulk notify is deliberately
deprioritized.

### Gap: "View Billing History" store action is a client-only stub

**Section:** Stores. **Severity:** Low (known-incomplete feature, not a
broken wire).

The Store Fleet row action "View Billing History" (`handleViewBilling` in
`app/admin/stores/page.tsx`) only shows a `toast.info("Billing History",
...)` — it calls no API and navigates nowhere. Distinct from a
wrong-endpoint bug: there's no endpoint call attempted at all, so nothing is
silently failing. Logged for visibility since a superadmin clicking this
expecting real billing history data would see only a toast that "Fetching
billing records for {store}..." and then nothing further happens.

### Confirmed, not a bug: "Active Users" stat (4) vs. total user count (5)

**Section:** Login/Stores/Users cross-check (Overview dashboard stat, not
one of this batch's 3 target sections, but checked while verifying totals).

The Overview dashboard shows "Active Users: 4" while
`App\Models\User::count()` is 5. Verified this is intentional, not a bug:
`AdminService::getGlobalSummary()`'s `active_users` metric explicitly
excludes `super_admin`-role accounts (`->where('role', '!=',
'super_admin')`) as well as inactive users, and the shared dev backend has
exactly one `super_admin` (the account used for this walkthrough) among its
5 total users — 5 − 1 = 4, matching the displayed figure exactly. This is a
deliberate business-metric scoping decision (an "Active Users" count for a
SaaS admin panel reasonably shouldn't include the platform's own operator
accounts), not a data bug.

### Confirmed, not a bug (data-display inconsistency, logged for awareness): two different "store status" definitions render identically

**Section:** Stores (cross-checked against the Overview dashboard, which is
out of this batch's scope but shares the same `AdminStoreSummary.status`
field name).

"Smoke Test Store" shows **Active** on the Store Fleet list / View Store
Details dialog (`AdminService::getStores()`, real `stores.status` DB
column) but **Inactive** on the Overview dashboard's Recent Stores widget /
store-detail dialog (`AdminService::getGlobalSummary()`, a
sync-recency-derived pseudo-status based on `last_sync_at`, unrelated to
the `stores.status` column). Both UI surfaces use an identical-looking
badge for a field named "Status" in both cases, but the two backend
computations diverge for the same store. Not a wrong-endpoint bug (both
endpoints are real and return what they say), but a real
data-presentation inconsistency worth a superadmin knowing about before
trusting either badge at a glance. Full detail in
`docs/features/superadmin/stores.md`.

### Minor, unconfirmed observation: session-restore-on-reload landed on the wrong route once

**Section:** Login.

During live testing, one full-page reload of `/admin/stores` (after a fresh
in-memory session with no token) auto-restored the session via
`POST admin/session/refresh` as expected, but landed on `/admin/marketing`
instead of the originally-requested `/admin/stores`. Not reproduced
consistently across several repeated navigations to the same URL in the
same session (all other attempts landed correctly on the requested route),
so this is flagged as an observation rather than a pinned-down, reproducible
bug — plausibly a stale/queued client-side navigation from a preceding
interaction in the same tab (test-harness timing) rather than the
session-restore logic itself. Documented rather than silently dropped, per
this task's brief to err toward thorough documentation.

### Confirmed, not a bug: Users search doesn't match multi-word "first last" queries

**Section:** Users.

Searching "Pika Restiv" (first + last name together) returned zero results
even though a user "Pika Restiv" exists; searching "Restiv" alone (last
name only) correctly returned that user. Root cause understood and
intentional-by-implementation, not a wiring bug:
`AdminService::getGlobalUsers()`'s search does independent `LIKE` checks
against `first_name`, `last_name`, `email`, `id` — never a concatenated
"first + last" match — so a query spanning both name parts can't match any
single column. Logged as a UX gap (a superadmin typing a full display name
from the table will get zero results) rather than a bug, since the
underlying columns and endpoint are working exactly as coded.

### Bug: Activity Log's Store column also shows "Platform" for staff/cashier users (same root cause as the Users-page bug, second surface)

**Section:** Activity. **Severity:** Medium (data-display correctness).

Batch: Activity/System. Live-observed on `/admin/activity`: a `LOGIN` row
for "Pika Store 1 Cashier 1" (a real `sales_staff` user with
`store_id` = `8f3c150c-53ca-456d-a008-b5571ee3f6fe`, i.e. "Pikarestiv
Stores" — same user already documented in the Users-section bug above)
shows **Store: "Platform"** instead of the real store name, while every
other row (all from the store-owner account) correctly shows "Pikarestiv
Stores 2". Root cause is identical to the already-logged Users bug, just a
second call site: `AdminService::getActivityLogs()`
(`laravel-server/app/Services/Admin/AdminService.php:733`) resolves
`$log->user?->store ?? $log->user?->stores?->first()`, and both
`User::store()` (`hasOne`, default-inferred `stores.user_id` FK) and
`User::stores()` (`hasMany`, explicit `user_id`) mean "stores this user
**owns**," not "the store this user's own `store_id` column points at" —
so both are always empty for any staff-tier user regardless of their real
`store_id`. Not fixed — investigation only. Same suggested fix as the
Users bug (resolve via `$user->store_id` directly). Full detail in
`docs/features/superadmin/activity.md`.

### Gap: Activity Log has 4 documented, working backend filter params with no UI control

**Section:** Activity. **Severity:** Low.

`AdminController::activityLogs` / `AdminService::getActivityLogs()` and
the frontend hook `useAdminActivityLogs()` all already support `store_id`,
`user_id`, `date_from`, `date_to` as real query params (confirmed by
signature/OpenAPI-annotation read), but `app/admin/activity/page.tsx` only
exposes UI for `search` and `action` — no store picker, user picker, or
date range picker exists on the page. Not a wiring bug (nothing is
mis-wired; the capability just isn't surfaced in the UI yet). Full detail
in `docs/features/superadmin/activity.md`.

### Confirmed, not a bug: System page "Memory" card always reads "Unknown" on this dev machine

**Section:** System.

`AdminService::getSystemHealth()` shells out to `free -m` (Linux-only;
confirmed absent via `which free` on this macOS dev machine), and already
degrades gracefully to the pre-seeded `'Unknown'`/`0%` defaults when that
fails — exactly what renders live. Environment limitation of running the
Laravel backend on macOS for local dev, not a bug in the health-check
logic. Full detail in `docs/features/superadmin/system.md`.

### Confirmed, not a bug (accuracy caveat): System page "Storage 92.3%" doesn't match this machine's real disk usage, but the backend math is internally correct

**Section:** System.

Live "Storage" card shows 92.3% used; cross-checked
`disk_total_space('/')`/`disk_free_space('/')` directly via `php -r` and
got the exact same 92.3% — so the backend's calculation is correct given
its inputs. But `df -h /` on the same machine reports 47% capacity used.
Root cause is a macOS APFS quirk (PHP's disk-space functions report usage
against the whole shared APFS *container* across all its volumes, while
`df`'s Capacity column is scoped to the one volume) — not a code defect,
and likely a non-issue on the single-partition Linux hosts this code is
actually written for. Flagged as a dev-environment caveat, not a bug. Full
detail in `docs/features/superadmin/system.md`.

### Confirmed, not a bug: System page's Sentry error feed and Default Contact Specialist config are both real, correctly-wired live integrations

**Section:** System.

`GET admin/errors` makes a genuine live server-side call to the real
Sentry API (org `dumos-technologies`, both `dumosrx-client` and
`dumosrx-server` projects) and rendered ~17 real unresolved historical
issues with correct titles/projects/culprits/event counts — not a stub or
hardcoded list. The "Refresh" button on system metrics re-issues a fresh
`GET admin/health` (200 OK). The Default Contact Specialist widget loads
the real current value via `GET /system-configs/default_account_manager_id`
and a no-op re-save round-tripped a real `PUT
admin/system-configs/default_account_manager_id` → 200 with the correct
toast. No bugs found in either integration. Full detail in
`docs/features/superadmin/system.md`.
