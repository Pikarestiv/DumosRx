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

  describe("createAndReceivePurchaseOrder selling price", () => {
    it("never writes the catalog price, even when the line still carries a different one", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price, _synced) VALUES ('pI', 'I', 'Tablet', 'Carton', 10, 40, 1)`);
      await createAndReceivePurchaseOrder(null, "", [
        { product_id: "pI", product_name: "I", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 10, unit_cost: 1000, subtotal: 1000, selling_price: 55 },
      ]);
      expect(db.exec(`SELECT selling_price, _synced FROM products WHERE id = 'pI'`)[0].values[0]).toEqual([40, 1]);
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

    it("never writes the catalog price when an order is received", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price, _synced) VALUES ('pS', 'S', 'Tablet', 'Carton', 10, 40, 1)`);
      const poId = await createPurchaseOrder(null, "", [{ product_id: "pS", product_name: "S", bulk_unit: "Carton", bulk_quantity: 5, units_per_bulk: 10, unit_cost: 1000, subtotal: 5000, selling_price: 99 }]);
      const item = (await getPurchaseOrderById(poId))?.items[0];

      await receivePurchaseOrder(poId, [{ po_item_id: item?.id ?? "", quantity: 5 }]);

      expect(db.exec(`SELECT selling_price, _synced FROM products WHERE id = 'pS'`)[0].values[0]).toEqual([40, 1]);
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

    it("treats a submit that receives nothing as a no-op even when earlier receipts exist", async () => {
      const poId = await seedStandardPO();
      const item = await lineItem(poId);
      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 60 }]);

      const second = await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 0 }]);

      expect(second).toBeUndefined();
      expect(db.exec(`SELECT status FROM purchase_orders WHERE id = '${poId}'`)[0].values[0][0]).toBe("partially_received");
    });

    it("reports a missing order instead of silently returning", async () => {
      expect(await receivePurchaseOrder("does-not-exist", [])).toBe("not_found");
    });

    it("is a no-op on an already-received order", async () => {
      const poId = await seedStandardPO();
      const item = await lineItem(poId);

      await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 100 }]);
      const second = await receivePurchaseOrder(poId, [{ po_item_id: item.id, quantity: 100 }]);

      expect(second).toBe("already_received");
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

  describe("receivePurchaseOrder uncounted lines", () => {
    const seedWithUncountedLine = async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('pc', 'Counted', 'Tablet', 'Carton', 10), ('pu', 'Uncounted', 'Tablet', 'Carton', 10)`);
      const poId = await createPurchaseOrder(null, "", [
        { product_id: "pc", product_name: "Counted", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 10, unit_cost: 1000, subtotal: 2000 },
        { product_id: "pu", product_name: "Uncounted", bulk_unit: "Carton", bulk_quantity: 0, units_per_bulk: 10, unit_cost: 500, subtotal: 0 },
      ]);
      const items = (await getPurchaseOrderById(poId))?.items ?? [];
      const idOf = (productId: string) => items.find((i) => i.product_id === productId)?.id ?? "";
      return { poId, counted: idOf("pc"), uncounted: idOf("pu") };
    };

    it("receives what was counted on a line ordered at zero, recording it as both ordered and received", async () => {
      const { poId, counted, uncounted } = await seedWithUncountedLine();

      const status = await receivePurchaseOrder(poId, [
        { po_item_id: counted, quantity: 2 },
        { po_item_id: uncounted, quantity: 3 },
      ]);

      expect(status).toBe("received");
      const line = db.exec(`SELECT bulk_quantity, quantity_received, subtotal FROM purchase_order_items WHERE id = '${uncounted}'`)[0].values[0];
      expect(line).toEqual([3, 3, 1500]);
      expect(db.exec(`SELECT SUM(quantity) FROM stock_batches WHERE product_id = 'pu'`)[0].values[0][0]).toBe(30);
      expect(db.exec(`SELECT total_amount FROM purchase_orders WHERE id = '${poId}'`)[0].values[0][0]).toBe(3500);
    });

    it("sends the counted quantity with units_per_bulk so the server scales it", async () => {
      const { poId, counted, uncounted } = await seedWithUncountedLine();
      db.run(`DELETE FROM _sync_queue`);

      await receivePurchaseOrder(poId, [
        { po_item_id: counted, quantity: 2 },
        { po_item_id: uncounted, quantity: 3 },
      ]);

      const payload = JSON.parse(db.exec(`SELECT payload FROM _sync_queue WHERE record_id = '${uncounted}'`)[0].values[0][0] as string);
      expect(payload).toMatchObject({ bulk_quantity: 3, quantity_received: 3, units_per_bulk: 10 });
    });

    it("leaves a line still at zero off the receipt without holding the order open", async () => {
      const { poId, counted, uncounted } = await seedWithUncountedLine();

      const status = await receivePurchaseOrder(poId, [
        { po_item_id: counted, quantity: 2 },
        { po_item_id: uncounted, quantity: 0 },
      ]);

      expect(status).toBe("received");
      expect(db.exec(`SELECT COUNT(*) FROM stock_batches WHERE product_id = 'pu'`)[0].values[0][0]).toBe(0);
      expect(db.exec(`SELECT total_amount FROM purchase_orders WHERE id = '${poId}'`)[0].values[0][0]).toBe(2000);
    });

    it("rejects a negative or non-numeric count instead of booking it", async () => {
      const { poId, counted, uncounted } = await seedWithUncountedLine();

      await receivePurchaseOrder(poId, [
        { po_item_id: counted, quantity: 2 },
        { po_item_id: uncounted, quantity: "abc" },
      ]);
      await receivePurchaseOrder(poId, [{ po_item_id: uncounted, quantity: -4 }]);

      expect(db.exec(`SELECT COUNT(*) FROM stock_batches WHERE product_id = 'pu'`)[0].values[0][0]).toBe(0);
    });
  });
});
