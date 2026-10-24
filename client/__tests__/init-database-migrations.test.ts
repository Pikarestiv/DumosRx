import { describe, it, expect, vi, beforeEach } from "vitest";
import initSqlJs from "sql.js";

let storedExport: Uint8Array | undefined;

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(storedExport)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Exercises the real initDatabase() web/sql.js migration path end-to-end.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-init-database-migrations-test-ts-L11
describe("initDatabase() web migration path", () => {
  beforeEach(() => {
    vi.resetModules();
    storedExport = undefined;
    // clearLegacyTransactionsOnce wipes sales/purchase_orders/etc the first time it ever runs on a device (see core.ts); a rea…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-init-database-migrations-test-ts-L29
    window.localStorage.setItem("dumosrx_cleared_legacy_v2", "true");
  });

  it("migrates a database with a NOT NULL purchase_orders.supplier_id and un-backfilled store_id", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE purchase_orders (
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
      );
      CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT);

      INSERT INTO products (id, name) VALUES ('prod-1', 'Panadol');
      INSERT INTO purchase_orders (id, order_number, supplier_id, status)
        VALUES ('po-1', 'PO-001', 'supplier-1', 'pending');
      INSERT INTO stores (id, name) VALUES ('store-1', 'Local Store');
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    // Table was rebuilt to relax NOT NULL; verify a null supplier_id insert (an Immediate Purchase / walk-in) is now actually…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-init-database-migrations-test-ts-L76
    const po = db.exec("SELECT supplier_id FROM purchase_orders WHERE id = 'po-1'");
    expect(po[0].values).toEqual([["supplier-1"]]);
    expect(() =>
      db.run(
        "INSERT INTO purchase_orders (id, order_number, supplier_id, status) VALUES ('po-2', 'PO-002', NULL, 'pending')",
      ),
    ).not.toThrow();

    // store_id backfilled onto every pre-existing product row, and the
    // sync-column migration ran (product now carries _version etc.).
    const productStoreId = db.exec(
      "SELECT store_id, _version FROM products WHERE id = 'prod-1'",
    );
    expect(productStoreId[0].values).toEqual([["store-1", 1]]);
  });

  it("adds stores.loyalty_program_enabled to a pre-existing store, defaulting it to 1 (ON)", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE purchase_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT,
        supplier_id TEXT,
        status TEXT DEFAULT 'pending'
      );
      CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT, subscription_tier TEXT DEFAULT 'pro');

      INSERT INTO stores (id, name, subscription_tier) VALUES ('store-1', 'Pro Store', 'pro');
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    // A Pro/Enterprise store already using the loyalty program before this migration must see zero behavior change:
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-init-database-migrations-test-ts-L118
    const result = db.exec(
      "SELECT loyalty_program_enabled FROM stores WHERE id = 'store-1'",
    );
    expect(result[0].values).toEqual([[1]]);
  });

  it("zeroes a legacy stock_batches row whose cost_price is NULL, leaving a real cost alone", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE stock_batches (
        id TEXT PRIMARY KEY,
        product_id TEXT,
        batch_number TEXT,
        quantity INTEGER DEFAULT 0,
        cost_price REAL
      );

      INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price)
        VALUES ('batch-legacy', 'prod-1', 'B-1', 5, NULL);
      INSERT INTO stock_batches (id, product_id, batch_number, quantity, cost_price)
        VALUES ('batch-priced', 'prod-1', 'B-2', 5, 42.5);
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    const result = db.exec(
      "SELECT id, cost_price FROM stock_batches ORDER BY id",
    );
    expect(result[0].values).toEqual([
      ["batch-legacy", 0],
      ["batch-priced", 42.5],
    ]);
  });

  // A-305: `_sync_state` was keyed by `table_name` alone, so one watermark served every store.
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-init-database-migrations-test-ts-L162
  it("rebuilds a table-keyed _sync_state onto (store_id, table_name), keeping the device's watermarks", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE _sync_state (
        table_name TEXT PRIMARY KEY,
        last_synced_at TEXT,
        server_cursor TEXT,
        rewind_count INTEGER NOT NULL DEFAULT 0,
        rewound_from TEXT
      );
      INSERT INTO stores (id, name) VALUES ('store-1', 'Only Store');
      INSERT INTO _sync_state (table_name, last_synced_at, rewind_count)
        VALUES ('sales', '2026-10-19T11:00:00Z', 2);
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    const rows = db.exec(
      "SELECT store_id, table_name, last_synced_at, rewind_count FROM _sync_state",
    );
    expect(rows[0].values).toEqual([["store-1", "sales", "2026-10-19T11:00:00Z", 2]]);

    // Two stores can now hold their own watermark for the same table, which
    // the old primary key made impossible.
    db.run(
      `INSERT INTO _sync_state (store_id, table_name, last_synced_at)
       VALUES ('store-2', 'sales', '2026-10-18T09:00:00Z')`,
    );
    const both = db.exec("SELECT COUNT(*) FROM _sync_state WHERE table_name = 'sales'");
    expect(both[0].values[0][0]).toBe(2);
  });

  // A watermark on a device holding two stores cannot be attributed to either of them — attributing it wrongly is the whole…
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-init-database-migrations-test-ts-L208
  it("parks a two-store device's watermarks under no store rather than guessing one", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE _sync_state (
        table_name TEXT PRIMARY KEY,
        last_synced_at TEXT,
        server_cursor TEXT,
        rewind_count INTEGER NOT NULL DEFAULT 0,
        rewound_from TEXT
      );
      INSERT INTO stores (id, name) VALUES ('store-1', 'First'), ('store-2', 'Second');
      INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('sales', '2026-10-19T11:00:00Z');
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    const rows = db.exec("SELECT store_id FROM _sync_state WHERE table_name = 'sales'");
    expect(rows[0].values).toEqual([[""]]);
  });

  // The rebuild is CREATE / copy / DROP / RENAME with no transaction, so a process death between the copy and the DROP leave…
  // Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-init-database-migrations-test-ts-L240
  it("completes the rebuild even when an interrupted earlier attempt left its scratch table behind", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE _sync_state (
        table_name TEXT PRIMARY KEY,
        last_synced_at TEXT,
        server_cursor TEXT,
        rewind_count INTEGER NOT NULL DEFAULT 0,
        rewound_from TEXT
      );
      CREATE TABLE _sync_state_scoped (
        store_id TEXT NOT NULL DEFAULT '',
        table_name TEXT NOT NULL,
        last_synced_at TEXT,
        server_cursor TEXT,
        rewind_count INTEGER NOT NULL DEFAULT 0,
        rewound_from TEXT,
        PRIMARY KEY (store_id, table_name)
      );
      INSERT INTO stores (id, name) VALUES ('store-1', 'Only Store');
      INSERT INTO _sync_state (table_name, last_synced_at) VALUES ('sales', '2026-10-19T11:00:00Z');
      INSERT INTO _sync_state_scoped (store_id, table_name, last_synced_at)
        VALUES ('store-1', 'sales', '2026-10-19T11:00:00Z');
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    const rows = db.exec(
      "SELECT store_id, table_name, last_synced_at FROM _sync_state",
    );
    expect(rows[0].values).toEqual([["store-1", "sales", "2026-10-19T11:00:00Z"]]);

    // The scratch table must not survive, or the next migration gate reads a
    // half-built state as finished.
    const scratch = db.exec(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '_sync_state_scoped'",
    );
    expect(scratch).toEqual([]);
  });

  it("is idempotent: re-running the same migrations against an already-migrated database is a no-op that doesn't throw", async () => {
    const core = await import("@/lib/db/core");
    const first = await core.initDatabase();
    const exported = first.export();

    vi.resetModules();
    storedExport = exported;
    const core2 = await import("@/lib/db/core");
    await expect(core2.initDatabase()).resolves.toBeTruthy();
  });
});
