/* eslint-disable max-lines */
/**
 * Database Schema SQL
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  generic_name TEXT,
  category_id TEXT,
  manufacturer TEXT,
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
  selling_price REAL DEFAULT 0,
  markup_percentage REAL DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  requires_prescription INTEGER DEFAULT 0,
  is_controlled INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  show_online INTEGER DEFAULT 0,
  barcode TEXT,
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

CREATE TABLE IF NOT EXISTS stock_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  batch_number TEXT,
  expiry_date TEXT,
  quantity INTEGER DEFAULT 0,
  cost_price REAL,
  supplier_id TEXT,
  manufacture_date TEXT,
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
  parent_id TEXT,
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


CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  transaction_number TEXT UNIQUE NOT NULL,
  customer_id TEXT,
  user_id TEXT,
  prescription_id TEXT,
  subtotal REAL NOT NULL,
  tax_amount REAL DEFAULT 0,
  discount_total REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  amount_paid REAL DEFAULT 0,
  change_given REAL DEFAULT 0,
  payment_method TEXT,
  payment_details TEXT,
  payment_status TEXT DEFAULT 'completed',
  transaction_date TEXT,
  notes TEXT,
  tax_percentage REAL DEFAULT 0,
  discount_percentage REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  discount_type TEXT DEFAULT 'fixed',
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
  product_id TEXT NOT NULL,
  stock_batch_id TEXT,
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

CREATE TABLE IF NOT EXISTS sale_item_batches (
  id TEXT PRIMARY KEY,
  sale_item_id TEXT NOT NULL,
  stock_batch_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  prescription_number TEXT,
  customer_id TEXT,
  user_id TEXT,
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
  dispensed_at TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id TEXT PRIMARY KEY,
  prescription_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  strength TEXT,
  dosage TEXT,
  quantity INTEGER,
  instructions TEXT,
  cost REAL DEFAULT 0,
  refills_authorized INTEGER DEFAULT 0,
  refills_used INTEGER DEFAULT 0,
  refill_interval_days INTEGER DEFAULT 30,
  next_refill_date TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0,
  FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
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
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  subtotal REAL NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0,
  FOREIGN KEY (return_id) REFERENCES returns(id)
);

CREATE TABLE IF NOT EXISTS _sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  next_retry_at TEXT
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

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY,
  name TEXT,
  store_slug TEXT UNIQUE,
  store_type TEXT DEFAULT 'store',
  device_id TEXT UNIQUE,
  user_id TEXT,
  location TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  currency TEXT DEFAULT 'NGN',
  vat_percentage REAL DEFAULT 0,
  is_initialized INTEGER DEFAULT 0,
  theme TEXT DEFAULT 'default',
  license_token TEXT,
  subscription_tier TEXT DEFAULT 'free',
  last_monotonic_time TEXT,
  pcn_license TEXT,
  registration_number TEXT,
  receipt_header TEXT,
  receipt_footer TEXT,
  show_logo_on_receipt INTEGER DEFAULT 1,
  show_contact_on_receipt INTEGER DEFAULT 1,
  hide_powered_by INTEGER DEFAULT 0,
  low_stock_warning INTEGER DEFAULT 1,
  expiry_warning INTEGER DEFAULT 1,
  expiry_warning_days INTEGER DEFAULT 90,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0,
  auto_sync_enabled INTEGER DEFAULT 1,
  auto_sync_interval INTEGER DEFAULT 30,
  status TEXT DEFAULT 'Active',
  suspension_reason TEXT,
  show_retail_suggestions INTEGER DEFAULT 0,
  require_payment_account INTEGER DEFAULT 0,
  enabled_payment_methods TEXT DEFAULT '["cash","card","transfer","credit","mixed"]',
  online_store_enabled INTEGER DEFAULT 0,
  custom_units TEXT DEFAULT '[]',
  is_demo INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  payment_method TEXT,
  vendor_name TEXT,
  reference_number TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0,
  store_id TEXT,
  covers_months INTEGER
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  email TEXT UNIQUE,
  pin TEXT,
  role TEXT DEFAULT 'staff',
  store_id TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0,
  UNIQUE(store_id, username)
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


CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT,
  supplier_id TEXT,
  ordered_by TEXT,
  order_date TEXT,
  status TEXT DEFAULT 'pending',
  type TEXT DEFAULT 'standard',
  payment_status TEXT DEFAULT 'unpaid',
  amount_paid REAL DEFAULT 0,
  due_date TEXT,
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
  product_id TEXT NOT NULL,
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
  tax_id TEXT,
  payment_terms INTEGER DEFAULT 30,
  rating REAL DEFAULT 0,
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
  product_id TEXT NOT NULL,
  expected_quantity INTEGER NOT NULL,
  actual_quantity INTEGER NOT NULL,
  difference INTEGER NOT NULL,
  expected_cost_price REAL,
  actual_cost_price REAL,
  cost_price_difference REAL,
  expected_selling_price REAL,
  actual_selling_price REAL,
  selling_price_difference REAL,
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
  discount REAL DEFAULT 0,
  discount_type TEXT,
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
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  min_spend REAL DEFAULT 0,
  points_multiplier REAL DEFAULT 1,
  benefits TEXT,
  color TEXT DEFAULT 'bg-gray-400',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS loyalty_redemption_options (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  label TEXT NOT NULL,
  points_cost REAL DEFAULT 0,
  description TEXT,
  icon_key TEXT DEFAULT 'tag',
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  type TEXT NOT NULL, -- 'bug', 'feature_request', 'other'
  content TEXT NOT NULL,
  contact_email TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _deleted INTEGER DEFAULT 0,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  stock_batch_id TEXT,
  product_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost REAL,
  total_cost REAL,
  reference_id TEXT,
  reference_type TEXT,
  reason TEXT,
  performed_by TEXT,
  movement_date TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  store_id TEXT,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_number TEXT,
  bank_name TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS system_configs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS requested_products (
  id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  requested_by_customer TEXT,
  request_count INTEGER DEFAULT 1,
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL,
  po_id TEXT,
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL,
  payment_method TEXT,
  reference_note TEXT,
  created_at TEXT,
  updated_at TEXT,
  _version INTEGER DEFAULT 1,
  _synced INTEGER DEFAULT 0,
  _synced_at TEXT,
  _deleted INTEGER DEFAULT 0
);
`;

