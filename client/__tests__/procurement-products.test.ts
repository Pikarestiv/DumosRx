import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises getActiveProductsForPO() against a genuine in-memory SQLite
 * engine. Regression coverage for two fixes: "cost_price" meaning "the
 * most recently created batch's cost" instead of a real average across
 * batches; and that average being a plain AVG(cost_price) instead of a
 * quantity-weighted average, which skews the result toward small/odd-cost
 * batches (see KNOWN_BUGS.md #5/#8 — this exact query was part of that bug).
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

  it("returns the quantity-weighted average cost across active batches and total stock quantity", async () => {
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, is_active, _deleted) VALUES
      ('b1', 'prod1', 100, 4, 1, 0),
      ('b2', 'prod1', 50, 6, 1, 0)`);

    const products = await getActiveProductsForPO();
    const panadol = products.find((p) => p.id === "prod1")!;

    // Weighted: (100*4 + 50*6) / 150 = 4.667 — a plain AVG(4, 6) = 5 would be
    // wrong here since it ignores that the ₦4 batch is twice the size.
    expect(panadol.cost_price).toBeCloseTo(4.6667, 4);
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
