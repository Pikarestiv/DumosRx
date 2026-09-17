import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("getStaffCount", () => {
  let execute: typeof import("@/lib/db/core").execute;
  let getStaffCount: typeof import("@/lib/db/queries/auth").getStaffCount;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    execute = core.execute;
    getStaffCount = (await import("@/lib/db/queries/auth")).getStaffCount;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run(
      "CREATE TABLE users (id TEXT PRIMARY KEY, role TEXT, _deleted INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1)",
    );
    core.__setDatabaseForTesting(db);
  });

  beforeEach(async () => {
    await execute("DELETE FROM users");
  });

  it("does not count the store owner's own row", async () => {
    await execute("INSERT INTO users (id, role) VALUES (?, ?)", ["owner-1", "store_owner"]);
    await execute("INSERT INTO users (id, role) VALUES (?, ?)", ["staff-1", "sales_staff"]);
    await execute("INSERT INTO users (id, role) VALUES (?, ?)", ["staff-2", "manager"]);

    expect(await getStaffCount()).toBe(2);
  });

  it("still excludes the hardcoded bootstrap default-admin row", async () => {
    await execute("INSERT INTO users (id, role) VALUES (?, ?)", ["default-admin", "admin"]);
    await execute("INSERT INTO users (id, role) VALUES (?, ?)", ["staff-1", "sales_staff"]);

    expect(await getStaffCount()).toBe(1);
  });

  it("does not count deleted or inactive rows", async () => {
    await execute(
      "INSERT INTO users (id, role, _deleted) VALUES (?, ?, 1)",
      ["staff-deleted", "sales_staff"],
    );
    await execute(
      "INSERT INTO users (id, role, is_active) VALUES (?, ?, 0)",
      ["staff-inactive", "sales_staff"],
    );
    await execute("INSERT INTO users (id, role) VALUES (?, ?)", ["staff-active", "sales_staff"]);

    expect(await getStaffCount()).toBe(1);
  });
});
