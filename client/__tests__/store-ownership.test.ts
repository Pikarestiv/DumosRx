import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for bug #8 (docs/features/_known-bugs.md): update() and
 * softDelete() in base-helpers.ts used to perform zero store-ownership check,
 * so any store could rename/delete another store's row (or a still-shared
 * legacy NULL-store_id row forever, instead of just claiming it once) via the
 * completely ordinary edit/delete UI. Exercises the three real cases against
 * a real in-memory SQLite instance (sql.js), on the "categories" table (a
 * STORE_SCOPED_TABLES member with a simple shape) via the actual update()/
 * softDelete() exports, not a reimplementation.
 */
describe("update()/softDelete() store-ownership check", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let update: typeof import("@/lib/db/base-helpers").update;
  let softDelete: typeof import("@/lib/db/base-helpers").softDelete;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const baseHelpers = await import("@/lib/db/base-helpers");
    update = baseHelpers.update;
    softDelete = baseHelpers.softDelete;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    // store_id is added via core.ts's runtime ALTER TABLE migration, not the
    // base CREATE TABLE statements in SCHEMA_SQL. Replicate it here since
    // __setDatabaseForTesting bypasses initDatabase()'s migration loop.
    db.run(`ALTER TABLE categories ADD COLUMN store_id TEXT;`);
    db.run(`ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1;`);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM categories;`);
    core.setActiveStoreId(null);
  });

  function insertCategory(id: string, name: string, storeId: string | null) {
    db.run(
      `INSERT INTO categories (id, name, store_id, _deleted) VALUES ('${id}', '${name}', ${
        storeId ? `'${storeId}'` : "NULL"
      }, 0)`,
    );
  }

  function readCategory(id: string): { name: string; store_id: string | null; _deleted: number } {
    const res = db.exec(`SELECT name, store_id, _deleted FROM categories WHERE id = '${id}'`);
    const [name, store_id, _deleted] = res[0].values[0];
    return { name: name as string, store_id: store_id as string | null, _deleted: _deleted as number };
  }

  describe("update()", () => {
    it("allows editing your own store's row", async () => {
      insertCategory("c1", "Drugs", "store-a");
      core.setActiveStoreId("store-a");

      await update("categories", "c1", { name: "Medicines" });

      expect(readCategory("c1").name).toBe("Medicines");
    });

    it("allows editing a legacy NULL-store_id row and claims it for the active store", async () => {
      insertCategory("c1", "Legacy", null);
      core.setActiveStoreId("store-a");

      await update("categories", "c1", { name: "Legacy Renamed" });

      const row = readCategory("c1");
      expect(row.name).toBe("Legacy Renamed");
      expect(row.store_id).toBe("store-a");
    });

    it("rejects editing a different known store's row, and leaves the row unmodified", async () => {
      insertCategory("c1", "Drugs", "store-b");
      core.setActiveStoreId("store-a");

      await expect(update("categories", "c1", { name: "Hijacked" })).rejects.toThrow(
        "Cannot modify a record owned by a different store",
      );

      const row = readCategory("c1");
      expect(row.name).toBe("Drugs");
      expect(row.store_id).toBe("store-b");
    });
  });

  describe("softDelete()", () => {
    it("allows deleting your own store's row", async () => {
      insertCategory("c1", "Drugs", "store-a");
      core.setActiveStoreId("store-a");

      await softDelete("categories", "c1");

      expect(readCategory("c1")._deleted).toBe(1);
    });

    it("allows deleting a legacy NULL-store_id row and claims it for the active store", async () => {
      insertCategory("c1", "Legacy", null);
      core.setActiveStoreId("store-a");

      await softDelete("categories", "c1");

      const row = readCategory("c1");
      expect(row._deleted).toBe(1);
      expect(row.store_id).toBe("store-a");
    });

    it("rejects deleting a different known store's row, and leaves the row unmodified", async () => {
      insertCategory("c1", "Drugs", "store-b");
      core.setActiveStoreId("store-a");

      await expect(softDelete("categories", "c1")).rejects.toThrow(
        "Cannot modify a record owned by a different store",
      );

      const row = readCategory("c1");
      expect(row._deleted).toBe(0);
      expect(row.store_id).toBe("store-b");
    });
  });

  it("fails open (allows the write) when no active store is resolved", async () => {
    insertCategory("c1", "Drugs", "store-b");
    core.setActiveStoreId(null);

    await update("categories", "c1", { name: "Edited With No Active Store" });

    expect(readCategory("c1").name).toBe("Edited With No Active Store");
  });
});
