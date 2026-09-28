import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * U9: the staff list rendered a green "PIN set" pill unconditionally, because
 * StaffListItem structurally omits `pin` — so a staff member with no PIN at
 * all still showed as having one. The query now derives a boolean has_pin
 * (never the hash itself) so the list can tell the truth.
 */
describe("getUsers has_pin", () => {
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
        pin TEXT,
        role TEXT,
        store_id TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT,
        permission_group_id TEXT,
        _deleted INTEGER DEFAULT 0
      )`,
    );
    core.__setDatabaseForTesting(db);
  });

  beforeEach(async () => {
    await execute("DELETE FROM users");
  });

  it("reports has_pin per row without ever exposing the PIN hash", async () => {
    await execute("INSERT INTO users (id, role, store_id, pin) VALUES (?, ?, ?, ?)", [
      "with-pin",
      "sales_staff",
      "store-a",
      "$2a$10$somehash",
    ]);
    await execute("INSERT INTO users (id, role, store_id, pin) VALUES (?, ?, ?, ?)", [
      "no-pin",
      "sales_staff",
      "store-a",
      null,
    ]);
    await execute("INSERT INTO users (id, role, store_id, pin) VALUES (?, ?, ?, ?)", [
      "empty-pin",
      "sales_staff",
      "store-a",
      "",
    ]);

    const users = await getUsers("store-a");
    const byId = new Map(users.map((u) => [u.id, u]));

    expect(byId.get("with-pin")!.has_pin).toBe(1);
    expect(byId.get("no-pin")!.has_pin).toBe(0);
    expect(byId.get("empty-pin")!.has_pin).toBe(0);
    for (const user of users) {
      expect((user as Record<string, unknown>).pin).toBeUndefined();
    }
  });

  it("reports has_pin for the unscoped (all stores) query too", async () => {
    await execute("INSERT INTO users (id, role, pin) VALUES (?, ?, ?)", [
      "with-pin",
      "auditor",
      "$2a$10$somehash",
    ]);

    const users = await getUsers(null);
    expect(users[0].has_pin).toBe(1);
    expect((users[0] as Record<string, unknown>).pin).toBeUndefined();
  });
});
