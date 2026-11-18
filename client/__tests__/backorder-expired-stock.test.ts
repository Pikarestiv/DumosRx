import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-1";
const PAST_EXPIRY = "2025-01-01";
const FUTURE_EXPIRY = "2028-01-01";

describe("backorder shortfall with expired stock batches (A-343)", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let insert: typeof import("@/lib/db/base-helpers").insert;
  let recordSaleItemStock: typeof import("@/lib/db/queries/inventory-sale-stock").recordSaleItemStock;
  let isBatchExpired: typeof import("@/lib/db/queries/inventory-sale-stock").isBatchExpired;
  let constants: typeof import("@/lib/constants/stock-adjustments");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ insert } = await import("@/lib/db/base-helpers"));
    ({ recordSaleItemStock, isBatchExpired } = await import("@/lib/db/queries/inventory-sale-stock"));
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
    db.run(`INSERT INTO products (id, name, _deleted, store_id) VALUES ('p1', 'Amoxicillin 500mg', 0, '${STORE_ID}')`);
  });

  async function createBatch(batchId: string, quantity: number, expiry: string | null = null) {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, expiry_date, is_active, _deleted, store_id, created_at, updated_at)
       VALUES ('${batchId}', 'p1', 'B-${batchId}', 0, 1000, ${expiry ? `'${expiry}'` : "NULL"}, 1, 0, '${STORE_ID}', '2026-01-01', '2026-01-01')`,
    );
    await insert("stock_movements", { product_id: "p1", stock_batch_id: batchId, movement_type: "purchase", quantity });
  }

  const sell = (quantity: number, recordShortfallAsOwed?: boolean) =>
    recordSaleItemStock({
      saleId: "sale-1",
      productId: "p1",
      quantity,
      unitPrice: 1500,
      costPrice: 1000,
      subtotal: quantity * 1500,
      cashierId: "u1",
      correlationId: "sale-1",
      recordShortfallAsOwed,
    });

  const movements = () =>
    db.exec(`SELECT stock_batch_id, movement_type, quantity, reference_type, reference_id, reason
             FROM stock_movements WHERE reference_id = 'sale-1' ORDER BY rowid`)[0]?.values ?? [];

  const quantityOf = (batchId: string) =>
    Number(db.exec(`SELECT quantity FROM stock_batches WHERE id = '${batchId}'`)[0]?.values?.[0]?.[0] ?? -1);

  const backorderRows = () => movements().filter((m) => m[3] === constants.BACKORDER_REFERENCE_TYPE);

  it("records entire requested quantity as owed backorder when only expired batch exists", async () => {
    await createBatch("b_expired", 10, PAST_EXPIRY);
    expect(quantityOf("b_expired")).toBe(10);

    await sell(4, true);

    const owed = backorderRows();
    expect(owed).toHaveLength(1);
    expect(owed[0][0]).toBe("b_expired");
    expect(owed[0][1]).toBe("adjustment");
    expect(owed[0][2]).toBe(4);
    expect(owed[0][3]).toBe(constants.BACKORDER_REFERENCE_TYPE);

    expect(quantityOf("b_expired")).toBe(10);
  });

  it("allocates valid stock first and treats remaining quantity as backorder shortfall without deducting from expired batch", async () => {
    await createBatch("b_valid", 3, FUTURE_EXPIRY);
    await createBatch("b_expired", 10, PAST_EXPIRY);

    await sell(5, true);

    const owed = backorderRows();
    expect(owed).toHaveLength(1);
    expect(owed[0][2]).toBe(2);

    expect(quantityOf("b_valid")).toBe(0);
    expect(quantityOf("b_expired")).toBe(10);
  });

  it("records owed shortfall when valid stock was in an inactive batch and fallback selects expired batch", async () => {
    await createBatch("b_expired", 10, PAST_EXPIRY);
    expect(quantityOf("b_expired")).toBe(10);

    await sell(3, true);

    const owed = backorderRows();
    expect(owed).toHaveLength(1);
    expect(owed[0][0]).toBe("b_expired");
    expect(owed[0][2]).toBe(3);
    expect(quantityOf("b_expired")).toBe(10);
  });

  it("evaluates expired boundary conditions matching SQLite date semantics", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(isBatchExpired(null)).toBe(false);
    expect(isBatchExpired(undefined)).toBe(false);
    expect(isBatchExpired("")).toBe(false);
    expect(isBatchExpired("   ")).toBe(false);
    expect(isBatchExpired(PAST_EXPIRY)).toBe(true);
    expect(isBatchExpired(today)).toBe(true);
    expect(isBatchExpired(FUTURE_EXPIRY)).toBe(false);
  });

  it("marks batch as oversold in stock_movements reason when selling against an expired fallback batch", async () => {
    await createBatch("b_expired", 5, PAST_EXPIRY);
    await sell(2, false);

    const movs = movements();
    expect(movs).toHaveLength(1);
    expect(movs[0][0]).toBe("b_expired");
    expect(movs[0][1]).toBe("sale");
    expect(movs[0][2]).toBe(-2);
    expect(movs[0][5]).toBe("Customer sale (oversold — insufficient batch stock)");
  });
});
