# Superadmin Users (Platform Users)

Route: `app/admin/users/page.tsx` → `GlobalUsersDirectory` /
`GlobalUsersDirectoryContent` (wrapped in `Suspense` for `useSearchParams`),
using `components/admin/users/user-table.tsx`, `user-pagination.tsx`, and
per-action dialogs (`user-profile-dialog.tsx`, `deactivate-user-dialog.tsx`,
`reactivate-user-dialog.tsx`, `reset-password-dialog.tsx`,
`send-notification-dialog.tsx`, `delete-user-dialog.tsx`), plus the shared
`shared-grant-trial-dialog.tsx`. Data/mutations from
`lib/api/admin-hooks-users.ts`. New-admin flow: `app/admin/users/new/page.tsx`
(`AdminNewUserPage`, self-contained — no separate form component).

Walked live on 2026-09-04 as `admin@dumosrx.com` (`super_admin`). The shared
dev backend has **5 real users**: 2 sales-staff cashiers ("Pika Store1
Cashier2", "Pika Store 1 Cashier 1"), 2 store owners ("Smoke Tester", "Pika
Restiv"), and the `super_admin` account itself.

## List view (`useAdminUsers`)

`GET admin/users?page=&search=` (`AdminController::users`,
`super_admin`-gated, `AdminService::getGlobalUsers()`). Columns: User
Profile (name, UUID + email, deletion-requested badge), System Role, Parent
Store, Last Active, Status.

**Verified live:**
- **Count matches DB**: "GLOBAL DIRECTORY: 5 USERS" matched
  `App\Models\User::count()` → `5`.
- **Search** — single-token search (e.g. "Restiv") correctly fired
  `GET admin/users?page=1&search=Restiv` and narrowed 5→1. A two-word query
  spanning first+last name ("Pika Restiv") returned **zero** results even
  though a user by that full name exists — not a bug, just how the backend
  search is implemented: `AdminService::getGlobalUsers()` does
  `first_name LIKE '%q%' OR last_name LIKE '%q%' OR email LIKE '%q%' OR id
  LIKE '%q%'` against each column independently, so a query containing both
  the first and last name together won't match either column alone. Logged
  as a UX gap, not a wiring bug.
- **Roles filter** (`Roles` dropdown) — options for All/Super
  Admin/Store Owner/Specialist. **Client-side only**: `roleFilter` state is
  set but never passed into `useAdminUsers(page, debouncedSearch)` — the
  hook's signature doesn't even accept a role parameter, and the dropdown
  trigger's own label just echoes the selected value without re-querying or
  re-filtering the already-rendered list. Selecting a role visibly changes
  the button label but the table underneath does not change. **This is a
  real bug** — logged in the findings log.
- **Export CSV** — client-side only (`handleExportCSV`, builds a CSV Blob
  from the loaded `userList`, no network call), matching the same pattern
  as Stores' export. Confirmed it doesn't hit a broken endpoint (it hits
  none).
- **Notify All** — opens (per the code) a bulk-notify dialog path; the
  button sets `_isBulkNotifyDialogOpen` but that state is prefixed
  underscore and **its setter is passed to nothing** — no dialog component
  in the tree consumes `isBulkNotifyDialogOpen`/`setIsBulkNotifyDialogOpen`
  as of this walkthrough, so clicking "Notify All" changes no visible UI at
  all (silent no-op). A real, matching backend route does exist
  (`POST admin/users/bulk-notify`, `AdminController::bulkNotify`) but the
  frontend has no dialog wired to call it. Logged in the findings log as a
  dead/unfinished control, not a wrong-endpoint bug (there's no endpoint
  call attempted in the first place).

## Row actions (per-user dropdown, `UserTable`)

- **View Detailed Profile** → `UserProfileDialog`. Confirmed live for "Pika
  Store1 Cashier2" (a `sales_staff` cashier): shows name, role badge, email,
  **Affiliated Store**, Member Since, Last Login, System Status. All fields
  matched the row's own values — **including the same "Platform Admin"
  mislabeled store shown in the list row** (see bug below).
- **Send Notification** → `SendNotificationDialog`, wired to
  `useNotifyUserMutation` → `POST /admin/users/{id}/notify` (real route,
  `AdminController::notifyUser`). Opened and inspected; not submitted (would
  send a real notification to the target user's account).
- **Force Password Reset** → `ResetPasswordDialog`, wired to
  `useResetUserPasswordMutation` → `POST admin/users/{id}/reset-password`
  (real route, `AdminController::forcePasswordReset`, returns a
  `temp_password`). Not exercised live — this is a real, working-credential
  mutation on a shared account other flows may depend on being loginable.
- **Grant Free Trial** (only shown for `store_owner`/`admin` role_slugs, per
  `UserTable`'s own conditional — correctly hidden for the two sales-staff
  rows, confirmed live) → shared `SharedGrantTrialDialog`, wired to
  `useGrantUserTrialMutation` → `POST admin/users/{id}/grant-trial` (real
  route, `AdminController::grantUserTrial`). Not submitted (real
  subscription-state change to a shared store owner's account).
- **Deactivate / Reactivate Account** →
  `useDeactivateUserMutation`/`useReactivateUserMutation` →
  `POST admin/users/{id}/deactivate` / `/reactivate` (both real routes).
  Toggle correctly conditioned on `user.status` (`Inactive`/`Suspended` →
  shows Reactivate; otherwise Deactivate), confirmed via code + row state.
  Not exercised live (would actually lock/unlock login for a real shared
  account).
- **Delete Account** → `DeleteUserDialog`, wired to
  `useDeleteUserMutation` → `DELETE admin/users/{id}` (real route,
  `AdminController::deleteUser`). Not exercised live for the obvious reason
  (irreversible on a shared dev backend with real, in-use test accounts).

## New Platform Account (`/admin/users/new`)

`AdminNewUserPage` fields — First Name, Last Name, Email, Phone (optional),
Role (Platform Admin / Agent / Super Admin, each with its own description
line), Password, Confirm Password — verified live: opening the Role select
rendered exactly the three `ROLE_OPTIONS` from the component
(`platform_admin`/`agent`/`super_admin`) with matching descriptions.
Zod schema requires 8+ char password and password===confirmation.
Submits via `useCreatePlatformAdminMutation` → `POST admin/users` (real
route, `AdminController::createPlatformAdmin`).

**Not submitted live** — this form creates a real `super_admin`/
`platform_admin`/`agent` account, a materially heavier action than a
regular store user (platform-level access, not scoped to one store); out of
this task's conservative-write policy for a shared dev backend.

## Bug found: staff/cashier accounts show "Platform Admin" as their store

**This is a real, confirmed bug**, found by cross-referencing the UI against
`php artisan tinker`.

Both "Pika Store1 Cashier2" and "Pika Store 1 Cashier 1" (role `sales_staff`)
show **Parent Store: Platform Admin** in the Users list and **Affiliated
Store: Platform Admin** in their detail dialog. Neither is actually a
platform admin — both are real store staff. Confirmed their true store via
`php artisan tinker`:

```
0f5d616a-... | Pika Store1 Cashier2 | store_id=8f3c150c-53ca-456d-a008-b5571ee3f6fe
ed26d57d-... | Pika Store 1 Cashier 1 | store_id=8f3c150c-53ca-456d-a008-b5571ee3f6fe
8f3c150c-53ca-456d-a008-b5571ee3f6fe | Pikarestiv Stores   ← the actual store
```

**Root cause** (`app/Services/Admin/AdminService.php` line 710):

```php
'store' => $user->store ? $user->store->name : 'Platform Admin',
```

`$user->store` is `User::store()` (`app/Models/User.php` line 90):

```php
public function store()
{
    return $this->hasOne(Store::class);
}
```

A `hasOne(Store::class)` with no explicit foreign key defaults to matching
`stores.user_id = users.id` — i.e. "the store I **own**," which is the exact
same relationship as `User::stores()` (`hasMany(Store::class, 'user_id')`)
just narrowed to one row. It does **not** look up a store by the user's own
`users.store_id` column (i.e. "the store I **work at**"). For a store
owner, `stores.user_id` really does point back at them, so `$user->store`
resolves correctly. For staff/cashiers, no `stores` row has `user_id` equal
to their own ID (they don't own any store), so `$user->store` is always
`null` regardless of their real `users.store_id` — and the code's fallback
label, "Platform Admin," is wrong for this case (it's meant for the small
number of users who genuinely have no store at all, like the super_admin
account, not for staff who have a real `store_id` the relation just isn't
using).

**Impact**: every non-owner staff account (sales_staff, and likely any
other staff-tier role using `users.store_id`) is mislabeled platform-wide in
both the Users list and the profile dialog, misrepresenting real store staff
as platform-level admin accounts — directly relevant to the task's ask to
verify "important operational data is actually being tracked/shown
correctly," since staff-to-store attribution is exactly that kind of data.

Not fixed (investigation-only task) — logged in `_findings-log.md` with
enough detail (exact file/line, root cause, and the two affected user IDs)
to scope a follow-up fix: `AdminService::getGlobalUsers()`'s `'store'` field
should resolve via `$user->store_id` (a `belongsTo`/`find()` lookup) rather
than the misnamed `store()` relation, which is really "store I own."
