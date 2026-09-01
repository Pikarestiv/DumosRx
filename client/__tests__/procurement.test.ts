import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises getSuppliers()/getPurchaseOrders() against a genuine in-memory
 * SQLite engine (sql.js) built from the app's real schema, not a mocked
 * query(), so these tests actually prove the SQL's join/aggregation math is
 * correct. This is a regression test for the bug where the Vendors &
 * Suppliers table showed "0" for every supplier's Orders/Total Value: those
 * fields were hardcoded client-side rather than derived from any query, so a
 * test that only asserted "query() was called" would never have caught it;
 * only asserting on the actual returned numbers does.
 */
describe("procurement.ts", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getSuppliers: typeof import("@/lib/db/procurement").getSuppliers;
  let getPurchaseOrders: typeof import("@/lib/db/procurement").getPurchaseOrders;
  let getPurchaseOrderItemsForDetail: typeof import("@/lib/db/procurement").getPurchaseOrderItemsForDetail;
  let createPurchaseOrder: typeof import("@/lib/db/procurement").createPurchaseOrder;
  let updatePurchaseOrder: typeof import("@/lib/db/procurement").updatePurchaseOrder;
  let createAndReceivePurchaseOrder: typeof import("@/lib/db/procurement-receiving").createAndReceivePurchaseOrder;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const procurement = await import("@/lib/db/procurement");
    const procurementReceiving = await import("@/lib/db/procurement-receiving");
    getSuppliers = procurement.getSuppliers;
    getPurchaseOrders = procurement.getPurchaseOrders;
    getPurchaseOrderItemsForDetail = procurement.getPurchaseOrderItemsForDetail;
    createPurchaseOrder = procurement.createPurchaseOrder;
    updatePurchaseOrder = procurement.updatePurchaseOrder;
    createAndReceivePurchaseOrder = procurementReceiving.createAndReceivePurchaseOrder;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE suppliers (
        id TEXT PRIMARY KEY, name TEXT, contact_person TEXT, email TEXT, phone TEXT,
        address TEXT, tax_id TEXT, payment_terms TEXT, rating REAL, is_active INTEGER DEFAULT 1,
        created_at TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE purchase_orders (
        id TEXT PRIMARY KEY, order_number TEXT, supplier_id TEXT, ordered_by TEXT,
        order_date TEXT, status TEXT DEFAULT 'pending', type TEXT DEFAULT 'standard',
        payment_status TEXT DEFAULT 'unpaid',
        amount_paid REAL DEFAULT 0, due_date TEXT, total_amount REAL DEFAULT 0, notes TEXT,
        created_at TEXT, received_at TEXT, updated_at TEXT,
        _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE purchase_order_items (
        id TEXT PRIMARY KEY, po_id TEXT, product_id TEXT, bulk_quantity INTEGER,
        units_per_bulk INTEGER, unit_cost REAL, subtotal REAL, created_at TEXT, updated_at TEXT,
        _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT, base_unit TEXT, bulk_unit TEXT, units_per_bulk INTEGER
      );
      CREATE TABLE users (
        id TEXT PRIMARY KEY, first_name TEXT, last_name TEXT
      );
      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY, reference_id TEXT, reference_type TEXT, stock_batch_id TEXT,
        product_id TEXT, movement_type TEXT, quantity REAL, unit_cost REAL, total_cost REAL,
        reason TEXT, performed_by TEXT, movement_date TEXT, created_at TEXT, updated_at TEXT,
        _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE stock_batches (
        id TEXT PRIMARY KEY, expiry_date TEXT, product_id TEXT, quantity REAL, cost_price REAL,
        batch_number TEXT, created_at TEXT, updated_at TEXT, is_active INTEGER DEFAULT 1,
        _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE _sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT, record_id TEXT,
        operation TEXT, payload TEXT, created_at TEXT, next_retry_at TEXT
      );
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY, user_id TEXT, store_id TEXT, action TEXT, table_name TEXT,
        record_id TEXT, details TEXT, created_at TEXT
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM suppliers; DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
      DELETE FROM products; DELETE FROM users; DELETE FROM stock_movements; DELETE FROM stock_batches;
    `);
  });

  describe("getSuppliers", () => {
    it("reports order count/value across ALL orders, and debt only across unpaid ones", async () => {
      db.run(
        `INSERT INTO suppliers (id, name, created_at) VALUES ('sup1', 'Emzor', '2026-01-01')`,
      );
      db.run(
        `INSERT INTO purchase_orders (id, supplier_id, total_amount, amount_paid, payment_status, order_date, _deleted)
         VALUES
           ('po1', 'sup1', 100000, 100000, 'paid', '2026-01-05', 0),
           ('po2', 'sup1', 50000, 20000, 'unpaid', '2026-02-10', 0)`,
      );

      const { data } = await getSuppliers();

      expect(data).toHaveLength(1);
      // Orders/value must count BOTH orders (100k + 50k), not just the unpaid one:
      // this is the exact aggregate that was hardcoded to 0 before the fix.
      expect(data[0].total_orders).toBe(2);
      expect(data[0].total_value).toBe(150000);
      // Debt must only count the unpaid order's outstanding balance (50000 - 20000).
      expect(data[0].total_debt).toBe(30000);
      expect(data[0].last_order_date).toBe("2026-02-10");
    });

    it("returns zeroed stats (not null/undefined) for a supplier with no orders", async () => {
      db.run(`INSERT INTO suppliers (id, name, created_at) VALUES ('sup2', 'New Vendor', '2026-01-01')`);

      const { data } = await getSuppliers();

      expect(data[0].total_orders).toBe(0);
      expect(data[0].total_value).toBe(0);
      expect(data[0].total_debt).toBe(0);
      expect(data[0].last_order_date).toBeFalsy();
    });

    it("excludes soft-deleted purchase orders from both order stats and debt", async () => {
      db.run(`INSERT INTO suppliers (id, name, created_at) VALUES ('sup3', 'Kingsize', '2026-01-01')`);
      db.run(
        `INSERT INTO purchase_orders (id, supplier_id, total_amount, amount_paid, payment_status, order_date, _deleted)
         VALUES ('po3', 'sup3', 30000, 0, 'unpaid', '2026-03-01', 1)`,
      );

      const { data } = await getSuppliers();

      expect(data[0].total_orders).toBe(0);
      expect(data[0].total_value).toBe(0);
      expect(data[0].total_debt).toBe(0);
    });

    it("excludes soft-deleted suppliers entirely", async () => {
      db.run(`INSERT INTO suppliers (id, name, created_at, _deleted) VALUES ('sup4', 'Gone', '2026-01-01', 1)`);

      const { data } = await getSuppliers();

      expect(data).toHaveLength(0);
    });

    it("keeps each supplier's stats independent when multiple suppliers have orders", async () => {
      db.run(
        `INSERT INTO suppliers (id, name, created_at) VALUES
          ('supA', 'A', '2026-01-01'), ('supB', 'B', '2026-01-02')`,
      );
      db.run(
        `INSERT INTO purchase_orders (id, supplier_id, total_amount, amount_paid, payment_status, order_date, _deleted)
         VALUES
           ('poA1', 'supA', 10000, 10000, 'paid', '2026-01-10', 0),
           ('poB1', 'supB', 99999, 0, 'unpaid', '2026-01-11', 0)`,
      );

      const { data } = await getSuppliers();
      const byId = Object.fromEntries(data.map((s) => [s.id, s]));

      expect(byId.supA.total_orders).toBe(1);
      expect(byId.supA.total_value).toBe(10000);
      expect(byId.supB.total_orders).toBe(1);
      expect(byId.supB.total_value).toBe(99999);
      expect(byId.supB.total_debt).toBe(99999);
    });
  });

  describe("getPurchaseOrders", () => {
    it("flags has_missing_expiry when a received batch linked to the PO has no expiry date", async () => {
      db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
      db.run(
        `INSERT INTO purchase_orders (id, supplier_id, total_amount, created_at) VALUES ('po1', 'sup1', 5000, '2026-01-01')`,
      );
      db.run(`INSERT INTO stock_batches (id, expiry_date) VALUES ('batch1', NULL)`);
      db.run(
        `INSERT INTO stock_movements (id, reference_id, reference_type, stock_batch_id)
         VALUES ('mv1', 'po1', 'purchase_order', 'batch1')`,
      );

      const { data } = await getPurchaseOrders();

      expect(data[0].has_missing_expiry).toBe(1);
    });

    it("does not flag has_missing_expiry when every linked batch has an expiry date", async () => {
      db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
      db.run(
        `INSERT INTO purchase_orders (id, supplier_id, total_amount, created_at) VALUES ('po1', 'sup1', 5000, '2026-01-01')`,
      );
      db.run(`INSERT INTO stock_batches (id, expiry_date) VALUES ('batch1', '2027-01-01')`);
      db.run(
        `INSERT INTO stock_movements (id, reference_id, reference_type, stock_batch_id)
         VALUES ('mv1', 'po1', 'purchase_order', 'batch1')`,
      );

      const { data } = await getPurchaseOrders();

      expect(data[0].has_missing_expiry).toBe(0);
    });

    it("restricts results to the given viewer's own orders when viewerId is passed", async () => {
      db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
      db.run(
        `INSERT INTO purchase_orders (id, supplier_id, total_amount, ordered_by, created_at) VALUES
          ('po1', 'sup1', 1000, 'user1', '2026-01-01'),
          ('po2', 'sup1', 2000, 'user2', '2026-01-02')`,
      );

      const { data } = await getPurchaseOrders("user1");

      expect(data.map((po) => po.id)).toEqual(["po1"]);
    });

    it("returns every non-deleted order when no viewerId is given", async () => {
      db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
      db.run(
        `INSERT INTO purchase_orders (id, supplier_id, total_amount, ordered_by, created_at) VALUES
          ('po1', 'sup1', 1000, 'user1', '2026-01-01'),
          ('po2', 'sup1', 2000, 'user2', '2026-01-02')`,
      );

      const { data } = await getPurchaseOrders();

      expect(data).toHaveLength(2);
    });
  });

  describe("getPurchaseOrderItemsForDetail", () => {
    it("aliases quantity/unit_price/total_price to the PO line item's stored fields", async () => {
      db.run(`INSERT INTO products (id, name) VALUES ('prod1', 'Panadol')`);
      db.run(
        `INSERT INTO purchase_order_items (id, po_id, product_id, bulk_quantity, unit_cost, subtotal, _deleted)
         VALUES ('item1', 'po1', 'prod1', 10, 500, 5000, 0)`,
      );

      const items = await getPurchaseOrderItemsForDetail("po1");

      expect(items).toEqual([
        expect.objectContaining({
          product_name: "Panadol",
          quantity: 10,
          unit_price: 500,
          total_price: 5000,
        }),
      ]);
    });
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

    it("derives total_amount and each item's subtotal from bulk_quantity * unit_cost, ignoring a stale subtotal field", async () => {
      // Regression: item.subtotal is only ever set once when a row is first
      // added in the UI and is never kept in sync with later quantity
      // edits, so a stale value here (500, from an earlier 1-carton state)
      // must not leak into what's actually persisted.
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

      // Simulates editing the quantity in the UI without touching cost: the
      // stale subtotal (500, from the original 1-carton row) must not carry
      // through the edit.
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
      // Regression: the UI's "New Cost" override is typed per base unit
      // (per tablet, matching the catalog's current-cost display), but the
      // total was previously computed as bulk_quantity * override with no
      // units_per_bulk factor — silently understating the order by 60x here.
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

  describe("getPurchaseOrders vendor_name fallback", () => {
    it("shows 'Self / Walk-in Purchase' when supplier_id is null", async () => {
      db.run(
        `INSERT INTO purchase_orders (id, supplier_id, total_amount, created_at) VALUES ('po1', NULL, 5000, '2026-01-01')`,
      );

      const { data } = await getPurchaseOrders();

      expect(data[0].vendor_name).toBe("Self / Walk-in Purchase");
    });

    it("shows the real vendor name when supplier_id is set", async () => {
      db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
      db.run(
        `INSERT INTO purchase_orders (id, supplier_id, total_amount, created_at) VALUES ('po2', 'sup1', 5000, '2026-01-01')`,
      );

      const { data } = await getPurchaseOrders();

      expect(data[0].vendor_name).toBe("Emzor");
    });
  });
});
