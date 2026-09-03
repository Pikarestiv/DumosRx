import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for bug #4's "floor + alert" fix
 * (docs/features/_known-bugs.md #4): recordSaleItemStock now floors an
 * oversold batch's stock_batches.quantity at 0 instead of going negative,
 * and tags the stock_movements row's `reason` with an "oversold" marker so
 * staff can find and reconcile it. getOversoldAlerts() (lib/db/queries/
 * inventory.ts) surfaces products with such a tagged movement within the
 * last 30 days, modeled on the existing getLowStockAlerts()/
 * getExpiryAlerts().
 */
describe("getOversoldAlerts", () => {
  let db: Database;
  let recordSaleItemStock: typeof import("@/lib/db/queries/inventory").recordSaleItemStock;
  let getOversoldAlerts: typeof import("@/lib/db/queries/inventory").getOversoldAlerts;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const inventory = await import("@/lib/db/queries/inventory");
    recordSaleItemStock = inventory.recordSaleItemStock;
    getOversoldAlerts = inventory.getOversoldAlerts;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM sales; DELETE FROM sale_items; DELETE FROM sale_item_batches; DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;`,
    );
    db.run(
      `INSERT INTO products (id, name, selling_price) VALUES ('prod1', '10ML SYRINGE', 100)`,
    );
    db.run(
      `INSERT INTO products (id, name, selling_price) VALUES ('prod2', 'PARACETAMOL', 50)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, payment_status) VALUES ('sale1', 'TXN-1', 100, 100, 'cash', 'completed')`,
    );
  });

  it("returns a product that was oversold via recordSaleItemStock", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price) VALUES ('batch1', 'prod1', 1, 60)`,
    );

    await recordSaleItemStock({
      saleId: "sale1",
      productId: "prod1",
      quantity: 3,
      unitPrice: 100,
      costPrice: 60,
      subtotal: 300,
      cashierId: "user1",
    });

    const alerts = await getOversoldAlerts();
    expect(alerts.some((a) => a.product === "10ML SYRINGE")).toBe(true);
  });

  it("does not return a product that was sold normally within stock", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price) VALUES ('batch2', 'prod2', 100, 10)`,
    );

    await recordSaleItemStock({
      saleId: "sale1",
      productId: "prod2",
      quantity: 2,
      unitPrice: 50,
      costPrice: 10,
      subtotal: 100,
      cashierId: "user1",
    });

    const alerts = await getOversoldAlerts();
    expect(alerts.some((a) => a.product === "PARACETAMOL")).toBe(false);
  });

  it("does not surface an oversold movement outside the recency window", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price) VALUES ('batch1', 'prod1', 1, 60)`,
    );

    await recordSaleItemStock({
      saleId: "sale1",
      productId: "prod1",
      quantity: 3,
      unitPrice: 100,
      costPrice: 60,
      subtotal: 300,
      cashierId: "user1",
    });

    // Backdate the movement well outside the 30-day window.
    db.run(
      `UPDATE stock_movements SET movement_date = date('now', '-90 days') WHERE reference_id = 'sale1' AND product_id = 'prod1'`,
    );

    const alerts = await getOversoldAlerts();
    expect(alerts.some((a) => a.product === "10ML SYRINGE")).toBe(false);
  });
});
