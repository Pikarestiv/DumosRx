import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("ensurePermissionGroupsSeeded", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let ensurePermissionGroupsSeeded: typeof import("@/lib/db/queries/permission-groups").ensurePermissionGroupsSeeded;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ ensurePermissionGroupsSeeded } = await import("@/lib/db/queries/permission-groups"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM permission_groups; DELETE FROM stores; DELETE FROM users; DELETE FROM _sync_queue; DELETE FROM audit_logs;`);
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    core.setActiveStoreId("store1");
  });

  it("creates all 5 default groups for a store that has never been seeded", async () => {
    await ensurePermissionGroupsSeeded();

    const groups = await core.query<{ name: string; is_default: number; based_on_role: string }>(
      `SELECT name, is_default, based_on_role FROM permission_groups WHERE store_id = 'store1'`,
    );
    expect(groups).toHaveLength(5);
    expect(groups.every((g) => g.is_default === 1)).toBe(true);
    expect(groups.map((g) => g.based_on_role).sort()).toEqual(
      ["admin", "auditor", "manager", "sales_staff", "specialist"].sort(),
    );
  });

  it("is a no-op the second time it's called for the same store", async () => {
    await ensurePermissionGroupsSeeded();
    await ensurePermissionGroupsSeeded();

    const groups = await core.query(`SELECT id FROM permission_groups WHERE store_id = 'store1'`);
    expect(groups).toHaveLength(5);
  });

  it("does not reseed a store that deliberately deleted its default groups after seeding once", async () => {
    await ensurePermissionGroupsSeeded();
    await core.execute(`UPDATE permission_groups SET _deleted = 1 WHERE store_id = 'store1'`, []);

    await ensurePermissionGroupsSeeded();

    const active = await core.query(`SELECT id FROM permission_groups WHERE store_id = 'store1' AND _deleted = 0`);
    expect(active).toHaveLength(0);
  });

  // Final review, Critical C4: the spec promises existing staff get
  // backfilled to the default group matching their current role in the
  // SAME seeding pass - without it, toggling a checkbox on an existing
  // store's Manager group changes nothing for any pre-existing manager.
  it("backfills every existing staff member's permission_group_id to the default group matching their role", async () => {
    db.run(
      `INSERT INTO users (id, role, first_name, last_name, store_id) VALUES
       ('u-manager', 'manager', 'M', 'M', 'store1'),
       ('u-cashier', 'sales_staff', 'C', 'C', 'store1')`,
    );

    await ensurePermissionGroupsSeeded();

    const managerGroup = await core.query<{ id: string }>(
      `SELECT id FROM permission_groups WHERE store_id = 'store1' AND based_on_role = 'manager'`,
    );
    const cashierGroup = await core.query<{ id: string }>(
      `SELECT id FROM permission_groups WHERE store_id = 'store1' AND based_on_role = 'sales_staff'`,
    );
    const users = await core.query<{ id: string; permission_group_id: string | null }>(
      `SELECT id, permission_group_id FROM users WHERE store_id = 'store1' ORDER BY id`,
    );

    expect(users.find((u) => u.id === "u-manager")?.permission_group_id).toBe(managerGroup[0].id);
    expect(users.find((u) => u.id === "u-cashier")?.permission_group_id).toBe(cashierGroup[0].id);
  });

  it("does not overwrite a staff member who already has a permission_group_id assigned", async () => {
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions) VALUES ('custom-pg', 'store1', 'Supervisor', 'manager', 0, '[]')`,
    );
    db.run(`INSERT INTO users (id, role, first_name, last_name, store_id, permission_group_id) VALUES ('u1', 'manager', 'M', 'M', 'store1', 'custom-pg')`);

    await ensurePermissionGroupsSeeded();

    const rows = await core.query<{ permission_group_id: string }>(`SELECT permission_group_id FROM users WHERE id = 'u1'`);
    expect(rows[0].permission_group_id).toBe("custom-pg");
  });

  // Final review, Important I3: two devices seeding the same store's
  // defaults before either has synced must not create permanently
  // divergent groups per role - deterministic ids (derived from
  // store_id + role, not random) mean a later sync push's "INSERT
  // against an already-existing id becomes an UPDATE" handling collapses
  // the race into one row per role, instead of leaving duplicates.
  it("generates the same default-group ids for the same store across independent seed runs (multi-device idempotency)", async () => {
    await ensurePermissionGroupsSeeded();
    const firstRun = await core.query<{ id: string; based_on_role: string }>(
      `SELECT id, based_on_role FROM permission_groups WHERE store_id = 'store1' ORDER BY based_on_role`,
    );

    // Simulate a second device: fresh local rows for the same store, as if
    // this were a different device's never-before-seeded local DB that
    // happens to derive the same ids this store's groups already have
    // server-side.
    db.run(`DELETE FROM permission_groups WHERE store_id = 'store1'`);
    db.run(`UPDATE stores SET permission_groups_seeded_at = NULL WHERE id = 'store1'`);
    await ensurePermissionGroupsSeeded();
    const secondRun = await core.query<{ id: string; based_on_role: string }>(
      `SELECT id, based_on_role FROM permission_groups WHERE store_id = 'store1' ORDER BY based_on_role`,
    );

    expect(secondRun).toEqual(firstRun);
  });
});
