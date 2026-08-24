import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for the multi-store query-scoping mechanism itself:
 * the module-scope getActiveStoreId()/setActiveStoreId() resolver in
 * lib/db/core.ts, and the read/write scoping pattern built on it
 * (products.ts as the reference implementation, insert()'s auto-injection).
 * Real in-memory SQLite (sql.js), not a mocked query(). A wrong ternary or
 * a forgotten `AND store_id = ?` would silently leak one store's data into
 * another's view, which only shows up by asserting on actual returned rows.
 */
describe("multi-store query scoping", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let getProductsWithStock: typeof import("@/lib/db/queries/products").getProductsWithStock;
  let getProductList: typeof import("@/lib/db/queries/products").getProductList;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const baseHelpers = await import("@/lib/db/base-helpers");
    insert = baseHelpers.insert;
    const products = await import("@/lib/db/queries/products");
    getProductsWithStock = products.getProductsWithStock;
    getProductList = products.getProductList;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    // store_id is added via core.ts's runtime ALTER TABLE migration, not the
    // base CREATE TABLE statements in SCHEMA_SQL. Replicate it here since
    // __setDatabaseForTesting bypasses initDatabase()'s migration loop.
    db.run(`ALTER TABLE products ADD COLUMN store_id TEXT;`);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM categories; DELETE FROM stock_batches; DELETE FROM stores;`);
    core.setActiveStoreId(null);
  });

  it("returns only the active store's products, and only categories flow through with the query", async () => {
    db.run(
      `INSERT INTO products (id, name, selling_price, store_id, _deleted) VALUES
        ('p1', 'Panadol', 500, 'store-a', 0),
        ('p2', 'Amoxicillin', 800, 'store-b', 0)`,
    );

    core.setActiveStoreId("store-a");
    const storeAProducts = await getProductsWithStock();
    expect(storeAProducts.map((p) => p.id)).toEqual(["p1"]);

    core.setActiveStoreId("store-b");
    const storeBProducts = await getProductsWithStock();
    expect(storeBProducts.map((p) => p.id)).toEqual(["p2"]);
  });

  it("returns every product, unfiltered, when no active store is resolved (pre-migration/setup edge case)", async () => {
    db.run(
      `INSERT INTO products (id, name, selling_price, store_id, _deleted) VALUES
        ('p1', 'Panadol', 500, 'store-a', 0),
        ('p2', 'Amoxicillin', 800, 'store-b', 0)`,
    );

    core.setActiveStoreId(null);
    const all = await getProductsWithStock();
    expect(all.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("getProductList applies the same store filter as getProductsWithStock", async () => {
    db.run(
      `INSERT INTO products (id, name, store_id, _deleted) VALUES
        ('p1', 'Panadol', 'store-a', 0),
        ('p2', 'Amoxicillin', 'store-b', 0)`,
    );

    core.setActiveStoreId("store-a");
    const list = await getProductList();
    expect(list.map((p) => p.id)).toEqual(["p1"]);
  });

  it("insert() auto-populates store_id from the active store when the caller doesn't set one", async () => {
    core.setActiveStoreId("store-a");
    const id = await insert("products", { name: "New Product" });

    const rows = db.exec(`SELECT store_id FROM products WHERE id = '${id}'`);
    expect(rows[0].values[0][0]).toBe("store-a");
  });

  it("insert() does not override an explicitly-provided store_id", async () => {
    core.setActiveStoreId("store-a");
    const id = await insert("products", { name: "Cross-store product", store_id: "store-b" });

    const rows = db.exec(`SELECT store_id FROM products WHERE id = '${id}'`);
    expect(rows[0].values[0][0]).toBe("store-b");
  });

  it("insert() never injects store_id into a table that has no such column", async () => {
    core.setActiveStoreId("store-a");
    // stores itself has no store_id column; should not throw.
    await expect(
      insert("stores", { name: "Test Store", store_type: "pharmacy", currency: "NGN" }),
    ).resolves.toBeDefined();
  });
});
