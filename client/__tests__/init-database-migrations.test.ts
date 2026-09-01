import { describe, it, expect, vi, beforeEach } from "vitest";
import initSqlJs from "sql.js";

let storedExport: Uint8Array | undefined;

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => storedExport),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises the real initDatabase() web/sql.js migration path end-to-end
 * against a hand-built "legacy device" database, covering the migration
 * steps still present after the 2026-06-27/06-28-vintage renames
 * (medicines->products, vendors->suppliers, store_profile->stores,
 * stock_batch->stock_batches, owner->store_owner, stock_quantity->batches)
 * were removed — every real account was confirmed to postdate those by 5+
 * weeks, so their repair code is gone; see diagnoseLegacySchema() for the
 * device audit that backed that decision. What remains here
 * (sale_items.inventory_id rename, dropLegacyVendorIdColumn,
 * rebuildUsersTableForStoreScopedUsername,
 * relaxPurchaseOrdersSupplierIdNullable) shipped closer to the earliest
 * real account and is still active. Existing suites all bypass
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

  it("migrates a legacy device database to the current schema on first load", async () => {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const legacyDb = new SQL.Database();
    legacyDb.run(`
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      -- supplier_id already present (added by an earlier syncColumns pass on
      -- a prior app version, per dropLegacyVendorIdColumn's own comment on
      -- why its COALESCE(supplier_id, vendor_id) is safe); only the legacy
      -- vendor_id NOT NULL column is left over from before the rename.
      CREATE TABLE purchase_orders (
        id TEXT PRIMARY KEY,
        order_number TEXT,
        vendor_id TEXT NOT NULL,
        supplier_id TEXT,
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
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        username TEXT UNIQUE,
        email TEXT,
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
      CREATE TABLE stores (id TEXT PRIMARY KEY, name TEXT);
      CREATE TABLE sale_items (id TEXT PRIMARY KEY, inventory_id TEXT);

      INSERT INTO products (id, name) VALUES ('prod-1', 'Panadol');
      INSERT INTO purchase_orders (id, order_number, vendor_id, status)
        VALUES ('po-1', 'PO-001', 'vendor-1', 'pending');
      INSERT INTO users (id, first_name, last_name, username, email, pin, role)
        VALUES ('user-1', 'Ada', 'Owner', 'admin', 'ada@example.com', '1234', 'owner');
      INSERT INTO stores (id, name) VALUES ('store-1', 'Local Store');
    `);
    storedExport = legacyDb.export();
    legacyDb.close();

    const core = await import("@/lib/db/core");
    const db = await core.initDatabase();

    // purchase_orders.vendor_id NOT NULL dropped in favor of nullable
    // supplier_id, carrying the old vendor_id value over.
    const poCols = db.exec("PRAGMA table_info(purchase_orders)");
    const poColNames = poCols[0].values.map((r: unknown[]) => r[1]);
    expect(poColNames).not.toContain("vendor_id");
    expect(poColNames).toContain("supplier_id");
    const po = db.exec("SELECT supplier_id FROM purchase_orders WHERE id = 'po-1'");
    expect(po[0].values).toEqual([["vendor-1"]]);
    // Table was rebuilt to relax NOT NULL; verify a null supplier_id insert
    // (an Immediate Purchase / walk-in) is now actually accepted.
    expect(() =>
      db.run(
        "INSERT INTO purchase_orders (id, order_number, supplier_id, status) VALUES ('po-2', 'PO-002', NULL, 'pending')",
      ),
    ).not.toThrow();

    // users table rebuilt with UNIQUE(store_id, username) instead of a bare
    // UNIQUE(username).
    const usersTableSql = db.exec(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
    )[0].values[0][0] as string;
    expect(usersTableSql).toMatch(/UNIQUE\s*\(\s*store_id\s*,\s*username\s*\)/i);

    // sale_items.inventory_id renamed to stock_batch_id.
    const saleItemCols = db
      .exec("PRAGMA table_info(sale_items)")[0]
      .values.map((r: unknown[]) => r[1]);
    expect(saleItemCols).toContain("stock_batch_id");
    expect(saleItemCols).not.toContain("inventory_id");

    // store_id backfilled onto every pre-existing product row, and the
    // sync-column migration ran (product now carries _version etc.).
    const productStoreId = db.exec(
      "SELECT store_id, _version FROM products WHERE id = 'prod-1'",
    );
    expect(productStoreId[0].values).toEqual([["store-1", 1]]);
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
