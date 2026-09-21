import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Regression test for the High-severity bug: a redemption picked earlier in
 * checkout (e.g. from a stale cached customer.loyalty_points, or another
 * terminal having already spent the points) was applied against the
 * customer's real balance by clamping the result at 0 instead of rejecting
 * - the customer effectively got the reward's discount for free. Runs
 * against a real in-memory SQLite engine, not a mocked update(), since the
 * bug is specifically about what applyLoyaltyPointsForSale does with the
 * freshly re-read balance.
 */
describe("applyLoyaltyPointsForSale re-validates the redemption against the real balance", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let applyLoyaltyPointsForSale: typeof import("@/lib/hooks/use-pos-payment-helpers").applyLoyaltyPointsForSale;
  let InsufficientLoyaltyPointsError: typeof import("@/lib/hooks/use-pos-payment-helpers").InsufficientLoyaltyPointsError;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const helpers = await import("@/lib/hooks/use-pos-payment-helpers");
    applyLoyaltyPointsForSale = helpers.applyLoyaltyPointsForSale;
    InsufficientLoyaltyPointsError = helpers.InsufficientLoyaltyPointsError;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM customers; DELETE FROM loyalty_transactions;`);
    db.run(
      `INSERT INTO customers (id, first_name, loyalty_points) VALUES ('c1', 'Jane', 50)`,
    );
  });

  const baseCustomer = { id: "c1", first_name: "Jane", loyalty_points: 50 } as never;

  it("rejects (throws InsufficientLoyaltyPointsError) instead of clamping when the real balance can't cover the redemption", async () => {
    // selectedCustomer is stale here on purpose - the cart picked a
    // redemption when the cache said 200 points, but the real row (just
    // seeded above) only has 50.
    const staleCustomer = { ...baseCustomer, loyalty_points: 200 };

    await expect(
      applyLoyaltyPointsForSale({
        selectedCustomer: staleCustomer,
        canUseLoyaltyProgram: true,
        earnedPoints: 0,
        redeemedOption: { id: "opt1", label: "₦500 off", pointsCost: 100, discountValue: 500 },
        saleId: "s1",
      }),
    ).rejects.toThrow(InsufficientLoyaltyPointsError);

    // Balance must be untouched - the caller rolls the whole sale back on
    // this throw (runInTransaction), so nothing here should have written.
    const rows = db.exec(`SELECT loyalty_points FROM customers WHERE id = 'c1'`);
    expect(rows[0].values[0][0]).toBe(50);
    const txnRows = db.exec(`SELECT COUNT(*) FROM loyalty_transactions`);
    expect(txnRows[0].values[0][0]).toBe(0);
  });

  it("still applies a redemption the real balance can genuinely cover", async () => {
    await applyLoyaltyPointsForSale({
      selectedCustomer: baseCustomer,
      canUseLoyaltyProgram: true,
      earnedPoints: 10,
      redeemedOption: { id: "opt1", label: "₦500 off", pointsCost: 30, discountValue: 500 },
      saleId: "s1",
    });

    const rows = db.exec(`SELECT loyalty_points FROM customers WHERE id = 'c1'`);
    expect(rows[0].values[0][0]).toBe(30); // 50 + 10 earned - 30 redeemed
  });
});
