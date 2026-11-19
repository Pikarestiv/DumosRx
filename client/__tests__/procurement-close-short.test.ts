import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("closing a purchase order short", () => {
  let db: Database;
  let closePurchaseOrderShort: typeof import("@/lib/db/procurement-close").closePurchaseOrderShort;
  let isReceivablePurchaseOrderStatus: typeof import("@/lib/db/procurement").isReceivablePurchaseOrderStatus;
  let receivePurchaseOrder: typeof import("@/lib/db/procurement-receiving").receivePurchaseOrder;
  const rows = (sql: string) => db.exec(sql)[0]?.values ?? [];

  beforeAll(async () => {
    ({ closePurchaseOrderShort } = await import("@/lib/db/procurement-close"));
    ({ isReceivablePurchaseOrderStatus } = await import("@/lib/db/procurement"));
    ({ receivePurchaseOrder } = await import("@/lib/db/procurement-receiving"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run("DELETE FROM audit_logs; DELETE FROM _sync_queue;");
    db.run(`INSERT INTO purchase_orders (id, status, type, total_amount, amount_paid, payment_status, _deleted) VALUES ('po1', 'partially_received', 'immediate', 10000, 2000, 'partial', 0)`);
    db.run(`INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, quantity_received, units_per_bulk, unit_cost, subtotal, _deleted) VALUES
      ('l1', 'po1', 'p1', 10, 4, 10, 500, 5000, 0),
      ('l2', 'po1', 'p2', 5, 5, 10, 1000, 5000, 0)`);
  });

  it("closes the order, bills only what arrived, and re-derives what is still owed", async () => {
    expect(await closePurchaseOrderShort("po1")).toBe("closed");

    expect(rows("SELECT status, total_amount, amount_paid, payment_status FROM purchase_orders")).toEqual([["closed", 7000, 2000, "partial"]]);
    expect(rows("SELECT id, bulk_quantity, quantity_received FROM purchase_order_items ORDER BY id")).toEqual([["l1", 10, 4], ["l2", 5, 5]]);
  });

  it("logs the close once in the audit trail", async () => {
    await closePurchaseOrderShort("po1");
    expect(rows("SELECT action FROM audit_logs WHERE action = 'PO_CLOSED_SHORT'")).toHaveLength(1);
  });

  it("only closes an order that is partially received", async () => {
    db.run("UPDATE purchase_orders SET status = 'sent'");
    expect(await closePurchaseOrderShort("po1")).toBe("not_partially_received");
    expect(rows("SELECT status FROM purchase_orders")[0][0]).toBe("sent");
    expect(await closePurchaseOrderShort("missing")).toBe("not_found");
  });

  it("can no longer be received, here or on an older till's receivable check", async () => {
    await closePurchaseOrderShort("po1");
    expect(isReceivablePurchaseOrderStatus("closed")).toBe(false);
    expect(await receivePurchaseOrder("po1", [{ po_item_id: "l1", quantity: 6 }])).toBe("not_receivable");
    expect(rows("SELECT quantity_received FROM purchase_order_items WHERE id = 'l1'")[0][0]).toBe(4);
  });

  it("keeps an overpaid order paid when it closes short and reports by how much it was overpaid", async () => {
    db.run("UPDATE purchase_orders SET amount_paid = 10000, payment_status = 'paid'");
    const { getCloseShortPreview } = await import("@/lib/db/procurement-close");

    expect(await getCloseShortPreview("po1")).toEqual({ receivedTotal: 7000, amountPaid: 10000, overpaidBy: 3000 });
    await closePurchaseOrderShort("po1");

    expect(rows("SELECT total_amount, amount_paid, payment_status FROM purchase_orders")).toEqual([[7000, 10000, "paid"]]);
  });

  it("reports no overpayment on a part-paid order, and counts an older paid row with no stored amount as paid in full", async () => {
    const { getCloseShortPreview } = await import("@/lib/db/procurement-close");
    expect((await getCloseShortPreview("po1"))?.overpaidBy).toBe(0);
    db.run("UPDATE purchase_orders SET amount_paid = NULL, payment_status = 'paid'");
    expect(await getCloseShortPreview("po1")).toEqual({ receivedTotal: 7000, amountPaid: 10000, overpaidBy: 3000 });
    expect(await getCloseShortPreview("missing")).toBeNull();
  });
});
