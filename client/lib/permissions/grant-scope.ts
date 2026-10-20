// Who may grant which permission keys, mirroring the server's own rule in SyncController::sanitizePermissionGroupSyncPayload() so the Roles &…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#permissions-grant-scope-ts-L1

// The roles the server lets through before it ever compares payload keys against the caller's own grants.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#permissions-grant-scope-ts-L11
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

// The server reads the caller's own keys from their permission group row alone - it has no role-based fallback - so a caller with no group can…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#permissions-grant-scope-ts-L30
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

// The keys a group already holds that this caller could not grant.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#permissions-grant-scope-ts-L48
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
