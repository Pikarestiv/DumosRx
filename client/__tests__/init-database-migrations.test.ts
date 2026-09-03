import { describe, it, expect, vi, beforeEach } from "vitest";
import initSqlJs from "sql.js";

let storedExport: Uint8Array | undefined;

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => storedExport),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises the real initDatabase() web/sql.js migration path end-to-end.
 * The bulk of initDatabase()'s legacy-repair migrations (medicines/vendors/
 * store_profile/stock_batch renames, owner->store_owner, stock_quantity
 * data migration, purchase_orders.vendor_id drop, sale_items.inventory_id
 * rename, users username-uniqueness rebuild) have all been removed: every
 * real account was confirmed (via diagnoseLegacySchema(), run against the
 * account that predated each one) to already be clear of the artifact each
 * step existed to repair. What remains — relaxPurchaseOrdersSupplierIdNullable
 * and backfillStoreIdOnLegacyRows — shipped 2026-08-14/08-29, comfortably
 * after any real account, and is still active. Existing suites all bypass
 * initDatabase() via __setDatabaseForTesting, so this is the only test that
 * would catch a regression in this path.
 */
describe("initDatabase() web migration path", () => {
  beforeEach(() => {
    vi.resetModules();
    storedExport = undefined;
    // clearLegacyTransactionsOnce wipes sales/purchase_orders/etc the first
    // time it ever runs on a device (see core.ts); a real production device
    // crossed that one-off flag long ago, so simulate that here too — this
    // test cares about the schema migrations, not that unrelated cleanup.
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

    // Table was rebuilt to relax NOT NULL; verify a null supplier_id insert
    // (an Immediate Purchase / walk-in) is now actually accepted, and the
    // pre-existing row's supplier_id was carried over.
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

    // A Pro/Enterprise store already using the loyalty program before this
    // migration must see zero behavior change: the new column must default
    // existing rows to 1 (ON), never 0 — 0 would silently pause the feature
    // for every store currently using it.
    const result = db.exec(
      "SELECT loyalty_program_enabled FROM stores WHERE id = 'store-1'",
    );
    expect(result[0].values).toEqual([[1]]);
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
