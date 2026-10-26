import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const STORE_ID = "store-1";

describe("a receipt pays owed units off before anything goes on the shelf", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let recordSaleItemStock: typeof import("@/lib/db/queries/inventory").recordSaleItemStock;
  let getOutstandingBackorders: typeof import("@/lib/db/queries/backorders").getOutstandingBackorders;
  let createPurchaseOrder: typeof import("@/lib/db/procurement").createPurchaseOrder;
  let getPurchaseOrderById: typeof import("@/lib/db/procurement").getPurchaseOrderById;
  let receiving: typeof import("@/lib/db/procurement-receiving");
  let receiptSettlementMovementId: typeof import("@/lib/db/deterministic-id").receiptSettlementMovementId;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ recordSaleItemStock } = await import("@/lib/db/queries/inventory"));
    ({ getOutstandingBackorders } = await import("@/lib/db/queries/backorders"));
    ({ createPurchaseOrder, getPurchaseOrderById } = await import("@/lib/db/procurement"));
    receiving = await import("@/lib/db/procurement-receiving");
    ({ receiptSettlementMovementId } = await import("@/lib/db/deterministic-id"));

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
       VALUES ('p1', 'Cement 50kg', 'Bag', 'Bag', 1, 0, '${STORE_ID}')`,
    );
  });

  const sellOwed = (saleId: string, quantity: number, costPrice = 4000) =>
    recordSaleItemStock({
      saleId, productId: "p1", quantity, unitPrice: 5000, costPrice, subtotal: quantity * 5000,
      cashierId: "u1", recordShortfallAsOwed: true,
    });

  const line = (bulk_quantity: number, unit_cost = 4500) => ({
    product_id: "p1", product_name: "Cement 50kg", bulk_unit: "Bag",
    bulk_quantity, units_per_bulk: 1, unit_cost, subtotal: bulk_quantity * unit_cost,
  });

  async function seedPO(...lines: ReturnType<typeof line>[]) {
    const poId = await createPurchaseOrder(null, "", lines);
    const po = await getPurchaseOrderById(poId);
    if (!po) throw new Error("PO not created");
    return { poId, itemIds: po.items.map((i) => i.id) };
  }

  const scalar = (sql: string) => db.exec(sql)[0]?.values?.[0]?.[0];
  const onHand = () => Number(scalar(`SELECT COALESCE(SUM(quantity), 0) FROM stock_batches WHERE product_id = 'p1'`));
  const outstanding = async () => (await getOutstandingBackorders(["p1"]))[0]?.outstanding ?? 0;
  const lineCost = (saleId: string) => Number(scalar(`SELECT cost_price FROM sale_items WHERE sale_id = '${saleId}'`));

  it("settles 5 owed out of a receipt of 20: 15 on the shelf, nothing outstanding", async () => {
    await sellOwed("s1", 5);
    expect(await outstanding()).toBe(5);

    const { poId, itemIds } = await seedPO(line(20));
    await receiving.receivePurchaseOrder(poId, [{ po_item_id: itemIds[0], quantity: 20 }]);

    expect(onHand()).toBe(15);
    expect(await outstanding()).toBe(0);
    expect(scalar(`SELECT id FROM stock_movements WHERE reference_type = 'backorder_settlement'`)).toBe(
      receiptSettlementMovementId(itemIds[0], 0, "s1"),
    );
    expect(scalar(`SELECT reference_id FROM stock_movements WHERE reference_type = 'backorder_settlement'`)).toBe("s1");
    expect(String(scalar(`SELECT reason FROM stock_movements WHERE reference_type = 'backorder_settlement'`))).toContain(poId);
    expect(scalar(`SELECT quantity FROM stock_movements WHERE reference_type = 'backorder_settlement'`)).toBe(-5);
    expect(Number(scalar(`SELECT SUM(quantity * cost_price) FROM stock_batches WHERE product_id = 'p1'`))).toBe(15 * 4500);
  });

  it("settles only what a partial receipt brings in", async () => {
    await sellOwed("s1", 5);
    const { poId, itemIds } = await seedPO(line(20));
    await receiving.receivePurchaseOrder(poId, [{ po_item_id: itemIds[0], quantity: 3 }]);

    expect(onHand()).toBe(0);
    expect(await outstanding()).toBe(2);
  });

  it("does not over-settle across two lines for the same product in one PO", async () => {
    await sellOwed("s1", 5);
    const { poId, itemIds } = await seedPO(line(3), line(10));
    await receiving.receivePurchaseOrder(poId, itemIds.map((id) => ({ po_item_id: id })));

    expect(onHand()).toBe(8);
    expect(await outstanding()).toBe(0);
    expect(Number(scalar(`SELECT SUM(quantity) FROM stock_movements WHERE reference_type = 'backorder_settlement'`))).toBe(-5);
  });

  it("books one settlement when two receipts of the same line race", async () => {
    await sellOwed("s1", 5);
    const { poId, itemIds } = await seedPO(line(20));
    await Promise.all([
      receiving.receivePurchaseOrder(poId, [{ po_item_id: itemIds[0], quantity: 20 }]),
      receiving.receivePurchaseOrder(poId, [{ po_item_id: itemIds[0], quantity: 20 }]),
    ]);

    expect(Number(scalar(`SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'backorder_settlement'`))).toBe(1);
    expect(onHand()).toBe(15);
  });

  it("settles an Immediate Purchase the same way", async () => {
    await sellOwed("s1", 5);
    await receiving.createAndReceivePurchaseOrder(null, "", [line(20)]);

    expect(onHand()).toBe(15);
    expect(await outstanding()).toBe(0);
  });

  it("settles nothing and changes nothing when nothing is owed", async () => {
    const { poId, itemIds } = await seedPO(line(20));
    await receiving.receivePurchaseOrder(poId, [{ po_item_id: itemIds[0] }]);

    expect(onHand()).toBe(20);
    expect(scalar(`SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'backorder_settlement'`)).toBe(0);
  });

  it("re-costs the owed part of past sales at the received cost, oldest sale first", async () => {
    await sellOwed("s1", 4);
    await sellOwed("s2", 2);
    const { poId, itemIds } = await seedPO(line(5, 5000));
    await receiving.receivePurchaseOrder(poId, [{ po_item_id: itemIds[0] }]);

    expect(lineCost("s1")).toBe(5000);
    expect(lineCost("s2")).toBe(4500);
    expect(await outstanding()).toBe(1);
  });

  it("re-weights a line that was only partly owed", async () => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, is_active, _deleted, store_id)
       VALUES ('b0', 'p1', 'B0', 0, 4000, 1, 0, '${STORE_ID}')`,
    );
    await core.execute(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted, store_id)
       VALUES ('m0', 'p1', 'b0', 'purchase', 2, 0, '${STORE_ID}')`,
    );
    db.run(`UPDATE stock_batches SET quantity = 2 WHERE id = 'b0'`);
    await sellOwed("s1", 4);
    await receiving.createAndReceivePurchaseOrder(null, "", [line(10, 6000)]);

    expect(lineCost("s1")).toBe(5000);
  });

  it("reads a legacy settlement that names its PO: pays only what was owed at the time", async () => {
    await sellOwed("s1", 2);
    await core.execute(
      `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, reference_type, reference_id, movement_date, _deleted, store_id)
       VALUES ('over', 'p1', 'x', 'adjustment', -5, 'backorder_settlement', 'po-x', '2999-01-01T00:00:00Z', 0, '${STORE_ID}')`,
    );
    expect(await outstanding()).toBe(0);
    db.run(`UPDATE stock_movements SET movement_date = '2000-01-01T00:00:00Z' WHERE id = 'over'`);
    db.run(`UPDATE stock_movements SET movement_date = '1999-01-01T00:00:00Z' WHERE reference_id = 's1'`);
    await sellOwed("s2", 2);

    expect(await outstanding()).toBe(2);
  });

  it("never books owed or settled units as a stock loss", async () => {
    const { getStockLossTotal } = await import("@/lib/db/queries/finance");
    await sellOwed("s1", 5);
    await receiving.createAndReceivePurchaseOrder(null, "", [line(20)]);

    expect(await getStockLossTotal({ from: "2000-01-01T00:00:00Z", to: "2999-01-01T00:00:00Z" })).toBe(0);
  });

  it("leaves owed units alone on a return, because the customer had the goods (owner decision 5)", async () => {
    const { restoreReturnedStock } = await import("@/lib/db/queries/returns");
    const saleItemId = await sellOwed("s1", 5);
    await restoreReturnedStock({ saleItemId, productId: "p1", costPrice: 4000, returnQuantity: 2, returnId: "r1" });

    expect(onHand()).toBe(2);
    expect(await outstanding()).toBe(5);

    await receiving.createAndReceivePurchaseOrder(null, "", [line(20)]);
    expect(onHand()).toBe(17);
    expect(await outstanding()).toBe(0);
  });

  it("rebuilds the same shelf figure and the same owed balance from the pulled log alone", async () => {
    const { recomputeBatchQuantities } = await import("@/lib/db/batch-quantity");
    const rebuildFromLog = async () => {
      db.run(`UPDATE stock_batches SET quantity = 0`);
      const rows = db.exec(
        `SELECT stock_batch_id, SUM(quantity), SUM(MAX(quantity, 0)) FROM stock_movements GROUP BY stock_batch_id`,
      )[0]?.values ?? [];
      await recomputeBatchQuantities(
        new Map(rows.map(([id, delta, inbound]) => [String(id), { delta: Number(delta), inbound: Number(inbound) }])),
      );
      return { onHand: onHand(), owed: await outstanding() };
    };
    await sellOwed("s1", 5);
    await sellOwed("s2", 3);

    await receiving.createAndReceivePurchaseOrder(null, "", [line(6)]);
    expect({ onHand: onHand(), owed: await outstanding() }).toEqual({ onHand: 0, owed: 2 });
    expect(await rebuildFromLog()).toEqual({ onHand: 0, owed: 2 });

    await receiving.createAndReceivePurchaseOrder(null, "", [line(10)]);
    expect({ onHand: onHand(), owed: await outstanding() }).toEqual({ onHand: 8, owed: 0 });
    expect(await rebuildFromLog()).toEqual({ onHand: 8, owed: 0 });
  });

  describe("each settlement names the sale it pays off", () => {
    const settlementRows = () =>
      db.exec(`SELECT reference_id, quantity FROM stock_movements WHERE reference_type = 'backorder_settlement' ORDER BY reference_id`)[0]?.values ?? [];

    it("stays settled when the settling till's clock is behind the selling till's", async () => {
      await sellOwed("s1", 5);
      await receiving.createAndReceivePurchaseOrder(null, "", [line(20, 4500)]);
      db.run(`UPDATE stock_movements SET movement_date = '2000-01-01T00:00:00Z' WHERE reference_type = 'backorder_settlement'`);

      expect(await outstanding()).toBe(0);
      await receiving.createAndReceivePurchaseOrder(null, "", [line(20, 6000)]);
      expect(onHand()).toBe(35);
      expect(settlementRows()).toEqual([["s1", -5]]);
      expect(lineCost("s1")).toBe(4500);
    });

    it("does not move an earlier-stamped sale that syncs after a later one was settled", async () => {
      await sellOwed("s2", 3);
      await receiving.createAndReceivePurchaseOrder(null, "", [line(3, 4600)]);
      await sellOwed("s1", 2);
      db.run(`UPDATE stock_movements SET movement_date = '2000-01-01T00:00:00Z' WHERE reference_id = 's1'`);

      expect(await outstanding()).toBe(2);
      await receiving.createAndReceivePurchaseOrder(null, "", [line(2, 5000)]);
      expect(await outstanding()).toBe(0);
      expect(lineCost("s2")).toBe(4600);
      expect(lineCost("s1")).toBe(5000);
      expect(settlementRows()).toEqual([["s1", -2], ["s2", -3]]);
    });

    it("is idempotent on a retried settle and never lets one sale's double settlement pay another", async () => {
      const { settleBackordersOnReceipt } = await import("@/lib/db/queries/backorders");
      await sellOwed("s1", 5);
      await sellOwed("s2", 3);
      const receipt = {
        poItemId: "po-item-1", alreadyReceived: 0, productId: "p1", batchId: "b-r", receivedUnits: 10, unitCost: 4500,
        purchaseOrderId: "po-1", performedBy: null, movementDate: new Date().toISOString(),
      };
      expect(await settleBackordersOnReceipt(receipt)).toBe(8);
      expect(await settleBackordersOnReceipt(receipt)).toBe(0);
      expect(lineCost("s1")).toBe(4500);
      expect(lineCost("s2")).toBe(4500);
      const ids = db.exec(`SELECT id FROM stock_movements WHERE reference_type = 'backorder_settlement' ORDER BY reference_id`)[0].values.flat();
      expect(ids).toEqual([receiptSettlementMovementId("po-item-1", 0, "s1"), receiptSettlementMovementId("po-item-1", 0, "s2")]);

      await core.execute(
        `INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, reference_type, reference_id, movement_date, _deleted, store_id)
         VALUES ('dup', 'p1', 'b-other', 'adjustment', -5, 'backorder_settlement', 's1', '2026-10-26T10:00:00Z', 0, '${STORE_ID}')`,
      );
      db.run(`DELETE FROM stock_movements WHERE reference_type = 'backorder_settlement' AND reference_id = 's2'`);
      expect(await outstanding()).toBe(3);
    });
  });

  describe("a receipt with no cost", () => {
    it("settles but does not re-cost a purchase-order line costed at 0", async () => {
      await sellOwed("s1", 5);
      const { poId, itemIds } = await seedPO(line(20, 0));
      await receiving.receivePurchaseOrder(poId, [{ po_item_id: itemIds[0] }]);

      expect(await outstanding()).toBe(0);
      expect(lineCost("s1")).toBe(4000);
    });

    it("settles but does not re-cost an Immediate Purchase costed at 0", async () => {
      await sellOwed("s1", 5);
      await receiving.createAndReceivePurchaseOrder(null, "", [line(20, 0)]);

      expect(await outstanding()).toBe(0);
      expect(lineCost("s1")).toBe(4000);
    });
  });
});
