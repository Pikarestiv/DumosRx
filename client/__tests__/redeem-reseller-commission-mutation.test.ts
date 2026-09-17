import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

describe("useRedeemResellerCommissionMutation", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let redeemResellerCommission: typeof import("@/lib/hooks/use-redeem-reseller-commission-mutation").redeemResellerCommission;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const mod = await import("@/lib/hooks/use-redeem-reseller-commission-mutation");
    redeemResellerCommission = mod.redeemResellerCommission;
    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM audit_logs;`);
    core.setActiveStoreId(null);
  });

  it("marks an unredeemed reseller sale's commission as redeemed", async () => {
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, is_reseller_sale, reseller_commission_amount, reseller_commission_redeemed)
      VALUES ('s1', 'TXN1', 100, 100, 1, 30, 0)
    `);

    await redeemResellerCommission({ saleId: "s1", userId: "user-1" });

    const rows = db.exec(
      `SELECT reseller_commission_redeemed, reseller_commission_redeemed_by FROM sales WHERE id = 's1'`,
    );
    expect(rows[0].values[0][0]).toBe(1);
    expect(rows[0].values[0][1]).toBe("user-1");
  });

  it("rejects redeeming a sale that isn't a reseller sale", async () => {
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount) VALUES ('s2', 'TXN2', 100, 100)`,
    );
    await expect(
      redeemResellerCommission({ saleId: "s2", userId: "user-1" }),
    ).rejects.toThrow();
  });

  it("rejects redeeming a sale that's already redeemed", async () => {
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, is_reseller_sale, reseller_commission_amount, reseller_commission_redeemed)
      VALUES ('s3', 'TXN3', 100, 100, 1, 30, 1)
    `);
    await expect(
      redeemResellerCommission({ saleId: "s3", userId: "user-1" }),
    ).rejects.toThrow();
  });
});
