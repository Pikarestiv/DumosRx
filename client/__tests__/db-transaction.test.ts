import { describe, it, expect, beforeAll, vi } from "vitest";
import initSqlJs from "sql.js";

// transaction() persists via idb-keyval when not running in Tauri — stub it
// out since jsdom has no real IndexedDB and we only care about the SQL
// transaction semantics here, not persistence.
vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises the real transaction()/query()/execute() implementation in
 * lib/db/core.ts against a genuine in-memory SQLite engine (sql.js) — not a
 * mock — so these tests actually prove BEGIN/COMMIT/ROLLBACK behave
 * correctly, which is exactly what mocking query()/execute() elsewhere in
 * the suite can't tell us.
 */
describe("transaction()", () => {
  let query: typeof import("@/lib/db/core").query;
  let execute: typeof import("@/lib/db/core").execute;
  let transaction: typeof import("@/lib/db/core").transaction;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    query = core.query;
    execute = core.execute;
    transaction = core.transaction;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run("CREATE TABLE items (id TEXT PRIMARY KEY, qty INTEGER)");
    core.__setDatabaseForTesting(db);
  });

  it("commits every write in the block when it succeeds", async () => {
    await transaction(async () => {
      await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["a", 1]);
      await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["b", 2]);
    });

    const rows = await query<{ id: string; qty: number }>(
      "SELECT id, qty FROM items WHERE id IN ('a', 'b') ORDER BY id",
    );
    expect(rows).toEqual([
      { id: "a", qty: 1 },
      { id: "b", qty: 2 },
    ]);
  });

  it("rolls back every write in the block when it throws partway through", async () => {
    await expect(
      transaction(async () => {
        await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["c", 3]);
        await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["d", 4]);
        throw new Error("simulated failure after partial writes");
      }),
    ).rejects.toThrow("simulated failure after partial writes");

    const rows = await query(
      "SELECT id FROM items WHERE id IN ('c', 'd')",
    );
    expect(rows).toEqual([]);
  });

  it("propagates the original error even if a later statement in the block would have failed too", async () => {
    await expect(
      transaction(async () => {
        await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["e", 5]);
        throw new Error("business logic failure");
      }),
    ).rejects.toThrow("business logic failure");

    const rows = await query("SELECT id FROM items WHERE id = 'e'");
    expect(rows).toEqual([]);
  });

  it("runs a nested transaction() call inline against the already-open outer transaction", async () => {
    await transaction(async () => {
      await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["f", 6]);
      await transaction(async () => {
        await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["g", 7]);
      });
    });

    const rows = await query<{ id: string }>(
      "SELECT id FROM items WHERE id IN ('f', 'g') ORDER BY id",
    );
    expect(rows).toEqual([{ id: "f" }, { id: "g" }]);
  });

  it("leaves the connection usable for subsequent transactions after a rollback", async () => {
    await expect(
      transaction(async () => {
        await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["h", 8]);
        throw new Error("boom");
      }),
    ).rejects.toThrow();

    // A prior failed transaction must not leave the connection stuck inside
    // an open transaction (which would make this next one fail to BEGIN).
    await transaction(async () => {
      await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["i", 9]);
    });

    const rows = await query<{ id: string }>(
      "SELECT id FROM items WHERE id IN ('h', 'i') ORDER BY id",
    );
    expect(rows).toEqual([{ id: "i" }]);
  });
});
