import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import type { Customer } from "@/lib/types/customer";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Covers the two LOYALTY_RULES constants that used to be declared and never
 * used: MIN_REDEMPTION_POINTS and POINTS_EXPIRY_MONTHS. Runs against a real
 * in-memory SQLite engine because the point of the fix is what
 * applyLoyaltyPointsForSale does with the customer row and the dated
 * loyalty_transactions ledger, not the pure math (covered in
 * loyalty-calculator.test.ts).
 */
describe("applyLoyaltyPointsForSale enforces LOYALTY_RULES", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let applyLoyaltyPointsForSale: typeof import("@/lib/hooks/use-pos-payment-helpers").applyLoyaltyPointsForSale;
  let InsufficientLoyaltyPointsError: typeof import("@/lib/hooks/use-pos-payment-helpers").InsufficientLoyaltyPointsError;
  let LoyaltyRedemptionBelowMinimumError: typeof import("@/lib/hooks/use-pos-payment-helpers").LoyaltyRedemptionBelowMinimumError;

  const customer = { id: "c1", first_name: "Jane", loyalty_points: 5000 } as unknown as Customer;

  const seedLedger = (rows: { points: number; type: string; created_at: string }[]) => {
    rows.forEach((row, i) => {
      db.run(
        `INSERT INTO loyalty_transactions (id, customer_id, points, type, created_at, _deleted)
         VALUES (?, 'c1', ?, ?, ?, 0)`,
        [`lt${i}`, row.points, row.type, row.created_at],
      );
    });
  };

  const monthsAgo = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString();
  };

  const points = () =>
    db.exec(`SELECT loyalty_points FROM customers WHERE id = 'c1'`)[0].values[0][0];

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const helpers = await import("@/lib/hooks/use-pos-payment-helpers");
    applyLoyaltyPointsForSale = helpers.applyLoyaltyPointsForSale;
    InsufficientLoyaltyPointsError = helpers.InsufficientLoyaltyPointsError;
    LoyaltyRedemptionBelowMinimumError = helpers.LoyaltyRedemptionBelowMinimumError;

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
      `INSERT INTO customers (id, first_name, loyalty_points) VALUES ('c1', 'Jane', 5000)`,
    );
  });

  describe("MIN_REDEMPTION_POINTS floor", () => {
    it("rejects a below-minimum redemption with an explicit error instead of silently applying it", async () => {
      await expect(
        applyLoyaltyPointsForSale({
          selectedCustomer: customer,
          canUseLoyaltyProgram: true,
          earnedPoints: 0,
          // 50 < MIN_REDEMPTION_POINTS (100), and the customer can easily
          // afford it - the floor is what rejects this, not the balance.
          redeemedOption: { id: "opt1", label: "₦50 off", pointsCost: 50, discountValue: 50 },
          saleId: "s1",
        }),
      ).rejects.toThrow(LoyaltyRedemptionBelowMinimumError);

      // Nothing written: the caller rolls the whole sale back on this throw.
      expect(points()).toBe(5000);
      expect(db.exec(`SELECT COUNT(*) FROM loyalty_transactions`)[0].values[0][0]).toBe(0);
    });

    it("names the minimum in the error message the cashier sees", async () => {
      await expect(
        applyLoyaltyPointsForSale({
          selectedCustomer: customer,
          canUseLoyaltyProgram: true,
          earnedPoints: 0,
          redeemedOption: { id: "opt1", label: "₦50 off", pointsCost: 50, discountValue: 50 },
          saleId: "s1",
        }),
      ).rejects.toThrow(/at least 100 points/);
    });

    it("applies a redemption at or above the minimum", async () => {
      await applyLoyaltyPointsForSale({
        selectedCustomer: customer,
        canUseLoyaltyProgram: true,
        earnedPoints: 0,
        redeemedOption: { id: "opt1", label: "₦500 off", pointsCost: 100, discountValue: 500 },
        saleId: "s1",
      });
      expect(points()).toBe(4900);
    });
  });

  describe("POINTS_EXPIRY_MONTHS (FIFO per-batch expiry over the dated ledger)", () => {
    it("refuses a redemption the balance only covers with points that have expired", async () => {
      // 5000-point balance, but every point of it was earned 14 months ago.
      db.run(`UPDATE customers SET loyalty_points = 500 WHERE id = 'c1'`);
      seedLedger([{ points: 500, type: "earned", created_at: monthsAgo(14) }]);

      await expect(
        applyLoyaltyPointsForSale({
          selectedCustomer: customer,
          canUseLoyaltyProgram: true,
          earnedPoints: 0,
          redeemedOption: { id: "opt1", label: "₦500 off", pointsCost: 500, discountValue: 500 },
          saleId: "s1",
        }),
      ).rejects.toThrow(InsufficientLoyaltyPointsError);
      expect(points()).toBe(500);
    });

    it("still allows a redemption backed by recently-earned points", async () => {
      db.run(`UPDATE customers SET loyalty_points = 500 WHERE id = 'c1'`);
      seedLedger([{ points: 500, type: "earned", created_at: monthsAgo(2) }]);

      await applyLoyaltyPointsForSale({
        selectedCustomer: customer,
        canUseLoyaltyProgram: true,
        earnedPoints: 0,
        redeemedOption: { id: "opt1", label: "₦500 off", pointsCost: 500, discountValue: 500 },
        saleId: "s1",
      });
      expect(points()).toBe(0);
    });

    it("materializes expiry into the balance and records a negative 'expired' ledger row", async () => {
      db.run(`UPDATE customers SET loyalty_points = 700 WHERE id = 'c1'`);
      seedLedger([
        { points: 500, type: "earned", created_at: monthsAgo(14) }, // stale
        { points: 200, type: "earned", created_at: monthsAgo(1) }, // fresh
      ]);

      await applyLoyaltyPointsForSale({
        selectedCustomer: customer,
        canUseLoyaltyProgram: true,
        earnedPoints: 10,
        redeemedOption: null,
        saleId: "s1",
      });

      // 700 - 500 expired + 10 earned.
      expect(points()).toBe(210);
      const expiredRows = db.exec(
        `SELECT points FROM loyalty_transactions WHERE type = 'expired'`,
      );
      expect(expiredRows[0].values).toEqual([[-500]]);
    });

    it("does not re-expire the same batch on a later sale (the 'expired' row consumes it)", async () => {
      db.run(`UPDATE customers SET loyalty_points = 700 WHERE id = 'c1'`);
      seedLedger([
        { points: 500, type: "earned", created_at: monthsAgo(14) },
        { points: 200, type: "earned", created_at: monthsAgo(1) },
      ]);

      await applyLoyaltyPointsForSale({
        selectedCustomer: customer,
        canUseLoyaltyProgram: true,
        earnedPoints: 10,
        redeemedOption: null,
        saleId: "s1",
      });
      await applyLoyaltyPointsForSale({
        selectedCustomer: customer,
        canUseLoyaltyProgram: true,
        earnedPoints: 10,
        redeemedOption: null,
        saleId: "s2",
      });

      expect(points()).toBe(220);
      expect(
        db.exec(`SELECT COUNT(*) FROM loyalty_transactions WHERE type = 'expired'`)[0]
          .values[0][0],
      ).toBe(1);
    });

    it("leaves an un-ledgered balance (imported/demo/manual) untouched — it can never expire", async () => {
      // 5000 points with zero ledger rows: nothing dates them, so nothing is
      // provably stale.
      await applyLoyaltyPointsForSale({
        selectedCustomer: customer,
        canUseLoyaltyProgram: true,
        earnedPoints: 10,
        redeemedOption: null,
        saleId: "s1",
      });
      expect(points()).toBe(5010);
      expect(
        db.exec(`SELECT COUNT(*) FROM loyalty_transactions WHERE type = 'expired'`)[0]
          .values[0][0],
      ).toBe(0);
    });
  });
});
