# Roles & Permission Groups

**Date:** 2026-09-27
**Status:** Approved design, pending implementation plan

## Background

Inspired by QuickBooks POS's "Security" screen (`refs/qb-roles-and-permissions-1.HEIC`, `-2.HEIC`): a matrix of individual "Security Rights" (rows) against named Groups (Owner, Manager, Assistant Manager, Associate, columns), each cell a checkbox. Toolbar: "New Group", "Copy Group", "Print", "Find Security Right" search, a "View" filter, and "Revert Default Groups".

DumosRx already has a placeholder for this (`client/components/settings/roles-permissions-placeholder.tsx`): "Custom staff roles with fine-grained permissions are coming soon." Today, every permission check in the client is one of 6 hardcoded, role-string-array helpers in `auth-context.tsx` (`checkIsAdmin`, `checkCanManageStockBatch`, `checkCanProcessSales`, `checkCanRequestStockTransfer`, `checkCanViewAllActivity`, `checkCanFactoryReset`), called from ~80 sites across the client. The server already has a real, unrelated `Role`/`Permission`/`permission_role`/`permission_user` system (`RolesAndPermissionsSeeder`, `User::hasPermission()`) — but it's platform/API-authorization-only (e.g. `manage_staff`, `view_reports`, `manage_platform`) and the client has no concept of it at all.

This spec replaces the 6 client-side helpers with a data-driven, store-scoped, per-group permission system, editable by the store owner, synced to every device so it works fully offline (this app's core offline-first promise — staff log in locally via PIN with no guaranteed network round trip).

## Existing patterns this builds on

- `stores.enabled_payment_methods` / `stores.custom_units` (`client/lib/db/schema.ts`) — the existing precedent for storing a JSON array in a single TEXT column on a store-scoped row, synced like any other field. A group's granted-permission list follows this shape rather than a relational pivot, since a group needs to sync down to every device as one self-contained row with no join required offline.
- `stores.loyalty_defaults_seeded_at` — the existing precedent for lazily, idempotently seeding per-store default rows (loyalty tiers) the first time a feature touches a store that predates it. Default permission groups are seeded the same way.
- `auth-context.tsx`'s existing role-string hierarchy and its server-side mirror — `SyncController`'s `USER_SYNC_FORBIDDEN_FIELDS`, `USER_SYNC_ASSIGNABLE_ROLES`, `roleIsAtOrBelowCallerPrivilege()` (shared via `EnforcesStaffOwnership`) — is the **existing security ceiling** for "who can assign what role to whom." This spec does not touch or replace that machinery; it stays exactly as-is and continues to gate the underlying `role` string.
- `STAFF_ROLES` (`client/lib/constants/roles.ts`) and `staff-management.tsx`'s role dropdown — the UI this spec's "Group" dropdown replaces.
- `use-feature-gate.ts` — the existing plan-tier gating system. Orthogonal to this feature (plan tier vs. staff permission) but composes with it: creating a *custom* group is gated by plan the same way other advanced features are.

## Goals

- Store owner can view and edit, per group, a checkbox matrix of ~30 granular permissions (Section: Permission catalog).
- 5 default groups (Manager, Specialist, Sales Staff, Auditor, Admin) exist per store, pre-seeded with permission sets that reproduce today's exact 6-helper behavior — no behavior change for existing stores on day one.
- Default groups' checkboxes are editable; their names cannot be changed or deleted. A "Revert to Default" action restores a default group's original permission set.
- Store owner can create custom groups (e.g. "Supervisor"), each with a fixed base privilege tier chosen at creation and a fully custom permission checkbox set. Custom groups can be renamed and deleted (staff must be reassigned first).
- Every permission check works fully offline, using group data already synced to the device.
- All ~80 existing call sites of the 6 hardcoded helpers are migrated to the new system (full replacement, not an additive layer).
- Creating a *custom* group (beyond editing the 5 defaults) is gated by subscription plan.

## Non-goals

- No change to the existing `role` string / privilege-hierarchy security ceiling (who can grant which role to another user). That stays exactly as-is.
- No change to the existing server-side platform-level `Role`/`Permission` system (`manage_platform`, `create_accounts`, `grant_trials`, etc.) — those remain platform-admin-only concerns, entirely separate from this store-level feature.
- No per-permission audit trail of who changed what checkbox (ordinary `audit_logs`/Activity Log coverage of the group-edit action itself is enough — see Sync & security).
- No QuickBooks-style live "Find Security Right" search bar in v1 — the matrix is short enough (~30 rows, 6 categories) to scan directly; can be added later if it proves necessary.

## Data model

**Client (SQLite) and server (MySQL) both gain:**

`permission_groups`
- `id` (uuid/text pk)
- `store_id` (FK, required — every group belongs to exactly one store)
- `name` (text)
- `based_on_role` (text — one of the 5 privilege-tier role strings: `admin`, `manager`, `specialist`, `sales_staff`, `auditor`; fixed at creation, drives the privilege-ceiling checks below, never itself surfaced as editable)
- `is_default` (bool — true for the 5 seeded groups, false for owner-created custom groups)
- `permissions` (TEXT, JSON array of permission keys, e.g. `["process_sales","apply_discounts",...]`)
- standard sync columns (`created_at`, `updated_at`, `_version`, `_synced`, `_synced_at`, `_deleted`)

`users` gains:
- `permission_group_id` (nullable FK). Nullable so a pre-migration row (or a row created before its store's groups have synced down) degrades to the role-string fallback described in Enforcement, rather than being blocked outright.

`stores` gains:
- `permission_groups_seeded_at` (nullable timestamp) — the lazy-seed marker, mirroring `loyalty_defaults_seeded_at`.

Both tables sync exactly like every other store-scoped table (`products`, `categories`, ...) — added to the standard client `SYNC_COLUMN_MIGRATIONS`/schema and the server's syncable `$tables` list in `SyncController`. No special-cased append-only handling is needed (unlike `audit_logs`) — this is an ordinary editable, syncable resource.

**Why not reuse the existing server `roles`/`permissions` tables:** those are platform-scoped (a `Role` row means the same thing for every store) and already carry specific meaning for `super_admin`/`platform_admin`/`agent`. Overloading them to also be per-store, owner-editable groups would risk exactly the kind of cross-tenant/privilege confusion `TenantScopingArchitectureTest` exists to catch. A parallel, store-scoped table is simpler and keeps the two systems from ever needing to agree with each other.

## Permission catalog (~30)

Grouped into 8 categories for the matrix UI:

**Sales & POS:** Process Sales · Apply Discounts · Void / Refund Sales · Open Cash Drawer (no sale) · Override Price at Checkout

**Inventory & Stock:** Manage Products & Categories · Manage Stock Batches · Adjust Stock Counts · Manage Purchase Orders · Receive Purchase Orders · Manage Suppliers · Request Stock Transfers · Approve Incoming Stock Transfers

**Prescriptions:** Dispense Prescriptions · Manage Prescription Records

**Customers & Loyalty:** Manage Customers · Manage Loyalty Program

**Reports & Activity:** View Reports & Analytics · Export / Print Reports · View Activity Log

**Expenses:** Record Expenses · View All Expenses

**Staff & Groups:** Manage Staff · Manage Roles & Permission Groups

**Store & Settings:** Manage Store Settings · Manage Payment Accounts · Manage Online Store · Manage Subscription & Billing · Backup / Restore Local Data · Factory Reset Device

Each permission is a stable string key (e.g. `process_sales`, `manage_roles_permissions`) — the JSON array on each `permission_groups` row is a list of these keys. Mapping each of the ~80 existing hardcoded call sites onto the *correct* specific key(s) from this catalog is implementation-time judgment, verified against that call site's existing tests/behavior — not fully enumerated here.

## Default group seeding

On first touch to a store missing `permission_groups_seeded_at` (client: on app boot via `DatabaseProvider`, same trigger point as other lazy per-store seeding; server: equivalent lazy check on relevant API entry points), create the 5 default groups with `based_on_role` set to their matching role string and `permissions` populated to reproduce today's exact 6-helper behavior for that role. E.g. `manager`'s default group gets every key that `checkIsAdmin`, `checkCanManageStockBatch`, `checkCanProcessSales`, and `checkCanRequestStockTransfer` currently grant a `manager`, and excludes what `checkCanViewAllActivity`/`checkCanFactoryReset` currently deny a `manager`.

Existing staff rows get `permission_group_id` backfilled to the default group matching their current `role` in the same pass.

## Enforcement mechanism

New hook: `useHasPermission(key: string | string[], mode: "any" | "all" = "any")`, backed by a plain `hasPermission(user, groups, key)` function (usable outside React, e.g. sync engine / plain query files — the same shape `checkIsAdmin` already has today).

`store_owner` and `super_admin` always short-circuit to "everything granted" — never group-assigned, can't lock themselves out.

Every other user: look up `permission_group_id` → that group's row (already synced locally) → check key(s) against its `permissions` JSON array.

**Fallback for missing group data** (brand-new device before first sync, or a pre-migration store that hasn't synced its seeded groups down yet): evaluate against a hardcoded copy of today's 6 helpers' logic, keyed by `role` string — identical to current behavior. Once real group data exists locally for that user, it takes over silently. This guarantees no device is ever fully locked out or wide open during the gap.

Call-site migration: every call to one of the 6 old helpers (and their precomputed `auth-context.tsx` booleans `isAdmin`/`canManageStockBatch`/`canProcessSales`/`canViewAllActivity`) is replaced with `useHasPermission(...)` against the specific permission key(s) that call site actually needs. The 6 old helpers and their context-level booleans are deleted once migration is complete (full replacement, not left dangling).

## UI

Replaces `roles-permissions-placeholder.tsx` with a real "Roles & Permissions" panel under Settings > Staff:

- Matrix: permission rows (grouped/collapsible by the 8 categories above) × group columns (5 defaults + any custom groups), checkbox per cell.
- Toolbar: **New Group** (name + base-tier picker dialog; gated by plan — see Plan gating), **Copy Group** (duplicate an existing group's checkbox set into a new custom group, still plan-gated since it results in a new group), **Revert to Default** (per default-group column only).
- Default group columns: name shown as plain text (not editable), no delete action.
- Custom group columns: name editable inline/via dialog, delete action (blocked with a clear message if any active staff are still assigned — reassign first).
- Staff create/edit form (`staff-management.tsx`): the `STAFF_ROLES` dropdown becomes a "Group" dropdown listing that store's groups (defaults + custom). Selecting a group sets both `permission_group_id` and (derived, not separately editable) the underlying `role` to that group's `based_on_role`.

## Plan gating

`useFeatureGate` gains `canCreateCustomPermissionGroups` (and reuses the existing `maxStaffAccounts`-style pattern for a `withRestriction` wrapper on the New Group / Copy Group actions). Editing the 5 default groups' checkboxes is available on every plan — only *creating a new group* is gated. Exact tier cutoff (e.g. Pro+) is a product/pricing decision made at implementation time against the existing plan table, not fixed here.

## Sync & security

- **No privilege escalation via a custom group's checkboxes:** server-side, creating/editing a `permission_groups` row validates that every permission key in the payload is one the *acting* user's own effective permission set already includes (store_owner/admin bypass, as everywhere else). Mirrors the existing `sanitizeUserSyncPayload`/`roleIsAtOrBelowCallerPrivilege` shape — a new `sanitizePermissionGroupSyncPayload` (or an extension of the existing sanitizer family) is the natural home. Note `based_on_role` does **not** cap a group's checkbox set by itself — it only feeds the existing role-hierarchy machinery (e.g. who may assign this group to another staff member, per `roleIsAtOrBelowCallerPrivilege`). The only cap on the checkboxes themselves is the acting user's own effective permissions, exactly as just described.
- **`permission_group_id` self-edit exclusion:** added to `USER_SYNC_FORBIDDEN_FIELDS`/kept out of `USER_SYNC_SELF_ALLOWED_FIELDS`, exactly like `role`/`store_id`/`is_active` today — a staff member must never be able to self-assign into a more powerful group via their own sync push.
- **`manage_staff` vs. `manage_roles_permissions`:** kept as two separate permission keys (matching QuickBooks' own "Modify security rights or groups" being distinct from ordinary employee management) so an owner can let someone manage staff records without letting them redefine what any group is allowed to do.
- Both new tables sync through the standard push/pull path (`ScopesToTenant`, store-id scoping) like any other store-owned resource — no append-only special-casing.

## Testing

- Default-group seeding reproduces today's 6-helper behavior exactly, per role — a table-driven test asserting old-helper-result === new-permission-check-result for every (role, existing call site) pair that's practical to enumerate.
- Fallback path: a user with no synced group data still gets correct role-based behavior.
- Sync privilege-escalation guard: a non-owner cannot push a `permission_groups` edit granting a permission they don't themselves hold.
- `permission_group_id` cannot be self-edited via sync (mirrors existing `role`/`store_id` self-edit tests).
- Default group name/delete immutability enforced both in UI and at the data layer (a direct API/sync call can't rename or delete a default group either).
- Custom group deletion blocked while staff are still assigned; succeeds once reassigned.
