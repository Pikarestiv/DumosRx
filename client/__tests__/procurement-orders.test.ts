import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import { clearProcurementTables, createProcurementTestDb } from "./helpers/procurement-test-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("procurement.ts order writes", () => {
  let db: Database;
  let createPurchaseOrder: typeof import("@/lib/db/procurement").createPurchaseOrder;
  let saveDraftOrder: typeof import("@/lib/db/procurement-draft").saveDraftOrder;
  const updatePurchaseOrder = (poId: string, supplierId: string | null, notes: string, items: Parameters<typeof saveDraftOrder>[0]["items"]) =>
    saveDraftOrder({ id: poId, supplierId, notes, items, paymentStatus: "unpaid", amountPaid: 0, dueDate: null });
  let deletePurchaseOrder: typeof import("@/lib/db/procurement").deletePurchaseOrder;

  beforeAll(async () => {
    ({ createPurchaseOrder, deletePurchaseOrder } = await import("@/lib/db/procurement"));
    ({ saveDraftOrder } = await import("@/lib/db/procurement-draft"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
  });

  describe("selling price on save", () => {
    const line = (selling_price?: number) => [{ product_id: "prodSp", product_name: "Zyrtec", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 10, unit_cost: 500, subtotal: 500, selling_price }];
    const price = () => db.exec(`SELECT selling_price, _synced FROM products WHERE id = 'prodSp'`)[0].values[0];

    it("never writes the catalog price when an order is created or edited, whatever the line carries", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price, _synced) VALUES ('prodSp', 'Zyrtec', 'Tablet', 'Carton', 10, 10, 1)`);

      const poId = await createPurchaseOrder(null, "", line(25));
      await updatePurchaseOrder(poId, null, "", line(30));
      await updatePurchaseOrder(poId, null, "", line(0));

      expect(price()).toEqual([10, 1]);
    });

    it("keeps a line's stored selling price for older tills that still read it", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price) VALUES ('prodSp', 'Zyrtec', 'Tablet', 'Carton', 10, 10)`);

      const poId = await createPurchaseOrder(null, "", line(25));

      const stored = db.exec(`SELECT selling_price FROM purchase_order_items WHERE po_id = '${poId}'`)[0].values[0][0];
      expect(stored).toBe(25);
    });
  });

  describe("createPurchaseOrder", () => {
    it("writes every new order as type 'immediate', so an older till's edit never strips its lot, expiry or cost", async () => {
      db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);

      const poId = await createPurchaseOrder(
        "sup1",
        "",
        [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
      );

      const rows = db.exec(`SELECT type, status FROM purchase_orders WHERE id = '${poId}'`);
      expect(rows[0].values[0]).toEqual(["immediate", "pending"]);
    });

    it("can create an order already sent to its vendor in one write, still typed 'immediate'", async () => {
      db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);

      const poId = await createPurchaseOrder(
        "sup1",
        "",
        [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
        "unpaid",
        0,
        null,
        "sent",
      );

      const rows = db.exec(`SELECT type, status FROM purchase_orders WHERE id = '${poId}'`);
      expect(rows[0].values[0]).toEqual(["immediate", "sent"]);
    });

    it("stores lot, expiry and cost override on every new line instead of dropping them", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);

      const poId = await createPurchaseOrder(null, "", [
        { product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000, cost_price_override: 4, lot_number: "L1", expiry_date: "2027-01-01" },
      ]);

      const row = db.exec(`SELECT cost_price_override, lot_number, expiry_date FROM purchase_order_items WHERE po_id = '${poId}'`)[0].values[0];
      expect(row).toEqual([4, "L1", "2027-01-01"]);
    });

    it("bills a drafted Immediate Purchase for its per-base-unit override, which the screen already showed", async () => {
      // The order page prices an immediate line via immediateLineAmount, so 3 cartons of 10 at a typed override of ₦90/unit read…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-procurement-test-ts-L306
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prodOv', 'Zyrtec', 'Tablet', 'Carton', 10)`);

      const poId = await createPurchaseOrder(
        null,
        "",
        [
          {
            product_id: "prodOv",
            product_name: "Zyrtec",
            bulk_unit: "Carton",
            bulk_quantity: 3,
            units_per_bulk: 10,
            unit_cost: 1000,
            subtotal: 3000,
            cost_price_override: 90,
          },
        ],
        "partial",
        1000,
        null,
      );

      const po = db.exec(`SELECT total_amount FROM purchase_orders WHERE id = '${poId}'`);
      expect(po[0].values[0][0]).toBe(2700);
      const item = db.exec(`SELECT subtotal FROM purchase_order_items WHERE po_id = '${poId}'`);
      expect(item[0].values[0][0]).toBe(2700);
    });

    it("leaves a standard line billed at bulk_quantity * unit_cost, exactly as before", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prodStd', 'Flagyl', 'Tablet', 'Carton', 20)`);

      const poId = await createPurchaseOrder(
        null,
        "",
        [
          {
            product_id: "prodStd",
            product_name: "Flagyl",
            bulk_unit: "Carton",
            bulk_quantity: 4,
            units_per_bulk: 20,
            unit_cost: 250,
            subtotal: 0,
          },
        ],
      );

      const po = db.exec(`SELECT total_amount FROM purchase_orders WHERE id = '${poId}'`);
      expect(po[0].values[0][0]).toBe(1000);
    });

    it("derives total_amount and each item's subtotal from bulk_quantity * unit_cost, ignoring a stale subtotal field", async () => {
      // Regression: item.subtotal is only ever set once when a row is first added in the UI and is never kept in sync with later…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-procurement-test-ts-L365
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);

      const poId = await createPurchaseOrder(
        null,
        "",
        [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 3, units_per_bulk: 100, unit_cost: 500, subtotal: 500 }],
      );

      const poRows = db.exec(`SELECT total_amount FROM purchase_orders WHERE id = '${poId}'`);
      expect(poRows[0].values[0][0]).toBe(1500);

      const itemRows = db.exec(`SELECT subtotal FROM purchase_order_items WHERE po_id = '${poId}'`);
      expect(itemRows[0].values[0][0]).toBe(1500);
    });

    it("accepts a null supplierId for a self/walk-in purchase with no real vendor", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);

      const poId = await createPurchaseOrder(
        null,
        "",
        [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
      );

      const rows = db.exec(`SELECT supplier_id FROM purchase_orders WHERE id = '${poId}'`);
      expect(rows[0].values[0][0]).toBeNull();
    });
  });

  describe("saving an existing order", () => {
    it("derives total_amount and each item's subtotal from bulk_quantity * unit_cost, ignoring a stale subtotal field", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);
      const poId = await createPurchaseOrder(
        null,
        "",
        [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 100, unit_cost: 500, subtotal: 500 }],
      );

      // Simulates editing the quantity in the UI without touching cost:
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-procurement-test-ts-L407
      await updatePurchaseOrder(
        poId,
        null,
        "",
        [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 4, units_per_bulk: 100, unit_cost: 500, subtotal: 500 }],
      );

      const poRows = db.exec(`SELECT total_amount FROM purchase_orders WHERE id = '${poId}'`);
      expect(poRows[0].values[0][0]).toBe(2000);

      const itemRows = db.exec(
        `SELECT subtotal FROM purchase_order_items WHERE po_id = '${poId}' AND _deleted = 0`,
      );
      expect(itemRows[0].values[0][0]).toBe(2000);
    });

    it("diffs edited lines in place to prevent sync churn and preserve line IDs (A-390)", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod2', 'Amoxil', 'Capsule', 'Carton', 50)`);
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod3', 'Ibuprofen', 'Tablet', 'Carton', 20)`);

      const poId = await createPurchaseOrder(null, "", [
        { product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 },
        { product_id: "prod2", product_name: "Amoxil", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 50, unit_cost: 800, subtotal: 800 },
      ]);

      const initialLines = db.exec(
        `SELECT id, product_id, bulk_quantity FROM purchase_order_items WHERE po_id = '${poId}' AND _deleted = 0 ORDER BY product_id ASC`,
      )[0].values;
      const line1Id = initialLines[0][0] as string;
      const line2Id = initialLines[1][0] as string;

      // 1. One-line quantity change queues only 1 UPDATE, 0 INSERTs, 0 DELETEs
      db.run(`DELETE FROM _sync_queue`);
      await updatePurchaseOrder(poId, null, "", [
        { id: line1Id, product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 5, units_per_bulk: 100, unit_cost: 500, subtotal: 2500 },
        { id: line2Id, product_id: "prod2", product_name: "Amoxil", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 50, unit_cost: 800, subtotal: 800 },
      ]);

      const queueOps1 = db.exec(
        `SELECT operation, record_id FROM _sync_queue WHERE table_name = 'purchase_order_items'`,
      )[0]?.values ?? [];
      expect(queueOps1).toEqual([["UPDATE", line1Id]]);

      // Verify line1 updated in place and retained its id
      const updatedLine1 = db.exec(
        `SELECT id, bulk_quantity FROM purchase_order_items WHERE id = '${line1Id}' AND _deleted = 0`,
      )[0].values[0];
      expect(updatedLine1).toEqual([line1Id, 5]);

      // 2. Keeping line 1, removing line 2, and adding line 3 queues exactly 1 DELETE and 1 INSERT
      db.run(`DELETE FROM _sync_queue`);
      await updatePurchaseOrder(poId, null, "", [
        { id: line1Id, product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 5, units_per_bulk: 100, unit_cost: 500, subtotal: 2500 },
        { product_id: "prod3", product_name: "Ibuprofen", bulk_unit: "Carton", bulk_quantity: 3, units_per_bulk: 20, unit_cost: 400, subtotal: 1200 },
      ]);

      const queueOps2 = db.exec(
        `SELECT operation, record_id FROM _sync_queue WHERE table_name = 'purchase_order_items' ORDER BY operation ASC`,
      )[0]?.values ?? [];
      expect(queueOps2).toHaveLength(2);
      expect(queueOps2[0][0]).toBe("DELETE");
      expect(queueOps2[0][1]).toBe(line2Id);
      expect(queueOps2[1][0]).toBe("INSERT");

      // Verify line 1 is still live with same ID, line 2 is soft deleted, and line 3 is inserted
      const liveItems = db.exec(
        `SELECT id, product_id, bulk_quantity FROM purchase_order_items WHERE po_id = '${poId}' AND _deleted = 0 ORDER BY product_id ASC`,
      )[0].values;
      expect(liveItems).toHaveLength(2);
      expect(liveItems[0]).toEqual([line1Id, "prod1", 5]);
      expect(liveItems[1][1]).toBe("prod3");
      expect(liveItems[1][2]).toBe(3);
    });
  });

  describe("saving an existing order for older tills", () => {
    const panadol = { product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", units_per_bulk: 100, unit_cost: 500 };

    beforeEach(() => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);
    });

    it("keeps lot, expiry and cost on a legacy 'standard' order and retypes it 'immediate' so older tills stop stripping them", async () => {
      const poId = await createPurchaseOrder(null, "", [{ ...panadol, bulk_quantity: 1, subtotal: 500 }]);
      db.run(`UPDATE purchase_orders SET type = 'standard' WHERE id = '${poId}'`);
      const lineId = db.exec(`SELECT id FROM purchase_order_items WHERE po_id = '${poId}'`)[0].values[0][0] as string;

      await updatePurchaseOrder(poId, null, "", [
        { ...panadol, id: lineId, bulk_quantity: 1, subtotal: 500, cost_price_override: 6, lot_number: "L9", expiry_date: "2028-02-02" },
      ]);

      expect(db.exec(`SELECT type FROM purchase_orders WHERE id = '${poId}'`)[0].values[0][0]).toBe("immediate");
      const row = db.exec(`SELECT cost_price_override, lot_number, expiry_date FROM purchase_order_items WHERE id = '${lineId}'`)[0].values[0];
      expect(row).toEqual([6, "L9", "2028-02-02"]);
    });

    it("keeps two lines of the same product on their own rows instead of swapping their values", async () => {
      const poId = await createPurchaseOrder(null, "", [
        { ...panadol, bulk_quantity: 1, subtotal: 500, lot_number: "A" },
        { ...panadol, bulk_quantity: 2, subtotal: 1000, lot_number: "B" },
      ]);
      const before = db.exec(`SELECT id, lot_number, bulk_quantity FROM purchase_order_items WHERE po_id = '${poId}' ORDER BY lot_number`)[0].values;

      await updatePurchaseOrder(poId, null, "", [
        { ...panadol, id: before[1][0] as string, bulk_quantity: 2, subtotal: 1000, lot_number: "B" },
        { ...panadol, id: before[0][0] as string, bulk_quantity: 1, subtotal: 500, lot_number: "A" },
      ]);

      const after = db.exec(`SELECT id, lot_number, bulk_quantity FROM purchase_order_items WHERE po_id = '${poId}' AND _deleted = 0 ORDER BY lot_number`)[0].values;
      expect(after).toEqual(before);
    });

    it("sends bulk_quantity and units_per_bulk together whenever a line's quantity changes", async () => {
      const poId = await createPurchaseOrder(null, "", [{ ...panadol, bulk_quantity: 1, subtotal: 500 }]);
      const lineId = db.exec(`SELECT id FROM purchase_order_items WHERE po_id = '${poId}'`)[0].values[0][0] as string;
      db.run(`DELETE FROM _sync_queue`);

      await updatePurchaseOrder(poId, null, "", [{ ...panadol, id: lineId, bulk_quantity: 3, subtotal: 1500 }]);

      const payload = JSON.parse(db.exec(`SELECT payload FROM _sync_queue WHERE record_id = '${lineId}'`)[0].values[0][0] as string);
      expect(payload).toMatchObject({ bulk_quantity: 3, units_per_bulk: 100 });
    });
  });

  describe("editing after another device removed a line", () => {
    it("saves a line whose old id points at a soft-deleted row instead of failing on the primary key", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);
      const poId = await createPurchaseOrder(null, "", [
        { product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 },
      ]);
      const oldId = db.exec(`SELECT id FROM purchase_order_items WHERE po_id = '${poId}'`)[0].values[0][0] as string;
      db.run(`UPDATE purchase_order_items SET _deleted = 1 WHERE id = '${oldId}'`);

      await updatePurchaseOrder(poId, null, "", [
        { id: oldId, product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 4, units_per_bulk: 100, unit_cost: 500, subtotal: 2000 },
      ]);

      const live = db.exec(`SELECT id, bulk_quantity FROM purchase_order_items WHERE po_id = '${poId}' AND _deleted = 0`)[0].values;
      expect(live).toHaveLength(1);
      expect(live[0][1]).toBe(4);
      expect(live[0][0]).not.toBe(oldId);
    });
  });

  describe("deletePurchaseOrder", () => {
    it("soft-deletes the order's lines with it, so neither side is left holding a line under a deleted order (A-296)", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Coartem', 'Tablet', 'Carton', 24)`);
      const poId = await createPurchaseOrder(null, "", [
        { product_id: "prod1", product_name: "Coartem", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 24, unit_cost: 9000, subtotal: 18000 },
        { product_id: "prod1", product_name: "Coartem", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 24, unit_cost: 9000, subtotal: 9000 },
      ]);
      db.run(`DELETE FROM _sync_queue`);

      await deletePurchaseOrder(poId);

      const live = db.exec(
        `SELECT COUNT(*) FROM purchase_order_items WHERE po_id = '${poId}' AND _deleted = 0`,
      );
      expect(live[0].values[0][0]).toBe(0);

      // The cloud only learns through the queue: without a DELETE per line the
      // server keeps them live under a parent it has soft-deleted.
      const queued = db.exec(
        `SELECT COUNT(*) FROM _sync_queue WHERE table_name = 'purchase_order_items' AND operation = 'DELETE'`,
      );
      expect(queued[0].values[0][0]).toBe(2);
    });

    it("leaves another order's lines alone", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Coartem', 'Tablet', 'Carton', 24)`);
      const doomed = await createPurchaseOrder(null, "", [
        { product_id: "prod1", product_name: "Coartem", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 24, unit_cost: 9000, subtotal: 9000 },
      ]);
      const keeper = await createPurchaseOrder(null, "", [
        { product_id: "prod1", product_name: "Coartem", bulk_unit: "Carton", bulk_quantity: 3, units_per_bulk: 24, unit_cost: 9000, subtotal: 27000 },
      ]);

      await deletePurchaseOrder(doomed);

      const kept = db.exec(
        `SELECT COUNT(*) FROM purchase_order_items WHERE po_id = '${keeper}' AND _deleted = 0`,
      );
      expect(kept[0].values[0][0]).toBe(1);
    });
  });
});
