"use client";

import { useCallback, useEffect, useState } from "react";
import { insert, update, softDelete, generateId } from "@/lib/db/local-database";
import { query } from "@/lib/db/core";
import { getStorePermissionGroups } from "@/lib/db/queries/permission-groups";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";

export interface PermissionGroupRow {
  id: string;
  name: string;
  based_on_role: string;
  is_default: number;
  permissions: string[];
}

/** Never deletes a default group (immutable by design - see Global
 * Constraints), and blocks deleting a custom group with staff still
 * assigned (reassign first). Both refusals throw, so a caller can always
 * tell a refusal from a success, and the default-group check runs first so
 * the reported reason is the fundamental one rather than a reassignment
 * instruction that would never unblock the delete. A staff row with a NULL
 * is_active counts as assigned, matching the NULL-tolerant boolean handling
 * used for _deleted throughout the query layer. Standalone/testable without
 * a React render harness, and reused by the hook's own deleteGroup
 * callback. */
export async function deletePermissionGroup(groupId: string): Promise<void> {
  const groups = await getStorePermissionGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group) throw new Error("That group no longer exists.");
  if (group.is_default) {
    throw new Error("Cannot delete a default group - default groups are permanent.");
  }
  const assigned = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM users WHERE permission_group_id = ? AND (is_active = 1 OR is_active IS NULL)`,
    [groupId],
  );
  if ((assigned[0]?.count ?? 0) > 0) {
    throw new Error("Cannot delete a group with staff assigned - reassign them first.");
  }
  await softDelete("permission_groups", groupId);
}

/** Restores a default group's original seeded permission set - standalone/
 * testable without a React render harness, and reused by the hook's own
 * revertToDefault callback. No-op for a custom (non-default) group. */
export async function revertGroupToDefault(groupId: string): Promise<void> {
  const groups = await getStorePermissionGroups();
  const group = groups.find((g) => g.id === groupId);
  if (!group || !group.is_default) return;
  const defaults = DEFAULT_GROUP_PERMISSIONS[group.based_on_role as keyof typeof DEFAULT_GROUP_PERMISSIONS];
  if (!defaults) return;
  await update("permission_groups", groupId, { permissions: JSON.stringify(defaults) });
}

export function usePermissionGroups() {
  const [groups, setGroups] = useState<PermissionGroupRow[]>([]);

  const reload = useCallback(async () => {
    const rows = await getStorePermissionGroups();
    setGroups(rows as PermissionGroupRow[]);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggle = useCallback(
    async (groupId: string, key: string, granted: boolean) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group) return;
      const next = granted
        ? Array.from(new Set([...group.permissions, key]))
        : group.permissions.filter((k) => k !== key);
      await update("permission_groups", groupId, { permissions: JSON.stringify(next) });
      await reload();
    },
    [groups, reload],
  );

  const createGroup = useCallback(
    async (name: string, basedOnRole: string) => {
      await insert("permission_groups", {
        id: generateId(),
        name,
        based_on_role: basedOnRole,
        is_default: 0,
        permissions: "[]",
      });
      await reload();
    },
    [reload],
  );

  const copyGroup = useCallback(
    async (sourceId: string, name: string) => {
      const source = groups.find((g) => g.id === sourceId);
      if (!source) return;
      await insert("permission_groups", {
        id: generateId(),
        name,
        based_on_role: source.based_on_role,
        is_default: 0,
        permissions: JSON.stringify(source.permissions),
      });
      await reload();
    },
    [groups, reload],
  );

  const revertToDefault = useCallback(
    async (groupId: string) => {
      await revertGroupToDefault(groupId);
      await reload();
    },
    [reload],
  );

  const renameGroup = useCallback(
    async (groupId: string, name: string) => {
      const group = groups.find((g) => g.id === groupId);
      if (!group || group.is_default) return; // defaults are immutable by name - Global Constraints
      await update("permission_groups", groupId, { name });
      await reload();
    },
    [groups, reload],
  );

  const deleteGroup = useCallback(
    async (groupId: string) => {
      await deletePermissionGroup(groupId);
      await reload();
    },
    [reload],
  );

  return { groups, toggle, createGroup, copyGroup, revertToDefault, renameGroup, deleteGroup };
}
