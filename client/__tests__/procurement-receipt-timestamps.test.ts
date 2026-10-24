import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("purchase receipt timestamps", () => {
  let db: Database;
  let createPurchaseOrder: typeof import("@/lib/db/procurement").createPurchaseOrder;
  let getPurchaseOrderById: typeof import("@/lib/db/procurement").getPurchaseOrderById;
  let createAndReceivePurchaseOrder: typeof import("@/lib/db/procurement-receiving").createAndReceivePurchaseOrder;
  let receivePurchaseOrder: typeof import("@/lib/db/procurement-receiving").receivePurchaseOrder;

  beforeAll(async () => {
    ({ createPurchaseOrder, getPurchaseOrderById } = await import("@/lib/db/procurement"));
    ({ createAndReceivePurchaseOrder, receivePurchaseOrder } = await import("@/lib/db/procurement-receiving"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
    db.run(
      `INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Zyrtec', 'Tablet', 'Carton', 10)`,
    );
  });

  const line = {
    product_id: "prod1",
    product_name: "Zyrtec",
    bulk_unit: "Carton",
    bulk_quantity: 10,
    units_per_bulk: 10,
    unit_cost: 1000,
    subtotal: 10000,
  };

  const column = (sql: string): unknown[] => db.exec(sql)[0].values.map((row) => row[0]);

  it("stamps an immediate purchase's movement, batch and order with real UTC instants, not zone-less strings", async () => {
    const poId = await createAndReceivePurchaseOrder(null, "", [line]);

    for (const value of [
      ...column(`SELECT created_at FROM stock_movements WHERE reference_id = '${poId}'`),
      ...column(`SELECT movement_date FROM stock_movements WHERE reference_id = '${poId}'`),
      ...column(`SELECT created_at FROM stock_batches WHERE product_id = 'prod1'`),
      ...column(`SELECT received_at FROM purchase_orders WHERE id = '${poId}'`),
    ]) {
      expect(String(value)).toMatch(UTC_INSTANT);
    }
  });

  it("stamps a later receipt of a drafted order the same way", async () => {
    const poId = await createPurchaseOrder(null, "", [line]);
    const item = (await getPurchaseOrderById(poId))?.items[0];
    if (!item) throw new Error(`expected a line item on ${poId}`);

    await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 10 }]);

    for (const value of [
      ...column(`SELECT created_at FROM stock_movements WHERE reference_id = '${poId}'`),
      ...column(`SELECT movement_date FROM stock_movements WHERE reference_id = '${poId}'`),
      ...column(`SELECT created_at FROM stock_batches WHERE product_id = 'prod1'`),
    ]) {
      expect(String(value)).toMatch(UTC_INSTANT);
    }
  });
});
