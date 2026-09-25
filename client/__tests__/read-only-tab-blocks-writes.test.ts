import { describe, it, expect, vi, beforeEach } from "vitest";
import initSqlJs from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Proves core.ts's write path actually enforces the single-writer-tab
 * election from tab-lock.ts (docs/KNOWN_BUGS.md C1): a tab that lost (or
 * never won) the election must never touch the shared sql.js database, since
 * doing so is exactly the silent last-write-wins data loss C1 was about.
 * tab-lock.test.ts already covers the election logic itself in isolation;
 * this covers core.ts's execute()/transaction() actually consulting it.
 */
describe("read-only tab write blocking", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("execute() throws and leaves the database untouched when this tab isn't the writer", async () => {
    const core = await import("@/lib/db/core");
    const tabLock = await import("@/lib/db/tab-lock");

    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_n: string, opts: { ifAvailable?: boolean }, cb: (l: unknown) => unknown) =>
          opts.ifAvailable ? Promise.resolve(cb(null)) : new Promise(() => {}),
      },
    });
    await tabLock.initWriterLock(vi.fn(), vi.fn());
    expect(tabLock.isWriterTab()).toBe(false);

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run("CREATE TABLE items (id TEXT PRIMARY KEY)");
    core.__setDatabaseForTesting(db);

    const blocked = vi.fn();
    window.addEventListener("dumos_db_read_only_write_blocked", blocked);

    await expect(
      core.execute("INSERT INTO items (id) VALUES (?)", ["a"]),
    ).rejects.toThrow(/read-only/i);
    expect(blocked).toHaveBeenCalledTimes(1);

    const rows = await core.query("SELECT id FROM items");
    expect(rows).toEqual([]);

    window.removeEventListener("dumos_db_read_only_write_blocked", blocked);
  });

  it("transaction() throws before ever issuing BEGIN when this tab isn't the writer", async () => {
    const core = await import("@/lib/db/core");
    const tabLock = await import("@/lib/db/tab-lock");

    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_n: string, opts: { ifAvailable?: boolean }, cb: (l: unknown) => unknown) =>
          opts.ifAvailable ? Promise.resolve(cb(null)) : new Promise(() => {}),
      },
    });
    await tabLock.initWriterLock(vi.fn(), vi.fn());

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run("CREATE TABLE items (id TEXT PRIMARY KEY)");
    core.__setDatabaseForTesting(db);

    const fn = vi.fn(async () => {
      await core.execute("INSERT INTO items (id) VALUES (?)", ["a"]);
    });

    await expect(core.transaction(fn)).rejects.toThrow(/read-only/i);
    expect(fn).not.toHaveBeenCalled();
  });

  it("query() (reads) still works normally on a read-only tab", async () => {
    const core = await import("@/lib/db/core");
    const tabLock = await import("@/lib/db/tab-lock");

    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (_n: string, opts: { ifAvailable?: boolean }, cb: (l: unknown) => unknown) =>
          opts.ifAvailable ? Promise.resolve(cb(null)) : new Promise(() => {}),
      },
    });
    await tabLock.initWriterLock(vi.fn(), vi.fn());

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run("CREATE TABLE items (id TEXT PRIMARY KEY); INSERT INTO items VALUES ('a')");
    core.__setDatabaseForTesting(db);

    await expect(core.query("SELECT id FROM items")).resolves.toEqual([{ id: "a" }]);
  });
});
