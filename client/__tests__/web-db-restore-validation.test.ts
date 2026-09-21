import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { SCHEMA_SQL } from "@/lib/db/schema";

/**
 * Regression coverage for the desktop-DB-restore Critical bug's web-side
 * twin (docs/KNOWN_BUGS.md): restoreDatabase() used to hand a picked file's
 * bytes straight to `new SQL.Database(binaryData)` and immediately persist
 * it, with no validation and no copy of the outgoing database kept - a
 * wrong or corrupt file destroyed the live database irrecoverably.
 */

const idbStore = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => idbStore.get(key)),
  set: vi.fn(async (key: string, value: unknown) => {
    idbStore.set(key, value);
  }),
}));

describe("restoreDatabase() (web) validation and pre-restore snapshot", () => {
  let core: typeof import("@/lib/db/core");
  let SQL: SqlJsStatic;

  function makeValidDumosDbBytes(marker: string): Uint8Array {
    const seed = new SQL.Database();
    seed.run(SCHEMA_SQL);
    seed.run(
      `INSERT INTO stores (id, name) VALUES ('store-1', ?)`,
      [marker],
    );
    const bytes = seed.export();
    seed.close();
    return bytes;
  }

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  });

  beforeEach(() => {
    idbStore.clear();
    const live = new SQL.Database();
    live.run(SCHEMA_SQL);
    live.run(`INSERT INTO stores (id, name) VALUES ('store-original', 'Original Store')`);
    core.__setDatabaseForTesting(live);
  });

  it("throws and leaves the live database untouched when the file isn't valid SQLite at all", async () => {
    const garbage = new TextEncoder().encode("this is not a database");

    await expect(core.restoreDatabase(garbage)).rejects.toThrow();

    const rows = core.getDatabaseBinary();
    expect(rows).not.toBeNull();
    // The live db is still the original one - a fresh Database() constructed
    // from its export still has the original store row.
    const check = new SQL.Database(rows!);
    const result = check.exec("SELECT name FROM stores WHERE id = 'store-original'");
    expect(result[0]?.values[0]?.[0]).toBe("Original Store");
    check.close();
  });

  it("throws when the file is valid SQLite but missing DumosRx's core tables", async () => {
    const wrongApp = new SQL.Database();
    wrongApp.run("CREATE TABLE some_other_apps_table (id TEXT)");
    const bytes = wrongApp.export();
    wrongApp.close();

    await expect(core.restoreDatabase(bytes)).rejects.toThrow(
      /doesn't look like a DumosRx backup/,
    );

    const rows = core.getDatabaseBinary();
    const check = new SQL.Database(rows!);
    const result = check.exec("SELECT name FROM stores WHERE id = 'store-original'");
    expect(result[0]?.values[0]?.[0]).toBe("Original Store");
    check.close();
  });

  it("accepts a valid DumosRx backup, snapshots the outgoing db first, and the restore takes effect", async () => {
    const validBytes = makeValidDumosDbBytes("Restored Store");

    await core.restoreDatabase(validBytes);

    const rows = core.getDatabaseBinary();
    const check = new SQL.Database(rows!);
    const result = check.exec("SELECT name FROM stores WHERE id = 'store-1'");
    expect(result[0]?.values[0]?.[0]).toBe("Restored Store");
    check.close();

    // The pre-restore snapshot must contain the ORIGINAL data, not the
    // just-restored data.
    const snapshotBytes = idbStore.get("dumosrx_db_pre_restore_backup") as Uint8Array;
    expect(snapshotBytes).toBeDefined();
    const snapshotDb = new SQL.Database(snapshotBytes);
    const snapshotResult = snapshotDb.exec("SELECT name FROM stores WHERE id = 'store-original'");
    expect(snapshotResult[0]?.values[0]?.[0]).toBe("Original Store");
    snapshotDb.close();
  });

  it("restorePreRestoreSnapshot() recovers the database as it stood before the last restore", async () => {
    const validBytes = makeValidDumosDbBytes("Restored Store");
    await core.restoreDatabase(validBytes);

    const recovered = await core.restorePreRestoreSnapshot();
    expect(recovered).toBe(true);

    const rows = core.getDatabaseBinary();
    const check = new SQL.Database(rows!);
    const result = check.exec("SELECT name FROM stores WHERE id = 'store-original'");
    expect(result[0]?.values[0]?.[0]).toBe("Original Store");
    check.close();
  });

  it("restorePreRestoreSnapshot() does nothing and returns false when there's no snapshot yet", async () => {
    const recovered = await core.restorePreRestoreSnapshot();
    expect(recovered).toBe(false);

    const rows = core.getDatabaseBinary();
    const check = new SQL.Database(rows!);
    const result = check.exec("SELECT name FROM stores WHERE id = 'store-original'");
    expect(result[0]?.values[0]?.[0]).toBe("Original Store");
    check.close();
  });
});
