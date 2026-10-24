import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("procurement-receiving.ts", () => {
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
  });

  describe("createAndReceivePurchaseOrder", () => {
    it("uses unit_cost (per carton) directly for both the order total and the received stock's cost basis when there's no override", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Zyrtec', 'Tablet', 'Carton', 60)`);

      const poId = await createAndReceivePurchaseOrder(null, "", [
        {
          product_id: "prod1",
          product_name: "Zyrtec",
          bulk_unit: "Carton",
          bulk_quantity: 1,
          units_per_bulk: 60,
          unit_cost: 37200, // 620/tablet * 60 tablets/carton
          subtotal: 37200,
        },
      ]);

      const poRows = db.exec(`SELECT total_amount FROM purchase_orders WHERE id = '${poId}'`);
      expect(poRows[0].values[0][0]).toBe(37200);

      const batchRows = db.exec(`SELECT quantity, cost_price FROM stock_batches WHERE product_id = 'prod1'`);
      expect(batchRows[0].values[0]).toEqual([60, 620]);
    });

    it("scales a per-tablet cost override by units_per_bulk instead of using it as a flat per-carton price", async () => {
      // Regression: the UI's "New Cost" override is typed per base unit (per tablet, matching the catalog's current-cost display…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-procurement-test-ts-L493
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Zyrtec', 'Tablet', 'Carton', 60)`);

      const poId = await createAndReceivePurchaseOrder(null, "", [
        {
          product_id: "prod1",
          product_name: "Zyrtec",
          bulk_unit: "Carton",
          bulk_quantity: 2,
          units_per_bulk: 60,
          unit_cost: 37200,
          subtotal: 37200, // stale — from before the override/quantity were set
          cost_price_override: 650,
        },
      ]);

      const poRows = db.exec(`SELECT total_amount FROM purchase_orders WHERE id = '${poId}'`);
      expect(poRows[0].values[0][0]).toBe(78000); // 650 * 60 * 2

      const batchRows = db.exec(`SELECT quantity, cost_price FROM stock_batches WHERE product_id = 'prod1'`);
      expect(batchRows[0].values[0]).toEqual([120, 650]);

      const itemRows = db.exec(`SELECT subtotal FROM purchase_order_items WHERE po_id = '${poId}'`);
      expect(itemRows[0].values[0][0]).toBe(78000);
    });
  });

  describe("receivePurchaseOrder partial receipts", () => {
    const seedStandardPO = async () => {
      db.run(
        `INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Zyrtec', 'Tablet', 'Carton', 10)`,
      );
      return createPurchaseOrder(null, "", [
        {
          product_id: "prod1",
          product_name: "Zyrtec",
          bulk_unit: "Carton",
          bulk_quantity: 100,
          units_per_bulk: 10,
          unit_cost: 1000,
          subtotal: 100000,
        },
      ]);
    };

    const lineItem = async (poId: string) => {
      const item = (await getPurchaseOrderById(poId))?.items[0];
      if (!item) throw new Error(`expected a line item on ${poId}`);
      return item;
    };

    it("includes the product's current live selling price on each line item, for comparing against a receive-time override", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price) VALUES ('prod2', 'Panadol', 'Tablet', 'Carton', 100, 15.5)`);
      const poId = await createPurchaseOrder(null, "", [
        { product_id: "prod2", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 5, units_per_bulk: 100, unit_cost: 400, subtotal: 2000 },
      ]);

      const po = await getPurchaseOrderById(poId);

      expect(po?.items[0].current_selling_price).toBe(15.5);
    });

    it("leaves a short receipt as partially_received, with only the delivered quantity in stock", async () => {
      const poId = await seedStandardPO();
      const item = await lineItem(poId);

      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 60 }]);

      const poRows = db.exec(`SELECT status, received_at FROM purchase_orders WHERE id = '${poId}'`);
      expect(poRows[0].values[0][0]).toBe("partially_received");
      expect(poRows[0].values[0][1]).toBeNull();

      const itemRows = db.exec(`SELECT quantity_received FROM purchase_order_items WHERE po_id = '${poId}'`);
      expect(itemRows[0].values[0][0]).toBe(60);

      const batchRows = db.exec(`SELECT quantity FROM stock_batches WHERE product_id = 'prod1'`);
      expect(batchRows[0].values[0][0]).toBe(600);
    });

    it("receives the outstanding balance on a follow-up receipt and only then flips to received", async () => {
      const poId = await seedStandardPO();
      const item = await lineItem(poId);

      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 60 }]);
      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 40 }]);

      const poRows = db.exec(`SELECT status FROM purchase_orders WHERE id = '${poId}'`);
      expect(poRows[0].values[0][0]).toBe("received");

      const itemRows = db.exec(`SELECT quantity_received FROM purchase_order_items WHERE po_id = '${poId}'`);
      expect(itemRows[0].values[0][0]).toBe(100);

      const batchRows = db.exec(
        `SELECT SUM(quantity) FROM stock_batches WHERE product_id = 'prod1'`,
      );
      expect(batchRows[0].values[0][0]).toBe(1000);
    });

    it("caps a submitted quantity at the outstanding balance instead of overbooking stock", async () => {
      const poId = await seedStandardPO();
      const item = await lineItem(poId);

      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 60 }]);
      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 999 }]);

      const itemRows = db.exec(`SELECT quantity_received FROM purchase_order_items WHERE po_id = '${poId}'`);
      expect(itemRows[0].values[0][0]).toBe(100);

      const batchRows = db.exec(
        `SELECT SUM(quantity) FROM stock_batches WHERE product_id = 'prod1'`,
      );
      expect(batchRows[0].values[0][0]).toBe(1000);
    });

    it("defaults an omitted line to its outstanding balance, not the full ordered quantity", async () => {
      const poId = await seedStandardPO();
      const item = await lineItem(poId);

      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 60 }]);
      await receivePurchaseOrder(poId);

      const batchRows = db.exec(
        `SELECT SUM(quantity) FROM stock_batches WHERE product_id = 'prod1'`,
      );
      expect(batchRows[0].values[0][0]).toBe(1000);
    });

    it("is a no-op on an already-received order", async () => {
      const poId = await seedStandardPO();
      const item = await lineItem(poId);

      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 100 }]);
      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 100 }]);

      const batchRows = db.exec(
        `SELECT SUM(quantity) FROM stock_batches WHERE product_id = 'prod1'`,
      );
      expect(batchRows[0].values[0][0]).toBe(1000);
    });

    it("leaves the order untouched when every line is submitted as zero", async () => {
      const poId = await seedStandardPO();
      const item = await lineItem(poId);

      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 0 }]);

      const poRows = db.exec(`SELECT status FROM purchase_orders WHERE id = '${poId}'`);
      expect(poRows[0].values[0][0]).toBe("pending");

      const batchRows = db.exec(`SELECT COUNT(*) FROM stock_batches WHERE product_id = 'prod1'`);
      expect(batchRows[0].values[0][0]).toBe(0);
    });
  });
});
