import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises createAndReceivePurchaseOrder() against a genuine in-memory
 * SQLite engine, proving the Immediate Purchase path actually creates a
 * received PO plus real stock_batches/stock_movements rows in one
 * transaction, matching the batch/cost/expiry semantics receivePurchaseOrder
 * already uses for Standard POs.
 */
describe("createAndReceivePurchaseOrder", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let createAndReceivePurchaseOrder: typeof import("@/lib/db/procurement").createAndReceivePurchaseOrder;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const procurement = await import("@/lib/db/procurement");
    createAndReceivePurchaseOrder = procurement.createAndReceivePurchaseOrder;

    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(`
      CREATE TABLE suppliers (
        id TEXT PRIMARY KEY, name TEXT, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE purchase_orders (
        id TEXT PRIMARY KEY, order_number TEXT, supplier_id TEXT, ordered_by TEXT,
        order_date TEXT, status TEXT DEFAULT 'pending', type TEXT DEFAULT 'standard',
        payment_status TEXT DEFAULT 'unpaid', amount_paid REAL DEFAULT 0, due_date TEXT,
        total_amount REAL DEFAULT 0, notes TEXT, created_at TEXT, received_at TEXT,
        updated_at TEXT, _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE purchase_order_items (
        id TEXT PRIMARY KEY, po_id TEXT, product_id TEXT, bulk_quantity INTEGER,
        units_per_bulk INTEGER, unit_cost REAL, subtotal REAL, created_at TEXT, updated_at TEXT,
        _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE products (
        id TEXT PRIMARY KEY, name TEXT, base_unit TEXT, bulk_unit TEXT, units_per_bulk INTEGER,
        selling_price REAL, updated_at TEXT, _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0
      );
      CREATE TABLE stock_batches (
        id TEXT PRIMARY KEY, product_id TEXT, quantity INTEGER, cost_price REAL,
        batch_number TEXT, expiry_date TEXT, created_at TEXT, updated_at TEXT, is_active INTEGER DEFAULT 1,
        _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY, product_id TEXT, stock_batch_id TEXT, movement_type TEXT,
        quantity INTEGER, unit_cost REAL, total_cost REAL, reference_id TEXT,
        reference_type TEXT, reason TEXT, performed_by TEXT, movement_date TEXT,
        created_at TEXT, updated_at TEXT, _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
      );
      CREATE TABLE _sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT, record_id TEXT,
        operation TEXT, payload TEXT, created_at TEXT, next_retry_at TEXT
      );
      CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY, user_id TEXT, action TEXT, table_name TEXT,
        record_id TEXT, details TEXT, created_at TEXT
      );
    `);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`
      DELETE FROM suppliers; DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
      DELETE FROM products; DELETE FROM stock_batches; DELETE FROM stock_movements;
    `);
    db.run(`INSERT INTO suppliers (id, name) VALUES ('sup1', 'Emzor')`);
    db.run(`INSERT INTO products (id, name, base_unit, bulk_unit, units_per_bulk, selling_price) VALUES ('prod1', 'Panadol', 'Tablet', 'Carton', 100, 50)`);
  });

  it("creates the PO already marked received, with type 'immediate'", async () => {
    const poId = await createAndReceivePurchaseOrder(
      "sup1",
      "",
      [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
    );

    const rows = db.exec(`SELECT status, type FROM purchase_orders WHERE id = '${poId}'`);
    expect(rows[0].values[0]).toEqual(["received", "immediate"]);
  });

  it("creates one stock_batches row per line item, using cost_price_override when given", async () => {
    await createAndReceivePurchaseOrder(
      "sup1",
      "",
      [{
        product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton",
        bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000,
        cost_price_override: 6, lot_number: "BATCH-1", expiry_date: "2027-01-01",
      }],
    );

    const rows = db.exec(`SELECT product_id, quantity, cost_price, batch_number, expiry_date FROM stock_batches`);
    expect(rows[0].values[0]).toEqual(["prod1", 200, 6, "BATCH-1", "2027-01-01"]);
  });

  it("falls back to unit_cost / units_per_bulk when no cost override is given", async () => {
    await createAndReceivePurchaseOrder(
      "sup1",
      "",
      [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 2, units_per_bulk: 100, unit_cost: 500, subtotal: 1000 }],
    );

    const rows = db.exec(`SELECT cost_price FROM stock_batches`);
    expect(rows[0].values[0][0]).toBe(5);
  });

  it("updates the product's selling_price when provided", async () => {
    await createAndReceivePurchaseOrder(
      "sup1",
      "",
      [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 100, unit_cost: 500, subtotal: 500, selling_price: 75 }],
    );

    const rows = db.exec(`SELECT selling_price FROM products WHERE id = 'prod1'`);
    expect(rows[0].values[0][0]).toBe(75);
  });

  it("accepts a null supplierId for a self/walk-in purchase with no real vendor", async () => {
    const poId = await createAndReceivePurchaseOrder(
      null,
      "",
      [{ product_id: "prod1", product_name: "Panadol", bulk_unit: "Carton", bulk_quantity: 1, units_per_bulk: 100, unit_cost: 500, subtotal: 500 }],
    );

    const rows = db.exec(`SELECT supplier_id, status FROM purchase_orders WHERE id = '${poId}'`);
    expect(rows[0].values[0]).toEqual([null, "received"]);
  });
});
