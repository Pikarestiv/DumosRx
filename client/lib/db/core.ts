/**
 * Core Database Logic
 */

import initSqlJs, { Database, SqlJsStatic } from "sql.js";
import { APP_NAME } from "@/lib/constants";
import { SCHEMA_SQL } from "./schema";

let SQL: SqlJsStatic | null = null;
let db: any = null;
let currentUser: { id: string; name: string; role: string } | null = null;

export function setCurrentUser(user: { id: string; name: string; role: string } | null) {
  currentUser = user;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && ((window as any).__TAURI__ !== undefined || (window as any).__TAURI_INTERNALS__ !== undefined);
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

  if (isTauri()) {
    try {
      const sqlPlugin = await import("@tauri-apps/plugin-sql");
      const Database = sqlPlugin.default || (sqlPlugin as any).Database;
      // @ts-ignore - Database.load is a static method in Tauri 2
      db = await Database.load("sqlite:dumosrx.db");
      
      const statements = SCHEMA_SQL.split(';').filter(s => s.trim());
      for (const statement of statements) {
        await db.execute(statement);
      }
      
      return db;
    } catch (err) {
      console.error("Failed to init Tauri DB", err);
    }
  }

  try {
    if (!SQL) {
      SQL = await initSqlJs({
        locateFile: (file: string) => `/${file}`,
      });
    }

    const savedData = localStorage.getItem(`${APP_NAME.toLowerCase()}_db`);
    if (savedData) {
      try {
        const data = new Uint8Array(JSON.parse(savedData));
        db = new SQL.Database(data);
        // Ensure new tables from schema updates are created
        db.run(SCHEMA_SQL);
      } catch (e) {
        console.error("[DB] Failed to load saved data, starting fresh", e);
        db = new SQL.Database();
        db.run(SCHEMA_SQL);
      }
    } else {
      db = new SQL.Database();
      db.run(SCHEMA_SQL);
    }

    // ---- Migration: ensure sync tracking and missing columns exist ----
    const syncColumns = [
      { table: 'medicines', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'inventory', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'categories', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'customers', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'vendors', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'sales', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0', 'amount_paid REAL DEFAULT 0', 'change_given REAL DEFAULT 0', 'tax_percentage REAL DEFAULT 0', 'discount_percentage REAL DEFAULT 0', 'points_earned REAL DEFAULT 0', 'points_redeemed REAL DEFAULT 0', 'cashier_id TEXT'] },
      { table: 'sale_items', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'prescriptions', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'expenses', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'users', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0', 'store_id TEXT'] },
      { table: 'audit_logs', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'returns', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'purchase_orders', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'purchase_order_items', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'suppliers', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'stock_audits', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'held_transactions', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'loyalty_transactions', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'store_profile', columns: ['created_at TEXT', 'pcn_license TEXT', 'receipt_header TEXT', 'receipt_footer TEXT', 'show_logo_on_receipt INTEGER DEFAULT 1', 'show_contact_on_receipt INTEGER DEFAULT 1', 'low_stock_warning INTEGER DEFAULT 1', 'expiry_warning INTEGER DEFAULT 1', 'expiry_warning_days INTEGER DEFAULT 90', '_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0', 'auto_sync_enabled INTEGER DEFAULT 0', 'auto_sync_interval INTEGER DEFAULT 15'] },
    ];
    
    for (const { table, columns } of syncColumns) {
      for (const colDef of columns) {
        try {
          // Attempt to add column; will throw if it already exists
          db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
        } catch (e) {
          // Column likely already exists; ignore
        }
      }
    }

    return db;
  } catch (err) {
    console.error("[DB] Failed to initialize database:", err);
    throw err;
  }
}

export function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const arr = Array.from(data);
  localStorage.setItem(`${APP_NAME.toLowerCase()}_db`, JSON.stringify(arr));
}

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
  saveDatabase();
  // Reload page to ensure all contexts pick up new data
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

/**
 * Truncates all tables except system-critical ones
 */
export async function resetDatabase(): Promise<void> {
  if (!db) await initDatabase();
  
  const tablesToClear = [
    'medicines', 'inventory', 'sales', 'sale_items', 'customers', 
    'expenses', 'vendors', 'categories', 'prescriptions', 'audit_logs',
    'returns', 'purchase_orders', 'purchase_order_items', 'suppliers',
    'stock_audits', 'held_transactions', 'loyalty_transactions', '_sync_state'
  ];

  for (const table of tablesToClear) {
    try {
      db.run(`DELETE FROM ${table}`);
    } catch (e) {
      console.warn(`Failed to clear table ${table}`, e);
    }
  }
  
  saveDatabase();
  if (typeof window !== "undefined") {
    localStorage.removeItem("last_sync_time");
    window.location.reload();
  }
}

export async function logAction(action: string, table: string, recordId: string, details?: any) {
  if (!db) return;
  const id = generateId();
  const now = new Date().toISOString();
  
  await execute(
    `INSERT INTO audit_logs (id, user_id, action, table_name, record_id, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, currentUser?.id || null, action, table, recordId, details ? JSON.stringify(details) : null, now]
  );
}

export function getDatabase(): Database | null {
  return db;
}
