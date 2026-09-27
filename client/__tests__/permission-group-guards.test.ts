import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({ get: vi.fn(async () => undefined), set: vi.fn(async () => undefined) }));

describe("permission group guards", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let usePermissionGroupsModule: typeof import("@/lib/hooks/use-permission-groups");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    usePermissionGroupsModule = await import("@/lib/hooks/use-permission-groups");
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
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions) VALUES
       ('default1', 'store1', 'Manager', 'manager', 1, '["process_sales"]'),
       ('custom1', 'store1', 'Supervisor', 'manager', 0, '["process_sales","manage_staff"]')`,
    );
  });

  it("revertToDefault restores a default group's original seeded permissions after it was edited", async () => {
    await core.execute(`UPDATE permission_groups SET permissions = '[]' WHERE id = 'default1'`, []);

    // Simulate the hook's revertToDefault logic directly against the DB
    // (the full React-hook test is covered by permission-matrix.test.tsx).
    const { revertGroupToDefault } = usePermissionGroupsModule as any;
    await revertGroupToDefault("default1");

    const rows = await core.query<{ permissions: string }>(`SELECT permissions FROM permission_groups WHERE id = 'default1'`);
    expect(JSON.parse(rows[0].permissions)).toContain("process_sales");
  });

  it("deleting a custom group with an assigned staff member is blocked", async () => {
    db.run(`INSERT INTO users (id, role, permission_group_id) VALUES ('staff1', 'manager', 'custom1')`);

    const { deletePermissionGroup } = usePermissionGroupsModule as any;
    await expect(deletePermissionGroup("custom1")).rejects.toThrow(/staff.*assigned/i);

    const rows = await core.query(`SELECT id FROM permission_groups WHERE id = 'custom1' AND (_deleted = 0 OR _deleted IS NULL)`);
    expect(rows).toHaveLength(1);
  });

  it("deleting a default group reports the default-group reason, not the staff-assigned one", async () => {
    db.run(`INSERT INTO users (id, role, permission_group_id) VALUES ('staff1', 'manager', 'default1')`);

    const { deletePermissionGroup } = usePermissionGroupsModule as any;
    await expect(deletePermissionGroup("default1")).rejects.toThrow(/default group/i);

    const rows = await core.query(`SELECT id FROM permission_groups WHERE id = 'default1' AND (_deleted = 0 OR _deleted IS NULL)`);
    expect(rows).toHaveLength(1);
  });

  it("deleting a default group with nobody assigned still refuses, with a signal the caller can see", async () => {
    const { deletePermissionGroup } = usePermissionGroupsModule as any;
    await expect(deletePermissionGroup("default1")).rejects.toThrow(/default group/i);

    const rows = await core.query(`SELECT id FROM permission_groups WHERE id = 'default1' AND (_deleted = 0 OR _deleted IS NULL)`);
    expect(rows).toHaveLength(1);
  });

  it("counts a staff row with a NULL is_active as still assigned", async () => {
    db.run(`INSERT INTO users (id, role, permission_group_id, is_active) VALUES ('staff1', 'manager', 'custom1', NULL)`);

    const { deletePermissionGroup } = usePermissionGroupsModule as any;
    await expect(deletePermissionGroup("custom1")).rejects.toThrow(/staff.*assigned/i);

    const rows = await core.query(`SELECT id FROM permission_groups WHERE id = 'custom1' AND (_deleted = 0 OR _deleted IS NULL)`);
    expect(rows).toHaveLength(1);
  });

  it("deleting a custom group with no assigned staff succeeds", async () => {
    const { deletePermissionGroup } = usePermissionGroupsModule as any;
    await deletePermissionGroup("custom1");

    const rows = await core.query(`SELECT id FROM permission_groups WHERE id = 'custom1' AND (_deleted = 0 OR _deleted IS NULL)`);
    expect(rows).toHaveLength(0);
  });
});
