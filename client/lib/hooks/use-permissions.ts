"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";
import { buildGrantScope, type PermissionGrantScope } from "@/lib/permissions/grant-scope";

type MinimalUser = { role: string; id?: string } | null | undefined;
type MinimalGroup = { permissions: string[]; userId?: string } | null | undefined;

/** A group loaded for another user must never govern the acting one: on a
 * lock-screen account switch (user -> user, no logout) AuthContext still
 * holds the outgoing user's group until the async read for the incoming user
 * resolves. A mismatch is treated as "no group yet" so the acting user falls
 * back to their own role tier - see docs/FIXED_BUGS.md (A-55). */
function belongsToUser(user: MinimalUser, group: MinimalGroup): boolean {
  if (!group?.userId || !user?.id) return true;
  return group.userId === user.id;
}

/**
 * Fallback used whenever a user has no synced permission_groups row yet
 * (brand-new device before first sync, or a store that predates this
 * feature) - reproduces today's exact 6-helper behavior by role, so no
 * device is ever fully locked out or wide open during that gap. Once real
 * group data exists locally, hasPermission() uses it instead (see below).
 */
function fallbackPermissions(role: string): string[] {
  const normalized = role.toLowerCase().replace(/[^a-z_]/g, "");
  if (normalized === "store_owner" || normalized === "super_admin" || normalized === "admin") {
    return DEFAULT_GROUP_PERMISSIONS.admin;
  }
  if (normalized === "manager") return DEFAULT_GROUP_PERMISSIONS.manager;
  if (normalized === "specialist") return DEFAULT_GROUP_PERMISSIONS.specialist;
  if (normalized === "sales_staff") return DEFAULT_GROUP_PERMISSIONS.sales_staff;
  if (normalized === "auditor") return DEFAULT_GROUP_PERMISSIONS.auditor;
  return [];
}

/** Pure, usable outside React (sync engine, plain query files) - same
 * shape checkIsAdmin etc. already had. store_owner/super_admin always
 * grant everything, matching today's behavior where the owner can never
 * lock themselves out. */
export function hasPermission(
  user: MinimalUser,
  group: MinimalGroup,
  key: string | string[],
  mode: "any" | "all" = "any",
): boolean {
  if (!user || !user.role) return false;
  const normalized = user.role.toLowerCase().replace(/[^a-z_]/g, "");
  if (normalized === "store_owner" || normalized === "super_admin") return true;

  const ownGroup = belongsToUser(user, group) ? group : null;
  const granted = ownGroup?.permissions ?? fallbackPermissions(user.role);
  const keys = Array.isArray(key) ? key : [key];
  return mode === "all" ? keys.every((k) => granted.includes(k)) : keys.some((k) => granted.includes(k));
}

/** The acting session's own permission group id, or null when they have
 * none (store_owner/super_admin are never group-assigned, and so is a user
 * whose store's groups haven't synced down yet). Lets the Roles &
 * Permissions matrix single out the column the acting user themselves
 * belongs to - see its self-lockout guard. */
export function useOwnPermissionGroupId(): string | null {
  const { user, permissionGroup } = useAuth();

  // useMemo, not a bare `return permissionGroup?.id ?? null`, for the same
  // rules-of-hooks reason spelled out on useHasPermission below.
  return useMemo(
    () => (belongsToUser(user, permissionGroup) ? permissionGroup?.id ?? null : null),
    [user, permissionGroup],
  );
}

/** What the acting session is allowed to GRANT to a permission group, as
 * opposed to what it is allowed to do. The two differ: the sync server lets
 * store_owner/admin/super_admin grant anything and holds everyone else to
 * the keys their own group row carries, with no role-based fallback. Used
 * by the Roles & Permissions matrix to disable what the server would
 * reject - see lib/permissions/grant-scope.ts. */
export function useOwnGrantScope(): PermissionGrantScope {
  const { user, permissionGroup } = useAuth();

  return useMemo(
    () =>
      buildGrantScope(
        user?.role,
        belongsToUser(user, permissionGroup) ? permissionGroup?.permissions : undefined,
      ),
    [user, permissionGroup],
  );
}

/**
 * React hook: checks the acting session's permission group via
 * hasPermission(). Returns false while loading/logged out, matching how the
 * old precomputed booleans defaulted to false with no user.
 *
 * Reads the group from AuthContext, which owns the single copy of that state
 * (its query, its `dumos_sync_completed` listener). This hook used to keep its
 * own useState/useEffect/query/listener, so all 26+ call sites re-ran the
 * synchronous sql.js read independently on every sync cycle and could
 * transiently disagree with each other and with AuthContext's own booleans.
 *
 * The useMemo is load-bearing beyond memoization, and must NOT be collapsed
 * into a plain `return hasPermission(...)`: useContext does not occupy a slot
 * in React's hook list, so a useHasPermission that only read context would make
 * a CONDITIONAL call (e.g. the short-circuited `&&` chain that
 * pos-layout-header.tsx once had) fail silently instead of throwing
 * "Rendered more hooks than during the previous render". useMemo keeps that
 * tripwire armed. See __tests__/pos-layout-header-rules-of-hooks.test.tsx,
 * which asserts the crash still happens.
 */
export function useHasPermission(key: string | string[], mode: "any" | "all" = "any"): boolean {
  const { user, permissionGroup } = useAuth();

  const serializedKey = Array.isArray(key) ? key.join("|") : key;

  return useMemo(
    () => hasPermission(user, permissionGroup, key, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, permissionGroup, serializedKey, mode],
  );
}
