import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises getActiveProductsForPO() against a genuine in-memory SQLite
 * engine. Regression coverage for the fix where "cost_price" meant "the
 * most recently created batch's cost" instead of the same averaged cost
 * shown everywhere else (Product Catalog's "Avg Cost"), and where
 * stock_quantity wasn't selected at all.
 */
describe("getActiveProductsForPO", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getActiveProductsForPO: typeof import("@/lib/db/queries/procurement").getActiveProductsForPO;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const procurement = await import("@/lib/db/queries/procurement");
    getActiveProductsForPO = procurement.getActiveProductsForPO;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT, base_unit TEXT, bulk_unit TEXT, units_per_bulk INTEGER,
        _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE stock_batches (
        id TEXT PRIMARY KEY, product_id TEXT, quantity INTEGER, cost_price REAL,
        created_at TEXT, is_active INTEGER DEFAULT 1, _deleted INTEGER DEFAULT 0
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM stock_batches;`);
  });

  it("returns the averaged cost across active batches and total stock quantity", async () => {
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, is_active, _deleted) VALUES
      ('b1', 'prod1', 100, 4, 1, 0),
      ('b2', 'prod1', 50, 6, 1, 0)`);

    const products = await getActiveProductsForPO();
    const panadol = products.find((p) => p.id === "prod1")!;

    expect(panadol.cost_price).toBe(5);
    expect(panadol.stock_quantity).toBe(150);
  });

  it("returns 0 stock_quantity for a product with no batches", async () => {
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod2', 'New Item', 'Unit', 'Box', 1)`);

    const products = await getActiveProductsForPO();
    const item = products.find((p) => p.id === "prod2")!;

    expect(item.stock_quantity).toBe(0);
  });

  it("excludes inactive and soft-deleted batches from both cost average and stock quantity", async () => {
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod3', 'Amoxil', 'Capsule', 'Pack', 10)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, is_active, _deleted) VALUES
      ('b3', 'prod3', 100, 4, 1, 0),
      ('b4', 'prod3', 999, 999, 0, 0),
      ('b5', 'prod3', 999, 999, 1, 1)`);

    const products = await getActiveProductsForPO();
    const amoxil = products.find((p) => p.id === "prod3")!;

    expect(amoxil.cost_price).toBe(4);
    expect(amoxil.stock_quantity).toBe(100);
  });
});
