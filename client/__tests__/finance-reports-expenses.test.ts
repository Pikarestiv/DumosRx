import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import type { Database } from "sql.js";
import {
  createFinanceReportsDb,
  resetFinanceReportsDb,
  todayISO,
  otherMonthISO,
  currentMonthWindow,
  todayLocal,
  todayLocalMonth,
  todayLocalStartISO,
} from "./helpers/finance-reports-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("finance.ts expense and stock-loss aggregates", () => {
  let db: Database;
  let getCurrentMonthExpensesByCategory: typeof import("@/lib/db/queries/finance").getCurrentMonthExpensesByCategory;
  let getSmoothedExpensesTotal: typeof import("@/lib/db/queries/finance").getSmoothedExpensesTotal;
  let getExpensesPage: typeof import("@/lib/db/queries/finance").getExpensesPage;
  let getStockLossTotal: typeof import("@/lib/db/queries/finance").getStockLossTotal;
  let getAdvancedMonthlySalesData: typeof import("@/lib/db/queries/reports").getAdvancedMonthlySalesData;

  beforeAll(async () => {
    const finance = await import("@/lib/db/queries/finance");
    getCurrentMonthExpensesByCategory = finance.getCurrentMonthExpensesByCategory;
    getSmoothedExpensesTotal = finance.getSmoothedExpensesTotal;
    getExpensesPage = finance.getExpensesPage;
    getStockLossTotal = finance.getStockLossTotal;
    const reports = await import("@/lib/db/queries/reports");
    getAdvancedMonthlySalesData = reports.getAdvancedMonthlySalesData;
    db = await createFinanceReportsDb();
  });

  beforeEach(() => resetFinanceReportsDb(db));

  describe("getSmoothedAmountInWindow (prepaid amortization overlap/UTC fixes)", () => {
    it("attributes the full installment to a calendar-month window that fully contains it", async () => {
      const { getSmoothedAmountInWindow } = await import("@/lib/db/queries/finance");
      const expense = { amount: 120000, date: "2026-01-15", covers_months: 12 };

      const jan = getSmoothedAmountInWindow(
        expense,
        new Date(2026, 0, 1),
        new Date(2026, 1, 1),
      );
      expect(jan).toBeCloseTo(10000, 5); // 120000 / 12

      const feb = getSmoothedAmountInWindow(
        expense,
        new Date(2026, 1, 1),
        new Date(2026, 2, 1),
      );
      expect(feb).toBeCloseTo(10000, 5);
    });

    it("prorates instead of double-counting when a rolling window straddles two installment months", async () => {
      const { getSmoothedAmountInWindow } = await import("@/lib/db/queries/finance");
      const expense = { amount: 120000, date: "2026-01-01", covers_months: 12 };

      // A 30-day window entirely inside January should sum to ~1 month's
      // installment, never 2x it just because a later/earlier bucket's month
      // is merely touched.
      const rollingWindow = getSmoothedAmountInWindow(
        expense,
        new Date(2026, 0, 5),
        new Date(2026, 1, 4), // 30 days later, spills into February
      );
      // Bounded strictly below 2 full installments (the old overlap-based
      // bug would return ~20000, double the correct ~1-installment amount).
      expect(rollingWindow).toBeLessThan(15000);
      expect(rollingWindow).toBeGreaterThan(9000);
    });

    it("sums to exactly the original amount when a window spans the full covers_months range", async () => {
      const { getSmoothedAmountInWindow } = await import("@/lib/db/queries/finance");
      const expense = { amount: 120000, date: "2026-01-01", covers_months: 12 };

      const full = getSmoothedAmountInWindow(
        expense,
        new Date(2025, 11, 1),
        new Date(2027, 1, 1),
      );
      expect(full).toBeCloseTo(120000, 5);
    });

    it("parses a bare YYYY-MM-DD expense date as local time, not UTC midnight", async () => {
      const { getSmoothedAmountInWindow } = await import("@/lib/db/queries/finance");
      // A non-amortized expense dated the 1st of the month must count toward
      // that local calendar month's window even in a negative-UTC timezone,
      // where `new Date("2026-01-01")` (UTC midnight) would fall on
      // 2025-12-31 local and be excluded from the January window.
      const expense = { amount: 5000, date: "2026-01-01", covers_months: null };

      const jan = getSmoothedAmountInWindow(
        expense,
        new Date(2026, 0, 1),
        new Date(2026, 1, 1),
      );
      expect(jan).toBe(5000);
    });
  });

  describe("fixture dates stay on the local calendar day (A-121)", () => {
    const boundaryInstant = new Date("2026-09-30T23:11:00.000Z");

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(boundaryInstant);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("names the local calendar day even when UTC is still on the previous month", () => {
      expect(todayISO().slice(0, 10)).toBe("2026-09-30");
      expect(todayLocal()).toBe("2026-10-01");
      expect(todayLocalMonth()).toBe("2026-10");
      expect(todayLocalStartISO()).toBe("2026-09-30T23:00:00.000Z");
    });

    it("keeps a today-dated expense inside currentMonthWindow at that clock position", async () => {
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES ('e1', 'Rent', 20000, ?, 0)`,
        [todayLocal()],
      );

      const rows = await getCurrentMonthExpensesByCategory(currentMonthWindow());
      expect(rows.find((r) => r.category === "Rent")?.total).toBe(20000);
    });

    it("keeps a today-dated return in the local month bucket at that clock position", async () => {
      const now = todayLocalStartISO();
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 4000, 4000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES ('si1', 's1', 'prod1', 4, 1000, 4000, 500)`,
      );
      db.run(
        `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted) VALUES ('r1', 's1', 'u1', 2000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO return_items (id, return_id, product_id, quantity, unit_price, subtotal) VALUES ('ri1', 'r1', 'prod1', 2, 1000, 2000)`,
      );

      const { rawMonthlyReturns } = await getAdvancedMonthlySalesData("2026-08-01T00:00:00.000Z");
      expect(rawMonthlyReturns.find((r) => r.month === todayLocalMonth())?.refunds).toBe(2000);
    });
  });

  describe("getCurrentMonthExpensesByCategory", () => {
    it("groups this month's expenses by category, excluding other months", async () => {
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES
          ('e1', 'Rent', 20000, ?, 0),
          ('e2', 'Rent', 5000, ?, 0),
          ('e3', 'Utilities', 3000, ?, 0),
          ('e4', 'Rent', 99999, ?, 0)`,
        [todayLocal(), todayLocal(), todayLocal(), otherMonthISO()],
      );

      const rows = await getCurrentMonthExpensesByCategory(currentMonthWindow());
      const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.total]));

      expect(byCategory["Rent"]).toBe(25000);
      expect(byCategory["Utilities"]).toBe(3000);
    });

    it("smooths a prepaid expense's category the same way the headline total is smoothed, so they sum together", async () => {
      // A 12-month prepaid rent logged today contributes only 1/12th to this
      // month's category breakdown, matching getSmoothedExpensesTotal's math
      // for the same row — otherwise the breakdown wouldn't sum to the P&L
      // report's headline expense total.
      db.run(
        `INSERT INTO expenses (id, category, amount, date, covers_months, _deleted) VALUES
          ('e1', 'Rent', 120000, ?, 12, 0),
          ('e2', 'Utilities', 3000, ?, NULL, 0)`,
        [todayLocal(), todayLocal()],
      );

      const window = currentMonthWindow();
      const rows = await getCurrentMonthExpensesByCategory(window);
      const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.total]));

      expect(byCategory["Rent"]).toBeCloseTo(10000, 5); // 120000 / 12
      expect(byCategory["Utilities"]).toBe(3000);

      const smoothedTotal = byCategory["Rent"] + byCategory["Utilities"];
      const headlineTotal = await getSmoothedExpensesTotal(window);
      expect(smoothedTotal).toBeCloseTo(headlineTotal, 5);
    });
  });

  describe("getExpensesPage", () => {
    it("restricts to a single user's expenses when viewerId is passed, joins their display name", async () => {
      db.run(`INSERT INTO users (id, first_name, last_name) VALUES ('u1', 'Ada', 'Obi'), ('u2', 'Bo', 'Lee')`);
      db.run(
        `INSERT INTO expenses (id, category, amount, date, user_id, _deleted) VALUES
          ('e1', 'Rent', 1000, ?, 'u1', 0),
          ('e2', 'Rent', 2000, ?, 'u2', 0)`,
        [todayISO(), todayISO()],
      );

      const mine = await getExpensesPage({ viewerId: "u1" });
      expect(mine.rows).toHaveLength(1);
      expect(mine.rows[0]).toMatchObject({ id: "e1", recorded_by_name: "Ada Obi" });

      const everyone = await getExpensesPage();
      expect(everyone.rows).toHaveLength(2);
    });
  });

  describe("getStockLossTotal", () => {
    const insertAdjustment = (
      id: string,
      reason: string,
      quantity: number,
      unitCost: number,
      movementDate = "2026-06-10T10:00:00.000Z",
    ) => {
      db.run(
        `INSERT INTO stock_movements (id, product_id, movement_type, quantity, unit_cost, reason, movement_date, _deleted)
         VALUES (?, 'prod1', 'adjustment', ?, ?, ?, ?, 0)`,
        [id, quantity, unitCost, reason, movementDate],
      );
    };

    const JUNE = { from: "2026-06-01T00:00:00.000Z", to: "2026-06-30T23:59:59.999Z" };

    it("values damage and loss adjustments at their unit cost and sums them", async () => {
      insertAdjustment("m1", "Damage", -3, 500);
      insertAdjustment("m2", "Loss", -2, 1500);

      expect(await getStockLossTotal(JUNE)).toBe(4500); // 3*500 + 2*1500
    });

    it("counts a damage or loss reason that carries a free-text note", async () => {
      insertAdjustment("m1", "Damage — crushed in transit", -4, 250);

      expect(await getStockLossTotal(JUNE)).toBe(1000);
    });

    it("ignores receive_items and inventory_count adjustments", async () => {
      insertAdjustment("m1", "Receive items", 10, 500);
      insertAdjustment("m2", "Inventory count", -6, 500);
      insertAdjustment("m3", "Damage", -1, 500);

      expect(await getStockLossTotal(JUNE)).toBe(500);
    });

    it("excludes movements outside the window and soft-deleted ones", async () => {
      insertAdjustment("m1", "Damage", -3, 500, "2026-05-31T23:00:00.000Z");
      insertAdjustment("m2", "Loss", -3, 500, "2026-07-01T00:00:00.000Z");
      db.run(
        `INSERT INTO stock_movements (id, product_id, movement_type, quantity, unit_cost, reason, movement_date, _deleted)
         VALUES ('m3', 'prod1', 'adjustment', -3, 500, 'Damage', '2026-06-10T10:00:00.000Z', 1)`,
      );

      expect(await getStockLossTotal(JUNE)).toBe(0);
    });

    it("returns 0, not null, when nothing was written off", async () => {
      expect(await getStockLossTotal(JUNE)).toBe(0);
    });
  });
});
