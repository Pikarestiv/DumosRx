import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import { vi } from "vitest";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Sanity check for diagnoseLegacySchema(): a device already fully on the
 * current schema reports clean, and a device carrying real legacy artifacts
 * (old table name, unmigrated stock_quantity, NOT NULL supplier_id) reports
 * every one of them by name. Run before trusting the tool's output against
 * real production/dev devices.
 */
describe("diagnoseLegacySchema()", () => {
  it("reports clean on a database that's already fully migrated", async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);

    const result = await core.diagnoseLegacySchema();
    expect(result.clean).toBe(true);
    expect(result.findings).toEqual([]);
    // A fully-migrated device blocks neither still-active legacy-repair step.
    expect(result.retirable.relaxPurchaseOrdersSupplierIdNullable.ok).toBe(true);
    expect(result.retirable.backfillStoreIdOnLegacyRows.ok).toBe(true);
  });

  it("reports every legacy artifact present on an unmigrated database", async () => {
    const core = await import("@/lib/db/core");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run(`
      CREATE TABLE medicines (id TEXT PRIMARY KEY);
      CREATE TABLE products (id TEXT PRIMARY KEY, stock_quantity INTEGER DEFAULT 0);
      CREATE TABLE stock_batches (id TEXT PRIMARY KEY, product_id TEXT, batch_number TEXT);
      CREATE TABLE purchase_orders (id TEXT PRIMARY KEY, vendor_id TEXT, supplier_id TEXT NOT NULL);
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT UNIQUE);
      INSERT INTO products (id, stock_quantity) VALUES ('p1', 5);
    `);
    core.__setDatabaseForTesting(db);

    const result = await core.diagnoseLegacySchema();
    expect(result.clean).toBe(false);
    expect(result.findings.some((f) => f.includes('"medicines"'))).toBe(true);
    expect(result.findings.some((f) => f.includes("stock_quantity") && f.includes("not yet migrated"))).toBe(true);
    expect(result.findings.some((f) => f.includes("purchase_orders.supplier_id"))).toBe(true);
    expect(result.findings.some((f) => f.includes("UNIQUE(store_id, username)"))).toBe(true);
    // ...and this device is a blocker for retiring the purchase_orders
    // rebuild, since its supplier_id is still NOT NULL.
    expect(result.retirable.relaxPurchaseOrdersSupplierIdNullable.ok).toBe(false);
  });

  it("reports the store_id backfill as still needed when a store-scoped table has NULL store_ids", async () => {
    const core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database();
    db.run(SCHEMA_SQL);
    // SCHEMA_SQL alone doesn't carry store_id on products — that column is
    // added by runSyncColumnMigrations at init. Add it the same way, then
    // leave a row with a NULL store_id, i.e. exactly what
    // backfillStoreIdOnLegacyRows exists to repair.
    db.run("ALTER TABLE products ADD COLUMN store_id TEXT");
    db.run("INSERT INTO products (id, name, store_id) VALUES ('p_legacy', 'legacy item', NULL)");
    core.__setDatabaseForTesting(db);

    const result = await core.diagnoseLegacySchema();
    expect(result.clean).toBe(false);
    expect(result.findings.some((f) => f.includes("no store_id"))).toBe(true);
    expect(result.retirable.backfillStoreIdOnLegacyRows.ok).toBe(false);
  });
});
