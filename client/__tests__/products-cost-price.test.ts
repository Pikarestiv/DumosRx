import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Regression coverage for KNOWN_BUGS.md #5/#8:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-products-cost-price-test-ts-L9
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
        batch_number TEXT, expiry_date TEXT, is_active INTEGER DEFAULT 1, _deleted INTEGER DEFAULT 0, created_at TEXT
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM products; DELETE FROM categories; DELETE FROM stock_batches;`);
  });

  it("weights cost by batch quantity, not a plain average across batches", async () => {
    // Batch A: 500 units @ ₦10 (the bulk of stock).
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-products-cost-price-test-ts-L54
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

  it("falls back to the last purchase cost when every batch is empty", async () => {
    db.run(`INSERT INTO products (id, name, selling_price) VALUES ('prod3', 'Cement', 5000)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, batch_number, created_at) VALUES
      ('old', 'prod3', 0, 3000, 'B-1', '2026-01-01'),
      ('new', 'prod3', 0, 3500, 'B-2', '2026-02-01'),
      ('adj', 'prod3', 0, 1, 'ADJ-9', '2026-03-01')`);

    const [item] = await getProductsWithStock();

    expect(item.cost_price).toBe(3500);
  });

  it("prefers the weighted average over the last purchase cost when stock is on hand", async () => {
    db.run(`INSERT INTO products (id, name, selling_price) VALUES ('prod4', 'Nails', 100)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, batch_number, created_at) VALUES
      ('a', 'prod4', 10, 20, 'B-1', '2026-01-01'),
      ('b', 'prod4', 0, 90, 'B-2', '2026-02-01')`);

    const [item] = await getProductsWithStock();

    expect(item.cost_price).toBe(20);
  });
});
