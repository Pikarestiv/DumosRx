import { query, transaction, getActiveStoreId } from "@/lib/db/core";
import { insert, update } from "@/lib/db/base-helpers";
import {
  ALL_GROUP_PERMISSION_ADDITIONS,
  DEFAULT_GROUP_PERMISSIONS,
  DEFAULT_GROUP_PERMISSION_ADDITIONS,
  PERMISSION_CATALOG_VERSION,
  type DefaultGroupRole,
} from "@/lib/constants/permissions";

// Deterministic, UUID-shaped id derived from (storeId, role) - NOT random, unlike generateId().
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-permission-groups-L10
function deterministicDefaultGroupId(storeId: string, role: string): string {
  const seed = `permission-group-default:${storeId}:${role}`;
  const lanes = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35].map((seedOffset) => {
    let h = seedOffset;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  });
  const [a, b, c, d] = lanes;
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-${((parseInt(c[0], 16) & 0x3) | 0x8).toString(16)}${c.slice(1, 4)}-${d}${c.slice(4, 8)}`;
}

// Seeds the 5 default permission groups (Manager, Specialist, Sales Staff, Auditor, Admin) the first time this feature touches a store, exactl…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-permission-groups-L42
export async function ensurePermissionGroupsSeeded(): Promise<void> {
  const storeId = getActiveStoreId();
  if (!storeId) return;

  await transaction(async () => {
    const stores = await query<{ id: string; permission_groups_seeded_at: string | null }>(
      "SELECT id, permission_groups_seeded_at FROM stores WHERE id = ?",
      [storeId],
    );
    if (stores.length === 0 || stores[0].permission_groups_seeded_at) return;

    // Second guard, matching ensureLoyaltyDefaultsSeeded's own double-check (tiers.length === 0 in addition to the timestamp):
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-permission-groups-ts-L39
    const existingGroups = await query<{ based_on_role: string }>(
      `SELECT based_on_role FROM permission_groups WHERE store_id = ? AND (_deleted = 0 OR _deleted IS NULL)`,
      [storeId],
    );
    const existingRoles = new Set(existingGroups.map((g) => g.based_on_role));

    const labels: Record<keyof typeof DEFAULT_GROUP_PERMISSIONS, string> = {
      admin: "Admin",
      manager: "Manager",
      specialist: "Specialist",
      sales_staff: "Sales Staff",
      auditor: "Auditor",
    };

    const groupIdByRole: Record<string, string> = {};
    for (const role of Object.keys(DEFAULT_GROUP_PERMISSIONS) as (keyof typeof DEFAULT_GROUP_PERMISSIONS)[]) {
      const id = deterministicDefaultGroupId(storeId, role);
      groupIdByRole[role] = id;
      if (existingRoles.has(role)) continue;
      await insert("permission_groups", {
        id,
        store_id: storeId,
        name: labels[role],
        based_on_role: role,
        is_default: 1,
        permissions: JSON.stringify(DEFAULT_GROUP_PERMISSIONS[role]),
      });
    }

    // Backfill: every existing staff member with no group yet gets the default group matching their current `role` string.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-permission-groups-ts-L74
    for (const role of Object.keys(DEFAULT_GROUP_PERMISSIONS) as (keyof typeof DEFAULT_GROUP_PERMISSIONS)[]) {
      const unassigned = await query<{ id: string }>(
        `SELECT id FROM users WHERE store_id = ? AND role = ? AND permission_group_id IS NULL AND (_deleted = 0 OR _deleted IS NULL)`,
        [storeId, role],
      );
      for (const user of unassigned) {
        await update("users", user.id, { permission_group_id: groupIdByRole[role] });
      }
    }

    await update("stores", storeId, {
      permission_groups_seeded_at: new Date().toISOString(),
      permission_catalog_version: PERMISSION_CATALOG_VERSION,
    });
  });

  await backfillDefaultGroupPermissions();
}

// The keys a default group for `role` is owed by every catalog version newer than `fromVersion`, in catalog order.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-permission-groups-ts-L100
export function pendingCatalogAdditions(role: string, fromVersion: number, isDefault = true): string[] {
  const pending: string[] = [];
  for (const [version, byRole] of Object.entries(DEFAULT_GROUP_PERMISSION_ADDITIONS)) {
    if (Number(version) <= fromVersion || !isDefault) continue;
    pending.push(...(byRole[role as DefaultGroupRole] ?? []));
  }
  for (const [version, keys] of Object.entries(ALL_GROUP_PERMISSION_ADDITIONS)) {
    if (Number(version) > fromVersion) pending.push(...keys);
  }
  return Array.from(new Set(pending));
}

// Brings an ALREADY-seeded store's default groups forward to the current catalog.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-permission-groups-L139
export async function backfillDefaultGroupPermissions(): Promise<void> {
  const storeId = getActiveStoreId();
  if (!storeId) return;

  await transaction(async () => {
    const stores = await query<{ permission_catalog_version: number | null }>(
      "SELECT permission_catalog_version FROM stores WHERE id = ?",
      [storeId],
    );
    if (stores.length === 0) return;

    const stamped = stores[0].permission_catalog_version ?? 1;
    if (stamped >= PERMISSION_CATALOG_VERSION) return;

    const groups = await query<{ id: string; based_on_role: string; is_default: number; permissions: string }>(
      `SELECT id, based_on_role, is_default, permissions FROM permission_groups
       WHERE store_id = ? AND (_deleted = 0 OR _deleted IS NULL)`,
      [storeId],
    );

    for (const group of groups) {
      const owed = pendingCatalogAdditions(group.based_on_role, stamped, Number(group.is_default) === 1);
      if (owed.length === 0) continue;

      let granted: string[];
      try {
        granted = JSON.parse(group.permissions);
      } catch {
        continue;
      }
      if (!Array.isArray(granted)) continue;

      const missing = owed.filter((key) => !granted.includes(key));
      if (missing.length === 0) continue;

      await update("permission_groups", group.id, {
        permissions: JSON.stringify([...granted, ...missing]),
      });
    }

    await update("stores", storeId, { permission_catalog_version: PERMISSION_CATALOG_VERSION });
  });
}

export async function getUserPermissionGroup(
  userId: string,
): Promise<{ userId: string; id: string; permissions: string[] } | null> {
  const rows = await query<{ id: string; permissions: string }>(
    `SELECT pg.id, pg.permissions FROM permission_groups pg
     JOIN users u ON u.permission_group_id = pg.id
     WHERE u.id = ? AND (pg._deleted = 0 OR pg._deleted IS NULL)`,
    [userId],
  );
  if (rows.length === 0) return null;
  try {
    return { userId, id: rows[0].id, permissions: JSON.parse(rows[0].permissions) };
  } catch {
    // A present-but-corrupt row denies, rather than returning null and letting hasPermission's `?? fallbackPermissions(role)` silently restore the…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-permission-groups-ts-L170
    return { userId, id: rows[0].id, permissions: [] };
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
  return rows.map((r) => {
    let permissions: string[];
    try {
      permissions = JSON.parse(r.permissions);
    } catch {
      // One malformed/legacy row must degrade to "grants nothing" rather than take out the whole matrix/staff-form dropdown for every OTHER group in…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-permission-groups-ts-L198
      permissions = [];
    }
    return { ...r, permissions };
  });
}
