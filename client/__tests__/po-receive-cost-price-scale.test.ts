import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Item 6A (Cynthia's feedback, 2026-09-28). The Receive panel's "Cost Price"
 * input is consumed as a PER BASE UNIT figure by receivePurchaseOrder(), but
 * its placeholder showed the line's per-bulk `unit_cost` and the copy around
 * it ("Ordered: 10 Carton(s) @ 12,000/Carton", "Qty Received (in Cartons)")
 * reinforced that reading, so a per-carton figure typed into it was stored
 * as the per-tablet cost - inflated by units_per_bulk.
 *
 * The scale contract itself is now shared with the Immediate Purchase flow
 * via resolveBaseUnitCost(); this pins it end to end so a future refactor
 * can't quietly reintroduce a division (or drop one).
 */
describe("receivePurchaseOrder cost price scale", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let createPurchaseOrder: typeof import("@/lib/db/procurement").createPurchaseOrder;
  let getPurchaseOrderById: typeof import("@/lib/db/procurement").getPurchaseOrderById;
  let receivePurchaseOrder: typeof import("@/lib/db/procurement-receiving").receivePurchaseOrder;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ createPurchaseOrder, getPurchaseOrderById } = await import("@/lib/db/procurement"));
    ({ receivePurchaseOrder } = await import("@/lib/db/procurement-receiving"));

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
      DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
      DELETE FROM products; DELETE FROM stock_batches; DELETE FROM stock_movements;
      DELETE FROM _sync_queue; DELETE FROM audit_logs;
    `);
    db.run(
      `INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk)
       VALUES ('prod1', 'Cement', 'Bag', 'Pallet', 50)`,
    );
  });

  async function seedPO() {
    const poId = await createPurchaseOrder(null, "", [
      {
        product_id: "prod1",
        product_name: "Cement",
        bulk_unit: "Pallet",
        bulk_quantity: 10,
        units_per_bulk: 50,
        // 250,000 per pallet == 5,000 per bag
        unit_cost: 250000,
        subtotal: 2500000,
      },
    ]);
    const po = await getPurchaseOrderById(poId);
    return { poId, itemId: po!.items[0].id };
  }

  function batchRow() {
    const rows = db.exec(
      "SELECT quantity, cost_price FROM stock_batches WHERE product_id = 'prod1'",
    );
    return {
      quantity: Number(rows[0].values[0][0]),
      costPrice: Number(rows[0].values[0][1]),
    };
  }

  it("stores a typed cost override as the per-base-unit cost, not inflated by units_per_bulk", async () => {
    const { poId, itemId } = await seedPO();

    await receivePurchaseOrder(poId, [
      { po_item_id: itemId, quantity: 4, cost_price: 5200 },
    ]);

    const batch = batchRow();
    expect(batch.quantity).toBe(200);
    expect(batch.costPrice).toBe(5200);
    expect(batch.costPrice).not.toBe(5200 * 50);
  });

  it("divides the line's per-bulk unit_cost down when no override is typed", async () => {
    const { poId, itemId } = await seedPO();

    await receivePurchaseOrder(poId, [{ po_item_id: itemId, quantity: 2 }]);

    const batch = batchRow();
    expect(batch.quantity).toBe(100);
    expect(batch.costPrice).toBe(5000);
  });

  it("records the movement's total cost at the base-unit scale", async () => {
    const { poId, itemId } = await seedPO();

    await receivePurchaseOrder(poId, [
      { po_item_id: itemId, quantity: 1, cost_price: 4800 },
    ]);

    const rows = db.exec(
      "SELECT unit_cost, total_cost FROM stock_movements WHERE product_id = 'prod1'",
    );
    expect(Number(rows[0].values[0][0])).toBe(4800);
    expect(Number(rows[0].values[0][1])).toBe(4800 * 50);
  });

  it("floors a negative cost override at zero", async () => {
    const { poId, itemId } = await seedPO();

    await receivePurchaseOrder(poId, [
      { po_item_id: itemId, quantity: 1, cost_price: -99 },
    ]);

    expect(batchRow().costPrice).toBe(0);
  });
});
