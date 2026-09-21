import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("getUsers store scoping", () => {
  let execute: typeof import("@/lib/db/core").execute;
  let getUsers: typeof import("@/lib/db/local-database").getUsers;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    execute = core.execute;
    getUsers = (await import("@/lib/db/local-database")).getUsers;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run(
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        username TEXT,
        email TEXT,
        role TEXT,
        store_id TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        _deleted INTEGER DEFAULT 0
      )`,
    );
    core.__setDatabaseForTesting(db);
  });

  beforeEach(async () => {
    await execute("DELETE FROM users");
  });

  it("keeps a store-scoped admin out of another store's staff list", async () => {
    await execute(
      "INSERT INTO users (id, role, store_id) VALUES (?, ?, ?)",
      ["admin-a", "admin", "store-a"],
    );
    await execute(
      "INSERT INTO users (id, role, store_id) VALUES (?, ?, ?)",
      ["cashier-b", "sales_staff", "store-b"],
    );

    const usersForStoreB = await getUsers("store-b");
    expect(usersForStoreB.map((u) => u.id)).not.toContain("admin-a");
    expect(usersForStoreB.map((u) => u.id)).toContain("cashier-b");
  });

  it("still surfaces the fleet-wide store_owner in every store's list", async () => {
    await execute(
      "INSERT INTO users (id, role, store_id) VALUES (?, ?, ?)",
      ["owner-1", "store_owner", "store-a"],
    );
    await execute(
      "INSERT INTO users (id, role, store_id) VALUES (?, ?, ?)",
      ["cashier-b", "sales_staff", "store-b"],
    );

    const usersForStoreB = await getUsers("store-b");
    expect(usersForStoreB.map((u) => u.id)).toContain("owner-1");
    expect(usersForStoreB.map((u) => u.id)).toContain("cashier-b");
  });

  it("still surfaces a truly global (store_id IS NULL) account everywhere", async () => {
    await execute(
      "INSERT INTO users (id, role, store_id) VALUES (?, ?, ?)",
      ["global-1", "auditor", null],
    );

    const usersForStoreB = await getUsers("store-b");
    expect(usersForStoreB.map((u) => u.id)).toContain("global-1");
  });
});
