import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import initSqlJs from "sql.js";

let storedExport: Uint8Array | undefined;

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => storedExport),
  set: vi.fn(async () => undefined),
}));

/**
 * initDatabase() has no guard against being called again before the first
 * call finishes: query()/execute()/transaction()/etc. each independently do
 * `if (!db) await initDatabase()`, and `db` stays null for the whole async
 * duration of the first call (WASM load + IndexedDB read + schema run). At
 * real app startup several of those fire around the same time (dashboard
 * widgets, license check, etc.), so multiple callers race past the null
 * check and each run the full body - including registering their own Web
 * Lock request via initWriterLock(). Observed live in the browser: a single
 * tab ended up with 14+ duplicate pending lock requests for itself, which
 * broke the writer-handoff feature (a tab dropping the lock to hand off
 * could immediately re-grant itself the lock from one of its own leftover
 * duplicate requests).
 */
describe("initDatabase() concurrency", () => {
  const originalLocks = (navigator as unknown as { locks?: unknown }).locks;

  beforeEach(() => {
    vi.resetModules();
    storedExport = undefined;
    window.localStorage.setItem("dumosrx_cleared_legacy_v2", "true");
  });

  afterEach(() => {
    Object.defineProperty(navigator, "locks", {
      value: originalLocks,
      configurable: true,
    });
  });

  it("de-duplicates concurrent calls: only registers one writer-lock request for this tab", async () => {
    // core.ts's own initSqlJs({locateFile: f => `/${f}`}) can't resolve the
    // wasm binary under Node - warm the package's internal wasm cache first
    // with a real resolvable path (same trick init-database-migrations.test.ts
    // uses), so core.ts's later call reuses it instead of failing outright.
    await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });

    let ifAvailableRequestCount = 0;
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (
          _name: string,
          opts: { ifAvailable?: boolean },
          cb: (lock: unknown) => Promise<void>,
        ) => {
          if (opts.ifAvailable) {
            ifAvailableRequestCount++;
            return Promise.resolve(cb({}));
          }
          return new Promise<void>(() => {});
        },
      },
    });

    const core = await import("@/lib/db/core");
    const [a, b, c] = await Promise.all([
      core.initDatabase(),
      core.initDatabase(),
      core.initDatabase(),
    ]);

    expect(ifAvailableRequestCount).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("a later call after the first has settled still returns the same instance without re-initializing", async () => {
    await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });

    const core = await import("@/lib/db/core");
    const first = await core.initDatabase();
    const second = await core.initDatabase();

    expect(second).toBe(first);
  });
});
