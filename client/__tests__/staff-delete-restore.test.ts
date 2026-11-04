import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("staff delete and restore", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let deleteUser: typeof import("@/lib/db/local-database").deleteUser;
  let restoreUser: typeof import("@/lib/db/local-database").restoreUser;
  let getUsers: typeof import("@/lib/db/local-database").getUsers;
  let getDeletedUsers: typeof import("@/lib/db/local-database").getDeletedUsers;
  let query: typeof import("@/lib/db/core").query;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    query = core.query;
    const localDb = await import("@/lib/db/local-database");
    deleteUser = localDb.deleteUser;
    restoreUser = localDb.restoreUser;
    getUsers = localDb.getUsers;
    getDeletedUsers = localDb.getDeletedUsers;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run("DELETE FROM users; DELETE FROM _sync_queue; DELETE FROM audit_logs;");
    core.setActiveStoreId("store-a");
  });

  function seedUser(user: {
    id: string;
    first_name: string;
    last_name: string;
    username: string;
    email?: string;
    role: string;
    store_id: string;
    is_active?: number;
    _deleted?: number;
  }) {
    db.run(
      `INSERT INTO users (id, first_name, last_name, username, email, role, store_id, is_active, _deleted, _version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        user.id,
        user.first_name,
        user.last_name,
        user.username,
        user.email ?? `${user.username}@test.com`,
        user.role,
        user.store_id,
        user.is_active ?? 1,
        user._deleted ?? 0,
      ],
    );
  }

  it("deleteUser soft-deletes the user and frees the username for reuse", async () => {
    seedUser({
      id: "u1",
      first_name: "Cynthia",
      last_name: "Staff",
      username: "cynthia_staff",
      role: "sales_staff",
      store_id: "store-a",
    });

    await deleteUser("u1");

    // Excluded from standard staff roster
    const activeRoster = await getUsers("store-a");
    expect(activeRoster.find((u) => u.id === "u1")).toBeUndefined();

    // Appears in deleted users list
    const deletedRoster = await getDeletedUsers("store-a");
    const deletedUser = deletedRoster.find((u) => u.id === "u1");
    expect(deletedUser).toBeDefined();
    expect(deletedUser?._deleted).toBe(1);

    // Stored row has _deleted = 1 and suffix appended to free unique index
    const rows = await query<{ username: string; email: string; _deleted: number }>(
      "SELECT username, email, _deleted FROM users WHERE id = 'u1'",
    );
    expect(rows[0]._deleted).toBe(1);
    expect(rows[0].username).toMatch(/^cynthia_staff_del_\d+$/);
    expect(rows[0].email).toMatch(/^cynthia_staff@test\.com_del_\d+$/);

    // Sync queue contains DELETE entry
    const syncRows = await query<{ operation: string; record_id: string }>(
      "SELECT operation, record_id FROM _sync_queue WHERE table_name = 'users'",
    );
    expect(syncRows).toHaveLength(1);
    expect(syncRows[0].operation).toBe("DELETE");
    expect(syncRows[0].record_id).toBe("u1");
  });

  it("restoreUser restores a deleted account as Inactive with cleaned credentials", async () => {
    seedUser({
      id: "u2",
      first_name: "Emeka",
      last_name: "Okoro",
      username: "emeka_del_1730000000000",
      email: "emeka@test.com_del_1730000000000",
      role: "specialist",
      store_id: "store-a",
      is_active: 1,
      _deleted: 1,
    });

    await restoreUser("u2");

    // Restored in SQLite: _deleted = 0, is_active = 0 (safe inactive state)
    const rows = await query<{ username: string; email: string; _deleted: number; is_active: number }>(
      "SELECT username, email, _deleted, is_active FROM users WHERE id = 'u2'",
    );
    expect(rows[0]._deleted).toBe(0);
    expect(rows[0].is_active).toBe(0);
    expect(rows[0].username).toBe("emeka");
    expect(rows[0].email).toBe("emeka@test.com");

    // Reappears in standard getUsers
    const activeRoster = await getUsers("store-a");
    const restored = activeRoster.find((u) => u.id === "u2");
    expect(restored).toBeDefined();
    expect(restored?.username).toBe("emeka");

    // Gone from getDeletedUsers
    const deletedRoster = await getDeletedUsers("store-a");
    expect(deletedRoster.find((u) => u.id === "u2")).toBeUndefined();

    // Queued an UPDATE sync change with _deleted: 0
    const syncRows = await query<{ operation: string; record_id: string; payload: string }>(
      "SELECT operation, record_id, payload FROM _sync_queue WHERE table_name = 'users' ORDER BY id DESC LIMIT 1",
    );
    expect(syncRows[0].operation).toBe("UPDATE");
    expect(syncRows[0].record_id).toBe("u2");
    const payload = JSON.parse(syncRows[0].payload);
    expect(payload._deleted).toBe(0);
    expect(payload.is_active).toBe(0);
    expect(payload.username).toBe("emeka");
    expect(payload._version).toBe(1);
  });

  it("restoreUser refuses restore if another active staff member currently has the username", async () => {
    // Current active staff has 'john'
    seedUser({
      id: "u-active",
      first_name: "John",
      last_name: "New",
      username: "john",
      role: "sales_staff",
      store_id: "store-a",
      _deleted: 0,
    });

    // Old deleted staff also had 'john'
    seedUser({
      id: "u-old",
      first_name: "John",
      last_name: "Old",
      username: "john_del_1730000000000",
      role: "sales_staff",
      store_id: "store-a",
      _deleted: 1,
    });

    await expect(restoreUser("u-old")).rejects.toThrow(
      'A staff member with username "john" already exists. Please resolve the duplicate username first.',
    );

    // Old user remains deleted
    const rows = await query<{ _deleted: number }>("SELECT _deleted FROM users WHERE id = 'u-old'");
    expect(rows[0]._deleted).toBe(1);
  });
});
