import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for bug #4's "floor + alert" fix
 * (docs/features/_known-bugs.md #4): recordSaleItemStock floors an oversold
 * batch's stock_batches.quantity at 0 instead of going negative, and
 * getOversoldAlerts() surfaces the product so staff can reconcile it.
 *
 * Rewritten 2026-10-14 (A-212, and stage 1 of
 * docs/superpowers/specs/2026-10-14-oversell-compensating-movement-design.md):
 * the alert is derived from the movement log's own shortfall rather than from
 * the word "oversold" in a reason string inside a 30-day window. It therefore
 * reports what is still owed rather than that something once happened, and it
 * goes quiet when the shortfall is cleared rather than when a month passes.
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

  it("still surfaces a shortfall that is months old, because it is still owed", async () => {
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

    // Backdated well outside the window the old alert used. The two units the
    // ledger owes have not gone anywhere, and the next delivery against this
    // batch will still pay them off before it adds anything (A-265), so going
    // quiet after a month was the defect, not the feature.
    db.run(
      `UPDATE stock_movements SET movement_date = date('now', '-90 days') WHERE reference_id = 'sale1' AND product_id = 'prod1'`,
    );

    const alerts = await getOversoldAlerts();
    expect(alerts.some((a) => a.product === "10ML SYRINGE")).toBe(true);
  });

  it("goes quiet once the shortfall has actually been made up", async () => {
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
    expect((await getOversoldAlerts()).some((a) => a.product === "10ML SYRINGE")).toBe(true);

    // +3, not +2: this batch's own single unit was never logged as inbound
    // either, so the log is short by the whole three it recorded going out.
    // That is also exactly what an inbound movement has to cover before the
    // figure on screen moves, which is what the alert is reporting.
    db.run(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted)
       VALUES ('make-up', 'prod1', 'batch1', 'adjustment', 3, 0)`,
    );

    expect((await getOversoldAlerts()).some((a) => a.product === "10ML SYRINGE")).toBe(false);
  });

  it("does not report a batch whose stock was never logged as coming in (A-148)", async () => {
    // Seeded with stock and no movement at all, the pre-a36b00e7 import shape:
    // its sales sum below zero but the units were on the shelf, so nothing is
    // owed and a count against it is not absorbed.
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price) VALUES ('legacy', 'prod1', 100, 60)`,
    );

    await recordSaleItemStock({
      saleId: "sale1",
      productId: "prod1",
      quantity: 2,
      unitPrice: 100,
      costPrice: 60,
      subtotal: 200,
      cashierId: "user1",
    });

    expect((await getOversoldAlerts()).some((a) => a.product === "10ML SYRINGE")).toBe(false);
  });
});
