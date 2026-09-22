import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression: a sale line split across multiple batches at sale time (FEFO)
 * restored ALL of a second partial return to the FIRST batch in the
 * original split, instead of continuing from where the first return left
 * off. restoreReturnedStock() always restarted allocation from
 * consumedBatches[0] with no memory of what an earlier return of the same
 * sale line already restored.
 *
 * Concretely: a 10-unit line split 6 units from batch A (expires March) +
 * 4 units from batch B (expires August). Returning 6 units, then later the
 * remaining 4, previously put all 10 restored units into batch A and left
 * batch B permanently 4 short - correct product-level total stock, but
 * batch A now holds units it never held (wrong expiry date attached to
 * them) and batch B's quantity/cost valuation is silently wrong forever.
 *
 * Fix: restoreReturnedStock() now nets out, per batch, how much a *prior*
 * return (scoped to the same sale + product) already restored before
 * allocating the current return's quantity.
 */
describe("restoreReturnedStock - batch attribution across multiple partial returns", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let restoreReturnedStock: typeof import("@/lib/db/queries/returns").restoreReturnedStock;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    restoreReturnedStock = (await import("@/lib/db/queries/returns")).restoreReturnedStock;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM stock_movements; DELETE FROM sale_item_batches;
      DELETE FROM sale_items; DELETE FROM sales; DELETE FROM stock_batches;
      DELETE FROM products; DELETE FROM returns; DELETE FROM return_items;
    `);
    core.setActiveStoreId(null);

    db.run(`INSERT INTO products (id, name) VALUES ('p1', 'Rebar 12mm')`);
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, expiry_date) VALUES
        ('batchA', 'p1', 0, '2027-03-01'),
        ('batchB', 'p1', 0, '2027-08-01')`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, _deleted) VALUES
        ('sale1', 'TXN1', 10000, 10000, 0)`,
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price) VALUES
        ('si1', 'sale1', 'p1', 10, 1000, 10000)`,
    );
    // FEFO split: 6 units from batch A (older), 4 from batch B.
    db.run(
      `INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity) VALUES
        ('sib1', 'si1', 'batchA', 6),
        ('sib2', 'si1', 'batchB', 4)`,
    );
  });

  it("attributes a second partial return to the second batch, not back to the first", async () => {
    db.run(`INSERT INTO returns (id, sale_id, user_id) VALUES ('ret1', 'sale1', 'u1')`);
    await restoreReturnedStock({
      saleItemId: "si1",
      productId: "p1",
      costPrice: 500,
      returnQuantity: 6,
      returnId: "ret1",
      saleId: "sale1",
    });

    let batchA = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batchA'`);
    let batchB = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batchB'`);
    expect(batchA[0].values[0][0]).toBe(6);
    expect(batchB[0].values[0][0]).toBe(0);

    // Second, separate return of the remaining 4 units.
    db.run(`INSERT INTO returns (id, sale_id, user_id) VALUES ('ret2', 'sale1', 'u1')`);
    await restoreReturnedStock({
      saleItemId: "si1",
      productId: "p1",
      costPrice: 500,
      returnQuantity: 4,
      returnId: "ret2",
      saleId: "sale1",
    });

    batchA = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batchA'`);
    batchB = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batchB'`);
    // Batch A already got its full 6 units back from the first return - the
    // bug put the second return's 4 units here too, reaching 10.
    expect(batchA[0].values[0][0]).toBe(6);
    // Batch B should receive this second return's 4 units.
    expect(batchB[0].values[0][0]).toBe(4);
  });

  it("does not over-restore when a different sale's return of the same product shares a batch", async () => {
    // A second sale of the same product, also drawing from batch A, whose
    // own return must not be counted against sale1's remaining-restorable
    // amount (and vice versa).
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, _deleted) VALUES
        ('sale2', 'TXN2', 3000, 3000, 0)`,
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price) VALUES
        ('si2', 'sale2', 'p1', 3, 1000, 3000)`,
    );
    db.run(
      `INSERT INTO sale_item_batches (id, sale_item_id, stock_batch_id, quantity) VALUES
        ('sib3', 'si2', 'batchA', 3)`,
    );
    db.run(`INSERT INTO returns (id, sale_id, user_id) VALUES ('ret_other', 'sale2', 'u1')`);
    await restoreReturnedStock({
      saleItemId: "si2",
      productId: "p1",
      costPrice: 500,
      returnQuantity: 3,
      returnId: "ret_other",
      saleId: "sale2",
    });

    // sale1's own first partial return, unaffected by sale2's unrelated one.
    db.run(`INSERT INTO returns (id, sale_id, user_id) VALUES ('ret1', 'sale1', 'u1')`);
    await restoreReturnedStock({
      saleItemId: "si1",
      productId: "p1",
      costPrice: 500,
      returnQuantity: 6,
      returnId: "ret1",
      saleId: "sale1",
    });

    const batchA = db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batchA'`);
    // 3 (from sale2's return) + 6 (from sale1's return) = 9, not short-changed
    // by sale2's unrelated return being wrongly netted against sale1's.
    expect(batchA[0].values[0][0]).toBe(9);
  });

  describe("no recorded batch to credit (KNOWN_BUGS.md - return with no batch never restores stock)", () => {
    // A sale line with no sale_item_batches rows and no legacyStockBatchId -
    // e.g. a pre-batch-attribution sale, or one where the batch write was
    // otherwise skipped at sale time.
    beforeEach(() => {
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price) VALUES
          ('si_nobatch', 'sale1', 'p1', 5, 1000, 5000)`,
      );
    });

    it("restores stock into an existing active batch instead of only logging a null-batch movement", async () => {
      // batchA/batchB exist for p1 from the outer beforeEach (both at 0).
      db.run(`INSERT INTO returns (id, sale_id, user_id) VALUES ('ret_nb', 'sale1', 'u1')`);
      await restoreReturnedStock({
        saleItemId: "si_nobatch",
        productId: "p1",
        costPrice: 500,
        returnQuantity: 5,
        returnId: "ret_nb",
        saleId: "sale1",
      });

      const totalQty = db.exec(
        `SELECT COALESCE(SUM(quantity), 0) FROM stock_batches WHERE product_id = 'p1'`,
      );
      // On-hand stock must actually go up by the returned quantity - not
      // just get a stock_movements row referencing no real batch.
      expect(totalQty[0].values[0][0]).toBe(5);

      const movement = db.exec(
        `SELECT stock_batch_id FROM stock_movements WHERE reference_id = 'ret_nb' AND movement_type = 'return'`,
      );
      expect(movement[0].values[0][0]).not.toBeNull();
    });

    it("creates a new batch when the product has no batch at all to restore into", async () => {
      db.run(`DELETE FROM stock_batches WHERE product_id = 'p1'`);
      db.run(`INSERT INTO returns (id, sale_id, user_id) VALUES ('ret_nb2', 'sale1', 'u1')`);
      await restoreReturnedStock({
        saleItemId: "si_nobatch",
        productId: "p1",
        costPrice: 500,
        returnQuantity: 5,
        returnId: "ret_nb2",
        saleId: "sale1",
      });

      const batches = db.exec(
        `SELECT quantity, cost_price FROM stock_batches WHERE product_id = 'p1'`,
      );
      expect(batches[0].values).toHaveLength(1);
      expect(batches[0].values[0][0]).toBe(5);
      expect(batches[0].values[0][1]).toBe(500);

      const movement = db.exec(
        `SELECT stock_batch_id FROM stock_movements WHERE reference_id = 'ret_nb2' AND movement_type = 'return'`,
      );
      expect(movement[0].values[0][0]).not.toBeNull();
    });
  });
});
