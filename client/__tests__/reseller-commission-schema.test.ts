import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("reseller commission schema", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM stores;`);
  });

  it("stores a reseller_commission_percentage on stores", () => {
    db.run(
      `INSERT INTO stores (id, name, reseller_commission_percentage) VALUES ('s1', 'Store', 25)`,
    );
    const rows = db.exec(
      `SELECT reseller_commission_percentage FROM stores WHERE id = 's1'`,
    );
    expect(rows[0].values[0][0]).toBe(25);
  });

  it("stores reseller commission fields on a sale, defaulting to unset", () => {
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount) VALUES ('sale1', 'TXN1', 100, 100)`,
    );
    const defaults = db.exec(
      `SELECT is_reseller_sale, reseller_commission_amount, reseller_commission_redeemed FROM sales WHERE id = 'sale1'`,
    );
    expect(defaults[0].values[0]).toEqual([0, 0, 0]);

    db.run(
      `UPDATE sales SET is_reseller_sale = 1, reseller_commission_percentage = 20, reseller_commission_amount = 500 WHERE id = 'sale1'`,
    );
    const updated = db.exec(
      `SELECT is_reseller_sale, reseller_commission_percentage, reseller_commission_amount FROM sales WHERE id = 'sale1'`,
    );
    expect(updated[0].values[0]).toEqual([1, 20, 500]);

    db.run(
      `UPDATE sales SET reseller_commission_redeemed = 1, reseller_commission_redeemed_at = '2026-09-16T00:00:00Z', reseller_commission_redeemed_by = 'user-1' WHERE id = 'sale1'`,
    );
    const redeemed = db.exec(
      `SELECT reseller_commission_redeemed, reseller_commission_redeemed_at, reseller_commission_redeemed_by FROM sales WHERE id = 'sale1'`,
    );
    expect(redeemed[0].values[0]).toEqual([1, "2026-09-16T00:00:00Z", "user-1"]);
  });
});
