import { describe, it, expect, beforeAll, vi } from "vitest";
import initSqlJs from "sql.js";

// transaction() persists via idb-keyval when not running in Tauri; stub it
// out since jsdom has no real IndexedDB and we only care about the SQL
// transaction semantics here, not persistence.
vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises the real transaction()/query()/execute() implementation in
 * lib/db/core.ts against a genuine in-memory SQLite engine (sql.js), not a
 * mock, so these tests actually prove BEGIN/COMMIT/ROLLBACK behave
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

  // Nesting (calling transaction() from inside another transaction()'s `fn`)
  // used to run the inner call inline against the outer's already-open
  // transaction. That capability is retired — see transaction()'s own
  // comment in core.ts — because the same `inTransaction` flag that made
  // nesting work couldn't tell it apart from two unrelated top-level calls
  // that merely overlap in time, which was the actual bug this file's other
  // tests cover. Composed writes that need to run inside an already-open
  // transaction (e.g. requeueOrphanedRows() in reconcile-identity.ts) now
  // call query()/execute() directly instead of transaction() again.

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

  /**
   * Regression test for a real bug found via code review: `inTransaction`
   * used to be the only guard against nested BEGINs, but it's a plain
   * module-level boolean, not scoped to one call chain. Two *unrelated*
   * top-level transaction() calls that merely overlap in wall-clock time
   * (e.g. a background sync mid-flight when the cashier records a sale)
   * both saw the same flag: the second call would see it already true and
   * run inline against the first's still-open transaction, so the first's
   * rollback silently took the second's already-"successful" writes down
   * with it. transaction() now queues unrelated top-level calls so their
   * BEGIN/COMMIT pairs can never interleave.
   */
  it("does not let one top-level transaction's rollback affect a separate, later-queued transaction's writes", async () => {
    let releaseA: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const transactionA = transaction(async () => {
      await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["j", 10]);
      // Pause here, still inside A's open transaction, so B can be started
      // (and queued) while A hasn't committed or rolled back yet.
      await gate;
      throw new Error("A failed after B was already queued behind it");
    });

    // Let A actually reach BEGIN before queuing B behind it.
    await new Promise((r) => setTimeout(r, 0));

    const transactionB = transaction(async () => {
      await execute("INSERT INTO items (id, qty) VALUES (?, ?)", ["k", 11]);
    });

    releaseA!();

    await expect(transactionA).rejects.toThrow(
      "A failed after B was already queued behind it",
    );
    await transactionB;

    const rows = await query<{ id: string }>(
      "SELECT id FROM items WHERE id IN ('j', 'k') ORDER BY id",
    );
    // j rolled back with A; k committed on its own once it was B's turn,
    // independent of A's outcome.
    expect(rows).toEqual([{ id: "k" }]);
  });
});
