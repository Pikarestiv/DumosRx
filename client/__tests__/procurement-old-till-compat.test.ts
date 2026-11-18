import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";
import type { DraftPOLineItem, PurchaseOrderItem } from "@/lib/db/procurement";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// The shipped (pre-one-screen) edit page dropped these four fields from any order not typed "immediate".
function legacyEditSaveLines(type: string, items: PurchaseOrderItem[]): DraftPOLineItem[] {
  return items.map((item) => {
    const line: DraftPOLineItem = { ...item, product_name: item.product_name, bulk_unit: item.bulk_unit };
    if (type === "immediate") return { ...line, selling_price: item.current_selling_price ?? item.selling_price };
    return { ...line, selling_price: undefined, cost_price_override: undefined, lot_number: undefined, expiry_date: undefined };
  });
}

describe("a draft written by this build, handled by an older till", () => {
  let db: Database;
  let procurement: typeof import("@/lib/db/procurement");
  let receiving: typeof import("@/lib/db/procurement-receiving");
  let lineDiff: typeof import("@/lib/db/procurement-line-diff");

  beforeAll(async () => {
    procurement = await import("@/lib/db/procurement");
    receiving = await import("@/lib/db/procurement-receiving");
    lineDiff = await import("@/lib/db/procurement-line-diff");
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price) VALUES ('p1', 'Coartem', 'Tablet', 'Carton', 24, 900)`);
  });

  const createDraft = (status: "pending" | "sent" = "pending") =>
    procurement.createPurchaseOrder("sup1", "", [
      { product_id: "p1", product_name: "Coartem", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 24, unit_cost: 12000, subtotal: 24000, cost_price_override: 480, lot_number: "LOT-7", expiry_date: "2028-06-30" },
    ], "unpaid", 0, null, status);

  const lineFields = (poId: string) =>
    db.exec(`SELECT bulk_quantity, cost_price_override, lot_number, expiry_date FROM purchase_order_items WHERE po_id = '${poId}' AND _deleted = 0`)[0].values[0];

  it.each(["pending", "sent"] as const)("keeps lot, expiry and cost through the old edit-save of a %s order", async (status) => {
    const poId = await createDraft(status);
    const po = await procurement.getPurchaseOrderById(poId);
    if (!po) throw new Error("order missing");

    await lineDiff.reconcilePurchaseOrderLines(poId, legacyEditSaveLines(po.type, po.items ?? []), new Date().toISOString());

    expect(lineFields(poId)).toEqual([2, 480, "LOT-7", "2028-06-30"]);
  });

  it("receives the saved lot, expiry and cost through the old receive panel's seeding", async () => {
    const poId = await createDraft();
    const po = await procurement.getPurchaseOrderById(poId);
    const item = po?.items?.[0];
    if (!po || !item) throw new Error("order missing");
    const seedsLine = po.type === "immediate";

    await receiving.receivePurchaseOrder(poId, [{
      po_item_id: item.id,
      quantity: item.bulk_quantity,
      lot_number: seedsLine ? item.lot_number : "",
      expiry_date: seedsLine ? item.expiry_date : "",
      cost_price: seedsLine ? item.cost_price_override : undefined,
    }]);

    const batch = db.exec(`SELECT quantity, cost_price, batch_number, expiry_date FROM stock_batches WHERE product_id = 'p1'`)[0].values[0];
    expect(batch).toEqual([48, 480, "LOT-7", "2028-06-30"]);
    expect(lineFields(poId)).toEqual([2, 480, "LOT-7", "2028-06-30"]);
  });
});
