import { describe, it, expect, vi, beforeEach } from "vitest";
import initSqlJs from "sql.js";

let storedExport: Uint8Array | undefined;

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(storedExport)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("A-396 purchase orders rebuild crash recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    storedExport = undefined;
    window.localStorage.setItem("dumosrx_cleared_legacy_v2", "true");
  });

  it("recovers stranded purchase orders when an earlier attempt crashed after dropping purchase_orders but before rename", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE purchase_orders (
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
      );
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
      );
      CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT);
      INSERT INTO stores (id, name) VALUES ('store-1', 'Main Branch');

      INSERT INTO purchase_orders_nullable_supplier (
        id, order_number, supplier_id, ordered_by, order_date, status, type,
        payment_status, amount_paid, due_date, total_amount, notes, created_at,
        received_at, updated_at, store_id, _version, _synced, _synced_at, _deleted
      ) VALUES
        ('po-stranded-1', 'PO-STR-001', 'sup-1', 'user-1', '2026-11-01', 'completed', 'standard', 'paid', 5000, '2026-11-05', 5000, 'Stranded order 1', '2026-11-01', '2026-11-02', '2026-11-02', 'store-1', 1, 1, '2026-11-02', 0),
        ('po-stranded-2', 'PO-STR-002', NULL, 'user-1', '2026-11-03', 'pending', 'immediate', 'unpaid', 0, '2026-11-10', 2500, 'Stranded order 2', '2026-11-03', NULL, '2026-11-03', 'store-1', 1, 0, NULL, 0);
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    const orders = db.exec(
      "SELECT id, order_number, supplier_id, total_amount, store_id FROM purchase_orders ORDER BY id",
    );
    expect(orders[0]?.values).toEqual([
      ["po-stranded-1", "PO-STR-001", "sup-1", 5000, "store-1"],
      ["po-stranded-2", "PO-STR-002", null, 2500, "store-1"],
    ]);

    const scratch = db.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_orders_nullable_supplier'",
    );
    expect(scratch).toEqual([]);
  });

  it("preserves newly inserted orders while recovering stranded orders from scratch table", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE purchase_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT,
        supplier_id TEXT,
        total_amount REAL DEFAULT 0,
        store_id TEXT
      );
      CREATE TABLE purchase_orders_nullable_supplier (
        id TEXT PRIMARY KEY,
        order_number TEXT,
        supplier_id TEXT,
        total_amount REAL DEFAULT 0,
        store_id TEXT
      );
      CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT);
      INSERT INTO stores (id, name) VALUES ('store-1', 'Main Branch');

      INSERT INTO purchase_orders (id, order_number, supplier_id, total_amount, store_id)
      VALUES ('po-new-1', 'PO-NEW-001', 'sup-2', 7500, 'store-1');

      INSERT INTO purchase_orders_nullable_supplier (id, order_number, supplier_id, total_amount, store_id)
      VALUES ('po-stranded-1', 'PO-STR-001', 'sup-1', 5000, 'store-1');
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    const orders = db.exec(
      "SELECT id, order_number, supplier_id, total_amount, store_id FROM purchase_orders ORDER BY id",
    );
    expect(orders[0]?.values).toEqual([
      ["po-new-1", "PO-NEW-001", "sup-2", 7500, "store-1"],
      ["po-stranded-1", "PO-STR-001", "sup-1", 5000, "store-1"],
    ]);

    const scratch = db.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_orders_nullable_supplier'",
    );
    expect(scratch).toEqual([]);
  });

  it("renames scratch table to purchase_orders directly if purchase_orders was completely missing", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run(`
      CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT);
      INSERT INTO stores (id, name) VALUES ('store-1', 'Main Branch');
      CREATE TABLE _sync_state (store_id TEXT, table_name TEXT PRIMARY KEY);
      CREATE TABLE purchase_orders_nullable_supplier (
        id TEXT PRIMARY KEY,
        order_number TEXT,
        supplier_id TEXT,
        total_amount REAL DEFAULT 0,
        store_id TEXT
      );
      INSERT INTO purchase_orders_nullable_supplier (id, order_number, supplier_id, total_amount, store_id)
      VALUES ('po-restored-1', 'PO-RES-001', 'sup-3', 9200, 'store-1');
    `);

    const { makeSqlJsAdapter, runSchemaMigrations } = await import("@/lib/db/schema-migrations");
    const adapter = makeSqlJsAdapter(db);
    await runSchemaMigrations(adapter);

    const orders = db.exec(
      "SELECT id, order_number, supplier_id, total_amount, store_id FROM purchase_orders",
    );
    expect(orders[0]?.values).toEqual([
      ["po-restored-1", "PO-RES-001", "sup-3", 9200, "store-1"],
    ]);

    const scratch = db.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'purchase_orders_nullable_supplier'",
    );
    expect(scratch).toEqual([]);
    db.close();
  });
});
