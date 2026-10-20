import { describe, it, expect, vi, beforeEach } from "vitest";
import initSqlJs from "sql.js";

let storedExport: Uint8Array | undefined;
const setSpy = vi.fn(async (_key: string, _value: unknown) => undefined);

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => storedExport),
  set: (key: string, value: unknown) => setSpy(key, value),
}));

// Regression coverage for a gap an independent review caught in the C1 (single-writer-tab) fix:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-read-only-tab-skips-migration-persistence-test-ts-L12
describe("initDatabase() gates migration persistence on writer-tab status", () => {
  beforeEach(() => {
    vi.resetModules();
    setSpy.mockClear();
    storedExport = undefined;
    // Deliberately NOT set - this test wants clearLegacyTransactionsOnce to actually run (see init-database-migrations.test.ts…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-read-only-tab-skips-migration-persistence-test-ts-L29
    window.localStorage.removeItem("dumosrx_cleared_legacy_v2");
  });

  it("never persists the legacy-transactions cleanup to IndexedDB from a read-only tab", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE sales (id TEXT PRIMARY KEY);
      INSERT INTO sales (id) VALUES ('sale-1');
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    // Simulates another tab already holding the writer lock, so this tab's
    // ifAvailable check comes back unavailable and it starts read-only.
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: (
          _name: string,
          opts: { ifAvailable?: boolean },
          cb: (lock: unknown) => Promise<void>,
        ) => (opts.ifAvailable ? Promise.resolve(cb(null)) : new Promise<void>(() => {})),
      },
    });

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    // The migration still ran against this tab's OWN in-memory db (needed so
    // its own reads reflect the current, migrated schema/state)...
    const rows = db.exec("SELECT id FROM sales");
    expect(rows).toEqual([]);

    // ...but a read-only tab must never itself write that cleanup back to
    // the shared IndexedDB snapshot - only the actual writer tab may.
    expect(setSpy).not.toHaveBeenCalled();
  });
});
