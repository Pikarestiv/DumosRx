import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-1";

describe("selling past recorded stock records the shortfall as owed", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let recordSaleItemStock: typeof import("@/lib/db/queries/inventory").recordSaleItemStock;
  let getBatchDeficits: typeof import("@/lib/db/batch-quantity").getBatchDeficits;
  let constants: typeof import("@/lib/constants/stock-adjustments");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert } = await import("@/lib/db/base-helpers"));
    ({ recordSaleItemStock } = await import("@/lib/db/queries/inventory"));
    ({ getBatchDeficits } = await import("@/lib/db/batch-quantity"));
    constants = await import("@/lib/constants/stock-adjustments");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({ locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm") });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
    core.setActiveStoreId(STORE_ID);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products;
       DELETE FROM sale_items; DELETE FROM sale_item_batches; DELETE FROM _sync_queue; DELETE FROM audit_logs;`,
    );
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('p1', 'Cement 50kg', 0, '${STORE_ID}')`);
  });

  async function receive(batchId: string, quantity: number, expiry: string | null = null) {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, expiry_date, is_active, _deleted, store_id, created_at, updated_at)
       VALUES ('${batchId}', 'p1', 'B-${batchId}', 0, 4000, ${expiry ? `'${expiry}'` : "NULL"}, 1, 0, '${STORE_ID}', '2026-10-01', '2026-10-01')`,
    );
    await insert("stock_movements", { product_id: "p1", stock_batch_id: batchId, movement_type: "purchase", quantity });
  }

  const sell = (quantity: number, recordShortfallAsOwed?: boolean) =>
    recordSaleItemStock({
      saleId: "sale-1", productId: "p1", quantity, unitPrice: 5000, costPrice: 4000,
      subtotal: quantity * 5000, cashierId: "u1", correlationId: "sale-1", recordShortfallAsOwed,
    });

  const movements = () =>
    db.exec(`SELECT stock_batch_id, movement_type, quantity, reference_type, reference_id, unit_cost, reason
               FROM stock_movements WHERE reference_id = 'sale-1' ORDER BY rowid`)[0]?.values ?? [];
  const quantityOf = (batchId: string) =>
    Number(db.exec(`SELECT quantity FROM stock_batches WHERE id = '${batchId}'`)[0]?.values?.[0]?.[0] ?? -1);
  const backorderRows = () => movements().filter((m) => m[3] === constants.BACKORDER_REFERENCE_TYPE);

  it("leaves the write unchanged when the setting is off", async () => {
    await receive("b1", 3);
    await sell(5);

    expect(backorderRows()).toEqual([]);
    expect(await getBatchDeficits()).toHaveLength(1);
  });

  it("writes one sale −5 and one backorder +2 when 3 are on hand, and the batch reads 0", async () => {
    await receive("b1", 3);
    await sell(5, true);

    expect(movements()).toEqual([
      ["b1", "sale", -5, "sale", "sale-1", 4000, "Customer sale (oversold — insufficient batch stock)"],
      ["b1", "adjustment", 2, constants.BACKORDER_REFERENCE_TYPE, "sale-1", 4000, constants.BACKORDER_REASON],
    ]);
    expect(quantityOf("b1")).toBe(0);
    expect(await getBatchDeficits()).toEqual([]);
  });

  it("creates a SALE- batch for a product with no batch, carrying −5/+5 and reading 0", async () => {
    await sell(5, true);

    const rows = movements();
    expect(rows.map((m) => [m[1], m[2]])).toEqual([["sale", -5], ["adjustment", 5]]);
    const batchId = String(rows[0][0]);
    expect(rows[1][0]).toBe(batchId);
    const batchNumber = db.exec(`SELECT batch_number FROM stock_batches WHERE id = '${batchId}'`)[0].values[0][0];
    expect(String(batchNumber)).toMatch(/^SALE-/);
    expect(quantityOf(batchId)).toBe(0);
  });

  it("puts the compensation only on the batch that went short, for the shortfall alone", async () => {
    await receive("b1", 2, "2027-01-01");
    await receive("b2", 1, "2027-06-01");
    await sell(5, true);

    const owed = backorderRows();
    expect(owed).toHaveLength(1);
    expect(owed[0][2]).toBe(2);
    expect(quantityOf("b1")).toBe(0);
    expect(quantityOf("b2")).toBe(0);
    expect(await getBatchDeficits()).toEqual([]);
  });

  it("writes no compensation for a sale within stock", async () => {
    await receive("b1", 10);
    await sell(4, true);

    expect(backorderRows()).toEqual([]);
    expect(quantityOf("b1")).toBe(6);
  });
});
