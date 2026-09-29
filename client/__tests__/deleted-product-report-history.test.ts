import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Pins the load-bearing ABSENCE of a `_deleted = 0` filter on reports.ts's
 * `products` joins, documented in client/AGENTS.md ("The deactivate-vs-delete
 * design"). deleteProduct() is a non-cascading soft delete, so a sold product
 * that is later deleted must still resolve its name and category on every
 * sale it already appears in. Adding a deleted filter to any of the joins
 * below silently blanks or drops those historical rows, and every test here
 * goes red when it is added.
 */
describe("report history survives a product delete", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let reports: typeof import("@/lib/db/queries/reports");
  let products: typeof import("@/lib/db/queries/products");

  const SALE_DATE = "2026-09-01T10:00:00.000Z";
  const FROM = "2026-08-01T00:00:00.000Z";
  const PREV = "2026-07-01T00:00:00.000Z";

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    reports = await import("@/lib/db/queries/reports");
    products = await import("@/lib/db/queries/products");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(async () => {
    db.run(
      `DELETE FROM products; DELETE FROM categories; DELETE FROM sales; DELETE FROM sale_items;
       DELETE FROM stock_batches; DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
       DELETE FROM returns; DELETE FROM return_items; DELETE FROM expenses; DELETE FROM customers;
       DELETE FROM users; DELETE FROM _sync_queue;`,
    );
    core.setActiveStoreId(null);

    db.run(`INSERT INTO categories (id, name, _deleted) VALUES ('c1', 'Antibiotics', 0)`);
    db.run(
      `INSERT INTO products (id, name, category_id, selling_price, is_active, _deleted)
       VALUES ('p1', 'Amoxicillin 500mg', 'c1', 100, 1, 0)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, created_at, _deleted)
       VALUES ('s1', 'TXN-1', 300, 300, ?, ?, 0)`,
      [SALE_DATE, SALE_DATE],
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, created_at, _deleted)
       VALUES ('si1', 's1', 'p1', 3, 100, 60, 300, ?, 0)`,
      [SALE_DATE],
    );

    await products.deleteProduct("p1");
    const deleted = db.exec(`SELECT _deleted FROM products WHERE id = 'p1'`);
    expect(deleted[0]?.values[0]?.[0]).toBe(1);
  });

  it("keeps the deleted product in getBIMetrics's top sellers by revenue and by units", async () => {
    const metrics = await reports.getBIMetrics(FROM, PREV);

    expect(metrics.topSellingByRevenue).toHaveLength(1);
    expect(metrics.topSellingByRevenue[0]).toMatchObject({
      name: "Amoxicillin 500mg",
      sales: 300,
      units: 3,
      category: "Antibiotics",
    });
    expect(metrics.topSellingByQuantity[0]).toMatchObject({
      name: "Amoxicillin 500mg",
      units: 3,
    });
  });

  it("keeps the deleted product's revenue in getBIMetrics's category distribution", async () => {
    const metrics = await reports.getBIMetrics(FROM, PREV);

    expect(metrics.categoryDistribution).toEqual([{ name: "Antibiotics", value: 300 }]);
  });

  it("keeps the deleted product as a row in getBIMetrics's product performance", async () => {
    const metrics = await reports.getBIMetrics(FROM, PREV);

    expect(metrics.productPerformance).toHaveLength(1);
    expect(metrics.productPerformance[0]).toMatchObject({
      id: "p1",
      name: "Amoxicillin 500mg",
      category: "Antibiotics",
      revenue: 300,
      units: 3,
      cost: 180,
    });
  });

  it("keeps the deleted product in the Top Sellers report export", async () => {
    const rows = await reports.fetchTopSellersReportData(FROM, "2026-09-30T00:00:00.000Z");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      Product: "Amoxicillin 500mg",
      Category: "Antibiotics",
      "Qty Sold": 3,
      Revenue: 300,
    });
  });

  it("still attributes the deleted product's category in getPurchasePatterns", async () => {
    const { slotCategoryData } = await reports.getPurchasePatterns(FROM);

    expect(slotCategoryData).toHaveLength(1);
    expect(slotCategoryData[0].category).toBe("Antibiotics");
  });
});
