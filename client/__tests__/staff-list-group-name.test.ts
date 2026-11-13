import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("staff list permission group name", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let localDb: typeof import("@/lib/db/local-database");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    localDb = await import("@/lib/db/local-database");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM users; DELETE FROM permission_groups;");
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, _deleted) VALUES
        ('g-live', 'store-a', 'Cashier+StockManager', 'sales_staff', 0),
        ('g-gone', 'store-a', 'Retired Group', 'sales_staff', 1)`,
    );
    db.run(
      `INSERT INTO users (id, first_name, username, role, store_id, permission_group_id, _deleted) VALUES
        ('u-grouped', 'Ada', 'ada', 'sales_staff', 'store-a', 'g-live', 0),
        ('u-plain', 'Bola', 'bola', 'sales_staff', 'store-a', NULL, 0),
        ('u-stale', 'Chi', 'chi', 'sales_staff', 'store-a', 'g-gone', 0),
        ('u-missing', 'Dayo', 'dayo', 'sales_staff', 'store-a', 'g-never-synced', 0),
        ('u-deleted', 'Ebere', 'ebere', 'sales_staff', 'store-a', 'g-live', 1)`,
    );
  });

  it("reports each active staff member's group name, and null when there is no live group", async () => {
    const users = await localDb.getUsers("store-a");
    const groupById = new Map(users.map((u) => [u.id, u.permission_group_name]));

    expect(groupById.get("u-grouped")).toBe("Cashier+StockManager");
    expect(groupById.get("u-plain")).toBeNull();
    expect(groupById.get("u-stale")).toBeNull();
    expect(groupById.get("u-missing")).toBeNull();
  });

  it("reports the group name for the unscoped and deleted-staff lists too", async () => {
    const all = await localDb.getUsers(null);
    expect(all.find((u) => u.id === "u-grouped")?.permission_group_name).toBe("Cashier+StockManager");

    const deleted = await localDb.getDeletedUsers("store-a");
    expect(deleted.map((u) => [u.id, u.permission_group_name])).toEqual([["u-deleted", "Cashier+StockManager"]]);
  });

  it("picks up a renamed group on the next read", async () => {
    db.run("UPDATE permission_groups SET name = 'Front Desk' WHERE id = 'g-live'");
    const users = await localDb.getUsers("store-a");
    expect(users.find((u) => u.id === "u-grouped")?.permission_group_name).toBe("Front Desk");
  });
});
