import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Cynthia asked to see how many products are in each category right on the
 * Manage Categories tiles, so she can tell at a glance which ones are safe
 * to edit or delete. getCategoryList() previously returned just {id, name};
 * the dialog only ever found out a category's product count lazily, one
 * query per click, the moment you tried to delete it. This covers the new
 * `productCount` field added to the list query itself.
 */
describe("getCategoryList() product counts", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getCategoryList: typeof import("@/lib/db/queries/categories").getCategoryList;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ getCategoryList } = await import("@/lib/db/queries/categories"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT;`);
    db.run(`ALTER TABLE categories ADD COLUMN store_id TEXT;`);
    db.run(`ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1;`);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM categories;`);
    core.setActiveStoreId(null);
  });

  it("includes each category's active product count", async () => {
    db.run(
      `INSERT INTO categories (id, name, _deleted) VALUES ('c1', 'Drugs', 0), ('c2', 'Empty', 0)`,
    );
    db.run(
      `INSERT INTO products (id, name, category_id, _deleted) VALUES
        ('p1', 'A', 'c1', 0),
        ('p2', 'B', 'c1', 0),
        ('p3', 'C', 'c1', 1)`, // soft-deleted, must not count
    );

    const categories = await getCategoryList();

    const drugs = categories.find((c) => c.id === "c1");
    const empty = categories.find((c) => c.id === "c2");
    expect(drugs?.productCount).toBe(2);
    expect(empty?.productCount).toBe(0);
  });

  it("only counts products for the active store", async () => {
    core.setActiveStoreId("store-a");
    db.run(
      `INSERT INTO categories (id, name, store_id, _deleted) VALUES ('c1', 'Drugs', 'store-a', 0)`,
    );
    db.run(
      `INSERT INTO products (id, name, category_id, store_id, _deleted) VALUES
        ('p1', 'A', 'c1', 'store-a', 0),
        ('p2', 'B', 'c1', 'store-b', 0)`,
    );

    const categories = await getCategoryList();

    expect(categories.find((c) => c.id === "c1")?.productCount).toBe(1);
  });
});
