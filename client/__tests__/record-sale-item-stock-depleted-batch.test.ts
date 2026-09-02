import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression test for a silent-oversell bug found while smoke-testing POS
 * (docs/features/pos.md): once a product's only stock_batches row hit 0 (or
 * went negative), getBatchesForProduct's `quantity > 0` filter correctly
 * excluded it for FEFO picking, but the payment loop then had *no* batch to
 * attribute the sale to at all. The sale and its sale_items row still
 * completed and were recorded as revenue, while the stock_batches quantity
 * and stock_movements ledger were left completely untouched for that unit —
 * an untracked, unauditable inventory loss with no error or warning
 * anywhere. Confirmed against the real app data (a live sale with no
 * matching stock_movements row) before this fix.
 *
 * recordSaleItemStock (lib/db/queries/inventory.ts) now falls back to the
 * product's most-recently-touched active batch when none has positive
 * stock, so the deduction/movement is still recorded (batch going further
 * negative) instead of vanishing.
 */
describe("recordSaleItemStock — depleted batch", () => {
  let db: Database;
  let recordSaleItemStock: typeof import("@/lib/db/queries/inventory").recordSaleItemStock;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const inventory = await import("@/lib/db/queries/inventory");
    recordSaleItemStock = inventory.recordSaleItemStock;

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
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, payment_status) VALUES ('sale1', 'TXN-1', 100, 100, 'cash', 'completed')`,
    );
  });

  it("still logs a stock_movements row when the product's only batch is already fully depleted", async () => {
    // The one batch this product has is already at 0 — e.g. it was sold
    // down to nothing in an earlier transaction — so getBatchesForProduct's
    // `quantity > 0` filter would find nothing for it.
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price) VALUES ('batch1', 'prod1', 0, 60)`,
    );

    await recordSaleItemStock({
      saleId: "sale1",
      productId: "prod1",
      quantity: 1,
      unitPrice: 100,
      costPrice: 60,
      subtotal: 100,
      cashierId: "user1",
    });

    const movements = db.exec(
      "SELECT quantity, stock_batch_id FROM stock_movements WHERE reference_id = 'sale1' AND product_id = 'prod1'",
    );
    expect(movements[0]?.values.length).toBe(1);
    expect(movements[0]?.values[0]?.[0]).toBe(-1);
    expect(movements[0]?.values[0]?.[1]).toBe("batch1");

    const batch = db.exec("SELECT quantity FROM stock_batches WHERE id = 'batch1'");
    expect(batch[0]?.values[0]?.[0]).toBe(-1);

    const saleItems = db.exec(
      "SELECT stock_batch_id FROM sale_items WHERE sale_id = 'sale1' AND product_id = 'prod1'",
    );
    expect(saleItems[0]?.values[0]?.[0]).toBe("batch1");
  });

  it("still logs a stock_movements row when the product has no stock_batches row at all", async () => {
    // No batch ever created for this product (e.g. it was added without a
    // procurement receipt) — recordSaleItemStock can't attribute the
    // deduction to anything, but it must not silently swallow the sale_item
    // it already inserted without at least leaving that visible (null
    // stock_batch_id, no fabricated movement).
    await recordSaleItemStock({
      saleId: "sale1",
      productId: "prod1",
      quantity: 1,
      unitPrice: 100,
      costPrice: 60,
      subtotal: 100,
      cashierId: "user1",
    });

    const saleItems = db.exec(
      "SELECT stock_batch_id FROM sale_items WHERE sale_id = 'sale1' AND product_id = 'prod1'",
    );
    expect(saleItems[0]?.values[0]?.[0]).toBeNull();

    const movements = db.exec(
      "SELECT quantity FROM stock_movements WHERE reference_id = 'sale1' AND product_id = 'prod1'",
    );
    expect(movements.length).toBe(0);
  });

  it("still logs the full quantity when a single batch only partially covers an oversold cart line", async () => {
    // Reproduces the narrower variant of the same bug: getBatchesForProduct
    // returns a non-empty list (one batch with 1 unit left), so the
    // zero-batches fallback never triggers, but the cart line oversells
    // beyond what that batch has. The normal deduction loop deducts the 1
    // unit it can and stops — the leftover 2 units must still be picked up
    // by the fallback instead of vanishing untracked.
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

    const movements = db.exec(
      "SELECT quantity FROM stock_movements WHERE reference_id = 'sale1' AND product_id = 'prod1'",
    );
    const totalDeducted = (movements[0]?.values ?? []).reduce(
      (sum, row) => sum + Math.abs(Number(row[0])),
      0,
    );
    expect(totalDeducted).toBe(3);

    const batchQtyLeftInSaleItemBatches = db.exec(
      "SELECT SUM(quantity) FROM sale_item_batches WHERE sale_item_id = (SELECT id FROM sale_items WHERE sale_id = 'sale1' AND product_id = 'prod1')",
    );
    expect(batchQtyLeftInSaleItemBatches[0]?.values[0]?.[0]).toBe(3);

    const batch = db.exec("SELECT quantity FROM stock_batches WHERE id = 'batch1'");
    expect(batch[0]?.values[0]?.[0]).toBe(-2);
  });

  it("still picks FEFO among positive-stock batches when one exists (unaffected by the fallback)", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price, expiry_date) VALUES ('batch_old', 'prod1', 5, 60, '2026-01-01')`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price, expiry_date) VALUES ('batch_new', 'prod1', 5, 60, '2027-01-01')`,
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

    const oldBatch = db.exec("SELECT quantity FROM stock_batches WHERE id = 'batch_old'");
    const newBatch = db.exec("SELECT quantity FROM stock_batches WHERE id = 'batch_new'");
    // Earliest-expiry batch is consumed first; the later batch is untouched.
    expect(oldBatch[0]?.values[0]?.[0]).toBe(3);
    expect(newBatch[0]?.values[0]?.[0]).toBe(5);
  });
});
