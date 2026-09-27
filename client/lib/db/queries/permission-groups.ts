import { query, transaction, getActiveStoreId } from "@/lib/db/core";
import { insert, update } from "@/lib/db/base-helpers";
import { DEFAULT_GROUP_PERMISSIONS } from "@/lib/constants/permissions";

/**
 * Deterministic, UUID-shaped id derived from (storeId, role) - NOT random,
 * unlike generateId(). Two devices seeding the same store's default groups
 * independently, before either has synced (seeding fires from
 * auth-context on login, with no guarantee a sync round-trip has
 * happened yet), would otherwise mint different ids for "the same"
 * default group - permanently divergent Manager/Specialist/... rows, one
 * per device, with staff split across them. Deriving the id instead means
 * both devices compute the SAME id, so when their INSERTs eventually
 * reach the server, the sync engine's existing "INSERT against an
 * already-existing id becomes an UPDATE" handling (SyncController::push)
 * collapses the race into one row per role, not a duplicate.
 *
 * Not cryptographic - four independent FNV-1a-style 32-bit lanes over the
 * same seed give 128 bits of spread from one pass, comfortably enough to
 * avoid collisions across the tiny (store, role) space this app actually
 * has (one store, 5 roles).
 */
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

/**
 * Seeds the 5 default permission groups (Manager, Specialist, Sales Staff,
 * Auditor, Admin) the first time this feature touches a store, exactly
 * mirroring ensureLoyaltyDefaultsSeeded's gate-on-timestamp pattern (see
 * lib/db/queries/loyalty.ts) - gated on stores.permission_groups_seeded_at
 * rather than "zero groups exist right now", so a store that deliberately
 * deletes a custom group (or, in principle, all groups) never gets
 * silently reseeded. Also backfills every existing staff member's
 * permission_group_id to the default group matching their current role,
 * in the same pass - without this, editing a default group's checkboxes
 * changes nothing for any staff member who existed before this feature
 * shipped, since they'd have no group assigned at all.
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

    // Second guard, matching ensureLoyaltyDefaultsSeeded's own double-check
    // (tiers.length === 0 in addition to the timestamp): a device that
    // crashed between inserting the groups and stamping the timestamp
    // (or one that pulled another device's already-seeded groups down
    // before its own timestamp update landed) must not insert a second
    // set on top of rows that already exist for this store.
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

    // Backfill: every existing staff member with no group yet gets the
    // default group matching their current `role` string. Never touches a
    // user who already has a permission_group_id (e.g. one assigned via
    // the staff form, or from an earlier seed pass). Goes through
    // update() (not a raw bulk UPDATE) so each assignment is queued for
    // sync like any other write - other devices/the server need to learn
    // it too, not just this device's local copy.
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
  return rows.map((r) => {
    let permissions: string[];
    try {
      permissions = JSON.parse(r.permissions);
    } catch {
      // One malformed/legacy row must degrade to "grants nothing" rather
      // than take out the whole matrix/staff-form dropdown for every
      // OTHER group in this store - matches getUserPermissionGroup's own
      // guard above.
      permissions = [];
    }
    return { ...r, permissions };
  });
}
