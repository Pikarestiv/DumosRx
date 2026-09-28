import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Items 1+2 (Cynthia's feedback): the Detailed Sales report could already be
 * FILTERED by cashier but never showed who rang a sale, so a filtered export
 * was indistinguishable from an unfiltered one and an on-screen view could
 * not be sorted or scanned by staff member.
 */
describe("fetchSalesReportData cashier column", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let fetchSalesReportData: typeof import("@/lib/db/queries/reports").fetchSalesReportData;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    ({ fetchSalesReportData } = await import("@/lib/db/queries/reports"));

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    const { runSchemaMigrations, makeSqlJsAdapter } = await import(
      "@/lib/db/schema-migrations"
    );
    await runSchemaMigrations(makeSqlJsAdapter(db));
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM sales; DELETE FROM users; DELETE FROM customers; DELETE FROM returns;`,
    );
    core.setActiveStoreId(null);
    db.run(
      `INSERT INTO users (id, first_name, last_name, _deleted) VALUES
        ('u1', 'Ada', 'Obi', 0),
        ('u2', 'Chidi', NULL, 0)`,
    );
  });

  function seedSale(id: string, userId: string | null) {
    db.run(
      `INSERT INTO sales (id, transaction_number, transaction_date, user_id, payment_method, subtotal, tax_amount, discount_total, total_amount, payment_status, _deleted)
       VALUES ('${id}', 'TXN-${id}', '2026-09-20T10:00:00.000Z', ${userId ? `'${userId}'` : "NULL"}, 'cash', 100, 0, 0, 100, 'paid', 0)`,
    );
  }

  it("names the cashier who rang each sale", async () => {
    seedSale("s1", "u1");
    const rows = await fetchSalesReportData();
    expect(rows[0]["Cashier"]).toBe("Ada Obi");
  });

  it("does not leave a trailing separator when the cashier has no last name", async () => {
    seedSale("s1", "u2");
    const rows = await fetchSalesReportData();
    expect(rows[0]["Cashier"]).toBe("Chidi");
  });

  it("leaves the column blank rather than null for an unattributed sale", async () => {
    seedSale("s1", null);
    const rows = await fetchSalesReportData();
    expect(rows[0]["Cashier"]).toBe("");
  });

  it("still honours the staff filter, now alongside the column", async () => {
    seedSale("s1", "u1");
    seedSale("s2", "u2");
    const rows = await fetchSalesReportData(undefined, undefined, {
      staffId: "u2",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]["Cashier"]).toBe("Chidi");
  });
});
