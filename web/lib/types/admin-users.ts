export interface AdminUser {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email: string;
  /** Humanized for display (e.g. "Store Owner"). Use `role_slug` for any
   * role-gated logic, not this. */
  role: string;
  /** Raw role slug (e.g. "store_owner", "admin"): the source of truth for
   * role-based UI logic. */
  role_slug?: string;
  store?: string;
  /** Id of the store this account owns, else the store it is staff at, else
   * null for a platform-level account. Mirrors `store` (the display name). */
  store_id?: string | null;
  /** True only when the account OWNS a store (stores.user_id), as opposed to
   * working at one (users.store_id). See `AdminAccountType`. */
  is_store_owner?: boolean;
  lastActive?: string;
  joinedAt?: string;
  status: string;
  deletionRequested?: boolean;
  /** Not yet returned by `GET /admin/users` — see docs/KNOWN_BUGS.md A-133. */
  effective_permissions?: string[];
  /** Relative time ("5 minutes ago") of this account's most recently
   * synced device, or null if it has never synced. Login activity
   * (`lastActive` above) and sync activity are tracked separately - a
   * staff member can be logged in on a device that hasn't synced yet. */
  lastSyncedAt?: string | null;
  /** That device's human-readable label (e.g. "Chrome on Windows"), falling
   * back to its raw id if unlabeled. See `useStaffDevices` for the full
   * per-device history. */
  /** Legacy label-or-id string, kept for older bundles; prefer the pair below. */
  lastSyncDevice?: string | null;
  lastSyncDeviceId?: string | null;
  lastSyncDeviceLabel?: string | null;
  /** Server-computed hint that this row's deletion would be refused;
   * advisory only — the server still enforces it on delete. */
  can_delete?: boolean;
}

/** One row of a staff member's full sync history - `GET
 * /admin/users/{id}/devices`, most recent first. */
export interface AdminUserDevice {
  deviceId: string;
  deviceLabel: string | null;
  storeId: string | null;
  lastSyncedAt: string | null;
  lastSyncedAtIso: string | null;
}

/** The 3 built-in platform roles. NOT the full set `PUT /admin/users/{id}`
 * accepts: that endpoint validates against `UpdatesUserProfiles::platformRoleSlugs()`,
 * which also includes every custom platform role. Any UI offering or
 * validating a role must merge these with `useAdminRoles()` (see
 * `mergePlatformRoleOptions()`); these 3 are only the always-present floor.
 * Store-tenant roles stay unassignable from the platform panel either way. */
export const PLATFORM_ROLE_SLUGS = ["super_admin", "platform_admin", "agent"] as const;

export type BuiltInPlatformRoleSlug = (typeof PLATFORM_ROLE_SLUGS)[number];

/** A platform role slug: one of the 3 built-ins or a custom role's slug. */
export type PlatformRoleSlug = string;

/** The field scope of PUT /admin/users/{id}. Password, account status and
 * plan deliberately stay with their own endpoints. */
export interface AdminUserProfileUpdate {
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  email?: string;
  role?: PlatformRoleSlug;
}

/** `account_type` on GET /admin/users. "owners" own a store, "staff" work at
 * one, "platform" have no store affiliation at all; omitting it returns
 * every account. */
export type AdminAccountType = "owners" | "staff" | "platform";
