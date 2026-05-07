/**
 * Database Schema SQL
 */
export const SCHEMA_SQL = `
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
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  tax_id TEXT,
  payment_terms TEXT,
  rating REAL DEFAULT 0,
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
  transaction_number TEXT UNIQUE NOT NULL,
  customer_id TEXT,
  user_id TEXT,
  subtotal REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  discount_total REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  amount_paid REAL DEFAULT 0,
  change_given REAL DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'completed',
  transaction_date TEXT,
  notes TEXT,
  tax_percentage REAL DEFAULT 0,
  discount_percentage REAL DEFAULT 0,
  points_earned REAL DEFAULT 0,
  points_redeemed REAL DEFAULT 0,
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
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
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
  theme TEXT DEFAULT 'default',
  license_token TEXT,
  subscription_tier TEXT DEFAULT 'free',
  last_monotonic_time TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  payment_method TEXT,
  vendor_name TEXT,
  reference_number TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  pin TEXT,
  role TEXT DEFAULT 'staff',
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  action TEXT,
  table_name TEXT,
  record_id TEXT,
  details TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT,
  total_refunded REAL NOT NULL,
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
  status TEXT DEFAULT 'draft',
  total_amount REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT,
  received_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  po_id TEXT NOT NULL,
  medicine_id TEXT NOT NULL,
  bulk_quantity INTEGER NOT NULL,
  units_per_bulk INTEGER NOT NULL,
  unit_cost REAL NOT NULL,
  subtotal REAL NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  payment_terms TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS stock_audits (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL,
  expected_quantity INTEGER NOT NULL,
  actual_quantity INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  notes TEXT,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  reconciled_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS held_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  customer_name TEXT,
  items_json TEXT NOT NULL,
  total_amount REAL NOT NULL,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  points REAL NOT NULL,
  type TEXT NOT NULL, -- 'earned', 'redeemed'
  transaction_id TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);
`;
