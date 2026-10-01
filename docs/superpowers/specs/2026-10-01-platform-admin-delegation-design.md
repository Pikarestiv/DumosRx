# Platform Admin Delegation

**Date:** 2026-10-01
**Status:** Design drafted, awaiting user review

## Background

Today every `/admin/*` capability beyond a thin sliver (`manage_platform`, `create_accounts`, `grant_trials` — `RolesAndPermissionsSeeder.php`) is hardcoded `role:super_admin` in `routes/api.php`: stores, platform users, activity logs, broadcasts, coupons, revenue, health, impersonation — all of it. The `platform_admin` and `agent` roles exist but are nearly inert. The superadmin (the user) wants to delegate day-to-day platform operation to admins to reduce their own load, while retaining full visibility and the ability to override anything, and without exposing any path by which a delegated admin could extract money, grant themselves/others paid access, or seize another admin's identity.

This is **not** the store-level "Roles & Permissions" feature already specced in `2026-09-27-roles-and-permissions-design.md` (staff permission groups, client-side, per-store, syncable). That spec explicitly scopes out the platform-level `Role`/`Permission` system as a separate concern — this document is that separate concern. The two systems share no tables and must stay independent, exactly as the prior spec already requires.

## Existing patterns this builds on

- `roles` / `permissions` / `permission_role` tables (`database/migrations/2024_01_20_000001_create_roles_permissions_tables.php`) — real many-to-many platform-level RBAC, already seeded with `super_admin` / `platform_admin` / `agent` and a handful of permission slugs.
- `permission_user` pivot (`database/migrations/2026_05_17_094947_create_permission_user_table.php`) — a direct per-user permission grant table that exists today but has zero application code reading or writing it. This spec is what finally uses it.
- `User::hasPermission()` (`app/Models/User.php:213`) — already checks a direct `permissions()` relation before falling back to the user's role's permissions. This spec extends its direct-grant check to also support an explicit denial, rather than adding new resolution machinery.
- `CheckPermission` middleware (`app/Http/Middleware/CheckPermission.php`) — already gives `super_admin` an unconditional bypass. This is what makes "monitor and override" free: super_admin never loses access to anything, delegated or not.
- `AdminPlatformService::getActivityLogs()` — already supports a `user_id` filter; this spec adds an `actor_role` filter alongside it rather than building new audit infrastructure.

## Goals

- A superadmin can turn 5 specific capabilities on or off for the `platform_admin` and `agent` roles, from a UI, without a deploy.
- A superadmin can additionally grant a capability to one specific admin beyond their role's defaults, or revoke a capability from one specific admin that their role would otherwise grant them — without changing the role itself or moving them to a different role.
- The 5 capabilities are exactly: view platform data (stores/users/activity logs), send notifications/broadcasts, reset a user's password, suspend/reactivate a store or user, and store impersonation.
- A fixed set of actions never becomes delegatable through this system at all: granting trials/plans, coupons/referral payouts, editing another user's or admin's profile/role, deleting a user/store, and editing platform/subscription settings (including the plan-feature toggles from `2026_09_27_... ai_assistant` work). These stay hardcoded `role:super_admin`, completely outside this feature's reach — not even expressible as a permission an admin could be granted.
- A superadmin can filter the existing Activity Log to just what platform_admin/agent accounts have done, to audit delegated work without wading through their own actions.
- Every admin-facing nav item and action button in `web/` reflects the viewer's actual permissions — nothing renders a control that will just 403 on click (per `laravel-server/AGENTS.md`'s existing "backend verification isn't UI verification" rule).
- A superadmin can create a new named platform role beyond the 3 built-ins (e.g. "Support Lead"), choosing which of the 5 delegatable capabilities it carries — mirroring the client-side custom permission-group pattern from `2026-09-27-roles-and-permissions-design.md` (name + checkbox set, not a privilege-tier rewrite), scoped to the platform level instead of a store.

## Non-goals

- No change to the store-level staff permission-groups system (separate spec, separate tables, separate concern).
- No "undo" or action-reversal tooling. Super_admin's existing unconditional bypass means every delegated action is already independently reversible by the superadmin performing the opposite action themselves (reactivate what was suspended, etc.) — building a parallel undo mechanism would duplicate a capability that already exists.
- No per-store scoping of admin permissions (an admin with `manage_account_status` can act on any store, not a subset) — this product has no concept of partitioning the platform admin team by store today, and inventing one is out of scope here.
- No notification to an admin when their permissions change, and no self-service permission request flow — purely superadmin-driven.
- No privilege-tier concept for custom platform roles (unlike the store-level feature's `based_on_role`) — there is no multi-level platform staff hierarchy to anchor one to. A custom platform role is just a name plus a subset of the 5 capabilities; it can never include the never-delegatable actions, exactly like `platform_admin`/`agent` can't.
- No plan-gating on creating a custom platform role — unlike the store-level feature, the superadmin isn't a paying customer of their own admin panel, so the plan-gating concept doesn't apply here.

## Data model

**One new column, no new tables:**

`permission_user` gains `granted` (boolean, default `true`). Every row written by this feature's "grant extra" action sets it `true`; every row written by its "revoke a role default" action sets it `false`. Existing code that only ever reads `permission_user` for presence (none exists today — the table is currently unused) is unaffected by the default.

Five new permission slugs seeded onto `platform_admin` and `agent` via `permission_role` (`RolesAndPermissionsSeeder.php`), matching the matrix below. No new slug is created for any of the never-delegatable actions — they simply never get a `permission:*` middleware entry, so there is nothing to grant even via a `permission_user` override.

| Permission slug | `platform_admin` default | `agent` default |
|---|---|---|
| `view_platform_data` | granted | granted |
| `send_notifications` | granted | granted |
| `reset_user_passwords` | granted | — |
| `manage_account_status` | granted | — |
| `impersonate_store` | granted | — |

**Custom roles** are ordinary new rows in the existing `roles` table (no schema change — the table already supports an arbitrary slug/name, it's just never been given a creation UI) with their own `permission_role` rows drawn from the same 5 slugs. `super_admin`/`platform_admin`/`agent` gain an `is_system` flag (new column on `roles`, default `true` for the 3 seeded rows, `false` for anything created through this feature) so the UI and the delete endpoint can refuse to rename or delete a built-in role without a separate hardcoded slug check.

## Enforcement mechanism

`User::hasPermission($slug)` becomes:

1. `super_admin` → always true (unchanged — the existing bypass in `CheckPermission`, mirrored here for any direct model-level check).
2. Direct `permission_user` row exists for this user+slug → return its `granted` value, full stop. This is authoritative in both directions: a `true` row grants even if the role wouldn't, a `false` row denies even if the role would.
3. No direct row → fall back to whether the user's role has this slug via `permission_role` (today's existing behavior, unchanged).

This is a 3-line change to one existing method, not new resolution machinery.

**Route wiring:** the 5 routes behind the capabilities above move from `role:super_admin` to `permission:<slug>`. Every other admin route is untouched — this spec only touches the specific endpoints matching the 5 delegated capabilities, found by cross-referencing the capability list against the route group in `routes/api.php:182-226`.

**Interaction with the just-shipped superadmin profile-edit feature:** `AdminUserService::PLATFORM_ROLES` (the hardcoded `['super_admin', 'platform_admin', 'agent']` whitelist the profile-edit endpoint validates `role` against) must become a dynamic lookup against the `roles` table's platform-scoped rows instead of a fixed array, so a superadmin can actually assign a newly-created custom role to a user through the existing profile-edit UI. This is a required follow-on change to already-merged code, not new surface area — the two self-protection guards (`assertNotSelfRoleChange`, `assertNotLastActiveSuperAdmin`) are untouched, since both key specifically on the literal `super_admin` slug, which remains a fixed concept regardless of how many custom roles exist alongside it.

## UI

Two additions to the existing `web/` admin panel, both inside Platform Settings (next to the plan-tier editor, not a new top-level section):

**1. "Admin Permissions" card** — a 5-row × N-column checkbox matrix (`platform_admin`, `agent`, plus any custom roles), one row per capability above, editing each role's defaults via `permission_role`. Saves through a new endpoint following the existing `subscription-config-tab.tsx` → `PUT /admin/system-configs/{key}`-style pattern (a `PUT /admin/roles/{role}/permissions` endpoint, `role:super_admin`-gated, replacing that role's `permission_role` rows for these 5 slugs in one call). Toolbar gains **New Role** (name + the same 5-checkbox picker, `POST /admin/roles`) and, per custom-role column only, **Delete Role** (`DELETE /admin/roles/{role}`, blocked with a clear error if any user currently holds it — mirroring the store-level feature's "reassign staff first" rule). Built-in columns (`is_system = true`) show their name as plain text with no delete action, exactly like the store-level feature's default groups.

**2. Per-admin override section**, added to the existing `user-profile-dialog.tsx` (the same dialog Opus just gave an edit mode) as a new "Permissions" tab, shown only when viewing a `platform_admin`/`agent` account (not `super_admin` — super_admin's bypass makes permission editing meaningless for that role, so the tab doesn't render for one). Each of the 5 capabilities shows a 3-state control: **Inherited** (shows the role's current default, greyed, no override row exists), **Granted** (explicit override, writes `permission_user` with `granted=true`), **Revoked** (explicit override, writes `permission_user` with `granted=false`). Returning a row to "Inherited" deletes the override row rather than storing a third state value — the absence of a row *is* "inherited," per the enforcement mechanism above.

**3. Team Activity filter** on the existing Activity Log page (`web/app/admin/activity/page.tsx`) — a new "Actor role" dropdown (All / Super Admin / Platform Admin / Agent) alongside the existing user/store/date filters, backed by a new `actor_role` parameter on `AdminPlatformService::getActivityLogs()` (a join against `users.role` or the resolved role, implementation's call which is cleaner given the existing query shape).

**4. Nav/action gating:** every admin nav item and action button whose target route now carries a `permission:*` middleware gets wrapped in a client-side permission check (the admin panel's existing auth-state store is the natural place to read the viewer's resolved permission set from, fetched once at login) so a `platform_admin` without `impersonate_store`, for example, never sees the impersonate button at all, rather than seeing it 403. This directly follows `laravel-server/AGENTS.md`'s existing standing rule that a permission change must be verified in the browser, not just via `tinker`/API tests.

## Security

- **The never-delegatable list is enforced by omission, not by a deny rule** — those actions simply have no `permission:*` slug wired to their route at all, so there is no `permission_user` row that could ever grant them. A superadmin cannot accidentally expose one of them through the override UI because the UI only ever offers the 5 slugs that exist.
- **Self-service escape hatch check:** can a `platform_admin` with `view_platform_data` + nothing else reach any of the reserved actions indirectly (e.g. via a list endpoint that embeds an action link)? Each of the 5 newly-permission-gated endpoints must be re-verified independently against the full reserved-action list during implementation — this is a review item for the implementation pass, not assumed safe here.
- **Permission changes are themselves audited:** both the role-default edit and the per-admin override write an `ActivityLog` row (`ROLE_PERMISSIONS_UPDATED`, `USER_PERMISSION_OVERRIDE_SET`/`_CLEARED`), following the existing `ActivityLog::create([...])` convention, with a before/after diff in `properties` — matching the pattern just established by the superadmin profile-edit feature.
- **No lock-out risk:** `super_admin` never passes through the permission system at all (step 1 of enforcement), so there is no sequence of permission edits that could leave the platform without an admin capable of administering it. The already-shipped "can't demote the last active super_admin" guard (A-127 work) is the relevant safety net for the *role itself*; this feature only touches `platform_admin`/`agent`/custom roles, where there is no equivalent scarcity concern.
- **A custom role can never exceed the 5-slug catalog:** `POST /admin/roles`'s permission payload is validated against the same fixed list of 5 slugs as the role-default editor — there is no free-text permission slug field anywhere in this feature, so a custom role creation request can't smuggle in a never-delegatable action by naming it directly.
- **Built-in role protection:** `PUT`/`DELETE /admin/roles/{role}` reject any request targeting an `is_system = true` role (rename or delete) regardless of payload — the 3 seeded roles are permanent.

## Testing

- `hasPermission()` resolution: role grants + no override = granted; role grants + override `false` = denied; role denies + override `true` = granted; role denies + no override = denied; `super_admin` always granted regardless of any row.
- Each of the 5 newly-gated routes: `platform_admin`/`agent` with the permission succeeds; without it, 403; `super_admin` always succeeds regardless of any `permission_role`/`permission_user` state (bypass).
- The never-delegatable routes are unaffected — a `platform_admin` granted every one of the 5 new slugs still gets 403 on e.g. grant-trial, delete-user, edit-another-admin's-profile, and the subscription-config endpoints.
- Role-default edit endpoint: updates `permission_role` for the 5 slugs only, writes the audit log, a non-super_admin gets 403.
- Per-admin override: grant, revoke, and clear-back-to-inherited each produce the correct `permission_user` state and the correct audit log entry.
- Team Activity filter: `actor_role` correctly narrows results; combining it with the existing `user_id`/date filters still works.
- Web: nav/action items hide correctly per permission (component test using a mocked permission set, following whatever pattern `web/`'s existing admin component tests use); the Permissions tab doesn't render for a `super_admin` target user.
- A real logged-in browser smoke test (per `laravel-server/AGENTS.md`'s standing rule) covering at least one delegated action end-to-end as a `platform_admin` account: nav item visible, action succeeds, then revoke the permission and confirm the nav item disappears.
- Custom role creation: a new role with a chosen subset of the 5 slugs behaves identically to a built-in role with the same subset for every permission check above; a payload naming a non-catalog slug is rejected.
- Built-in role immutability: renaming or deleting `super_admin`/`platform_admin`/`agent` is rejected both via the UI and a direct API call.
- Custom role deletion is blocked while any user holds it, and succeeds once they're reassigned — mirroring the store-level feature's equivalent test.
- The profile-edit endpoint's role whitelist accepts a custom role slug once created, and still rejects a store-tenant role slug (regression test for the dynamic-lookup change).
