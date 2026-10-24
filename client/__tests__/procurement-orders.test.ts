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
  let updatePurchaseOrder: typeof import("@/lib/db/procurement").updatePurchaseOrder;
  let deletePurchaseOrder: typeof import("@/lib/db/procurement").deletePurchaseOrder;

  beforeAll(async () => {
    ({ createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder } = await import("@/lib/db/procurement"));
    db = await createProcurementTestDb();
  });

  beforeEach(() => {
    clearProcurementTables(db);
  });

  describe("createPurchaseOrder", () => {
    it("defaults type to 'standard' when none is passed", async () => {
      db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);

      const poId = await createPurchaseOrder(
        "sup1",
        "",
        [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
      );

      const rows = db.exec(`SELECT type FROM purchase_orders WHERE id = '${poId}'`);
      expect(rows[0].values[0][0]).toBe("standard");
    });

    it("preserves an explicit 'immediate' type, so a drafted Immediate Purchase keeps its identity", async () => {
      db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100)`);

      const poId = await createPurchaseOrder(
        null,
        "",
        [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
        "unpaid",
        0,
        null,
        "immediate",
      );

      const rows = db.exec(`SELECT type FROM purchase_orders WHERE id = '${poId}'`);
      expect(rows[0].values[0][0]).toBe("immediate");
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
        "immediate",
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

  describe("updatePurchaseOrder", () => {
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
