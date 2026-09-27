"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { getUserPermissionGroup } from "@/lib/db/queries/permission-groups";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";

type MinimalUser = { role: string } | null | undefined;
type MinimalGroup = { permissions: string[] } | null | undefined;

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
  if (!user) return false;
  const normalized = user.role.toLowerCase().replace(/[^a-z_]/g, "");
  if (normalized === "store_owner" || normalized === "super_admin") return true;

  const granted = group?.permissions ?? fallbackPermissions(user.role);
  const keys = Array.isArray(key) ? key : [key];
  return mode === "all" ? keys.every((k) => granted.includes(k)) : keys.some((k) => granted.includes(k));
}

/** React hook: resolves the current session's permission group (loaded
 * once per user id) and checks it via hasPermission(). Returns false while
 * loading/logged out, matching how the old precomputed booleans defaulted
 * to false with no user. */
export function useHasPermission(key: string | string[], mode: "any" | "all" = "any"): boolean {
  const { user } = useAuth();
  const [group, setGroup] = useState<{ permissions: string[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setGroup(null);
      return;
    }
    getUserPermissionGroup(user.id).then((g) => {
      if (!cancelled) setGroup(g);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return hasPermission(user, group, key, mode);
}
