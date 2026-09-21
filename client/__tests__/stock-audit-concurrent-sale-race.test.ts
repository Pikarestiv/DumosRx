import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression coverage for a High-severity bug (docs/KNOWN_BUGS.md):
 * submitStockAudit used the caller-supplied `systemQty` as-is to compute the
 * shrinkage/surplus diff, instead of re-reading the product's actual current
 * quantity inside the transaction. A sale landing between the audit list
 * being rendered and the audit being submitted made the caller's systemQty
 * stale, so the resulting adjustment was silently off by exactly the
 * concurrent sale's quantity. Exercised against a real in-memory SQLite
 * instance (sql.js), not a reimplementation.
 */
describe("submitStockAudit — concurrent sale race", () => {
  let db: Database;
  let submitStockAudit: typeof import("@/lib/db/queries/inventory").submitStockAudit;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const inventory = await import("@/lib/db/queries/inventory");
    submitStockAudit = inventory.submitStockAudit;

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
      `DELETE FROM stock_audits; DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;`,
    );
    db.run(`INSERT INTO products (id, name, selling_price) VALUES ('prod1', 'Paracetamol', 100)`);
  });

  it("uses the CURRENT system quantity, not the stale caller-supplied one, when computing the diff", async () => {
    // The audit screen rendered with 20 units on hand (systemQty: 20).
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, is_active, _deleted) VALUES ('b1', 'prod1', 20, 1, 0)`,
    );

    // Before the audit is submitted, a sale sells 5 units - the real
    // quantity is now 15, but the caller's `systemQty` still says 20.
    db.run(`UPDATE stock_batches SET quantity = 15 WHERE id = 'b1'`);

    // The cashier counted 15 units on the shelf (correctly matching the
    // NEW reality) and submits with the STALE systemQty of 20.
    await submitStockAudit(
      [{ productId: "prod1", systemQty: 20, countedQty: 15, reason: "Cycle count" }],
      "user-1",
    );

    // Correct behavior: countedQty (15) matches the re-read current
    // quantity (15), so there's NO discrepancy - diff is 0, batch
    // untouched, no adjustment movement written.
    const batch = db.exec("SELECT quantity FROM stock_batches WHERE id = 'b1'");
    expect(batch[0]?.values[0]?.[0]).toBe(15);

    const movements = db.exec("SELECT * FROM stock_movements WHERE product_id = 'prod1'");
    expect(movements.length).toBe(0); // no false "5 units missing" adjustment

    const audits = db.exec("SELECT * FROM stock_audits WHERE product_id = 'prod1'");
    expect(audits.length).toBe(0); // nothing to reconcile
  });

  it("records the audit against the re-read quantity when a genuine discrepancy exists", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, is_active, _deleted) VALUES ('b1', 'prod1', 15, 1, 0)`,
    );

    // Caller's stale systemQty (20) differs from the real current quantity
    // (15), and the actual physical count (12) differs from BOTH - the real
    // shrinkage is 15 - 12 = 3, not 20 - 12 = 8.
    await submitStockAudit(
      [{ productId: "prod1", systemQty: 20, countedQty: 12, reason: "Cycle count" }],
      "user-1",
    );

    const batch = db.exec("SELECT quantity FROM stock_batches WHERE id = 'b1'");
    expect(batch[0]?.values[0]?.[0]).toBe(12);

    const movements = db.exec(
      "SELECT quantity FROM stock_movements WHERE product_id = 'prod1' AND movement_type = 'adjustment'",
    );
    expect(movements[0]?.values[0]?.[0]).toBe(-3); // real shrinkage, not -8

    const audits = db.exec(
      "SELECT expected_quantity, actual_quantity, difference FROM stock_audits WHERE product_id = 'prod1'",
    );
    expect(audits[0]?.values[0]).toEqual([15, 12, -3]); // expected reflects the re-read value
  });
});
