import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * deleteProduct() is the catalog's first destructive action. The design it
 * encodes is documented in client/AGENTS.md ("Deleting a product"): a soft
 * delete, blocked while anything in the store still depends on the product.
 * Stock on hand and an open purchase order are the two dependencies that a
 * delete would orphan; sale history is deliberately not one, because every
 * report joins `products` without a `_deleted = 0` filter and so still
 * resolves a deleted product's name.
 */
describe("deleteProduct", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let products: typeof import("@/lib/db/queries/products");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    products = await import("@/lib/db/queries/products");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM products; DELETE FROM stock_batches; DELETE FROM purchase_orders;
       DELETE FROM purchase_order_items; DELETE FROM sale_items; DELETE FROM sales;`,
    );
    core.setActiveStoreId(null);
  });

  const seedProduct = (id = "p1") => {
    db.run(
      `INSERT INTO products (id, name, selling_price, is_active, _deleted) VALUES (?, ?, 100, 1, 0)`,
      [id, `Product ${id}`],
    );
  };

  const seedBatch = (productId: string, quantity: number) => {
    db.run(
      `INSERT INTO stock_batches (id, product_id, quantity, is_active, _deleted)
       VALUES (?, ?, ?, 1, 0)`,
      [`b-${productId}-${quantity}`, productId, quantity],
    );
  };

  const seedPurchaseOrder = (productId: string, status: string) => {
    db.run(
      `INSERT INTO purchase_orders (id, status, _deleted) VALUES (?, ?, 0)`,
      [`po-${status}`, status],
    );
    db.run(
      `INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal, _deleted)
       VALUES (?, ?, ?, 1, 1, 10, 10, 0)`,
      [`poi-${status}`, `po-${status}`, productId],
    );
  };

  const isDeleted = (id: string) => {
    const res = db.exec(`SELECT _deleted FROM products WHERE id = '${id}'`);
    return res[0]?.values[0]?.[0] === 1;
  };

  describe("getProductDeletionBlockers", () => {
    it("reports no blockers for a product with nothing depending on it", async () => {
      seedProduct();
      const blockers = await products.getProductDeletionBlockers("p1");
      expect(blockers).toEqual({ stockOnHand: 0, openPurchaseOrders: 0 });
    });

    it("counts stock on hand across a product's active batches", async () => {
      seedProduct();
      seedBatch("p1", 4);
      seedBatch("p1", 6);
      const blockers = await products.getProductDeletionBlockers("p1");
      expect(blockers.stockOnHand).toBe(10);
    });

    it("ignores emptied batches so a fully sold-through product is deletable", async () => {
      seedProduct();
      seedBatch("p1", 0);
      const blockers = await products.getProductDeletionBlockers("p1");
      expect(blockers.stockOnHand).toBe(0);
    });

    it("does not let a negative batch cancel out a positive one", async () => {
      seedProduct();
      seedBatch("p1", 5);
      seedBatch("p1", -5);
      const blockers = await products.getProductDeletionBlockers("p1");
      expect(blockers.stockOnHand).toBe(10);
    });

    it("treats a lone negative batch as a blocker", async () => {
      seedProduct();
      seedBatch("p1", -5);
      const blockers = await products.getProductDeletionBlockers("p1");
      expect(blockers.stockOnHand).toBe(5);
    });

    it("counts only still-receivable purchase orders", async () => {
      seedProduct();
      seedPurchaseOrder("p1", "sent");
      seedPurchaseOrder("p1", "received");
      const blockers = await products.getProductDeletionBlockers("p1");
      expect(blockers.openPurchaseOrders).toBe(1);
    });
  });

  describe("the guard", () => {
    it("refuses to delete a product that still has stock on hand", async () => {
      seedProduct();
      seedBatch("p1", 3);
      await expect(products.deleteProduct("p1")).rejects.toThrow(/stock/i);
      expect(isDeleted("p1")).toBe(false);
    });

    it("refuses to delete a product whose batches sum to zero but are not empty", async () => {
      seedProduct();
      seedBatch("p1", 5);
      seedBatch("p1", -5);
      await expect(products.deleteProduct("p1")).rejects.toThrow(/stock/i);
      expect(isDeleted("p1")).toBe(false);
    });

    it("refuses to delete a product sitting on an open purchase order", async () => {
      seedProduct();
      seedPurchaseOrder("p1", "partially_received");
      await expect(products.deleteProduct("p1")).rejects.toThrow(/purchase order/i);
      expect(isDeleted("p1")).toBe(false);
    });

    it("soft-deletes a product with no stock and no open order", async () => {
      seedProduct();
      await products.deleteProduct("p1");
      expect(isDeleted("p1")).toBe(true);
    });

    it("does not treat past sales as a blocker", async () => {
      seedProduct();
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, _deleted)
         VALUES ('s1', 'TXN-1', 100, 100, 0)`,
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, _deleted)
         VALUES ('si1', 's1', 'p1', 1, 100, 100, 0)`,
      );
      await products.deleteProduct("p1");
      expect(isDeleted("p1")).toBe(true);
    });

    it("leaves the product out of the catalog query once deleted", async () => {
      seedProduct();
      await products.deleteProduct("p1");
      const rows = await products.getProductsWithDetails();
      expect(rows.find((r) => r.id === "p1")).toBeUndefined();
    });
  });
});
