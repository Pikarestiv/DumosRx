import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage (final review, Important I8): getUserPermissionGroup
 * already guards its JSON.parse with try/catch, but getStorePermissionGroups
 * didn't - one malformed/legacy `permissions` value (see also Critical C1,
 * a real way such a value could arrive via sync before that fix) took out
 * the ENTIRE Roles & Permissions matrix and the staff form's Group
 * dropdown, instead of degrading to just that one row.
 */
describe("getStorePermissionGroups", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getStorePermissionGroups: typeof import("@/lib/db/queries/permission-groups").getStorePermissionGroups;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ getStorePermissionGroups } = await import("@/lib/db/queries/permission-groups"));
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM permission_groups; DELETE FROM stores;`);
    db.run(`INSERT INTO stores (id) VALUES ('store1')`);
    core.setActiveStoreId("store1");
  });

  it("degrades a single malformed permissions row to an empty array instead of throwing for the whole store", async () => {
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions) VALUES
       ('good1', 'store1', 'Manager', 'manager', 1, '["process_sales"]'),
       ('bad1', 'store1', 'Corrupted', 'auditor', 0, 'not valid json{{')`,
    );

    const groups = await getStorePermissionGroups();

    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.id === "good1")?.permissions).toEqual(["process_sales"]);
    expect(groups.find((g) => g.id === "bad1")?.permissions).toEqual([]);
  });
});
