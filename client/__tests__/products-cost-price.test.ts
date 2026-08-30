import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for KNOWN_BUGS.md #5/#8: getProductsWithStock() feeds
 * the live POS cart, and its cost_price is permanently persisted into
 * sale_items.cost_price at checkout — so if this query's average isn't
 * quantity-weighted, the wrong COGS gets baked into real sale records
 * forever, corrupting every downstream P&L/margin report. A plain
 * AVG(cost_price) across batches would report a cost skewed toward small,
 * odd-priced batches instead of reflecting what's actually on the shelf.
 */
describe("getProductsWithStock cost_price", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getProductsWithStock: typeof import("@/lib/db/queries/products").getProductsWithStock;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const products = await import("@/lib/db/queries/products");
    getProductsWithStock = products.getProductsWithStock;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT, generic_name TEXT, strength TEXT, selling_price REAL,
        reorder_level INTEGER, barcode TEXT, category_id TEXT, base_unit TEXT, bulk_unit TEXT,
        units_per_bulk INTEGER, _deleted INTEGER DEFAULT 0, store_id TEXT
      );
      CREATE TABLE categories (
        id TEXT PRIMARY KEY, name TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE stock_batches (
        id TEXT PRIMARY KEY, product_id TEXT, quantity INTEGER, cost_price REAL,
        batch_number TEXT, is_active INTEGER DEFAULT 1, _deleted INTEGER DEFAULT 0
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM categories; DELETE FROM stock_batches;`);
  });

  it("weights cost by batch quantity, not a plain average across batches", async () => {
    // Batch A: 500 units @ ₦10 (the bulk of stock). Batch B: 5 units @ ₦1000
    // (one emergency spot-price restock). True weighted cost = (500*10 +
    // 5*1000) / 505 ≈ ₦19.80/unit; a plain AVG(10, 1000) would report
    // ₦505 — 25x too high.
    db.run(
      `INSERT INTO products (id, name, selling_price) VALUES ('prod1', 'Zyrtec', 1000)`,
    );
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price) VALUES
      ('b1', 'prod1', 500, 10),
      ('b2', 'prod1', 5, 1000)`);

    const [zyrtec] = await getProductsWithStock();

    expect(zyrtec.cost_price).toBeCloseTo((500 * 10 + 5 * 1000) / 505, 6);
    expect(zyrtec.stock).toBe(505);
  });

  it("falls back to 0 for a product with no batches, without erroring on division by zero", async () => {
    db.run(`INSERT INTO products (id, name, selling_price) VALUES ('prod2', 'New Item', 500)`);

    const [item] = await getProductsWithStock();

    expect(item.cost_price).toBe(0);
    expect(item.stock).toBe(0);
  });
});
