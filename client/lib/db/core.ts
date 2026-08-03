/**
 * Core Database Logic
 */

import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { APP_NAME } from "@/lib/constants";
import { get, set } from "idb-keyval";
/* eslint-disable max-lines */
import { SCHEMA_SQL } from "./schema";

// Dual-backend handle: sql.js's Database in the browser, @tauri-apps/plugin-sql's
// Database (a different, incompatible shape — .execute()/.select() vs sql.js's
// .exec()/.run()) when running inside Tauri. Deliberately untyped rather than a
// misleading union, since callers already branch on isTauri() before touching it.
let SQL: SqlJsStatic | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;
let currentUser: {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
} | null = null;

export function setCurrentUser(
  user: {
    id: string;
    first_name: string;
    last_name: string;
    role: string;
  } | null,
) {
  currentUser = user;
}

export function isTauri(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.__TAURI__ !== undefined ||
      window.__TAURI_INTERNALS__ !== undefined)
  );
}

export function generateId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function initDatabase(): Promise<any> {
  if (db) return db;

  // ---- Migration: ensure sync tracking and missing columns exist ----
  const syncColumns = [
    {
      table: "products",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "is_active INTEGER DEFAULT 1",
      ],
    },
    {
      table: "stock_batches",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "supplier_id TEXT",
        "manufacture_date TEXT",
        "batch_number TEXT",
        "quantity INTEGER DEFAULT 0",
        "cost_price REAL DEFAULT 0",
        "selling_price REAL DEFAULT 0",
        "expiry_date TEXT",
        "received_date TEXT",
        "notes TEXT",
      ],
    },
    {
      table: "categories",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "is_active INTEGER DEFAULT 1",
      ],
    },
    {
      table: "customers",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
      ],
    },
    {
      table: "suppliers",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "contact_person TEXT",
        "email TEXT",
        "phone TEXT",
        "address TEXT",
        "tax_id TEXT",
        "payment_terms TEXT",
        "rating REAL DEFAULT 0",
        "is_active INTEGER DEFAULT 1",
        "deleted_at TEXT",
      ],
    },
    {
      table: "sales",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "amount_paid REAL DEFAULT 0",
        "change_given REAL DEFAULT 0",
        "tax_percentage REAL DEFAULT 0",
        "discount_percentage REAL DEFAULT 0",
        "discount_amount REAL DEFAULT 0",
        "discount_type TEXT DEFAULT 'fixed'",
        "points_earned REAL DEFAULT 0",
        "points_redeemed REAL DEFAULT 0",
        "cashier_id TEXT",
        "payment_details TEXT",
        "prescription_id TEXT",
      ],
    },
    {
      table: "sale_items",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
      ],
    },
    {
      table: "prescriptions",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "user_id TEXT",
        "dispensed_at TEXT",
      ],
    },
    {
      table: "prescription_items",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "refills_authorized INTEGER DEFAULT 0",
        "refills_used INTEGER DEFAULT 0",
        "refill_interval_days INTEGER DEFAULT 30",
        "next_refill_date TEXT",
        "product_name TEXT DEFAULT ''",
        "strength TEXT",
        "dosage TEXT",
        "quantity INTEGER DEFAULT 0",
        "instructions TEXT",
        "cost REAL DEFAULT 0",
      ],
    },
    {
      table: "expenses",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "user_id TEXT",
      ],
    },
    {
      table: "users",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "store_id TEXT",
        "first_name TEXT",
        "last_name TEXT",
      ],
    },
    {
      table: "audit_logs",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
      ],
    },
    {
      table: "returns",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
      ],
    },
    {
      table: "purchase_orders",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "ordered_by TEXT",
        "order_date TEXT",
        "order_number TEXT",
        "supplier_id TEXT",
        "payment_status TEXT DEFAULT 'unpaid'",
        "amount_paid REAL DEFAULT 0",
        "due_date TEXT",
      ],
    },
    {
      table: "purchase_order_items",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
      ],
    },
    {
      table: "suppliers",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "contact_person TEXT",
        "email TEXT",
        "phone TEXT",
        "address TEXT",
        "payment_terms TEXT",
        "is_active INTEGER DEFAULT 1",
      ],
    },
    {
      table: "stock_audits",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
      ],
    },
    {
      table: "held_transactions",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
      ],
    },
    {
      table: "loyalty_transactions",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
      ],
    },
    {
      table: "stores",
      columns: [
        "location TEXT",
        "created_at TEXT",
        "pcn_license TEXT",
        "receipt_header TEXT",
        "receipt_footer TEXT",
        "show_logo_on_receipt INTEGER DEFAULT 1",
        "show_contact_on_receipt INTEGER DEFAULT 1",
        "hide_powered_by INTEGER DEFAULT 0",
        "low_stock_warning INTEGER DEFAULT 1",
        "expiry_warning INTEGER DEFAULT 1",
        "expiry_warning_days INTEGER DEFAULT 90",
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "auto_sync_enabled INTEGER DEFAULT 1",
        "auto_sync_interval INTEGER DEFAULT 30",
        "status TEXT DEFAULT 'Active'",
        "suspension_reason TEXT",
        "show_retail_suggestions INTEGER DEFAULT 0",
        "require_payment_account INTEGER DEFAULT 0",
        'enabled_payment_methods TEXT DEFAULT \'["cash","card","transfer","credit","mixed"]\'',
      ],
    },
    {
      table: "feedback",
      columns: [
        "updated_at TEXT",
        "_version INTEGER DEFAULT 1",
        "_deleted INTEGER DEFAULT 0",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
      ],
    },
    {
      table: "stock_movements",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "stock_batch_id TEXT",
      ],
    },
    { table: "payment_accounts", columns: ["user_id TEXT", "store_id TEXT"] },
    {
      table: "requested_products",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "quantity INTEGER DEFAULT 1",
        "notes TEXT",
      ],
    },
    {
      table: "supplier_payments",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
      ],
    },
    { table: "_sync_queue", columns: ["next_retry_at TEXT"] },
  ];

  if (isTauri()) {
    try {
      const sqlPlugin = await import("@tauri-apps/plugin-sql");
      const Database = sqlPlugin.default || (sqlPlugin as any).Database;

      db = await Database.load("sqlite:dumosrx.db");

      const statements = SCHEMA_SQL.split(";").filter((s) => s.trim());
      for (const statement of statements) {
        await db.execute(statement);
      }

      // Rename stock_batch to stock_batches if the old table exists
      try {
        await db.execute("ALTER TABLE stock_batch RENAME TO stock_batches");
      } catch (_e) { }

      try {
        await db.execute("ALTER TABLE stock_batches RENAME TO stock_batches");
      } catch (_e) { }

      try {
        await db.execute("ALTER TABLE medicines RENAME TO products");
      } catch (_e) { }

      const tablesWithProductId = [
        "stock_batches",
        "sale_items",
        "stock_movements",
        "purchase_order_items",
        "prescription_items",
        "return_items"
      ];
      for (const t of tablesWithProductId) {
        try {
          await db.execute(`ALTER TABLE ${t} RENAME COLUMN medicine_id TO product_id`);
        } catch (_e) { }
      }

      try {
        await db.execute("ALTER TABLE vendors RENAME TO suppliers");
      } catch (_e) { }

      try {
        await db.execute("UPDATE users SET role = 'store_owner' WHERE role = 'owner'");
      } catch (_e) { }

      try {
        await db.execute("ALTER TABLE store_profile RENAME TO stores");
      } catch (_e) { }

      
      // --- Data migration: stock_quantity to stock_batches ---
      try {
        const hasProductsStock = await db.select("SELECT 1 FROM pragma_table_info('products') WHERE name='stock_quantity'");
        if (hasProductsStock && hasProductsStock.length > 0) {
          await db.execute(`
            INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, selling_price, expiry_date, is_active, created_at, updated_at)
            SELECT lower(hex(randomblob(16))), id, 'INITIAL', stock_quantity, cost_price, selling_price, date('now', '+2 years'), 1, created_at, updated_at
            FROM products 
            WHERE stock_quantity > 0 AND NOT EXISTS (
              SELECT 1 FROM stock_batches WHERE stock_batches.product_id = products.id AND stock_batches.batch_number = 'INITIAL'
            )
          `);
        }
      } catch (e) {
        console.error("Migration for stock_quantity skipped", e);
      }

      // Run migrations for Tauri
      for (const { table, columns } of syncColumns) {
        for (const colDef of columns) {
          try {
            await db.execute(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
          } catch (_e) {
            // Column likely already exists; ignore
          }
        }
      }

      // Rebuild users table to scope the username uniqueness constraint to store_id
      // (SQLite can't ALTER a column-level constraint, so recreate the table)
      try {
        const tableInfo = await db.select(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
        );
        const usersTableSql = tableInfo?.[0]?.sql || "";
        if (usersTableSql && !/UNIQUE\s*\(\s*store_id\s*,\s*username\s*\)/i.test(usersTableSql)) {
          await db.execute(`
            CREATE TABLE users_new (
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
            )
          `);
          await db.execute(`
            INSERT INTO users_new (id, first_name, last_name, username, email, pin, role, store_id, is_active, created_at, updated_at, _version, _synced, _synced_at, _deleted)
            SELECT id, first_name, last_name, username, email, pin, role, store_id, is_active, created_at, updated_at, _version, _synced, _synced_at, _deleted FROM users
          `);
          await db.execute("DROP TABLE users");
          await db.execute("ALTER TABLE users_new RENAME TO users");
        }
      } catch (e) {
        console.error("Failed to migrate users username uniqueness constraint", e);
      }

      // One-off data clearing for legacy transactions (retaining products, batches, users, and settings)
      try {
        const hasClearedLegacy = typeof window !== "undefined" && window.localStorage
          ? window.localStorage.getItem("dumosrx_cleared_legacy_v2")
          : "true";
        if (!hasClearedLegacy) {
          const tablesToClear = [
            "sales",
            "sale_items",
            "stock_movements",
            "returns",
            "return_items",
            "prescriptions",
            "prescription_items",
            "expenses",
            "purchase_orders",
            "purchase_order_items",
            "audit_logs",
            "_sync_queue"
          ];
          for (const table of tablesToClear) {
            try {
              await db.execute(`DELETE FROM ${table}`);
            } catch (_e) { }
          }
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem("dumosrx_cleared_legacy_v2", "true");
          }
        }
      } catch (e) {
        console.error("Failed to clear legacy transactions in Tauri", e);
      }

      return db;
    } catch (err) {
      console.error("Failed to init Tauri DB", err);
      throw err;
    }
  }

  try {
    if (!SQL) {
      SQL = await initSqlJs({
        locateFile: (file: string) => `/${file}`,
      });
    }

    let savedData: Uint8Array | undefined = await get(`${APP_NAME.toLowerCase()}_db`);

    // Migration from legacy localStorage to IndexedDB
    if (!savedData) {
      const legacySavedData = localStorage.getItem(`${APP_NAME.toLowerCase()}_db`);
      if (legacySavedData) {
        try {
          savedData = new Uint8Array(JSON.parse(legacySavedData));
          await set(`${APP_NAME.toLowerCase()}_db`, savedData);
          localStorage.removeItem(`${APP_NAME.toLowerCase()}_db`);
        } catch (e) {
          console.error("Failed to migrate legacy db", e);
        }
      }
    }

    if (savedData) {
      try {
        db = new SQL.Database(savedData);
        
        // Rename stock_batch to stock_batches if the old table exists
        try {
          db.run("ALTER TABLE stock_batch RENAME TO stock_batches");
        } catch (_e) { }

        try {
          db.run("ALTER TABLE stock_batches RENAME TO stock_batches");
        } catch (_e) { }

        try {
          db.run("ALTER TABLE medicines RENAME TO products");
        } catch (_e) { }

        const tablesWithProductId = [
          "stock_batches",
          "sale_items",
          "stock_movements",
          "purchase_order_items",
          "prescription_items",
          "return_items"
        ];
        for (const t of tablesWithProductId) {
          try {
            db.run(`ALTER TABLE ${t} RENAME COLUMN medicine_id TO product_id`);
          } catch (_e) { }
        }

        try {
          db.run("ALTER TABLE vendors RENAME TO suppliers");
        } catch (_e) { }

        try {
          db.run("UPDATE users SET role = 'store_owner' WHERE role = 'owner'");
        } catch (_e) { }

        try {
          db.run("ALTER TABLE store_profile RENAME TO stores");
        } catch (_e) { }

        // Ensure new tables from schema updates are created
        db.run(SCHEMA_SQL);
      } catch (_e) {
        console.error("[DB] Failed to load saved data, starting fresh", _e);
        db = new SQL.Database();
        db.run(SCHEMA_SQL);
      }
    } else {
      db = new SQL.Database();
      db.run(SCHEMA_SQL);
    }

    // --- Data migrations ---

    try {
      db.run('ALTER TABLE expenses ADD COLUMN notes TEXT;');
    } catch (_e) {
      // Ignore if column already exists
    }

    try {
        const hasProductsStock = db.exec("SELECT 1 FROM pragma_table_info('products') WHERE name='stock_quantity'");
        if (hasProductsStock && hasProductsStock.length > 0 && hasProductsStock[0].values.length > 0) {
          db.run(`
            INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price, selling_price, expiry_date, is_active, created_at, updated_at)
            SELECT lower(hex(randomblob(16))), id, 'INITIAL', stock_quantity, cost_price, selling_price, date('now', '+2 years'), 1, created_at, updated_at
            FROM products 
            WHERE stock_quantity > 0 AND NOT EXISTS (
              SELECT 1 FROM stock_batches WHERE stock_batches.product_id = products.id AND stock_batches.batch_number = 'INITIAL'
            )
          `);
        }
      } catch (e) {
        console.error("Migration for stock_quantity skipped", e);
      }

    try {
      db.run("UPDATE purchase_orders SET status = 'pending' WHERE status = 'draft'");
    } catch (_e) {}

    // Run migrations for Web (non-Tauri)
    for (const { table, columns } of syncColumns) {
      for (const colDef of columns) {
        try {
          // Attempt to add column; will throw if it already exists
          db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
        } catch (_e) {
          // Column likely already exists; ignore
        }
      }
    }

    // Rebuild users table to scope the username uniqueness constraint to store_id
    // (SQLite can't ALTER a column-level constraint, so recreate the table)
    try {
      const tableInfoRes = db.exec(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'"
      );
      const usersTableSql = tableInfoRes?.[0]?.values?.[0]?.[0] || "";
      if (usersTableSql && !/UNIQUE\s*\(\s*store_id\s*,\s*username\s*\)/i.test(String(usersTableSql))) {
        db.run(`
          CREATE TABLE users_new (
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
          )
        `);
        db.run(`
          INSERT INTO users_new (id, first_name, last_name, username, email, pin, role, store_id, is_active, created_at, updated_at, _version, _synced, _synced_at, _deleted)
          SELECT id, first_name, last_name, username, email, pin, role, store_id, is_active, created_at, updated_at, _version, _synced, _synced_at, _deleted FROM users
        `);
        db.run("DROP TABLE users");
        db.run("ALTER TABLE users_new RENAME TO users");
      }
    } catch (e) {
      console.error("Failed to migrate users username uniqueness constraint", e);
    }

    // One-off data clearing for legacy transactions (retaining products, batches, users, and settings)
    try {
      const hasClearedLegacy = typeof window !== "undefined" && window.localStorage
        ? window.localStorage.getItem("dumosrx_cleared_legacy_v2")
        : "true";
      if (!hasClearedLegacy) {
        const tablesToClear = [
          "sales",
          "sale_items",
          "stock_movements",
          "returns",
          "return_items",
          "prescriptions",
          "prescription_items",
          "expenses",
          "purchase_orders",
          "purchase_order_items",
          "audit_logs",
          "_sync_queue"
        ];
        for (const table of tablesToClear) {
          try {
            db.run(`DELETE FROM ${table}`);
          } catch (_e) { }
        }
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem("dumosrx_cleared_legacy_v2", "true");
        }
        saveDatabase();
      }
    } catch (e) {
      console.error("Failed to clear legacy transactions in Web", e);
    }

    return db;
  } catch (err) {
    console.error("[DB] Failed to initialize database:", err);
    throw err;
  }
}

export async function saveDatabase(): Promise<void> {
  if (!db) return;
  const data = db.export();
  await set(`${APP_NAME.toLowerCase()}_db`, data).catch(err => {
    console.error("Failed to save DB to IndexedDB", err);
  });
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null | Uint8Array)[] = [],
): Promise<T[]> {
  if (!db) {
    try {
      await initDatabase();
    } catch (err) {
      console.error("[DB] Query failed due to database init error:", err);
      return [];
    }
  }

  if (!db) return [];

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

export async function execute(
  sql: string,
  params: (string | number | null | Uint8Array)[] = [],
): Promise<void> {
  if (!db) {
    try {
      await initDatabase();
    } catch (err) {
      console.error("[DB] Execute failed due to database init error:", err);
      return;
    }
  }

  if (!db) return;

  if (isTauri()) {
    await db.execute(sql, params);
    return;
  }

  db.run(sql, params);
  saveDatabase();
}

/**
 * Returns the raw database binary for export
 */
export function getDatabaseBinary(): Uint8Array | null {
  if (!db) return null;
  return db.export();
}

/**
 * Overwrites the current database with provided binary data
 */
export async function restoreDatabase(binaryData: Uint8Array): Promise<void> {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `/${file}`,
    });
  }

  db = new SQL.Database(binaryData);
  await saveDatabase();
}

if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  window.getDatabaseBinary = getDatabaseBinary;
  window.restoreDatabase = restoreDatabase;
}

/**
 * Truncates all tables except system-critical ones
 */
export async function resetDatabase(): Promise<void> {
  if (!db) await initDatabase();

  const tablesToClear = [
    "prescription_items",
    "prescriptions",
    "return_items",
    "returns",
    "sale_items",
    "sales",
    "purchase_order_items",
    "purchase_orders",
    "customer_payments",
    "customers",
    "supplier_payments",
    "suppliers",
    "stock_audits",
    "stock_movements",
    "stock_batches",
    "products",
    "categories",
    "expenses",
    "audit_logs",
    "held_transactions",
    "loyalty_transactions",
    "requested_products",
    "feedback",
    "payment_accounts",
    "_sync_state",
    "_sync_queue",
  ];

  for (const table of tablesToClear) {
    try {
      if (isTauri()) {
        await execute(`DELETE FROM ${table}`);
      } else {
        db.run(`DELETE FROM ${table}`);
      }
    } catch (_e) {
      console.warn(`Failed to clear table ${table}`, _e);
    }
  }

  if (!isTauri()) {
    saveDatabase();
  }

  if (typeof window !== "undefined") {
    localStorage.removeItem("last_sync_time");
    window.location.reload();
  }
}

/**
 * Wipes all local store tables (including users and stores) without page reload.
 * Used when linking a new cloud store on an already-configured device.
 */
export async function clearDatabaseForNewStore(): Promise<void> {
  if (!db) await initDatabase();

  const tablesToClear = [
    "prescription_items",
    "prescriptions",
    "return_items",
    "returns",
    "sale_items",
    "sales",
    "purchase_order_items",
    "purchase_orders",
    "customer_payments",
    "customers",
    "supplier_payments",
    "suppliers",
    "stock_audits",
    "stock_movements",
    "stock_batches",
    "products",
    "categories",
    "expenses",
    "audit_logs",
    "held_transactions",
    "loyalty_transactions",
    "requested_products",
    "feedback",
    "payment_accounts",
    "_sync_state",
    "_sync_queue",
    "stores",
    "users",
  ];

  for (const table of tablesToClear) {
    try {
      if (isTauri()) {
        await execute(`DELETE FROM ${table}`);
      } else {
        db.run(`DELETE FROM ${table}`);
      }
    } catch (_e) {
      console.warn(`Failed to clear table ${table} during store transition`, _e);
    }
  }

  if (!isTauri()) {
    saveDatabase();
  }

  if (typeof window !== "undefined") {
    localStorage.removeItem("last_sync_time");
  }
}

export async function logAction(
  action: string,
  table: string,
  recordId: string,
  details?: Record<string, unknown>,
) {
  if (!db) return;
  const id = generateId();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO audit_logs (id, user_id, action, table_name, record_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      currentUser?.id || null,
      action,
      table,
      recordId,
      details ? JSON.stringify(details) : null,
      now,
    ],
  );

  // Enqueue log action into the sync queue so it gets synced to the server
  const record = {
    id,
    user_id: currentUser?.id || null,
    action,
    table_name: table,
    record_id: recordId,
    details: details ? JSON.stringify(details) : null,
    created_at: now,
    updated_at: now,
  };

  await execute(
    `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    ["audit_logs", id, "INSERT", JSON.stringify(record), now],
  );
}

export function getDatabase(): Database | null {
  return db;
}

export async function getSystemConfig(key: string): Promise<any | null> {
  const result = await query<{ value: string }>(
    "SELECT value FROM system_configs WHERE key = ?",
    [key],
  );
  if (result.length > 0) {
    try {
      return JSON.parse(result[0].value);
    } catch (_e) {
      return null;
    }
  }
  return null;
}

export async function setSystemConfig(key: string, value: unknown): Promise<void> {
  const now = new Date().toISOString();
  const valueStr = JSON.stringify(value);

  const existing = await query("SELECT key FROM system_configs WHERE key = ?", [
    key,
  ]);
  if (existing.length > 0) {
    await execute(
      "UPDATE system_configs SET value = ?, updated_at = ? WHERE key = ?",
      [valueStr, now, key],
    );
  } else {
    await execute(
      "INSERT INTO system_configs (key, value, updated_at) VALUES (?, ?, ?)",
      [key, valueStr, now],
    );
  }
}
