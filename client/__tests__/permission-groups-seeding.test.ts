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
});
