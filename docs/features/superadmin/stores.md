# Superadmin Stores (Store Fleet)

Route: `app/admin/stores/page.tsx` → `StoresManagement`, using
`components/admin/stores/store-table.tsx`, `store-toolbar.tsx`,
`store-pagination.tsx`, `store-dialogs.tsx` (`SuspendStoreDialog`,
`ViewStoreDialog`), and the shared `shared-grant-trial-dialog.tsx`. Data and
mutations come from `lib/api/admin-hooks-stores.ts` (re-exported through the
barrel `lib/api/admin-hooks.ts`). New-store flow: `app/admin/stores/new/page.tsx`
→ `components/admin/stores/new-store-form.tsx` (`NewStoreForm`).

Walked live on 2026-09-03/04 as `admin@dumosrx.com` (`super_admin`) against
the shared dev backend, which has **3 real stores**: "Smoke Test Store"
(demo-flagged, from earlier client-app smoke testing), "Pikarestiv Stores 2",
"Pikarestiv Stores".

## List view (`useAdminStores`)

`GET admin/stores?page=&search=&status=&plan=` (`AdminController::stores`,
`super_admin`-gated server-side via `hasRole('super_admin')`, backed by
`AdminService::getStores()`). Columns: Store Details (name, demo badge,
UUID), Owner & Contact, Subscription (plan badge + "Since {date}"), Fleet
Size, Total Revenue, Status.

**Verified live:**
- **Count matches DB**: "SHOWING 3 OF 3 STORES" matched
  `php artisan tinker --execute="echo App\Models\Store::count();"` → `3`.
- **Search** — typing "Pikarestiv" correctly debounced (500ms,
  `useDebounce`) and fired `GET admin/stores?page=1&search=Pikarestiv`
  (200), narrowing 3→2 stores live. Typing a full store name substring
  ("Pikarestiv Stores 2") isn't required — the backend does a `LIKE`
  match against store name / ID / owner first-name / last-name / email
  independently (`AdminService::getStores`), so a plain owner-name fragment
  works too.
- **Filters** (`Filters` dropdown, `StoreToolbar`) — Status (All/Active
  Only/Suspended) and Subscription (All/Starter/Professional/Enterprise).
  Selecting "Professional" fired `GET admin/stores?page=1&plan=pro` (200) —
  confirms the UI label "Professional" correctly maps to the backend's
  `pro` plan value, not a mismatched literal. All 3 stores are on Pro, so
  the result set stayed 3/3, which is expected (not a false-positive: the
  request parameter itself was verified in the network tab, not just the
  unchanged count).
- **Export CSV** — client-side only (`handleExportCSV`, no network call);
  builds a CSV Blob from the already-loaded `storeList` and triggers a
  browser download. Not deeply exercised (no destructive/state risk either
  way) but confirmed it doesn't silently hit a nonexistent endpoint.
- **Register Store** button routes to `/admin/stores/new` (below).

## Row actions (per-store dropdown, `StoreTable`)

Visibility is role-gated client-side (`checkIsSuperAdmin`, matching the
backend's own `super_admin`-only middleware for the destructive ones):

- **View Store Details** → opens `ViewStoreDialog`. Confirmed live: shows
  Store Name, Store ID, Owner, Email, Subscription, **Status**, Fleet Size,
  Total Revenue, Created At — all matched the row's own values exactly, and
  independently cross-checked "Smoke Test Store"'s fields against
  `php artisan tinker` (`status: Active`, `is_demo: true`) — all consistent.
  Also loads **Contact Specialist / Account Manager** via
  `GET admin/account-managers` (real endpoint, 200,
  `AdminController::accountManagerCandidates`) into a `Select`, with a
  **Save Assignment** button wired to `useUpdateAccountManagerMutation` →
  `PUT admin/stores/{id}/account-manager` (real route). Not submitted live
  (reassigning the real account manager on a shared dev store is a
  persistent, other-visible change out of this task's conservative-write
  policy), but the dialog's pre-fill ("Currently 'Josh Odumodu' via
  referral/default, not explicitly assigned.") matched
  `selectedStore.account_manager_is_explicit` being false, confirming the
  explicit-vs-inferred distinction documented in the component is real and
  not always-explicit.
- **Impersonate (Admin)** → `useImpersonateStoreMutation` →
  `POST admin/stores/{id}/impersonate` (real route,
  `AdminController::impersonateStore`), then a two-code handoff
  (`createHandoffCode` for both the impersonation token and the admin's own
  return token) redirects to the client app's `/auth/callback`. **Not
  exercised live** — this crosses into the already-fully-smoke-tested
  `client/` app and would leave the admin session in a different app
  entirely; out of this task's scope (superadmin panel only).
- **View Billing History** → **RESOLVED** (batch-c-downloads-billing).
  Was a client-only stub (`handleViewBilling` just showed a
  `toast.info("Billing History", ...)` with no navigation or API call).
  Fix: a new admin-scoped endpoint, `GET admin/stores/{id}/billing-history`
  (`AdminController::billingHistory` -> new
  `AdminService::getBillingHistoryForStore()`), reusing the identical
  `PaymentTransaction` query `SubscriptionController::billingHistory` already
  uses for a store owner's own self-service billing history, but scoped to
  the requested store's owner (`Store::user_id`) instead of `Auth::id()` —
  the existing endpoint is unusable for this because it's hardcoded to the
  currently-authenticated user, not an arbitrary store an admin is viewing.
  Gated by the same `super_admin` role check every other AdminController
  endpoint uses; 404s for a nonexistent store id. Frontend:
  `handleViewBilling` now opens a new `BillingHistoryDialog`
  (`components/admin/stores/store-dialogs.tsx`), modeled on the existing
  `BulkNotifyDialog` pattern (Users batch), backed by a new
  `useAdminStoreBillingHistory(storeId)` hook
  (`lib/api/admin-hooks-stores.ts`) — shows a real transaction list or an
  honest "No billing transactions found for this store" empty state (not a
  fabricated placeholder).

  **Verified:** PHPUnit
  (`tests/Feature/Admin/AdminStoreBillingHistoryTest.php`, 4 tests, RED
  before the fix / GREEN after — confirmed by re-running against a
  git-stashed pre-fix copy of the controller/service/routes, which 404'd
  since the route didn't exist yet): super_admin can fetch any store's
  billing history; a non-super_admin caller gets 403; a nonexistent store id
  404s; a store with no transactions returns an empty list, not an error.
  Live: clicked "View Billing History" on "Pikarestiv Stores" in the real
  dev browser — network tab confirmed a real
  `GET admin/stores/{id}/billing-history` → **200**, dialog correctly
  rendered "Payment transactions for Pikarestiv Stores." followed by "No
  billing transactions found for this store." (this dev DB's real
  `PaymentTransaction` table has no rows for this store's owner — an honest
  result, not a stub).
- **System Logs** → routes to `/admin/system?search={store.id}`. **Not
  exercised** (Activity Log / System section is out of this batch's scope;
  covered by a later batch per the task's 15-section split).
- **Grant Trial** (visible to `super_admin`/`platform_admin`) → opens the
  shared `SharedGrantTrialDialog` with Plan Tier (defaulted "Pro Plan") and
  Duration ("14 days") selects. Confirmed the dialog opens correctly wired
  to `useGrantTrialMutation` (`POST admin/stores/{id}/grant-trial`, real
  route, `AdminController::grantTrial`) by inspecting the mutation call in
  `stores/page.tsx`'s `handleGrantTrial`; **not submitted live** (grants a
  real, dashboard-visible trial change to a shared dev store's actual
  subscription state).
- **Mark as Demo / Unmark as Demo** (`super_admin` only) → toggles
  `useMarkStoreDemoMutation` / `useUnmarkStoreDemoMutation` →
  `POST admin/stores/{id}/mark-demo` or `/unmark-demo` (both real routes).
  Not exercised live (would flip a real, currently-`true` `is_demo` flag on
  "Smoke Test Store", a flag other in-flight test flows may depend on).
- **Suspend Account / Unsuspend Account** — opened `SuspendStoreDialog` for
  "Smoke Test Store": title, confirmation copy naming the store, and a
  required "Suspension Reason (Visible to user)" `Textarea` all matched the
  component exactly. Wired to `useSuspendStoreMutation` →
  `POST admin/stores/{id}/suspend` (real route,
  `AdminController::suspendStore`, body `{reason}`). **Cancelled without
  confirming** — suspending a real shared-dev store would lock its sync and
  is not something this task should do irreversibly-ish without a clear
  need.

## New Store (`/admin/stores/new`)

`NewStoreForm` fields — Store/Store Name, Owner First/Last Name, Email,
Login Username, Phone, Terminal PIN (4 digits), Default Password, Confirm
Password, and an "Demo account" switch — **match the backend's own
validation exactly** (`AdminController::registerStore`: `store_name`,
`first_name`, `last_name`, `email` unique, `username` unique, `phone`
min:10, `password` min:8, `pin` nullable size:4, `is_demo` nullable
boolean). Submits via `useCreateStoreMutation` → `POST admin/stores` (real
route, 201 on success, invalidates `admin-stores`/`admin-summary` queries).

**Not submitted live** — creating a real store + owner account on the
shared dev backend is exactly the kind of new, other-visible, base-data
change this task's brief says to stop short of unless confident it's
harmless; a fresh test store from this task isn't obviously safe to leave
behind for other concurrent/future work on this shared backend, so the form
was opened and its fields verified against the schema but not completed.

## Data accuracy note: two different "store status" concepts

Found while cross-checking the Overview dashboard (`/admin`, out of this
batch's primary scope but touched during login-flow verification) against
this Stores list for the same store ("Smoke Test Store"):

- **Store Fleet list / View Store Details** (this page) shows **Active**,
  sourced from `AdminService::getStores()`, which surfaces the real
  `stores.status` DB column (`Active`/`Suspended` — an actual account-state
  enum). Confirmed via `php artisan tinker`: `status: Active`.
- **Overview dashboard's "Recent Stores" widget and its store-detail
  dialog** (`components/admin/dashboard/recent-stores.tsx`,
  `components/admin/dashboard/store-dialog.tsx`) showed **Inactive** for
  the *same store*, sourced from `AdminService::getGlobalSummary()`, which
  computes `status` from **sync recency** instead
  (`last_sync_at` < 60min → Active, < 1440min → Away, else Inactive —
  `app/Services/Admin/AdminService.php` lines 145–155), entirely unrelated
  to the `stores.status` column.

Both UI surfaces render an identical-looking green/amber dot + text badge
labeled "Status," but they mean two different things (account state vs.
sync freshness) for the same field name. A superadmin glancing at the
dashboard could reasonably conclude a store's account is suspended/inactive
when it is actually `Active` per the real status column (or vice-versa for
a store that's `Active` on the account but has gone quiet on sync). Logged
as a real finding in `_findings-log.md` — not fixed (out of scope: this
task is investigation-only, no code changes).
