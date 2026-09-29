import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Pins the load-bearing ABSENCE of a `_deleted = 0` filter on the `products`
 * and `suppliers` joins in procurement.ts, local-database.ts and
 * stock-transfers.ts, documented in client/AGENTS.md ("The
 * deactivate-vs-delete design"). Purchase orders, stock movements and stock
 * transfers must still name the product and the vendor they were placed
 * against after either is deleted; filtering those joins blanks the name
 * (vendor_name falls back to "Self / Walk-in Purchase") or drops the row, and
 * every test here goes red when that filter is added.
 */
describe("procurement and stock history survives a product or supplier delete", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let procurement: typeof import("@/lib/db/procurement");
  let localDb: typeof import("@/lib/db/local-database");
  let transfers: typeof import("@/lib/db/queries/stock-transfers");
  let products: typeof import("@/lib/db/queries/products");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    procurement = await import("@/lib/db/procurement");
    localDb = await import("@/lib/db/local-database");
    transfers = await import("@/lib/db/queries/stock-transfers");
    products = await import("@/lib/db/queries/products");

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(async () => {
    db.run(
      `DELETE FROM products; DELETE FROM categories; DELETE FROM suppliers; DELETE FROM stock_batches;
       DELETE FROM purchase_orders; DELETE FROM purchase_order_items; DELETE FROM stock_movements;
       DELETE FROM stores; DELETE FROM users; DELETE FROM _sync_queue;`,
    );
    core.setActiveStoreId(null);

    db.run(
      `INSERT INTO products (id, name, selling_price, is_active, _deleted)
       VALUES ('p1', 'Amoxicillin 500mg', 100, 1, 0)`,
    );
    db.run(`INSERT INTO suppliers (id, name, is_active, _deleted) VALUES ('v1', 'Emzor Pharma', 1, 0)`);
    db.run(
      `INSERT INTO purchase_orders (id, order_number, supplier_id, status, payment_status, total_amount, amount_paid, created_at, _deleted)
       VALUES ('po1', 'PO-1', 'v1', 'received', 'paid', 1000, 1000, '2026-09-01T10:00:00.000Z', 0)`,
    );
    db.run(
      `INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal, _deleted)
       VALUES ('poi1', 'po1', 'p1', 10, 1, 100, 1000, 0)`,
    );
    db.run(
      `INSERT INTO stock_batches (id, product_id, supplier_id, batch_number, quantity, cost_price, is_active, _deleted)
       VALUES ('b1', 'p1', 'v1', 'BATCH-1', 0, 100, 1, 0)`,
    );
    db.run(
      `INSERT INTO stock_movements (id, stock_batch_id, product_id, movement_type, quantity, reason, movement_date, created_at, _deleted)
       VALUES ('sm1', 'b1', 'p1', 'adjustment', -2, 'damaged', '2026-09-02T10:00:00.000Z', '2026-09-02T10:00:00.000Z', 0)`,
    );

    await procurement.deleteSupplier("v1");
    await products.deleteProduct("p1");
  });

  describe("purchase orders", () => {
    it("still names the deleted vendor in the purchase-order list", async () => {
      const { data } = await procurement.getPurchaseOrders();

      expect(data).toHaveLength(1);
      expect(data[0].vendor_name).toBe("Emzor Pharma");
    });

    it("still names the deleted vendor and product on a single purchase order", async () => {
      const po = await procurement.getPurchaseOrderById("po1");

      expect(po?.vendor_name).toBe("Emzor Pharma");
      expect(po?.items).toHaveLength(1);
      expect(po?.items[0].product_name).toBe("Amoxicillin 500mg");
    });

    it("still names the deleted product on the purchase-order detail line items", async () => {
      const items = await procurement.getPurchaseOrderItemsForDetail("po1");

      expect(items).toHaveLength(1);
      expect(items[0].product_name).toBe("Amoxicillin 500mg");
    });
  });

  describe("stock movements", () => {
    it("still names the deleted product and vendor in the movement log", async () => {
      const { data } = await localDb.getStockMovements();

      expect(data).toHaveLength(1);
      expect(data[0].product_name).toBe("Amoxicillin 500mg");
      expect(data[0].supplier_name).toBe("Emzor Pharma");
    });

    it("still names the deleted product and vendor in the adjustments log", async () => {
      const { data } = await localDb.getStockAdjustments();

      expect(data).toHaveLength(1);
      expect(data[0].product_name).toBe("Amoxicillin 500mg");
      expect(data[0].supplier_name).toBe("Emzor Pharma");
    });
  });

  describe("stock transfers", () => {
    it("still names the deleted product on both sides of a past transfer", async () => {
      db.run(
        `INSERT INTO stores (id, name, _deleted) VALUES ('st1', 'Main Branch', 0), ('st2', 'Ikeja Branch', 0)`,
      );
      db.run(
        `INSERT INTO stock_movements (id, product_id, store_id, movement_type, quantity, unit_cost, reference_id, reference_type, movement_date, created_at, _deleted)
         VALUES
          ('smo', 'p1', 'st1', 'transfer_out', -5, 100, 'tr1', 'stock_transfer', '2026-09-03T10:00:00.000Z', '2026-09-03T10:00:00.000Z', 0),
          ('smi', 'p1', 'st2', 'transfer_in', 5, 100, 'tr1', 'stock_transfer', '2026-09-03T10:00:00.000Z', '2026-09-03T10:00:00.000Z', 0)`,
      );

      const rows = await transfers.getStockTransferHistory();

      expect(rows).toHaveLength(1);
      expect(rows[0].source_product_name).toBe("Amoxicillin 500mg");
      expect(rows[0].dest_product_name).toBe("Amoxicillin 500mg");
    });
  });
});
