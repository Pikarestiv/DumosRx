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
  return typeof window !== "undefined" && "__TAURI__" in window;
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
      const TauriDatabase = (await import("@tauri-apps/plugin-sql")).default;
      db = await TauriDatabase.load("sqlite:dumosrx.db");
      
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
      { table: 'sales', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0', 'amount_paid REAL DEFAULT 0', 'change_given REAL DEFAULT 0', 'tax_percentage REAL DEFAULT 0', 'discount_percentage REAL DEFAULT 0', 'points_earned REAL DEFAULT 0', 'points_redeemed REAL DEFAULT 0'] },
      { table: 'sale_items', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'prescriptions', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'expenses', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'users', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'audit_logs', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'returns', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'purchase_orders', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'purchase_order_items', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'suppliers', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'stock_audits', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'held_transactions', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'loyalty_transactions', columns: ['_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
      { table: 'store_profile', columns: ['created_at TEXT', '_version INTEGER DEFAULT 1', '_synced INTEGER DEFAULT 0', '_synced_at TEXT', '_deleted INTEGER DEFAULT 0'] },
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
