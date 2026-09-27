import { query, transaction, getActiveStoreId, generateId } from "@/lib/db/core";
import { insert, update } from "@/lib/db/base-helpers";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";

/**
 * Seeds the 5 default permission groups (Manager, Specialist, Sales Staff,
 * Auditor, Admin) the first time this feature touches a store, exactly
 * mirroring ensureLoyaltyDefaultsSeeded's gate-on-timestamp pattern (see
 * lib/db/queries/loyalty.ts) - gated on stores.permission_groups_seeded_at
 * rather than "zero groups exist right now", so a store that deliberately
 * deletes a custom group (or, in principle, all groups) never gets
 * silently reseeded.
 */
export async function ensurePermissionGroupsSeeded(): Promise<void> {
  const storeId = getActiveStoreId();
  if (!storeId) return;

  await transaction(async () => {
    const stores = await query<{ id: string; permission_groups_seeded_at: string | null }>(
      "SELECT id, permission_groups_seeded_at FROM stores WHERE id = ?",
      [storeId],
    );
    if (stores.length === 0 || stores[0].permission_groups_seeded_at) return;

    const labels: Record<keyof typeof DEFAULT_GROUP_PERMISSIONS, string> = {
      admin: "Admin",
      manager: "Manager",
      specialist: "Specialist",
      sales_staff: "Sales Staff",
      auditor: "Auditor",
    };

    for (const role of Object.keys(DEFAULT_GROUP_PERMISSIONS) as (keyof typeof DEFAULT_GROUP_PERMISSIONS)[]) {
      await insert("permission_groups", {
        id: generateId(),
        store_id: storeId,
        name: labels[role],
        based_on_role: role,
        is_default: 1,
        permissions: JSON.stringify(DEFAULT_GROUP_PERMISSIONS[role]),
      });
    }

    await update("stores", storeId, {
      permission_groups_seeded_at: new Date().toISOString(),
    });
  });
}

export async function getUserPermissionGroup(
  userId: string,
): Promise<{ id: string; permissions: string[] } | null> {
  const rows = await query<{ id: string; permissions: string }>(
    `SELECT pg.id, pg.permissions FROM permission_groups pg
     JOIN users u ON u.permission_group_id = pg.id
     WHERE u.id = ? AND (pg._deleted = 0 OR pg._deleted IS NULL)`,
    [userId],
  );
  if (rows.length === 0) return null;
  try {
    return { id: rows[0].id, permissions: JSON.parse(rows[0].permissions) };
  } catch {
    return null;
  }
}

/** Every group belonging to the active store - powers the Roles &
 * Permissions matrix UI (Task 9). */
export async function getStorePermissionGroups() {
  const storeId = getActiveStoreId();
  const rows = await query<{
    id: string; name: string; based_on_role: string; is_default: number; permissions: string;
  }>(
    `SELECT id, name, based_on_role, is_default, permissions FROM permission_groups
     WHERE (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
     ORDER BY is_default DESC, name ASC`,
    storeId ? [storeId] : [],
  );
  return rows.map((r) => ({ ...r, permissions: JSON.parse(r.permissions) as string[] }));
}
