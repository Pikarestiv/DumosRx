"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";
import { buildGrantScope, type PermissionGrantScope } from "@/lib/permissions/grant-scope";

type MinimalUser = { role: string; id?: string } | null | undefined;
type MinimalGroup = { permissions: string[]; userId?: string } | null | undefined;

// A group loaded for another user must never govern the acting one:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-permissions-ts-L11
function belongsToUser(user: MinimalUser, group: MinimalGroup): boolean {
  if (!group?.userId || !user?.id) return true;
  return group.userId === user.id;
}

// Fallback used whenever a user has no synced permission_groups row yet (brand-new device before first sync, or a store that predates this fea…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-permissions-ts-L21
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

// Pure, usable outside React (sync engine, plain query files) - same shape checkIsAdmin etc.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-permissions-ts-L40
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

// The acting session's own permission group id, or null when they have none (store_owner/super_admin are never group-assigned, and so is a use…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-permissions-ts-L60
export function useOwnPermissionGroupId(): string | null {
  const { user, permissionGroup } = useAuth();

  // useMemo, not a bare `return permissionGroup?.id ?? null`, for the same
  // rules-of-hooks reason spelled out on useHasPermission below.
  return useMemo(
    () => (belongsToUser(user, permissionGroup) ? permissionGroup?.id ?? null : null),
    [user, permissionGroup],
  );
}

// What the acting session is allowed to GRANT to a permission group, as opposed to what it is allowed to do.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-permissions-ts-L76
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

// React hook: checks the acting session's permission group via hasPermission().
// Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-permissions-L95
export function useHasPermission(key: string | string[], mode: "any" | "all" = "any"): boolean {
  const { user, permissionGroup } = useAuth();

  const serializedKey = Array.isArray(key) ? key.join("|") : key;

  return useMemo(
    () => hasPermission(user, permissionGroup, key, mode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, permissionGroup, serializedKey, mode],
  );
}
