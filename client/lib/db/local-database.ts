/**
 * LocalDatabase - SQLite wrapper for offline-first operation
 *
 * Platform detection:
 * - Browser: uses sql.js (WASM)
 * - Tauri: will use tauri-plugin-sql (native)
 */

import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { APP_NAME } from "@/lib/constants";

// Schema SQL (will be loaded from file in production)
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  generic_name TEXT,
  brand_name TEXT,
  category_id TEXT,
  manufacturer TEXT,
  supplier_id TEXT,
  nafdac_number TEXT,
  dosage_form TEXT,
  strength TEXT,
  pack_size TEXT,
  unit_of_measure TEXT,
  description TEXT,
  indications TEXT,
  contraindications TEXT,
  side_effects TEXT,
  storage_conditions TEXT,
  cost_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  markup_percentage REAL DEFAULT 0,
  stock_quantity INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  requires_prescription INTEGER DEFAULT 0,
  is_controlled INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  barcode TEXT,
  expiry_date TEXT,
  batch_number TEXT,
  base_unit TEXT DEFAULT 'Unit',
  bulk_unit TEXT,
  units_per_bulk INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL,
  batch_number TEXT,
  expiry_date TEXT,
  quantity INTEGER DEFAULT 0,
  cost_price REAL,
  selling_price REAL,
  location TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  date_of_birth TEXT,
  gender TEXT,
  allergies TEXT,
  medical_conditions TEXT,
  credit_limit REAL DEFAULT 0,
  outstanding_balance REAL DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  payment_terms TEXT,
  rating REAL,
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  transaction_number TEXT,
  customer_id TEXT,
  cashier_id TEXT,
  prescription_id TEXT,
  subtotal REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  discount_percentage REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  tax_percentage REAL DEFAULT 7.5,
  total_amount REAL DEFAULT 0,
  amount_paid REAL DEFAULT 0,
  change_given REAL DEFAULT 0,
  points_earned INTEGER DEFAULT 0,
  points_redeemed INTEGER DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'completed',
  transaction_date TEXT,
  notes TEXT,
  receipt_printed INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  inventory_id TEXT,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  cost_price REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  total_price REAL NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  prescription_number TEXT,
  customer_id TEXT,
  patient_name TEXT,
  patient_phone TEXT,
  patient_age INTEGER,
  doctor_name TEXT,
  doctor_license TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  insurance TEXT,
  total_cost REAL DEFAULT 0,
  notes TEXT,
  issued_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS _sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS _sync_state (
  table_name TEXT PRIMARY KEY,
  last_synced_at TEXT,
  server_cursor TEXT
);

CREATE TABLE IF NOT EXISTS customer_payments (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT,
  notes TEXT,
  payment_date TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE TABLE IF NOT EXISTS store_profile (
  id TEXT PRIMARY KEY,
  name TEXT,
  store_type TEXT DEFAULT 'pharmacy',
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  currency TEXT DEFAULT 'NGN',
  vat_percentage REAL DEFAULT 7.5,
  is_initialized INTEGER DEFAULT 0,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  role TEXT DEFAULT 'cashier', -- admin, pharmacist, cashier
  pin TEXT, -- For quick switching in POS
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT NOT NULL, -- INSERT, UPDATE, DELETE, LOGIN, RETURN
  table_name TEXT,
  record_id TEXT,
  details TEXT, -- JSON string of changes
  created_at TEXT,
  _synced INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT,
  total_refunded REAL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _deleted INTEGER DEFAULT 0,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  created_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  FOREIGN KEY (return_id) REFERENCES returns(id),
  FOREIGN KEY (medicine_id) REFERENCES medicines(id)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- Rent, Utilities, Salaries, Transport, Others
  amount REAL NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  payment_method TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  vendor_id TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, sent, received, cancelled
  total_amount REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT,
  received_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  bulk_quantity INTEGER NOT NULL,
  units_per_bulk INTEGER NOT NULL, -- Per-batch override
  unit_cost REAL NOT NULL, -- Per bulk unit
  subtotal REAL NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
  FOREIGN KEY (medicine_id) REFERENCES medicines(id)
);

CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_medicines_synced ON medicines(_synced);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_sync_queue_table ON _sync_queue(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
`;

let SQL: SqlJsStatic | null = null;
let db: any = null; // Can be sql.js Database or Tauri Database
let currentUser: { id: string; name: string; role: string } | null = null;

export function setCurrentUser(user: { id: string; name: string; role: string } | null) {
  currentUser = user;
}

async function logAction(action: string, table: string, recordId: string, details?: any) {
  if (!db) return;
  const id = generateId();
  const now = new Date().toISOString();
  
  await execute(
    `INSERT INTO audit_logs (id, user_id, action, table_name, record_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, currentUser?.id || null, action, table, recordId, details ? JSON.stringify(details) : null, now]
  );
}

/**
 * Check if running in Tauri environment
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Initialize the local database
 */
export async function initDatabase(): Promise<any> {
  if (db) return db;

  if (isTauri()) {
    try {
      const TauriDatabase = (await import("@tauri-apps/plugin-sql")).default;
      db = await TauriDatabase.load("sqlite:dumosrx.db");
      
      // Initialize schema if needed (Tauri plugin doesn't have a simple way to check if new, 
      // so we run CREATE TABLE IF NOT EXISTS)
      // We split the SCHEMA_SQL into individual statements because some drivers prefer that
      const statements = SCHEMA_SQL.split(';').filter(s => s.trim());
      for (const statement of statements) {
        await db.execute(statement);
      }
      
      return db;
    } catch (err) {
      console.error("Failed to init Tauri DB", err);
      // Fallback to sql.js if Tauri fails for some reason
    }
  }

  // Browser: use sql.js
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });
  }

  // Try to load existing database from localStorage
  const savedData = localStorage.getItem(`${APP_NAME.toLowerCase()}_db`);
  if (savedData) {
    const data = new Uint8Array(JSON.parse(savedData));
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
    // Initialize schema
    db.run(SCHEMA_SQL);
  }

  return db;
}

/**
 * Save database to localStorage (browser only)
 */
export function saveDatabase(): void {
  if (!db) return;

  const data = db.export();
  const arr = Array.from(data);
  localStorage.setItem(`${APP_NAME.toLowerCase()}_db`, JSON.stringify(arr));
}

/**
 * Execute a SQL query and return results
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null | Uint8Array)[] = [],
): Promise<T[]> {
  if (!db) await initDatabase();

  if (isTauri()) {
    return await db.select(sql, params);
  }

  const stmt = db.prepare(sql);
  stmt.bind(params);

  const results: T[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as T;
    results.push(row);
  }
  stmt.free();

  return results;
}

/**
 * Execute a SQL statement (INSERT, UPDATE, DELETE)
 */
export async function execute(
  sql: string,
  params: (string | number | null | Uint8Array)[] = [],
): Promise<void> {
  if (!db) await initDatabase();

  if (isTauri()) {
    await db.execute(sql, params);
    return;
  }

  db.run(sql, params);
  saveDatabase(); // Auto-save after writes
}

/**
 * Insert a record and add to sync queue
 */
export async function insert(table: string, data: Record<string, unknown>): Promise<string> {
  const id = (data.id as string) || generateId();
  const now = new Date().toISOString();

  const record: Record<string, unknown> = {
    ...data,
    id,
    created_at: data.created_at || now,
    updated_at: now,
    _version: 1,
    _synced: 0,
  };

  const columns = Object.keys(record);
  const placeholders = columns.map(() => "?").join(", ");
  const values = columns.map((col) => record[col]) as (
    | string
    | number
    | null
    | Uint8Array
  )[];

  await execute(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`,
    values,
  );

  // Add to sync queue
  await addToSyncQueue(table, id, "INSERT", record);
  await logAction("INSERT", table, id, record);

  return id;
}

/**
 * Update a record and add to sync queue
 */
export async function update(
  table: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  // Get current version
  const current = await query<{ _version: number }>(
    `SELECT _version FROM ${table} WHERE id = ?`,
    [id],
  );
  const version = current[0]?._version || 0;

  const record = {
    ...data,
    updated_at: now,
    _version: version + 1,
    _synced: 0,
  };

  const setClause = Object.keys(record)
    .map((col) => `${col} = ?`)
    .join(", ");
  const values = [...Object.values(record), id] as (
    | string
    | number
    | null
    | Uint8Array
  )[];

  await execute(`UPDATE ${table} SET ${setClause} WHERE id = ?`, values);

  // Add to sync queue
  await addToSyncQueue(table, id, "UPDATE", record);
  await logAction("UPDATE", table, id, record);
}

/**
 * Soft delete a record
 */
export async function softDelete(table: string, id: string): Promise<void> {
  const now = new Date().toISOString();

  await execute(
    `UPDATE ${table} SET _deleted = 1, updated_at = ?, _synced = 0 WHERE id = ?`,
    [now, id],
  );

  await addToSyncQueue(table, id, "DELETE", { id });
  await logAction("DELETE", table, id, { id });
}

/**
 * Add an operation to the sync queue
 */
async function addToSyncQueue(
  table: string,
  recordId: string,
  operation: "INSERT" | "UPDATE" | "DELETE",
  payload: Record<string, unknown>,
): Promise<void> {
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [table, recordId, operation, JSON.stringify(payload), now],
  );
}

/**
 * Get pending sync items
 */
export async function getPendingSyncItems(): Promise<Array<{
  id: number;
  table_name: string;
  record_id: string;
  operation: string;
  payload: string;
  created_at: string;
}>> {
  return await query("SELECT * FROM _sync_queue ORDER BY created_at ASC");
}

/**
 * Mark sync items as completed
 */
export async function markSynced(queueIds: number[]): Promise<void> {
  if (queueIds.length === 0) return;

  const placeholders = queueIds.map(() => "?").join(", ");
  await execute(`DELETE FROM _sync_queue WHERE id IN (${placeholders})`, queueIds);
}

/**
 * Get database instance (for advanced queries)
 */
export function getDatabase(): Database | null {
  return db;
}

// --- Purchase Order Helpers ---

interface PurchaseOrder {
  id: string;
  vendor_id: string;
  status: string;
  total_amount: number;
  notes?: string;
  created_at: string;
  received_at?: string;
  vendor_name: string;
}

interface PurchaseOrderItem {
  id: string;
  po_id: string;
  medicine_id: string;
  bulk_quantity: number;
  units_per_bulk: number;
  unit_cost: number;
  subtotal: number;
  medicine_name: string;
  base_unit: string;
  bulk_unit: string;
}

export async function getPurchaseOrders(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<PurchaseOrder>(
    `SELECT po.*, v.name as vendor_name 
     FROM purchase_orders po 
     JOIN vendors v ON po.vendor_id = v.id 
     WHERE po._deleted = 0 
     ORDER BY po.created_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return { data: results, page, limit };
}

export async function getPurchaseOrderById(id: string) {
  const po = await query<PurchaseOrder>(
    `SELECT po.*, v.name as vendor_name 
     FROM purchase_orders po 
     JOIN vendors v ON po.vendor_id = v.id 
     WHERE po.id = ? AND po._deleted = 0`,
    [id]
  );
  
  if (!po[0]) return null;

  const items = await query<PurchaseOrderItem>(
    `SELECT poi.*, m.name as medicine_name, m.base_unit, m.bulk_unit 
     FROM purchase_order_items poi 
     JOIN medicines m ON poi.medicine_id = m.id 
     WHERE poi.po_id = ?`,
    [id]
  );

  return { ...po[0], items };
}

export async function createPurchaseOrder(vendorId: string, notes: string, items: any[]) {
  const poId = generateId();
  const now = new Date().toISOString();
  let totalAmount = 0;

  for (const item of items) {
    totalAmount += item.subtotal;
  }

  // Create PO
  await insert("purchase_orders", {
    id: poId,
    vendor_id: vendorId,
    status: "draft",
    total_amount: totalAmount,
    notes,
    created_at: now
  });

  // Create PO Items
  for (const item of items) {
    await insert("purchase_order_items", {
      id: generateId(),
      po_id: poId,
      medicine_id: item.medicine_id,
      bulk_quantity: item.bulk_quantity,
      units_per_bulk: item.units_per_bulk,
      unit_cost: item.unit_cost,
      subtotal: item.subtotal,
      created_at: now
    });
  }

  return poId;
}

export async function updatePurchaseOrderStatus(id: string, status: string) {
  const updateData: any = { status };
  if (status === "received") {
    updateData.received_at = new Date().toISOString();
  }
  await update("purchase_orders", id, updateData);
}

export async function receivePurchaseOrder(id: string) {
  const poData = await getPurchaseOrderById(id);
  if (!poData || poData.status === "received") return;

  const now = new Date().toISOString();

  // 1. Update stock for each item
  for (const item of poData.items) {
    const bulkQty = Number(item.bulk_quantity);
    const unitsPerBulk = Number(item.units_per_bulk);
    const totalBaseUnits = bulkQty * unitsPerBulk;
    
    // Update medicine stock
    await execute(
      `UPDATE medicines SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?`,
      [totalBaseUnits, now, item.medicine_id]
    );

    // Create inventory record (batch)
    await insert("inventory", {
      medicine_id: item.medicine_id,
      quantity: totalBaseUnits,
      cost_price: Number(item.unit_cost) / unitsPerBulk, // Calculated cost per base unit
      selling_price: 0, // Will be set manually or via markup
      batch_number: poData.id.split('-')[0].toUpperCase(), // Reference PO as batch prefix
      expiry_date: null, // Should be provided during reception in a real app
      created_at: now
    });
  }

  // 2. Mark PO as received
  await updatePurchaseOrderStatus(id, "received");
  
  await logAction("RECEIVE_PO", "purchase_orders", id, { total_items: poData.items.length });
}
