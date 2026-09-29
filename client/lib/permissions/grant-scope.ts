/** Who may grant which permission keys, mirroring the server's own rule in
 * SyncController::sanitizePermissionGroupSyncPayload() so the Roles &
 * Permissions matrix can show the truth up front instead of letting a push
 * be rejected as `permission_denied` and silently reverted by the next pull.
 *
 * This is a UX honesty layer, not a security boundary - the server check is
 * the boundary, and this file exists only to say the same thing the server
 * would say, before the edit is made.
 */

/** The roles the server lets through before it ever compares payload keys
 * against the caller's own grants. `admin` is in the server's list next to
 * store_owner/super_admin even though hasPermission()'s short-circuit omits
 * it, and this list follows the server, not hasPermission(). */
export const UNRESTRICTED_GRANT_ROLES = ["store_owner", "admin", "super_admin"] as const;

export interface PermissionGrantScope {
  unrestricted: boolean;
  ownPermissions: readonly string[];
}

export function normalizeGrantRole(role: string | null | undefined): string {
  return (role ?? "").toLowerCase().replace(/[^a-z_]/g, "");
}

export function isUnrestrictedGrantRole(role: string | null | undefined): boolean {
  return (UNRESTRICTED_GRANT_ROLES as readonly string[]).includes(normalizeGrantRole(role));
}

/** The server reads the caller's own keys from their permission group row
 * alone - it has no role-based fallback - so a caller with no group can
 * grant nothing, and this mirrors that rather than hasPermission()'s
 * fallbackPermissions(). */
export function buildGrantScope(
  role: string | null | undefined,
  ownPermissions: readonly string[] | null | undefined,
): PermissionGrantScope {
  return {
    unrestricted: isUnrestrictedGrantRole(role),
    ownPermissions: ownPermissions ?? [],
  };
}

export function canGrantPermission(scope: PermissionGrantScope, key: string): boolean {
  return scope.unrestricted || scope.ownPermissions.includes(key);
}

/** The keys a group already holds that this caller could not grant. The
 * server checks the WHOLE resulting `permissions` array, not just the key
 * that changed, so any edit at all to such a group is rejected - which is
 * why a non-empty result locks the group's entire column, not one cell. */
export function getUngrantablePermissions(
  scope: PermissionGrantScope,
  groupPermissions: readonly string[],
): string[] {
  if (scope.unrestricted) return [];
  return groupPermissions.filter((key) => !scope.ownPermissions.includes(key));
}

export function isGroupEditable(scope: PermissionGrantScope, groupPermissions: readonly string[]): boolean {
  return getUngrantablePermissions(scope, groupPermissions).length === 0;
}
