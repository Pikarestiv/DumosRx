import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type SqlJsStatic, type Database } from "sql.js";
import { SCHEMA_SQL } from "@/lib/db/schema";
import { STORE_SCOPED_TABLES } from "@/lib/db/schema-migrations";

/**
 * A-163 (docs/FIXED_BUGS.md): a store-scoped table left behind by
 * clearDatabaseForNewStore() keeps the previous store's rows at
 * `_synced = 0` with no queue entry - precisely what requeueOrphanedRows()
 * re-queues - so they are pushed under the new account's identity and
 * refused as cross-tenant forever.
 */

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => {}),
  del: vi.fn(async () => {}),
}));

const isWriterTab = vi.fn(() => true);

vi.mock("@/lib/db/tab-lock", () => ({
  initWriterLock: vi.fn(async () => {}),
  isWriterTab: () => isWriterTab(),
  onWriterTabChange: () => () => {},
  onPromotionFailed: () => () => {},
  requestWriterHandoff: vi.fn(),
  forceWriterTakeover: vi.fn(),
}));

describe("clearDatabaseForNewStore() and store-scoped tables", () => {
  let core: typeof import("@/lib/db/core");
  let SQL: SqlJsStatic;
  let db: Database;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
  });

  beforeEach(() => {
    localStorage.clear();
    isWriterTab.mockReturnValue(true);
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  it("leaves no row of any store-scoped table behind for the previous store", async () => {
    const seeded: string[] = [];
    for (const table of STORE_SCOPED_TABLES) {
      const columns = db.exec(`PRAGMA table_info(${table})`);
      const names = (columns[0]?.values ?? []).map((row) => String(row[1]));
      if (!names.includes("store_id")) continue;
      const required = (columns[0]?.values ?? [])
        .filter((row) => Number(row[3]) === 1 && row[4] === null && String(row[1]) !== "id")
        .map((row) => String(row[1]));
      const cols = ["id", "store_id", ...required];
      const values = cols.map((c) => (c === "id" ? "'orphan-1'" : c === "store_id" ? "'old-store-1'" : "'x'"));
      db.run(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${values.join(", ")})`);
      seeded.push(table);
    }

    expect(seeded).toContain("permission_groups");

    await core.clearDatabaseForNewStore();

    const survivors = seeded.filter((table) => db.exec(`SELECT id FROM ${table}`).length > 0);
    expect(survivors).toEqual([]);
  });

  it("clears the previous store's default permission groups specifically", async () => {
    db.run(
      `INSERT INTO permission_groups (id, store_id, name, based_on_role, is_default, permissions, _synced)
       VALUES ('orphan-admin', 'old-store-1', 'Admin', 'admin', 1, '[]', 0)`,
    );

    await core.clearDatabaseForNewStore();

    expect(db.exec("SELECT id FROM permission_groups")).toEqual([]);
  });
});
