import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression test: fetchCustomerReportData's join to sales had no
 * store_id filter (customers.ts's getCustomers has the identical join WITH
 * one, so this was the outlier), so "Total Purchases"/"Total Spent" could
 * absorb another store's sales for any shared customer id on a multi-store
 * device.
 */
describe("fetchCustomerReportData store scoping", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let fetchCustomerReportData: typeof import("@/lib/db/queries/reports").fetchCustomerReportData;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ fetchCustomerReportData } = await import("@/lib/db/queries/reports"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import("@/lib/db/schema-migrations");
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM customers; DELETE FROM sales;`);
    core.setActiveStoreId(null);
  });

  it("excludes another store's sales from Total Purchases/Total Spent on a multi-store device", async () => {
    db.run(
      `INSERT INTO customers (id, first_name, store_id, _deleted) VALUES ('c1', 'Jane', 'store-a', 0)`,
    );
    db.run(
      `INSERT INTO sales (id, transaction_number, customer_id, store_id, total_amount, subtotal, transaction_date, _deleted) VALUES
        ('s1', 'TXN-1', 'c1', 'store-a', 1000, 1000, '2026-01-01', 0),
        ('s2', 'TXN-2', 'c1', 'store-b', 99999, 99999, '2026-01-02', 0)`,
    );

    core.setActiveStoreId("store-a");
    const rows = await fetchCustomerReportData();

    expect(rows[0]["Total Purchases"]).toBe(1);
    expect(rows[0]["Total Spent"]).toBe(1000);
  });
});
