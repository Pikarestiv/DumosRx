import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("reseller commission queries", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getSaleByTransactionNumber: typeof import("@/lib/db/queries/sales").getSaleByTransactionNumber;
  let getPendingResellerCommissionTotal: typeof import("@/lib/db/queries/sales").getPendingResellerCommissionTotal;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const sales = await import("@/lib/db/queries/sales");
    getSaleByTransactionNumber = sales.getSaleByTransactionNumber;
    getPendingResellerCommissionTotal = sales.getPendingResellerCommissionTotal;
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales;`);
    core.setActiveStoreId(null);
  });

  it("finds a sale by its exact transaction number", async () => {
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount) VALUES ('s1', 'TXN123', 100, 100)`,
    );
    const found = await getSaleByTransactionNumber("TXN123");
    expect(found?.id).toBe("s1");

    const notFound = await getSaleByTransactionNumber("NOPE");
    expect(notFound).toBeNull();
  });

  it("sums only unredeemed reseller commissions", async () => {
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, is_reseller_sale, reseller_commission_amount, reseller_commission_redeemed)
      VALUES
        ('s1', 'TXN1', 100, 100, 1, 30, 0),
        ('s2', 'TXN2', 100, 100, 1, 50, 1),
        ('s3', 'TXN3', 100, 100, 0, 0, 0),
        ('s4', 'TXN4', 100, 100, 1, 70, 0)
    `);
    const total = await getPendingResellerCommissionTotal();
    expect(total).toBe(100);
  });
});
