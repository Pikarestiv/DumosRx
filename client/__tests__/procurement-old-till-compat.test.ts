import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

interface ShippedLine {
  id: string;
  bulk_quantity: number;
  cost_price_override: number | null;
  lot_number: string | null;
  expiry_date: string | null;
}

// The shipped edit page's save, replayed in plain SQL: it cleared these four fields on any order not typed "immediate".
function shippedEditSave(db: Database, poId: string) {
  const [[type]] = db.exec(`SELECT type FROM purchase_orders WHERE id = '${poId}'`)[0].values;
  const lines = db.exec(`SELECT id, bulk_quantity, cost_price_override, lot_number, expiry_date FROM purchase_order_items WHERE po_id = '${poId}' AND _deleted = 0`)[0].values;
  for (const [id, quantity, cost, lot, expiry] of lines) {
    const kept: ShippedLine = type === "immediate"
      ? { id: String(id), bulk_quantity: Number(quantity), cost_price_override: cost as number | null, lot_number: lot as string | null, expiry_date: expiry as string | null }
      : { id: String(id), bulk_quantity: Number(quantity), cost_price_override: null, lot_number: null, expiry_date: null };
    db.run(`UPDATE purchase_order_items SET bulk_quantity = ?, cost_price_override = ?, lot_number = ?, expiry_date = ? WHERE id = ?`,
      [kept.bulk_quantity, kept.cost_price_override, kept.lot_number, kept.expiry_date, kept.id]);
  }
}

// The shipped receive panel's seeding rule: lot, expiry and cost come from the line only for "immediate" orders.
function shippedReceiveSeed(db: Database, poId: string) {
  const [[type]] = db.exec(`SELECT type FROM purchase_orders WHERE id = '${poId}'`)[0].values;
  const [[lot, expiry, cost]] = db.exec(`SELECT lot_number, expiry_date, cost_price_override FROM purchase_order_items WHERE po_id = '${poId}'`)[0].values;
  return type === "immediate" ? { lot, expiry, cost } : { lot: "", expiry: "", cost: undefined };
}

describe("orders written by this build, read and saved by an older till", () => {
  let db: Database;
  let saveDraftOrder: typeof import("@/lib/db/procurement-draft").saveDraftOrder;

  beforeAll(async () => {
    ({ saveDraftOrder } = await import("@/lib/db/procurement-draft"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => clearProcurementTables(db));

  const saveFromThisBuild = (id: string) =>
    saveDraftOrder({
      id, supplierId: "sup1", notes: "", paymentStatus: "unpaid", amountPaid: 0, dueDate: null,
      lock: { deviceId: "DRX-NEW", deviceLabel: "Counter 1", userId: "u1" },
      items: [{ id: "l1", product_id: "p1", product_name: "Coartem", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 24, unit_cost: 12000, subtotal: 24000, cost_price_override: 480, lot_number: "LOT-7", expiry_date: "2028-06-30" }],
    });
  const lineFields = () => db.exec(`SELECT bulk_quantity, cost_price_override, lot_number, expiry_date FROM purchase_order_items WHERE id = 'l1'`)[0].values[0];

  it("types every order it writes so the shipped edit save keeps lot, expiry and cost", async () => {
    await saveFromThisBuild("po1");
    shippedEditSave(db, "po1");
    expect(lineFields()).toEqual([2, 480, "LOT-7", "2028-06-30"]);
  });

  it("re-types an older standard draft on its first save, which is what stops the shipped edit save stripping it", async () => {
    db.run(`INSERT INTO purchase_orders (id, supplier_id, status, type, total_amount, _deleted) VALUES ('po1', 'sup1', 'pending', 'standard', 24000, 0)`);
    await saveFromThisBuild("po1");
    expect(db.exec(`SELECT type FROM purchase_orders`)[0].values[0][0]).toBe("immediate");
    shippedEditSave(db, "po1");
    expect(lineFields()).toEqual([2, 480, "LOT-7", "2028-06-30"]);
  });

  it("leaves the saved lot, expiry and cost where the shipped receive panel seeds from", async () => {
    await saveFromThisBuild("po1");
    expect(shippedReceiveSeed(db, "po1")).toEqual({ lot: "LOT-7", expiry: "2028-06-30", cost: 480 });
  });

  it("keeps writing payment_status beside amount_paid for tills that filter on it", async () => {
    await saveDraftOrder({
      id: "po1", supplierId: "sup1", notes: "", paymentStatus: "partial", amountPaid: 1000, dueDate: "2026-12-01",
      items: [{ id: "l1", product_id: "p1", product_name: "P", bulk_unit: "Box", bulk_quantity: 1, units_per_bulk: 1, unit_cost: 5000, subtotal: 5000 }],
    });
    expect(db.exec(`SELECT payment_status, amount_paid, due_date FROM purchase_orders`)[0].values[0]).toEqual(["partial", 1000, "2026-12-01"]);
  });
});
