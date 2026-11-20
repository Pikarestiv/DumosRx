import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("voiding a purchase-order receipt", () => {
  let db: Database;
  let voids: typeof import("@/lib/db/procurement-void-receipt");
  let receivePurchaseOrder: typeof import("@/lib/db/procurement-receiving").receivePurchaseOrder;
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    voids = await import("@/lib/db/procurement-void-receipt");
    ({ receivePurchaseOrder } = await import("@/lib/db/procurement-receiving"));
    db = await createProcurementTestDb();
  });

  beforeEach(async () => {
    clearProcurementTables(db);
    db.run("DELETE FROM audit_logs; DELETE FROM _sync_queue;");
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('p1', 'Panadol', 'Tablet', 'Carton', 10)`);
    db.run(`INSERT INTO purchase_orders (id, supplier_id, status, type, total_amount, _deleted) VALUES ('po1', 's1', 'sent', 'immediate', 1000, 0)`);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, _deleted)
            VALUES ('l1', 'po1', 'p1', 10, 0, 10, 100, 1000, 0)`);
    await receivePurchaseOrder("po1", [{ po_item_id: "l1", quantity: 4, lot_number: "LOT-A" }]);
  });

  const receipt = async () => (await voids.getPurchaseOrderReceipts("po1"))[0];

  it("lists each receipt with what it added and whether it can be voided", async () => {
    const r = await receipt();
    expect(r).toMatchObject({ product_name: "Panadol", batch_number: "LOT-A", units: 40, blocked: null });
  });

  it("takes the receipt's stock back out of its own batch and reopens the line", async () => {
    const r = await receipt();
    expect(await voids.voidPurchaseOrderReceipt("po1", r.batch_id)).toBe("voided");

    expect(rows(`SELECT quantity FROM stock_batches WHERE id = '${r.batch_id}'`)[0][0]).toBe(0);
    expect(rows("SELECT movement_type, quantity, reference_type FROM stock_movements WHERE quantity < 0")).toEqual([["adjustment", -40, "purchase_order_reversal"]]);
    expect(rows("SELECT quantity_received FROM purchase_order_items")[0][0]).toBe(0);
    expect(rows("SELECT status FROM purchase_orders")[0][0]).toBe("sent");
    expect(rows("SELECT action FROM audit_logs WHERE action = 'RECEIVE_PO_REVERSED'")).toHaveLength(1);
  });

  it("sends the reopened line's quantity with bulk_quantity and units_per_bulk", async () => {
    const r = await receipt();
    db.run("DELETE FROM _sync_queue");
    await voids.voidPurchaseOrderReceipt("po1", r.batch_id);
    const payload = JSON.parse(rows("SELECT payload FROM _sync_queue WHERE record_id = 'l1'")[0][0] as string);
    expect(payload).toMatchObject({ quantity_received: 0, bulk_quantity: 10, units_per_bulk: 10 });
  });

  it("leaves the order partially received when another receipt still stands", async () => {
    await receivePurchaseOrder("po1", [{ po_item_id: "l1", quantity: 6 }]);
    const [first] = await voids.getPurchaseOrderReceipts("po1");
    await voids.voidPurchaseOrderReceipt("po1", first.batch_id);
    expect(rows("SELECT quantity_received FROM purchase_order_items")[0][0]).toBe(6);
    expect(rows("SELECT status FROM purchase_orders")[0][0]).toBe("partially_received");
  });

  it("refuses once any of the receipt has been sold or adjusted, and says why", async () => {
    const r = await receipt();
    db.run(`INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, _deleted) VALUES ('sale1', 'p1', '${r.batch_id}', 'sale', -3, 0)`);
    db.run(`UPDATE stock_batches SET quantity = 37 WHERE id = '${r.batch_id}'`);

    expect((await receipt()).blocked).toBe("partly_sold");
    expect(await voids.voidPurchaseOrderReceipt("po1", r.batch_id)).toBe("partly_sold");
    expect(rows("SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'purchase_order_reversal'")[0][0]).toBe(0);
  });

  it("refuses a receipt that paid off backorders", async () => {
    const r = await receipt();
    db.run(`INSERT INTO stock_movements (id, product_id, stock_batch_id, movement_type, quantity, reference_type, _deleted) VALUES ('set1', 'p1', '${r.batch_id}', 'adjustment', 0, 'backorder_settlement', 0)`);
    expect((await receipt()).blocked).toBe("settled_backorders");
    expect(await voids.voidPurchaseOrderReceipt("po1", r.batch_id)).toBe("settled_backorders");
  });

  it("voids once even when asked twice, and a second till derives the same reversal id", async () => {
    const r = await receipt();
    await voids.voidPurchaseOrderReceipt("po1", r.batch_id);
    expect(await voids.voidPurchaseOrderReceipt("po1", r.batch_id)).toBe("already_voided");
    expect(rows("SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'purchase_order_reversal'")[0][0]).toBe(1);
    expect(rows("SELECT id FROM stock_movements WHERE reference_type = 'purchase_order_reversal'")[0][0]).toBe(voids.receiptReversalId(r.batch_id));
    expect(voids.receiptReversalId(r.batch_id)).toBe(voids.receiptReversalId(r.batch_id));
    expect((await receipt()).blocked).toBe("already_voided");
  });

  it("refuses a batch that is not one of this order's receipts", async () => {
    expect(await voids.voidPurchaseOrderReceipt("po1", "not-a-receipt")).toBe("not_found");
  });
});
