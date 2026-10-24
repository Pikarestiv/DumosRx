import initSqlJs, { type Database } from "sql.js";

const PROCUREMENT_SCHEMA = `
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
    quantity_received INTEGER DEFAULT 0,
    units_per_bulk INTEGER, unit_cost REAL, subtotal REAL,
    selling_price REAL, cost_price_override REAL, lot_number TEXT, expiry_date TEXT,
    created_at TEXT, updated_at TEXT,
    _version INTEGER DEFAULT 1, _synced INTEGER DEFAULT 0, _deleted INTEGER DEFAULT 0
  );
  CREATE TABLE products (
    id TEXT PRIMARY KEY, name TEXT, base_unit TEXT, bulk_unit TEXT, units_per_bulk INTEGER,
    selling_price REAL, category_id TEXT
  );
  CREATE TABLE categories (
    id TEXT PRIMARY KEY, name TEXT
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
    operation TEXT, payload TEXT, created_at TEXT, retry_count INTEGER DEFAULT 0, next_retry_at TEXT
  );
  CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY, user_id TEXT, store_id TEXT, action TEXT, table_name TEXT,
    record_id TEXT, details TEXT, correlation_id TEXT, occurrence_count INTEGER DEFAULT 1,
    last_occurred_at TEXT, created_at TEXT, updated_at TEXT, _synced INTEGER DEFAULT 0,
    _deleted INTEGER DEFAULT 0
  );
`;

export async function createProcurementTestDb(): Promise<Database> {
  const core = await import("@/lib/db/core");
  const SQL = await initSqlJs({
    locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
  });
  const db = new SQL.Database();
  db.run(PROCUREMENT_SCHEMA);
  core.__setDatabaseForTesting(db);
  return db;
}

export function clearProcurementTables(db: Database): void {
  db.run(`
    DELETE FROM suppliers; DELETE FROM purchase_orders; DELETE FROM purchase_order_items;
    DELETE FROM products; DELETE FROM users; DELETE FROM stock_movements; DELETE FROM stock_batches;
  `);
}
