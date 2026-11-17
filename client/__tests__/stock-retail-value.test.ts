import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import { describeStockValue } from "@/lib/utils/stock-value-display";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("getStockBatchStats retail value", () => {
  let db: Database;
  let getStockBatchStats: typeof import("@/lib/db/queries/inventory").getStockBatchStats;
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    getStockBatchStats = (await import("@/lib/db/queries/inventory")).getStockBatchStats;
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    core.setActiveStoreId(null);
    db.run("DELETE FROM products; DELETE FROM stock_batches;");
  });

  it("values on-hand stock at the selling price even when no cost price was entered", async () => {
    db.run(`INSERT INTO products (id, name, selling_price, is_active, _deleted) VALUES ('p1', 'Cream', 2500, 1, 0)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, _deleted) VALUES ('b1', 'p1', 4, 0, 0), ('b2', 'p1', 6, 0, 0)`);

    const stats = await getStockBatchStats();

    expect(stats.total_stock_batch_value).toBe(0);
    expect(stats.total_retail_value).toBe(25000);
  });

  it("keeps cost value and retail value side by side", async () => {
    db.run(`INSERT INTO products (id, name, selling_price, is_active, _deleted) VALUES ('p1', 'Tablet', 100, 1, 0)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, _deleted) VALUES ('b1', 'p1', 10, 60, 0)`);

    const stats = await getStockBatchStats();

    expect(stats.total_stock_batch_value).toBe(600);
    expect(stats.total_retail_value).toBe(1000);
  });

  it("ignores deleted products and counts a product with negative stock as zero", async () => {
    db.run(`INSERT INTO products (id, name, selling_price, is_active, _deleted) VALUES ('p1', 'Gone', 100, 1, 1), ('p2', 'Oversold', 100, 1, 0)`);
    db.run(`INSERT INTO stock_batches (id, product_id, quantity, cost_price, _deleted) VALUES ('b1', 'p1', 10, 5, 0), ('b2', 'p2', -3, 5, 0)`);

    const stats = await getStockBatchStats();

    expect(stats.total_retail_value).toBe(0);
  });
});

describe("describeStockValue", () => {
  const fmt = (n: number) => `N${n}`;

  it("leads with cost value and notes the selling-price worth", () => {
    expect(describeStockValue(600, 1000, fmt)).toEqual({ value: 600, caption: "Worth N1000 at selling price" });
  });

  it("falls back to the selling-price value when no cost prices are recorded", () => {
    expect(describeStockValue(0, 25000, fmt)).toEqual({ value: 25000, caption: "At selling price (no cost prices set)" });
  });

  it("shows zero with no caption for an empty store", () => {
    expect(describeStockValue(0, 0, fmt)).toEqual({ value: 0, caption: null });
  });
});
