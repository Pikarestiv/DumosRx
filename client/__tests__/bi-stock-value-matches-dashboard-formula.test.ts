import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// See client/AGENTS.md "Three places compute inventory/stock value" and
// docs/FIXED_BUGS.md A-147 for the bug this pins.
describe("getBIMetrics's stock value matches the dashboard/report formula", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getBIMetrics: typeof import("@/lib/db/queries/reports").getBIMetrics;
  let getStockBatchStats: typeof import("@/lib/db/queries/inventory").getStockBatchStats;

  const FROM = "2026-08-01T00:00:00.000Z";
  const PREV = "2026-07-01T00:00:00.000Z";

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const reports = await import("@/lib/db/queries/reports");
    getBIMetrics = reports.getBIMetrics;
    const inventory = await import("@/lib/db/queries/inventory");
    getStockBatchStats = inventory.getStockBatchStats;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    core.setActiveStoreId(null);
    db.run(
      `DELETE FROM products; DELETE FROM categories; DELETE FROM stock_batches;
       DELETE FROM sales; DELETE FROM sale_items; DELETE FROM _sync_queue;`,
    );

    db.run(
      `INSERT INTO products (id, name, selling_price, is_active, _deleted)
       VALUES ('p1', 'Live Product', 100, 1, 0)`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price, _deleted)
       VALUES ('b1', 'p1', 10, 50, 0)`,
    );
  });

  it("reports the batch value while the product is live", async () => {
    const metrics = await getBIMetrics(FROM, PREV);
    expect(metrics.stock_batchValueData[0]?.value).toBe(500);
  });

  it("excludes the batch value once its product is deleted, matching the dashboard's own figure", async () => {
    // Raw soft-delete rather than products.deleteProduct(), which refuses
    // to delete a product that still has stock on hand - irrelevant to
    // what's under test here (the query's own _deleted handling).
    db.run(`UPDATE products SET _deleted = 1 WHERE id = 'p1'`);

    const metrics = await getBIMetrics(FROM, PREV);
    const dashboardStats = await getStockBatchStats();

    expect(metrics.stock_batchValueData[0]?.value ?? 0).toBe(0);
    expect(dashboardStats.total_stock_batch_value ?? 0).toBe(0);
  });
});
