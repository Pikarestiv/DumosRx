"use client";

import { useMemo } from "react";
import { useAdminRoles } from "@/lib/api/admin-hooks-roles";
import {
  mergePlatformRoleOptions,
  type PlatformRoleOption,
} from "@/lib/constants/platform-roles";

/** The role picker's options: the 3 built-ins plus every custom platform
 * role. `enabled` must be false for a viewer who is not a super_admin, since
 * GET /admin/roles is super_admin-only and would 403 silently. */
export function usePlatformRoleOptions(enabled = true): PlatformRoleOption[] {
  const { data } = useAdminRoles(enabled);

  return useMemo(() => mergePlatformRoleOptions(data?.roles), [data]);
}
