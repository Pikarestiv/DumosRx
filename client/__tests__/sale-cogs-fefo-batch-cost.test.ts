import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-1";
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const CART_AVERAGE = 700;

describe("a sale books the cost of the batches it actually consumed", () => {
  let db: Database;
  let recordSaleItemStock: typeof import("@/lib/db/queries/inventory").recordSaleItemStock;
  let createPurchaseOrder: typeof import("@/lib/db/procurement").createPurchaseOrder;
  let getPurchaseOrderById: typeof import("@/lib/db/procurement").getPurchaseOrderById;
  let receivePurchaseOrder: typeof import("@/lib/db/procurement-receiving").receivePurchaseOrder;

  beforeAll(async () => {
    const core = await import("@/lib/db/core");
    ({ recordSaleItemStock } = await import("@/lib/db/queries/inventory"));
    ({ createPurchaseOrder, getPurchaseOrderById } = await import("@/lib/db/procurement"));
    ({ receivePurchaseOrder } = await import("@/lib/db/procurement-receiving"));
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
      `DELETE FROM stock_movements; DELETE FROM stock_batches; DELETE FROM products; DELETE FROM sale_items;
       DELETE FROM sale_item_batches; DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
       DELETE FROM _sync_queue; DELETE FROM audit_logs;`,
    );
    db.run(
      `INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, _deleted, store_id)
       VALUES ('p1', 'Amoxicillin 500mg', 'Pack', 'Pack', 1, 0, '${STORE_ID}')`,
    );
  });

  const batch = (id: string, quantity: number, cost: number | null, expiry: string | null, createdAt = "2026-01-01T00:00:00.000Z") =>
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, expiry_date, is_active, _deleted, store_id, created_at)
       VALUES (?, 'p1', ?, ?, ?, ?, 1, 0, '${STORE_ID}', ?)`,
      [id, id.toUpperCase(), quantity, cost, expiry, createdAt],
    );

  const sell = (quantity: number, extra: { recordShortfallAsOwed?: boolean } = {}) =>
    recordSaleItemStock({
      saleId: "s1", productId: "p1", quantity, unitPrice: 1000, costPrice: CART_AVERAGE,
      subtotal: quantity * 1000, cashierId: "u1", ...extra,
    });

  const scalar = (sql: string) => db.exec(sql)[0]?.values?.[0]?.[0];
  const lineCost = () => Number(scalar(`SELECT cost_price FROM sale_items WHERE sale_id = 's1'`));
  const movementCosts = () =>
    Object.fromEntries(
      (db.exec(`SELECT stock_batch_id, unit_cost, total_cost FROM stock_movements
                 WHERE movement_type = 'sale' AND reference_id = 's1' ORDER BY stock_batch_id`)[0]?.values ?? [])
        .map(([id, unit, total]) => [String(id), { unit: Number(unit), total: Number(total) }]),
    );

  it("uses the one batch's cost, not the cart's average", async () => {
    batch("b1", 10, 650, day(60));
    await sell(3);

    expect(lineCost()).toBe(650);
    expect(movementCosts()).toEqual({ b1: { unit: 650, total: 1950 } });
  });

  it("weights a line that spans two batches by the units taken from each", async () => {
    batch("b1", 2, 600, day(30));
    batch("b2", 10, 800, day(300));
    await sell(5);

    expect(lineCost()).toBe(720);
    expect(movementCosts()).toEqual({ b1: { unit: 600, total: 1200 }, b2: { unit: 800, total: 2400 } });
    expect(Number(scalar(`SELECT quantity FROM stock_batches WHERE id = 'b2'`))).toBe(7);
  });

  it("rounds the blended line cost to the kobo", async () => {
    batch("b1", 1, 100, day(30));
    batch("b2", 10, 200, day(300));
    await sell(3);

    expect(lineCost()).toBe(166.67);
  });

  it("books units the shelf could not cover at the last bought price", async () => {
    batch("b1", 2, 600, day(30), "2026-01-01T00:00:00.000Z");
    batch("b0", 0, 750, day(60), "2026-06-01T00:00:00.000Z");
    db.run(`UPDATE stock_batches SET is_active = 0 WHERE id = 'b0'`);
    await sell(5);

    expect(lineCost()).toBe((2 * 600 + 3 * 750) / 5);
    expect(movementCosts()).toEqual({ b1: { unit: 690, total: 3450 } });
  });

  it("books a batch received without a cost at the last bought price", async () => {
    batch("b1", 2, 0, day(30));
    batch("b2", 1, null, day(60));
    batch("b3", 10, 800, day(300));
    batch("sold", 0, 900, day(90), "2026-06-01T00:00:00.000Z");
    await sell(5);

    expect(lineCost()).toBe((3 * 900 + 2 * 800) / 5);
    expect(movementCosts()).toEqual({
      b1: { unit: 900, total: 1800 },
      b2: { unit: 900, total: 900 },
      b3: { unit: 800, total: 1600 },
    });
  });

  it("books a SALE batch at the last bought price of a batch no longer active", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted, store_id, created_at)
       VALUES ('old', 'p1', 'OLD', 0, 750, 0, 0, '${STORE_ID}', '2026-01-01T00:00:00.000Z')`,
    );
    await sell(2);

    expect(lineCost()).toBe(750);
    expect(Number(scalar(`SELECT cost_price FROM stock_batches WHERE batch_number LIKE 'SALE%'`))).toBe(750);
  });

  it("falls back to the cart's average only when no real batch cost exists at all", async () => {
    batch("adj", 0, 500, null);
    db.run(`UPDATE stock_batches SET batch_number = 'ADJ-1' WHERE id = 'adj'`);
    batch("free", 2, 0, day(30));
    await sell(4);

    expect(lineCost()).toBe(CART_AVERAGE);
  });

  it("takes an undated batch after a dated one even when its expiry was stored as ''", async () => {
    batch("b-blank", 10, 500, "", "2025-01-01T00:00:00.000Z");
    batch("b-dated", 10, 900, day(30), "2026-06-01T00:00:00.000Z");
    await sell(2);

    expect(movementCosts()).toEqual({ "b-dated": { unit: 900, total: 1800 } });
    expect(lineCost()).toBe(900);
  });

  it("keeps an owed sale line at the average so every till version re-costs it to the same figure", async () => {
    batch("b1", 2, 600, day(30));
    await sell(5, { recordShortfallAsOwed: true });
    expect(lineCost()).toBe(CART_AVERAGE);
    expect(movementCosts()).toEqual({ b1: { unit: CART_AVERAGE, total: 3500 } });

    const poId = await createPurchaseOrder(null, "", [{
      product_id: "p1", product_name: "Amoxicillin 500mg", bulk_unit: "Pack",
      bulk_quantity: 10, units_per_bulk: 1, unit_cost: 900, subtotal: 9000,
    }]);
    const itemId = (await getPurchaseOrderById(poId))?.items[0]?.id ?? "";
    await receivePurchaseOrder(poId, [{ po_item_id: itemId, quantity: 10 }]);

    expect(lineCost()).toBe(CART_AVERAGE + (3 * (900 - CART_AVERAGE)) / 5);
  });

  it("books a store that sells past stock at the batch cost when the shelf covers the line", async () => {
    batch("b1", 10, 650, day(30));
    await sell(3, { recordShortfallAsOwed: true });

    expect(lineCost()).toBe(650);
  });
});
