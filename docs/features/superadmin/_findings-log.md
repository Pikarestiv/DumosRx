# Superadmin Panel — Smoke-Test Findings Log

Running log for the superadmin panel (`web/`, distinct app from the
store-owner-facing `client/` app, which was fully smoke-tested separately —
see `docs/features/_findings-log.md`). Same structure as that log:
`## Resolved` / `## Open`, newest entries at the bottom of each section.

This log spans multiple batches of this effort. Batch: Products/Marketing
(sections: Global Products, Marketing). Batch: Login/Stores/Users (sections:
Login, Stores, Users). No fixes were made in either batch — investigation
and documentation only, per each task's explicit scope.

## Summary (close-out)

Walked all 12 superadmin-panel sections across 5 batches — Products,
Marketing, Login, Stores, Users, Activity Log, System, Communications,
Downloads, Handoff, My Referrals, Platform Settings (6 sub-tabs) — against
the real seeded dev backend, logged in as `admin@dumosrx.com`
(`super_admin`). Every batch was scoped as **investigation and
documentation only** — no application code was changed anywhere in this
survey; every finding below is logged, not fixed.

- **19 real bugs found** across the 5 batches (tallied below by section),
  every one reproduced live and/or confirmed by source read against the
  actual request/response contract, with root cause identified in each
  case. None were fixed, per this survey's explicit scope.
- **Recurring bug shape, confirmed across almost every batch:**
  frontend/backend response-shape or schema mismatches — the same class
  of defect found repeatedly, not a one-off: Products' `data`/`meta`
  nesting bug, Settings' Billing & Plans tier `limits`/`features` schema
  drift (blank UI field + phantom/missing feature-gate keys), and the
  `User::store()` "owns a store" vs. "belongs to a store" relation
  mismatch that independently broke 2 different pages (Users list,
  Activity Log) via the identical root cause.
- **Recurring bug shape #2: dead/stub controls** — buttons and filters
  that render correctly and look wired up, but call no API at all (toast
  stubs) or call one that's silently ignored client-side: Products' row
  actions and Export Metrics, Users' Roles filter and Notify All, Stores'
  View Billing History, Activity Log's undiscoverable-but-real filter
  params, Downloads' always-available "Coming Soon" state.
- **One security-relevant footgun:** Stores' Impersonate action defaults
  to the real production domain (`app.dumosrx.com`) with no in-panel way
  to override outside the login page's Server Config widget — live-
  reproduced sending a real handoff code to production from this dev
  session (harmlessly rejected, but the request went out for real).
- **Per-section real-bug tally:** Global Products — 5 (list/pagination
  always empty; Stock Flag Rate missing `%`; PCN Compliance badge always
  says "Verified"; 3 stub row actions; Export Metrics stub). Users — 3
  (staff/cashier store mis-resolves to "Platform Admin"; Roles filter is
  dead; Notify All is a no-op). Stores — 1 (View Billing History stub).
  Activity Log — 2 (same "Platform" store bug, second surface; 4 real
  filter params with no UI). Communications — 1 (Feedback tab has no
  pagination UI despite 2,934 real rows, only 50 ever reachable).
  Downloads — 2 (Linux/Android "Coming Soon" dead code; per-platform size
  text hardcoded empty). Handoff — 2 (Impersonate defaults to production
  domain; false "Missing handoff code" error on a real successful login,
  a Strict-Mode double-effect race). My Referrals — 1 (Save on your own
  unchanged code always fails as "already taken", since the self-exclusion
  `user_id` param the backend explicitly supports is never passed).
  Platform Settings — 2 (Integrations' "Disable Widget" always 422s and
  can never clear the Smartsupp key back to empty once set; Billing &
  Plans' tier `limits`/`features` UI schema doesn't match what's actually
  stored, on two axes — a permanently-blank Sync Interval field, and real
  enforced feature gates like `theme_customizer` that are completely
  unmanageable through this UI while the UI's own toggle list includes
  several keys no backend code reads at all). Marketing and System — 0
  (both fully verified correct; Marketing's coupon/referral-program CRUD
  and System's live Sentry integration and health metrics all checked
  out). Login — 0 confirmed (one unreproduced, likely test-harness-timing
  observation logged for awareness, not counted as a pinned bug).
- **Several "checked, confirmed no bug" investigations** are logged
  alongside the real findings throughout this log — each is a place a
  plausible-looking issue was specifically checked with evidence and
  ruled out, not assumed absent: the "Active Users" stat undercount (an
  intentional business-metric scope, not a bug), the two divergent
  store-status definitions on Stores (real inconsistency, but both sides
  individually correct), System's "Unknown" Memory card and 92.3% Storage
  reading (both explained by real macOS dev-environment quirks, not code
  defects), Handoff's 60-second impersonation TTL (intentional security
  control), and this batch's Referrals store-name resolution (shares the
  Users/Activity-Log bug's root cause but doesn't currently manifest on
  this page's real data).
- Every batch's mutation testing followed the same conservative rule: real
  live round-trips were performed wherever the action was scoped,
  reversible, and low-consequence (e.g. this batch's Smartsupp
  key set→confirm→attempted-clear round trip, which is how the
  Integrations bug above was actually found), while anything real,
  unscoped, and platform-wide with no dry-run was deliberately inspected
  only and never submitted (Products' Standardize Catalog, Settings'
  Billing & Plans pricing/feature config, Security's email-verification
  requirement, Communications' Email Campaigns real-send).

## Resolved

### Bug: staff/cashier users show "Platform Admin" as their affiliated store (two surfaces: Users list + Activity Log)

**Section:** Users, Activity Log. **Severity:** Medium (data-display
correctness). **Fix commit:** (batch-b-users-activity, see git log for the
squashed SHA at merge time).

Root cause confirmed as documented below: `AdminService::getGlobalUsers()`
and `AdminService::getActivityLogs()` both resolved a user's store via
`User::store()`/`User::stores()` — "the store(s) this user **owns**"
(`stores.user_id` = `users.id`) — never via the user's own `users.store_id`
column ("the store this user is **staff at**"). For any staff-tier user
(`sales_staff`, `specialist`, etc.), the owns-relations are always empty,
so both call sites fell through to a `'Platform Admin'` fallback meant only
for genuinely storeless platform accounts.

**Fix:**
- Added `User::employerStore()` (`app/Models/User.php`) —
  `belongsTo(Store::class, 'store_id')` — alongside the existing
  `store()`/`stores()` ownership relations, plus a
  `getDisplayStoreAttribute()` accessor (`$user->displayStore`) that
  prefers the owned store, falls back to the employer store, then null.
- `AdminService::getGlobalUsers()` and `::getActivityLogs()`
  (`app/Services/Admin/AdminService.php`) both now resolve `'store'` via
  `$user->displayStore` instead of the ownership-only relations, and both
  eager-load `employerStore` alongside `store`/`stores` to avoid N+1s.

**Verified:**
- PHPUnit (`tests/Feature/Admin/AdminUsersStoreResolutionTest.php`, 5
  tests, RED before the fix / GREEN after — 3 of 5 failed pre-fix,
  confirmed by re-running against a git-stashed pre-fix copy of the
  changed files): a seeded `sales_staff` user with `store_id` set and no
  owned store now resolves their real employer store's name on both the
  Users-list and Activity-Log endpoints; a real store owner still resolves
  their owned store; a user with neither (the `super_admin` fixture) still
  correctly falls back to `'Platform Admin'`.
- Live, against the real shared dev backend (both seeded `sales_staff`
  cashiers, "Pika Store1 Cashier2" and "Pika Store 1 Cashier 1"): Platform
  Users list and a direct authenticated `admin/activity-logs?search=Cashier`
  call both now show `"Pikarestiv Stores"` instead of `"Platform Admin"`/
  `"Platform"`.

### Bug: "Roles" filter on Platform Users list doesn't actually filter

**Section:** Users. **Severity:** Low (dead control, not data corruption).

Root cause confirmed as documented below: `useAdminUsers(page, search)` had
no `role` parameter and the backend's `getGlobalUsers()` accepted none
either — `roleFilter` state was set on selection but never reached the
query in any form.

**Fix:**
- `AdminService::getGlobalUsers()` now accepts a third `$role` argument
  and applies `->where('role', $role)` when present.
- `AdminController::users` reads `role` off the query string and passes it
  through; documented in the endpoint's OpenAPI annotation.
- `useAdminUsers(page, search, role)` (`lib/api/admin-hooks-users.ts`) now
  accepts and forwards `role`.
- `app/admin/users/page.tsx` maps the dropdown's display labels ("Super
  Admin"/"Store Owner"/"Specialist") to the backend's raw role slugs
  (`super_admin`/`store_owner`/`specialist`) and passes the mapped slug
  into `useAdminUsers`; selecting a role also resets to page 1.

**Verified:**
- PHPUnit: `roles_filter_narrows_the_global_users_list_to_the_requested_role`
  in `AdminUsersStoreResolutionTest.php` — unfiltered list returns 3 seeded
  users, `?role=store_owner` narrows to exactly the 1 owner.
- Live: direct authenticated `admin/users?role=store_owner` against the
  real dev backend narrowed 5 users → 2 (both real store owners), matching
  `role_slug` on every returned row.

### Gap: "Notify All" button on Platform Users is a no-op

**Section:** Users. **Severity:** Low (dead control).

Root cause confirmed as documented below: the button set
`_isBulkNotifyDialogOpen` but no dialog component in the tree consumed
that state, so the click produced no visible effect even though a real,
complete backend route (`POST admin/users/bulk-notify`,
`AdminController::bulkNotify` → `AdminService::bulkNotify()`) already
existed — in-app notification + email to every user matching an optional
`role`/`search` filter, logged to the activity log.

**Fix:** built and wired the missing dialog
(`components/admin/users/bulk-notify-dialog.tsx`, `BulkNotifyDialog`) to
the existing route via a new `useBulkNotifyUsersMutation`
(`lib/api/admin-hooks-users.ts`). It shows the real recipient count (the
current filtered list's `meta.total`) and forwards the page's current
`role`/`search` filters as the backend's `filters` param, so "Notify All"
notifies the currently-filtered set, not unconditionally every user on the
platform. Renamed `_isBulkNotifyDialogOpen` → `isBulkNotifyDialogOpen`
now that it's genuinely read.

**Verified:**
- Backend route re-confirmed live via direct authenticated request:
  validation errors surface correctly (missing `message`/short `title`
  → 422), and a real send with a filter matching zero users returns
  `{"message":"Notification sent to 0 users successfully","count":0}` —
  exercised without emailing any real seeded account.
- Live in the browser: clicking "Notify All" now opens "Notify All
  Filtered Users" showing "Deliver a message to 5 users matching the
  current search/role filters..." — a real, populated dialog instead of a
  silent no-op. Not submitted with a real message (would email all 5 real
  seeded accounts); dialog closed via Discard.

### Products: `/admin/products` list and pagination are always empty despite a real 200 response and real data

**Fix:** `AdminController::products`
(`laravel-server/app/Http/Controllers/Api/Admin/AdminController.php`) used
to return `{"products": {"data": [...], "meta": {...}}, "metrics": {...},
"categories": [...]}`, nesting the paginated `data`/`meta` one level under a
`products` key while the frontend's `AdminProductsResponse` type
(`web/lib/types/admin.ts`, `extends PaginatedResponse<T>`) expects them flat
at the response root, matching every other admin list endpoint (e.g.
`admin/stores`). Changed the controller to spread `getGlobalProducts()`'s
`['data' => ..., 'meta' => ...]` result directly into the response root
alongside the existing `metrics`/`categories` keys — no changes needed to
`AdminService::getGlobalProducts()` itself, its `data`/`meta` shape was
already correct, just nested one level too deep by the controller. Also
updated the two pre-existing `AdminDataAccuracyTest` assertions that read
`products.data` to read `data` at the root, matching the corrected shape.

**Verified by:** `tests/Feature/Admin/AdminProductsResponseShapeTest.php`
(`test_products_endpoint_returns_data_and_meta_at_the_response_root`,
`test_products_endpoint_pagination_meta_reflects_page_size_across_multiple_pages`)
— RED before the fix (`assertArrayHasKey('data', ...)` failed, `$json['meta']`
undefined, confirmed by re-running against a git-stashed pre-fix copy of
the controller), GREEN after, using its own seeded fixture products, not
the shared dev DB's 3,041 rows. Live-verified: logged in as
`admin@dumosrx.com` on `http://localhost:3002/admin/products`, table now
populates real rows, header reads "Global Catalog: 3041 SKUs", and the
pagination footer renders ("Page 1 of 305") with working Prev/Next.

### Products: "Stock Flag Rate" metric card renders a bare number where its siblings render a percentage

**Fix:** `AdminService::getProductMetrics()`
(`laravel-server/app/Services/Admin/AdminService.php`) returned
`stockAlerts.rate` as a raw number, unlike `mostStockedCategory.growth` and
`compliance.rate`, which are formatted as `"N%"` strings. Formatted
`stockAlerts.rate` the same way (`.'%'` appended), matching its siblings —
fixed at the source of the inconsistency rather than patched in the
frontend, since all three sibling cards already render their value the
same `value ?? "0%"` way.

**Verified by:**
`AdminProductsResponseShapeTest::test_stock_flag_rate_metric_is_formatted_as_a_percentage_string_like_its_siblings`
(asserts `stockAlerts.rate`, `mostStockedCategory.growth`, and
`compliance.rate` are all string-typed and end in `%`). Live-verified:
"Stock Flag Rate" card now reads "71%".

### Products: "PCN Compliance" card always says "Verified" regardless of actual compliance status

**Fix:** the backend already computed a real `compliance.status` field
(`'Verified'` above 90%, else `'Action Required'`), but
`global-products-metrics.tsx` hardcoded the literal word "Verified" in
front of the rate instead of reading it. Changed the card to render
`productMetrics?.compliance?.status ?? "Unknown"` followed by the rate, and
added `status` to the `GlobalProductMetrics` type
(`web/lib/types/admin.ts`).

**Verified by:**
`AdminProductsResponseShapeTest::test_compliance_status_reflects_the_real_nafdac_compliant_rate`
(seeds 1-of-4 NAFDAC-compliant products, asserts the backend returns
`compliance.status === 'Action Required'` at 25%). Live-verified: card now
correctly reads "Action Required 0.4%" instead of "Verified 0.4%" for the
dev DB's real compliance rate.

### Products: per-row "View Details" / "Edit Product" / "Standardize Entry" actions are non-functional toast stubs

**Fix (judgment call — honest stubs, not fake functionality):** checked
whether real destinations exist to wire these to. They don't: there is no
per-product detail/edit page anywhere in `web/app/admin/**`, and the only
product CRUD endpoints in the backend (`Api/App/ProductController`,
`routes/api.php`'s `apiResource('products', ...)`) are tenant-scoped
(`ScopesToTenant`) for a store's own inventory — not reachable or
appropriate for a platform-wide superadmin view spanning arbitrary stores'
products — and there's no per-row standardize endpoint (only the existing
bulk `admin/products/standardize`). Rather than build new admin
product-detail/edit surfaces (out of scope for a bug-fix batch) or leave
the toasts silently implying success, changed all three
`global-products-table.tsx` dropdown actions to honestly say they're not
yet available (e.g. "Product editing not yet available — there's no admin
product-edit endpoint yet — this product belongs to a store's own
inventory"; "Standardize Entry" points the user at the existing
"Standardize Catalog" bulk action instead).

**Verified by:** live click-through on `http://localhost:3002/admin/products`
— "View Details" now shows a "Product detail view not yet available" toast
with the honest description. No PHPUnit coverage (frontend-only, no
backend involved).

### Products: "Export Metrics" button is a stub

**Fix (judgment call — implemented a real minimal export):** no backend
export endpoint exists, but "Export Metrics" is a small, well-defined
action over data already loaded client-side (`response.metrics` +
`response.meta.total`), so implemented a real client-side CSV export
(`handleExportMetrics` in `app/admin/products/page.tsx`) — builds a CSV of
the currently-displayed metric values and triggers a browser download via
`Blob`/`URL.createObjectURL`, rather than leaving it as a no-op stub.

**Verified by:** live click on `http://localhost:3002/admin/products` — a
real `global-product-metrics-<date>.csv` file was downloaded to disk,
containing all displayed metrics (Global Catalog Total, Most Stocked
Category + growth, Stock Flag Rate + count, PCN Compliance rate + status),
success toast shown. No PHPUnit coverage (frontend-only, no backend
involved).

## Open

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

### Gap: Communications' User Feedback tab has no pagination UI despite a real, large paginated dataset (2,934 rows, only 50 ever visible)

**Section:** Communications. **Severity:** Medium (real data is
permanently inaccessible through this UI, not just a cosmetic gap).

`FeedbackController::index` correctly paginates (`Feedback::query()->paginate(50)`)
and the frontend's shape handling matches it exactly, but
`components/admin/views/feedback-tab.tsx` only ever renders
`data?.data?.map(...)` — no page control, "load more," or any element
reads the response's pagination metadata. Live-confirmed via `php artisan
tinker`: 2,934 real pending feedback/crash-report tickets exist
(auto-submitted by `system-logs@dumosrx.com`, e.g. `[CRASH] [WEB] FATAL:
Aborted(Error: [unenv] fs.readFileSync is not implemented yet!)`), of
which only the newest 50 are ever visible; the remaining 2,884 have no way
to be reached through this page. The "All/Pending/Resolved" status filter
tabs work correctly but don't help here since virtually all 2,934 tickets
are `pending`. Not fixed — investigation only. Full detail in
`docs/features/superadmin/communications.md`.

### Confirmed, not a bug: Communications' Broadcasts and Feedback actions are correctly wired; Email Campaigns deliberately not live-tested (real send risk)

**Section:** Communications.

Live round-trip tested Broadcasts create → toggle → delete (all real
`admin/announcements` calls, 200s, correct UI updates), scoped to a
`target_type: specific` broadcast targeting only the logged-in
super_admin's own account (never a real store owner). Live-tested
Feedback's "Resolve" action on a real ticket (`POST
admin/feedback/{id}/status` → 200, badge updated). Response shapes for
both match their frontend types exactly — no repeat of the Products
`data`/`meta` nesting bug. Email Campaigns (`POST admin/mail/send`) was
deliberately **not** submitted live: `MailController::send` queues a real
`Mail::to($user->email)` job per targeted user, and this dev backend's
seeded users include a real personal address
(pikarestiv@gmail.com). Confirmed correct wiring via source read only
(validation, queueing logic, response contract all check out). Full
detail in `docs/features/superadmin/communications.md`.

### Bug: Downloads page's Linux/Android "Coming Soon" state is dead code — always renders as available regardless of real asset existence

**Section:** Downloads. **Severity:** Low-Medium (could hand a real
superadmin/tester a Download button pointing at a 404).

`app/admin/downloads/page.tsx` computes `linuxAssetExists =
!!currentLinks.linux` (same for Android) to decide between an enabled
"Download" button and a disabled "Coming Soon"/"Unavailable" card. But
`useLatestRelease()` (`lib/api/release-hooks.ts`) always constructs
`currentLinks.linux`/`.android` as a non-empty template-string URL,
regardless of whether that file actually exists on the CDN or whether the
`updater.json` fetch even succeeded — so `!!currentLinks.linux` is always
`true` and the "Coming Soon" branch is unreachable in practice.
Live-confirmed via `read_page`: both Linux and Android cards rendered live
"Download" buttons with real-looking CDN URLs
(`https://downloads.dumosrx.com/v0.0.35/DumosRx_0.0.35_amd64.AppImage`,
`.../DumosRx-Android.apk`) even though this dev environment's CDN request
(`GET https://downloads.dumosrx.com/updater.json`) returned a live 503.
Not fixed — investigation only (no Download links were clicked, per this
task's scope of avoiding real external/production actions with unverified
consequences). Full detail in `docs/features/superadmin/downloads.md`.

### Minor: Downloads page's per-platform "size" text is hardcoded to empty in every code path

**Section:** Downloads.

`useLatestRelease()`'s success-path return object sets `winSize`/
`macSize`/`linuxSize`/`androidSize` to literal `""` unconditionally — not
derived from `updater.json`'s response even when that fetch succeeds. The
page's `defaultLinks` fallback (`"---"`) is dead code since `links` is
never falsy. Net effect: the size line under each install-format label is
always blank, regardless of environment. Full detail in
`docs/features/superadmin/downloads.md`.

### Bug: superadmin's Impersonate action defaults to the real production domain (`app.dumosrx.com`) with no in-panel way to override, in any dev session that skipped the login page's Server Config

**Section:** Handoff (root cause lives in Stores' Impersonate action, but
only became visible/relevant while investigating the Handoff round trip,
which has no other entry point). **Severity:** Medium-High (live-observed
real network request to production infrastructure from a dev testing
session).

`getAppURL()` (`web/lib/constants.ts`) defaults to
`https://app.dumosrx.com` (`NEXT_PUBLIC_APP_URL` unset in this dev
environment) and only checks a `localStorage` override that can *only* be
set via `ServerSelector`, which is mounted on the **login page**, not
anywhere inside the already-authenticated admin panel. This task's Chrome
session started pre-authenticated (never touched the login form), so the
override was never set. Live-reproduced: the first "Impersonate (Admin)"
click hard-navigated the browser to
`https://app.dumosrx.com/auth/callback?code=...` — real production — which
correctly rejected the (locally-minted, production-meaningless) code with
`410 Code expired or already used`, but only after a real handoff-code
value had already been sent over the network to production. No account
compromise resulted (code was for a `Demo`-flagged test store, already
consumed/rejected by the time of the request), but this is a real,
easily-reproduced footgun with no in-panel warning. Root-caused and
reproduced live; then worked around for the rest of this task's testing by
manually setting `localStorage.dumos_app_url` via the browser console.
Not fixed — investigation only. Full detail in
`docs/features/superadmin/handoff.md`.

### Bug: handoff callback page can show a false "Missing handoff code" error even when the underlying login already succeeded (React Strict-Mode dev double-effect race)

**Section:** Handoff. **Severity:** Low-Medium (confusing UX in dev; the
code's own comments show the author anticipated and partially — but not
fully — guarded against this exact race; likely not visible in production
builds since Strict Mode's double-invoke is dev-only).

Live-reproduced on `client/app/auth/callback/page.tsx` (the forward leg of
the impersonation handoff into which superadmin's Impersonate action
redirects) — `web/app/admin/handoff/page.tsx` (this task's actual target
file, the return leg) implements the structurally identical pattern and is
equally exposed, though its own failure during this task's testing was
separately root-caused to `return_code` TTL expiry (see below), not a
repeat of this exact symptom. Network log showed `POST
/auth/handoff/consume` → **200** (the real, successful exchange), yet the
browser visibly rendered "Missing handoff code. The link may have
expired." — the code's `if (!code) setError(...)` branch, a different,
earlier path than the try/catch around the real 200 call. Subsequent
direct navigation to `/dashboard` confirmed the login had genuinely
succeeded underneath the error screen. Consistent with React 18 Strict
Mode's dev-only double-invoke of `useEffect`: the file's own code comment
explicitly names the exact risk (`window.history.replaceState()` before
the async exchange can produce an empty `searchParams` on a second render)
but the guard (`useEffect(..., [])`) doesn't fully prevent it under
Strict Mode. Not fixed — investigation only. Full detail in
`docs/features/superadmin/handoff.md`.

### Confirmed, not a bug: "Failed to return to admin session" on ending impersonation, when the return leg is left idle past its 60-second TTL

**Section:** Handoff.

`AuthHandoffController::TTL_SECONDS = 60`, no renewal. This task's manual,
multi-minute investigation between minting the impersonation `return_code`
and clicking "End Session" caused the code to expire (confirmed via
network log: `POST /auth/handoff/consume` → **410**), logging the browser
out of both the impersonated and superadmin sessions and requiring a fresh
superadmin login. A real machine-speed impersonate→work→end cycle would
comfortably fit in 60 seconds; this is an intentional, documented security
control (short TTL on a bearer-token-wrapping code), not a defect. Logged
for awareness: a superadmin who leaves an impersonated session idle for
over a minute before ending it will hit this same error and be fully
logged out. Full detail in `docs/features/superadmin/handoff.md`.

### Bug: "Save" on your own unchanged referral code always fails as "already taken"

**Section:** Referrals ("My Referrals"). **Severity:** Medium.

Batch: Referrals/Settings (final batch). `app/admin/referrals/page.tsx`'s
`handleSave` calls `checkReferralCode(trimmed)` without passing the
current user's id, even though `checkReferralCode`'s signature
(`lib/api/admin-hooks-users.ts:20`) and the backend endpoint it hits both
support an optional `user_id` specifically to "exclude this user's own
current code from the collision check" (per the backend's own OpenAPI doc
comment, `AdminController.php:373`). Live-reproduced: opening the editor
on the account's real code (`pikarestiv`) and clicking Save without
changing anything → `"pikarestiv" is already taken. Try another.`
(confirmed via network tab: `GET
admin/referral-code/check?code=pikarestiv`, no `user_id` param, → `{
available: false }`). Effect: the only way to successfully use this
feature is to change to a code that's never been used by this account
before; simply re-confirming or lightly editing (e.g. casing) the existing
code always fails. Not fixed — investigation only. Suggested fix: pass
`user?.id` into `checkReferralCode` at the `handleSave` call site. Full
detail in `docs/features/superadmin/referrals.md`.

### Confirmed, not a bug: Referrals page's store-name resolution happens to be correct, sharing the same root cause as an already-logged bug elsewhere

**Section:** Referrals.

`AdminService::getReferralsFor()` resolves each referred account's store
via `$u->store->name ?? null` — the same `User::store()` `hasOne`
"stores this user **owns**" relation already documented as buggy for
staff-tier users in the Users-list and Activity-Log bugs above. It
resolves correctly here only because every referred account in this dev
DB is itself a store owner (the expected case for "referred a new
pharmacy"). Not re-logged as a new open bug — same root cause, no new
evidence of it actually breaking on this page's data. Full detail in
`docs/features/superadmin/referrals.md`.

### Bug: Settings → Integrations "Disable Widget" always fails with a 422, permanently unable to clear the Smartsupp key back to empty once set

**Section:** Settings (Integrations tab). **Severity:** Medium.

`integrations-tab.tsx`'s `handleClear` saves `value: ""` via `PUT
admin/system-configs/smartsupp_key`, but
`SystemConfigController::update()` validates with `'value' => 'required'`
— Laravel's `required` rule fails on an empty string. Live-reproduced:
set a throwaway test key, saved successfully (200, UI showed "Active"),
then clicked "Disable Widget" → toast `The value field is required.`,
network tab confirmed `PUT admin/system-configs/smartsupp_key` → **422**.
Manually clearing the input field and clicking "Save Key" instead hits the
identical code path and would fail identically. No working path exists in
this UI to return to the "Disabled" state once any value has ever been
saved. Recovered the shared dev backend's state directly via `php artisan
tinker` (`SystemConfig::setVal('smartsupp_key', '')`) after confirming the
bug, since the UI path is provably broken. Not fixed — investigation
only. Suggested fix: relax the backend validation for this key (e.g.
`present` instead of `required`) or have the frontend send an explicit
"clear" sentinel. Full detail in `docs/features/superadmin/settings.md`.

### Bug: Settings → Billing & Plans tier `limits`/`features` UI schema doesn't match what's actually stored, on two separate axes (blank field live; unmanageable real feature flags; phantom UI-only feature flags)

**Section:** Settings (Billing & Plans tab). **Severity:** Medium-High
(silent-corruption risk on save; found by inspection, no save required to
confirm).

Every tier's "Sync Interval (Mins)" field renders blank live because the
real stored `subscription_plans.tiers.*.limits` objects use a field called
`inventories` (confirmed via `php artisan tinker`: `{"staff": 0, "stores":
1, "inventories": -1}` for the Free tier) — there is no `sync_interval`
key in the real data at all, but `plan-tier-card.tsx` and the
`TierLimits` type hardcode `sync_interval` as the third limit field, and
the hydration `useEffect`'s `?? default` fallback never fires because the
real (partial) `limits` object is present, not undefined. Separately, and
more significantly: the real stored `features` object per tier uses keys
`basic_inventory`, `mobile_access`, `theme_customizer` (a real,
currently-enforced gate — confirmed live in
`client/components/ui/theme-customizer.tsx:73`), `store_url` — **none of
which have any toggle anywhere on this tab** — while the tab's 18-item
Feature Gates list includes keys (`mobile_app`, `ecommerce`, `smart_pos`,
`broadcast_create`, `custom_branding`, `barcode_generation`,
`loyalty_program`) that don't exist in the real stored config and (for at
least `loyalty_program`/`broadcast_create`/`barcode_generation`) have no
backend PHP code reading them as gates at all. A save (never actually
performed, to avoid corrupting the shared dev backend's real pricing
config) would write a garbage `sync_interval: NaN` into every tier and
leave the real `theme_customizer`/`mobile_access`/`store_url`/
`basic_inventory` flags permanently unmanageable through this UI. Not
fixed — investigation only. Full detail in
`docs/features/superadmin/settings.md`.
