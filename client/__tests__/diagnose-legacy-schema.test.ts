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
    expect(result).toEqual({ clean: true, findings: [] });
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
  });
});
