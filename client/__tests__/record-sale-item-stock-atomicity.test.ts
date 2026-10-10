import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

let failOnTable: string | null = null;

vi.mock("@/lib/db/base-helpers", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("@/lib/db/base-helpers");
  return {
    ...original,
    insert: async (table: string, ...rest: unknown[]) => {
      if (table === failOnTable) throw new Error("simulated write failure");
      return (original.insert as (...a: unknown[]) => Promise<string>)(table, ...rest);
    },
  };
});

/**
 * A-219: `recordSaleItemStock()` decremented `stock_batches.quantity` per
 * batch and inserted the matching `stock_movements` row only afterwards, in
 * a separate loop — each write taking its own slot on core.ts's FIFO queue.
 * In the window between them the batch reads as diverged by exactly the sale
 * quantity, so a concurrent stock fold writes the pre-sale number back and
 * the sale's deduction is lost until the next day's heal.
 */
describe("recordSaleItemStock writes a deduction and its movement atomically", () => {
  let db: Database;
  let recordSaleItemStock: typeof import("@/lib/db/queries/inventory").recordSaleItemStock;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ recordSaleItemStock } = await import("@/lib/db/queries/inventory"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    failOnTable = null;
    db.run(
      `DELETE FROM sales; DELETE FROM sale_items; DELETE FROM sale_item_batches;
       DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;`,
    );
    db.run(`INSERT INTO products (id, name, selling_price) VALUES ('prod1', 'Paracetamol', 100)`);
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, payment_method, payment_status)
       VALUES ('sale1', 'TXN-1', 100, 100, 'cash', 'completed')`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, cost_price) VALUES ('batch1', 'prod1', 10, 60)`,
    );
  });

  const batchQuantity = () =>
    db.exec(`SELECT quantity FROM stock_batches WHERE id = 'batch1'`)[0].values[0][0];
  const movementCount = () =>
    db.exec(`SELECT COUNT(*) FROM stock_movements`)[0].values[0][0];

  const sellThree = () =>
    recordSaleItemStock({
      saleId: "sale1",
      productId: "prod1",
      quantity: 3,
      unitPrice: 100,
      costPrice: 60,
      subtotal: 300,
      cashierId: "user1",
    });

  it("rolls the quantity back when the movement row cannot be written", async () => {
    failOnTable = "stock_movements";

    await expect(sellThree()).rejects.toThrow("simulated write failure");

    expect(batchQuantity()).toBe(10);
    expect(movementCount()).toBe(0);
  });

  it("still records the deduction and the movement together on the happy path", async () => {
    await sellThree();

    expect(batchQuantity()).toBe(7);
    expect(movementCount()).toBe(1);
  });

  it("runs inline without deadlocking when the caller already opened a transaction", async () => {
    const { transaction } = await import("@/lib/db/core");

    await transaction(async () => {
      await sellThree();
    });

    expect(batchQuantity()).toBe(7);
    expect(movementCount()).toBe(1);
  });
});
