/**
 * Core Database Logic
 */

import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { APP_NAME } from "@/lib/constants";
import { get, set } from "idb-keyval";
/* eslint-disable max-lines */
import { SCHEMA_SQL } from "./schema";

// Dual-backend handle: sql.js's Database in the browser, @tauri-apps/plugin-sql's
// Database (a different, incompatible shape: .execute()/.select() vs sql.js's
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

// Used to scope React Query cache keys (see lib/query-keys.ts's `resource`)
// so a switch between logged-in users on this device can never read a
// cache slot the outgoing user's queries wrote into.
export function getCurrentUserId(): string | null {
  return currentUser?.id ?? null;
}

// The store every domain query should be scoped to. Set from
// store-context.tsx's effect mirroring `user?.store_id || activeStoreId`;
// a staff member's fixed store_id always wins over any switcher state, same
// precedence the UI already uses. Module-scope (not threaded as a function
// param) because the query layer is plain async functions with no React
// context available, called from ~40+ hook sites across the app.
let activeStoreId: string | null = null;

export function setActiveStoreId(id: string | null) {
  activeStoreId = id;
}

export function getActiveStoreId(): string | null {
  return activeStoreId;
}

/** Test-only: injects a bare database instance directly, bypassing
 * initDatabase()'s IndexedDB persistence and schema-migration machinery, so
 * unit tests can exercise query()/execute()/transaction() against a real
 * SQLite engine (e.g. a throwaway sql.js instance) instead of mocks. Never
 * called from production code paths. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function __setDatabaseForTesting(instance: any): void {
  db = instance;
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

// Tables that just gained a `store_id` column (see syncColumns below) and
// need every pre-existing local row backfilled to the device's one
// pre-migration store: today's local DB is single-store-per-device by
// construction, so there's exactly one store to backfill to.
export const STORE_SCOPED_TABLES = [
  "products",
  "stock_batches",
  "categories",
  "customers",
  "suppliers",
  "sales",
  "sale_items",
  "sale_item_batches",
  "prescriptions",
  "prescription_items",
  "expenses",
  "returns",
  "return_items",
  "purchase_orders",
  "purchase_order_items",
  "stock_audits",
  "held_transactions",
  "loyalty_transactions",
  "customer_payments",
  "stock_movements",
  "requested_products",
  "supplier_payments",
  "audit_logs",
  "loyalty_tiers",
  "loyalty_redemption_options",
];

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
        "store_id TEXT",
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
        "store_id TEXT",
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
        "parent_id TEXT",
        "store_id TEXT",
      ],
    },
    {
      table: "customers",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "store_id TEXT",
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
        "store_id TEXT",
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
        "store_id TEXT",
      ],
    },
    {
      table: "sale_items",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "store_id TEXT",
      ],
    },
    {
      table: "sale_item_batches",
      columns: ["store_id TEXT"],
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
        "store_id TEXT",
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
        "unit_cost REAL DEFAULT 0",
        "store_id TEXT",
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
        "store_id TEXT",
        "covers_months INTEGER",
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
        "store_id TEXT",
      ],
    },
    {
      table: "loyalty_tiers",
      columns: ["store_id TEXT"],
    },
    {
      table: "loyalty_redemption_options",
      columns: ["store_id TEXT", "discount_value REAL DEFAULT 0"],
    },
    {
      table: "returns",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "store_id TEXT",
      ],
    },
    {
      table: "return_items",
      columns: ["store_id TEXT"],
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
        "store_id TEXT",
        "type TEXT DEFAULT 'standard'",
      ],
    },
    {
      table: "purchase_order_items",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "store_id TEXT",
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
        "expected_cost_price REAL",
        "actual_cost_price REAL",
        "cost_price_difference REAL",
        "expected_selling_price REAL",
        "actual_selling_price REAL",
        "selling_price_difference REAL",
        "store_id TEXT",
      ],
    },
    {
      table: "held_transactions",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "store_id TEXT",
        "discount REAL DEFAULT 0",
        "discount_type TEXT",
      ],
    },
    {
      table: "loyalty_transactions",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "store_id TEXT",
      ],
    },
    {
      table: "customer_payments",
      columns: ["store_id TEXT"],
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
        "online_store_enabled INTEGER DEFAULT 0",
        "registration_number TEXT",
        "custom_units TEXT DEFAULT '[]'",
        "is_demo INTEGER DEFAULT 0",
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
        "store_id TEXT",
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
        "store_id TEXT",
      ],
    },
    {
      table: "supplier_payments",
      columns: [
        "_version INTEGER DEFAULT 1",
        "_synced INTEGER DEFAULT 0",
        "_synced_at TEXT",
        "_deleted INTEGER DEFAULT 0",
        "store_id TEXT",
      ],
    },
    { table: "_sync_queue", columns: ["next_retry_at TEXT"] },
  ];

  if (isTauri()) {
    try {
      const sqlPlugin = await import("@tauri-apps/plugin-sql");
      const Database = sqlPlugin.default || (sqlPlugin as any).Database;

      db = await Database.load("sqlite:dumosrx.db");

      // The Tauri SQL plugin hands out a pooled sqlx connection, and SQLite's
      // default (rollback-journal) mode only allows one writer at a time:
      // two pooled connections writing close together can lock each other
      // out for multiple seconds, or fail outright with "database is
      // locked", with no PRAGMA tuning applied by default. WAL lets readers
      // and a writer proceed concurrently instead of blocking each other,
      // and busy_timeout makes SQLite retry internally for up to 5s instead
      // of erroring immediately when a write does have to wait its turn.
      try {
        await db.execute("PRAGMA journal_mode = WAL;");
        await db.execute("PRAGMA busy_timeout = 5000;");
        await db.execute("PRAGMA synchronous = NORMAL;");
      } catch (e) {
        console.error("Failed to set SQLite concurrency PRAGMAs", e);
      }

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

      // sale_items.inventory_id was renamed to stock_batch_id, but unlike the
      // medicine_id->product_id rename above this one was never migrated:
      // createSale() has written to stock_batch_id for a while now, so any
      // database that predates the rename still has the old inventory_id
      // column and no stock_batch_id at all, breaking every sale with "no
      // column named stock_batch_id". Try the rename first (databases that
      // still have inventory_id); fall back to adding stock_batch_id fresh
      // (databases old enough to have neither); whichever doesn't apply
      // just throws and is ignored, same pattern as the other migrations here.
      try {
        await db.execute("ALTER TABLE sale_items RENAME COLUMN inventory_id TO stock_batch_id");
      } catch (_e) { }
      try {
        await db.execute("ALTER TABLE sale_items ADD COLUMN stock_batch_id TEXT");
      } catch (_e) { }

      try {
        await db.execute("ALTER TABLE vendors RENAME TO suppliers");
      } catch (_e) { }

      try {
        await db.execute("UPDATE users SET role = 'store_owner' WHERE role = 'owner'");
      } catch (_e) { }

      try {
        await db.execute("ALTER TABLE store_profile RENAME TO stores");
      } catch (_e) { }

      // Drop the legacy purchase_orders.vendor_id NOT NULL column left over
      // from the vendors->suppliers rename above. That rename only renamed
      // the *table*; any database created before it still carries the old
      // vendor_id NOT NULL column forever (CREATE TABLE IF NOT EXISTS is a
      // no-op on an existing table), and current code only ever writes
      // supplier_id, so every PO insert on such a device would otherwise
      // fail the NOT NULL constraint permanently.
      try {
        const poColumns = await db.select("SELECT name FROM pragma_table_info('purchase_orders')");
        if (poColumns.some((c: { name: string }) => c.name === "vendor_id")) {
          await db.execute(`
            CREATE TABLE purchase_orders_new (
              id TEXT PRIMARY KEY,
              order_number TEXT,
              supplier_id TEXT NOT NULL,
              ordered_by TEXT,
              order_date TEXT,
              status TEXT DEFAULT 'pending',
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
            )
          `);
          await db.execute(`
            INSERT INTO purchase_orders_new (id, order_number, supplier_id, ordered_by, order_date, status, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, _version, _synced, _synced_at, _deleted)
            SELECT id, order_number, COALESCE(supplier_id, vendor_id), ordered_by, order_date, status, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, _version, _synced, _synced_at, _deleted FROM purchase_orders
          `);
          await db.execute("DROP TABLE purchase_orders");
          await db.execute("ALTER TABLE purchase_orders_new RENAME TO purchase_orders");
        }
      } catch (e) {
        console.error("Failed to drop legacy purchase_orders.vendor_id column", e);
      }

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

      // Backfill store_id on every pre-existing row of newly store-scoped
      // tables to this device's one pre-migration store. WHERE store_id IS
      // NULL makes this naturally idempotent on subsequent launches.
      try {
        for (const table of STORE_SCOPED_TABLES) {
          try {
            await db.execute(
              `UPDATE ${table} SET store_id = (SELECT id FROM stores LIMIT 1) WHERE store_id IS NULL`,
            );
          } catch (_e) {
            // Table may not exist yet on a fresh install; ignore
          }
        }
      } catch (e) {
        console.error("Failed to backfill store_id on legacy rows", e);
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

      // Relax purchase_orders.supplier_id to nullable, so an Immediate
      // Purchase can be recorded without a real vendor (self/walk-in
      // purchase) the same way sales.customer_id already supports a null
      // "Walk-in Customer". SQLite can't ALTER a column's NOT NULL
      // constraint, so recreate the table; runs after the syncColumns loop
      // above so the `type` column already exists to carry over.
      try {
        const tableInfo = await db.select(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name='purchase_orders'"
        );
        const poTableSql = tableInfo?.[0]?.sql || "";
        if (poTableSql && /supplier_id\s+TEXT\s+NOT\s+NULL/i.test(poTableSql)) {
          await db.execute(`
            CREATE TABLE purchase_orders_nullable_supplier (
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
              store_id TEXT,
              _version INTEGER DEFAULT 1,
              _synced INTEGER DEFAULT 0,
              _synced_at TEXT,
              _deleted INTEGER DEFAULT 0
            )
          `);
          await db.execute(`
            INSERT INTO purchase_orders_nullable_supplier (id, order_number, supplier_id, ordered_by, order_date, status, type, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, store_id, _version, _synced, _synced_at, _deleted)
            SELECT id, order_number, supplier_id, ordered_by, order_date, status, type, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, store_id, _version, _synced, _synced_at, _deleted FROM purchase_orders
          `);
          await db.execute("DROP TABLE purchase_orders");
          await db.execute("ALTER TABLE purchase_orders_nullable_supplier RENAME TO purchase_orders");
        }
      } catch (e) {
        console.error("Failed to relax purchase_orders.supplier_id to nullable", e);
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

        // See the matching Tauri-path comment above: sale_items.inventory_id
        // was renamed to stock_batch_id but never migrated for existing
        // databases.
        try {
          db.run("ALTER TABLE sale_items RENAME COLUMN inventory_id TO stock_batch_id");
        } catch (_e) { }
        try {
          db.run("ALTER TABLE sale_items ADD COLUMN stock_batch_id TEXT");
        } catch (_e) { }

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

        // See the matching Tauri-path comment above: drop the legacy
        // purchase_orders.vendor_id NOT NULL column on databases that
        // predate the vendors->suppliers rename.
        try {
          const poColumnsRes = db.exec("SELECT name FROM pragma_table_info('purchase_orders')");
          const poColumnNames: string[] = poColumnsRes?.[0]?.values?.map((row: unknown[]) => row[0]) || [];
          if (poColumnNames.includes("vendor_id")) {
            db.run(`
              CREATE TABLE purchase_orders_new (
                id TEXT PRIMARY KEY,
                order_number TEXT,
                supplier_id TEXT NOT NULL,
                ordered_by TEXT,
                order_date TEXT,
                status TEXT DEFAULT 'pending',
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
              )
            `);
            db.run(`
              INSERT INTO purchase_orders_new (id, order_number, supplier_id, ordered_by, order_date, status, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, _version, _synced, _synced_at, _deleted)
              SELECT id, order_number, COALESCE(supplier_id, vendor_id), ordered_by, order_date, status, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, _version, _synced, _synced_at, _deleted FROM purchase_orders
            `);
            db.run("DROP TABLE purchase_orders");
            db.run("ALTER TABLE purchase_orders_new RENAME TO purchase_orders");
          }
        } catch (e) {
          console.error("Failed to drop legacy purchase_orders.vendor_id column", e);
        }
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

    // Backfill store_id on every pre-existing row of newly store-scoped
    // tables to this device's one pre-migration store. WHERE store_id IS
    // NULL makes this naturally idempotent on subsequent launches.
    try {
      for (const table of STORE_SCOPED_TABLES) {
        try {
          db.run(
            `UPDATE ${table} SET store_id = (SELECT id FROM stores LIMIT 1) WHERE store_id IS NULL`,
          );
        } catch (_e) {
          // Table may not exist yet on a fresh install; ignore
        }
      }
    } catch (e) {
      console.error("Failed to backfill store_id on legacy rows", e);
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

    // Relax purchase_orders.supplier_id to nullable, so an Immediate
    // Purchase can be recorded without a real vendor (self/walk-in
    // purchase) the same way sales.customer_id already supports a null
    // "Walk-in Customer". SQLite can't ALTER a column's NOT NULL
    // constraint, so recreate the table; runs after the syncColumns loop
    // above so the `type` column already exists to carry over.
    try {
      const tableInfoRes = db.exec(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='purchase_orders'"
      );
      const poTableSql = tableInfoRes?.[0]?.values?.[0]?.[0] || "";
      if (poTableSql && /supplier_id\s+TEXT\s+NOT\s+NULL/i.test(String(poTableSql))) {
        db.run(`
          CREATE TABLE purchase_orders_nullable_supplier (
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
            store_id TEXT,
            _version INTEGER DEFAULT 1,
            _synced INTEGER DEFAULT 0,
            _synced_at TEXT,
            _deleted INTEGER DEFAULT 0
          )
        `);
        db.run(`
          INSERT INTO purchase_orders_nullable_supplier (id, order_number, supplier_id, ordered_by, order_date, status, type, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, store_id, _version, _synced, _synced_at, _deleted)
          SELECT id, order_number, supplier_id, ordered_by, order_date, status, type, payment_status, amount_paid, due_date, total_amount, notes, created_at, received_at, updated_at, store_id, _version, _synced, _synced_at, _deleted FROM purchase_orders
        `);
        db.run("DROP TABLE purchase_orders");
        db.run("ALTER TABLE purchase_orders_nullable_supplier RENAME TO purchase_orders");
      }
    } catch (e) {
      console.error("Failed to relax purchase_orders.supplier_id to nullable", e);
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

// Set while a transaction() block is running so execute() can defer the
// (expensive, whole-database) sql.js saveDatabase() to a single call at
// commit time instead of after every individual statement in the block.
let inTransaction = false;

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
  if (!inTransaction) {
    saveDatabase();
  }
}

/**
 * Runs `fn` inside a real SQL transaction so a multi-statement operation
 * (e.g. recording a sale and deducting stock for every line item) either
 * fully applies or fully rolls back: a crash, thrown error, or early return
 * partway through can never leave the database with only some of the writes
 * applied. Every write inside `fn` must go through query()/execute() (and by
 * extension insert()/update()/etc. in base-helpers.ts) against the same `db`
 * handle used here so it participates in the transaction.
 *
 * Nested calls (a transaction() started from inside another) just run `fn`
 * inline against the already-open outer transaction: SQLite doesn't support
 * real nested transactions without savepoints, and callers that compose
 * smaller transactional helpers into a bigger operation don't need them.
 *
 * If BEGIN itself fails (e.g. the Tauri SQL plugin's pooled connection
 * doesn't hand back the same connection for the follow-up statements, a
 * real risk with sqlx pooling that can't be verified from static analysis
 * alone), this falls back to running `fn` without transaction semantics
 * rather than blocking the operation entirely: no worse than the previous
 * behavior, just not improved for that run.
 */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (!db) {
    await initDatabase();
  }
  if (!db) {
    // Database unavailable; let fn() surface whatever error it hits.
    return fn();
  }

  if (inTransaction) {
    return fn();
  }

  let began = false;
  try {
    if (isTauri()) {
      await db.execute("BEGIN");
    } else {
      db.exec("BEGIN");
    }
    began = true;
  } catch (err) {
    console.error("[DB] Failed to start transaction, running without atomicity:", err);
  }

  if (!began) {
    return fn();
  }

  inTransaction = true;
  try {
    const result = await fn();
    if (isTauri()) {
      await db.execute("COMMIT");
    } else {
      db.exec("COMMIT");
    }
    return result;
  } catch (err) {
    try {
      if (isTauri()) {
        await db.execute("ROLLBACK");
      } else {
        db.exec("ROLLBACK");
      }
    } catch (rollbackErr) {
      console.error("[DB] Rollback failed after transaction error:", rollbackErr);
    }
    throw err;
  } finally {
    inTransaction = false;
    if (!isTauri()) {
      // sql.js: persist once for the whole block instead of per-statement.
      await saveDatabase();
    }
  }
}

/**
 * Returns the raw database binary for export: sql.js (web) only. `db` is a
 * real Tauri SQL plugin connection on desktop/mobile, which has no
 * `.export()` method; use backupDatabaseToFile() there instead.
 */
export function getDatabaseBinary(): Uint8Array | null {
  if (!db || isTauri()) return null;
  return db.export();
}

/**
 * Overwrites the current database with provided binary data: sql.js (web)
 * only. On desktop/mobile this would silently disconnect `db` from the real
 * file Tauri's SQL plugin manages without ever writing the restored data to
 * disk; use restoreDatabaseFromFile() there instead.
 */
export async function restoreDatabase(binaryData: Uint8Array): Promise<void> {
  if (isTauri()) {
    throw new Error(
      "restoreDatabase() is web-only; use restoreDatabaseFromFile() on desktop/mobile.",
    );
  }
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) => `/${file}`,
    });
  }

  db = new SQL.Database(binaryData);
  await saveDatabase();
}

/**
 * Desktop/mobile-only backup: lets the user pick a destination via a native
 * save dialog, then writes a consistent snapshot of the live database there
 * with SQLite's VACUUM INTO. Preferred over copying the raw file directly,
 * since VACUUM INTO produces a coherent copy even if writes are landing on
 * the live database around the same time; a raw file copy could otherwise
 * catch it mid-write.
 */
export async function backupDatabaseToFile(): Promise<{ success: boolean; path?: string }> {
  if (!isTauri()) {
    throw new Error("backupDatabaseToFile() is desktop/mobile-only; use getDatabaseBinary() on web.");
  }
  if (!db) {
    await initDatabase();
  }
  if (!db) {
    throw new Error("Database not initialized");
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toISOString().split("T")[1].slice(0, 8).replace(/:/g, "-");

  const destPath = await save({
    defaultPath: `${APP_NAME.toLowerCase()}_backup_${dateStr}_${timeStr}.drx`,
    filters: [{ name: "DumosRx Backup", extensions: ["drx"] }],
  });
  if (!destPath) {
    return { success: false }; // user cancelled the dialog
  }

  // VACUUM INTO doesn't reliably accept a bound parameter for the filename
  // across every SQLite driver combination, so the path is escaped and
  // inlined directly instead. destPath comes from a native OS save dialog
  // (not free-typed user input), but a single-quote in a folder name (e.g.
  // "O'Brien's backups") would still break unescaped string interpolation.
  const escapedPath = destPath.replace(/'/g, "''");
  await db.execute(`VACUUM INTO '${escapedPath}'`);
  return { success: true, path: destPath };
}

/**
 * Desktop/mobile-only restore: lets the user pick a backup file via a native
 * open dialog, closes the live SQL connection so the file isn't locked, then
 * overwrites the real dumosrx.db file with it. The caller must reload the
 * app afterward so initDatabase() re-establishes a fresh connection against
 * the restored file.
 */
export async function restoreDatabaseFromFile(): Promise<{ success: boolean }> {
  if (!isTauri()) {
    throw new Error("restoreDatabaseFromFile() is desktop/mobile-only; use restoreDatabase() on web.");
  }

  const { open } = await import("@tauri-apps/plugin-dialog");
  const sourcePath = await open({
    multiple: false,
    filters: [{ name: "DumosRx Backup", extensions: ["drx", "db", "sqlite", "sqlite3"] }],
  });
  if (!sourcePath || Array.isArray(sourcePath)) {
    return { success: false }; // user cancelled, or somehow picked multiple
  }

  if (db) {
    try {
      await db.close();
    } catch (err) {
      console.error("[DB] Failed to close database connection before restore:", err);
    }
    db = null;
  }

  const { copyFile } = await import("@tauri-apps/plugin-fs");
  const { appDataDir, join } = await import("@tauri-apps/api/path");
  const liveDbPath = await join(await appDataDir(), "dumosrx.db");
  await copyFile(sourcePath, liveDbPath);

  return { success: true };
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
    `INSERT INTO audit_logs (id, user_id, store_id, action, table_name, record_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      currentUser?.id || null,
      getActiveStoreId(),
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

export async function getSystemConfig<T = unknown>(key: string): Promise<T | null> {
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
