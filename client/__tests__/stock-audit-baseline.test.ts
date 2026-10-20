import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

// A-263. A count is an observation:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-stock-audit-baseline-test-ts-L9
describe("submitStockAudit — a counted row carries its own baseline", () => {
  let db: Database;
  let submitStockAudit: typeof import("@/lib/db/queries/inventory").submitStockAudit;
  let getProductStockQuantity: typeof import("@/lib/db/queries/inventory").getProductStockQuantity;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    const inventory = await import("@/lib/db/queries/inventory");
    submitStockAudit = inventory.submitStockAudit;
    getProductStockQuantity = inventory.getProductStockQuantity;

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
    db.run(`INSERT INTO products (id, name, selling_price) VALUES ('p1', 'Paracetamol', 100)`);
  });

  function seedBatch(qty: number, id = "b1") {
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, is_active, _deleted) VALUES ('${id}', 'p1', ${qty}, 1, 0)`,
    );
  }

  const stock = () =>
    db.exec(`SELECT COALESCE(SUM(quantity),0) FROM stock_batches WHERE product_id = 'p1' AND _deleted = 0 AND is_active = 1`)[0]
      ?.values[0]?.[0];
  const audits = () => db.exec(`SELECT expected_quantity, actual_quantity, difference FROM stock_audits WHERE product_id = 'p1'`);
  const movements = () => db.exec(`SELECT quantity FROM stock_movements WHERE product_id = 'p1'`);

  describe("getProductStockQuantity", () => {
    it("sums active, non-deleted batches", async () => {
      seedBatch(12, "b1");
      seedBatch(8, "b2");
      db.run(`INSERT INTO stock_batches (id, product_id, quantity, is_active, _deleted) VALUES ('gone', 'p1', 99, 1, 1)`);
      db.run(`INSERT INTO stock_batches (id, product_id, quantity, is_active, _deleted) VALUES ('off', 'p1', 99, 0, 0)`);
      expect(await getProductStockQuantity("p1")).toBe(20);
    });

    it("is zero for a product with no batches", async () => {
      expect(await getProductStockQuantity("p1")).toBe(0);
    });
  });

  it("records the discrepancy A-263 used to drop: shelf 10, system already 0 when counted", async () => {
    // Sheet built when the system said 10; the day's sales took live to 0
    // before the counter reached the shelf and found 10.
    await submitStockAudit(
      [{ productId: "p1", systemQty: 0, baselineQty: 0, countedQty: 10, reason: "Cycle count" }],
      "u1",
    );

    expect(stock()).toBe(10);
    expect(audits()[0].values[0]).toEqual([0, 10, 10]);
    expect(movements()[0].values[0][0]).toBe(10);
  });

  it("posts nothing when the count matched at the time, even though stock sold afterwards", async () => {
    // Counted 10 against a live 10 at 09:05, then all 10 sold.
    expect(stock()).toBe(0);
    await submitStockAudit(
      [{ productId: "p1", systemQty: 10, baselineQty: 10, countedQty: 10, reason: "Cycle count" }],
      "u1",
    );

    expect(stock()).toBe(0);
    expect(audits().length).toBe(0);
    expect(movements().length).toBe(0);
  });

  it("applies a real shortage on top of sales that happened after the count", async () => {
    // Baseline 10, counter found 7 (a shortage of 3), then 5 sold -> live 5.
    seedBatch(5);
    await submitStockAudit(
      [{ productId: "p1", systemQty: 10, baselineQty: 10, countedQty: 7, reason: "Cycle count" }],
      "u1",
    );

    // The shelf is short by 3 whatever sold since: 5 - 3 = 2.
    expect(stock()).toBe(2);
    expect(audits()[0].values[0]).toEqual([10, 7, -3]);
  });

  it("still handles a plain shortage with nothing moving", async () => {
    seedBatch(10);
    await submitStockAudit(
      [{ productId: "p1", systemQty: 10, baselineQty: 10, countedQty: 7 }],
      "u1",
    );
    expect(stock()).toBe(7);
    expect(audits()[0].values[0]).toEqual([10, 7, -3]);
  });

  it("never drives stock negative when the shortage exceeds what is left", async () => {
    seedBatch(2);
    await submitStockAudit(
      [{ productId: "p1", systemQty: 10, baselineQty: 10, countedQty: 7 }],
      "u1",
    );
    expect(stock()).toBe(0);
  });

  it("leaves quantity alone for a price-only row, however stale its baseline", async () => {
    seedBatch(4);
    await submitStockAudit(
      [
        {
          productId: "p1",
          systemQty: 10,
          baselineQty: 10,
          systemCostPrice: 50,
          countedCostPrice: 60,
        },
      ],
      "u1",
    );

    expect(stock()).toBe(4);
    expect(movements().length).toBe(0);
    expect(audits()[0].values[0][2]).toBe(0);
  });

  it("falls back to re-reading when a row carries no baseline of its own, so an upgraded draft is never worse than before", async () => {
    // A draft started on an older bundle has a countedQty beside a systemQty frozen at sheet-build.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-stock-audit-baseline-test-ts-L153
    seedBatch(5);
    await submitStockAudit(
      [{ productId: "p1", systemQty: 10, countedQty: 5, reason: "Resumed draft" }],
      "u1",
    );

    expect(stock()).toBe(5);
    expect(audits().length).toBe(0);
    expect(movements().length).toBe(0);
  });

  it("falls back to re-reading live stock when no baseline is given (catalog quick edit, CSV import)", async () => {
    seedBatch(15);
    await submitStockAudit(
      [{ productId: "p1", systemQty: 20, countedQty: 15 }],
      "u1",
    );
    expect(stock()).toBe(15);
    expect(audits().length).toBe(0);
  });
});
