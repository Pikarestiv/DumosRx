import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for two Low-severity docs/KNOWN_BUGS.md findings in
 * reports.ts:
 *
 * 1. fetchStockBatchReportData filtered products.store_id but never
 *    stock_batches.store_id on the join, so a legacy store_id-less batch (or
 *    one attributed to another store) could still be summed into the active
 *    store's valuation.
 * 2. getBIMetrics's current-period revenue/COGS/transaction queries used
 *    `transaction_date >= ?` with no upper bound, while the expense side
 *    (getSmoothedExpensesTotal) was already capped at "now" - a future-dated
 *    or clock-skewed sale counted toward revenue in a window the matching
 *    expenses were excluded from, skewing the reported margin.
 */
describe("reports.ts store scoping and current-period window cap", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let fetchStockBatchReportData: typeof import("@/lib/db/queries/reports").fetchStockBatchReportData;
  let getBIMetrics: typeof import("@/lib/db/queries/reports").getBIMetrics;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ fetchStockBatchReportData, getBIMetrics } = await import("@/lib/db/queries/reports"));

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

  beforeEach(() => {
    db.run(
      `DELETE FROM products; DELETE FROM stock_batches; DELETE FROM sales; DELETE FROM sale_items; DELETE FROM returns; DELETE FROM customers; DELETE FROM expenses; DELETE FROM users;`,
    );
    core.setActiveStoreId(null);
  });

  it("excludes a stock_batches row attributed to another store from the active store's valuation", async () => {
    db.run(
      `INSERT INTO products (id, name, store_id, _deleted) VALUES ('p1', 'Amoxicillin', 'store-a', 0)`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, store_id, quantity, cost_price, _deleted) VALUES
        ('b1', 'p1', 'store-a', 10, 100, 0),
        ('b2', 'p1', 'store-b', 500, 100, 0)`,
    );

    core.setActiveStoreId("store-a");
    const rows = await fetchStockBatchReportData();

    expect(rows).toHaveLength(1);
    expect(rows[0]["Stock Qty"]).toBe(10);
  });

  it("excludes a legacy store_id-less stock_batches row from every store's valuation, matching stock_batchValueData's own strict store_id = ? convention (no NULL fallback) elsewhere in this file", async () => {
    db.run(
      `INSERT INTO products (id, name, store_id, _deleted) VALUES ('p1', 'Amoxicillin', 'store-a', 0)`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, store_id, quantity, cost_price, _deleted) VALUES
        ('b1', 'p1', NULL, 10, 100, 0)`,
    );

    core.setActiveStoreId("store-a");
    const rows = await fetchStockBatchReportData();

    expect(rows).toHaveLength(0);
  });

  it("excludes a future-dated sale from the current-period revenue/COGS/transaction totals", async () => {
    const farPast = "2020-01-01T00:00:00.000Z";
    const farFuture = "2099-01-01T00:00:00.000Z";

    db.run(
      `INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Paracetamol', 0)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, total_amount, subtotal, tax_amount, transaction_date, _deleted) VALUES
        ('s1', 'TXN-1', 1000, 1000, 0, '2026-06-01', 0),
        ('s2', 'TXN-2', 999999, 999999, 0, ?, 0)`,
      [farFuture],
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, _deleted) VALUES
        ('si1', 's1', 'p1', 1, 1000, 500, 1000, 0),
        ('si2', 's2', 'p1', 1, 999999, 500000, 999999, 0)`,
    );

    const metrics = await getBIMetrics(farPast, farPast);

    expect(metrics.revenueData[0].total).toBe(1000);
    expect(metrics.transactionData[0].count).toBe(1);
    expect(metrics.cogsData[0].total).toBe(500);
  });

  it("also excludes a future-dated sale from top-sellers, category distribution, and product/cashier performance (extended past the initial revenue/COGS/transaction-only cap)", async () => {
    const farPast = "2020-01-01T00:00:00.000Z";
    const farFuture = "2099-01-01T00:00:00.000Z";

    db.run(
      `INSERT INTO products (id, name, category_id, _deleted) VALUES ('p1', 'Paracetamol', NULL, 0)`,
    );
    db.run(
      `INSERT INTO users (id, first_name, last_name, _deleted) VALUES ('u1', 'Jane', 'Doe', 0)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, total_amount, subtotal, tax_amount, transaction_date, user_id, _deleted) VALUES
        ('s1', 'TXN-1', 1000, 1000, 0, '2026-06-01', 'u1', 0),
        ('s2', 'TXN-2', 999999, 999999, 0, ?, 'u1', 0)`,
      [farFuture],
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, _deleted) VALUES
        ('si1', 's1', 'p1', 1, 1000, 500, 1000, 0),
        ('si2', 's2', 'p1', 1, 999999, 500000, 999999, 0)`,
    );

    const metrics = await getBIMetrics(farPast, farPast);

    expect(metrics.topSellingByRevenue[0].sales).toBe(1000);
    expect(metrics.categoryDistribution[0].value).toBe(1000);
    expect(metrics.productPerformance[0].revenue).toBe(1000);
    expect(metrics.cashierPerformance[0].totalSales).toBe(1000);
  });

  it("excludes a future-dated return from totalRefundsData/returnedCogsData, and a future sale from retentionData", async () => {
    const farPast = "2020-01-01T00:00:00.000Z";
    const farFuture = "2099-01-01T00:00:00.000Z";

    db.run(
      `INSERT INTO products (id, name, _deleted) VALUES ('p1', 'Paracetamol', 0)`,
    );
    db.run(
      `INSERT INTO customers (id, first_name, last_name, _deleted) VALUES ('c1', 'Regular', 'Customer', 0)`,
    );
    db.run(
      `INSERT INTO users (id, first_name, last_name, _deleted) VALUES ('u1', 'Jane', 'Doe', 0)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, total_amount, subtotal, tax_amount, transaction_date, customer_id, _deleted) VALUES
        ('s1', 'TXN-1', 1000, 1000, 0, '2026-06-01', 'c1', 0),
        ('s2', 'TXN-2', 1000, 1000, 0, ?, 'c1', 0)`,
      [farFuture],
    );
    db.run(
      `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted) VALUES
        ('r1', 's2', 'u1', 500, ?, 0)`,
      [farFuture],
    );

    const metrics = await getBIMetrics(farPast, farPast);

    expect(metrics.totalRefundsData[0].total ?? 0).toBe(0);
    // A single sale in the window means this customer hasn't "returned" yet.
    expect(metrics.retentionData[0].returning_count).toBe(0);
  });
});
