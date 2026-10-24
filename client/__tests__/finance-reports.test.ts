import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import {
  createFinanceReportsDb,
  resetFinanceReportsDb,
  todayISO,
  otherMonthISO,
  currentMonthWindow,
  firstDayOfMonthLocal,
  todayLocalMonth,
  todayLocalStartISO,
} from "./helpers/finance-reports-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

// Exercises the revenue/COGS/expense aggregation queries against a genuine in-memory SQLite engine (sql.js), not a mocked…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-finance-reports-test-ts-L9
describe("finance.ts / reports.ts financial aggregates", () => {
  let db: Database;
  let getCurrentMonthRevenue: typeof import("@/lib/db/queries/finance").getCurrentMonthRevenue;
  let getCurrentMonthCOGS: typeof import("@/lib/db/queries/finance").getCurrentMonthCOGS;
  let getCurrentMonthExpensesByCategory: typeof import("@/lib/db/queries/finance").getCurrentMonthExpensesByCategory;
  let getSmoothedExpensesTotal: typeof import("@/lib/db/queries/finance").getSmoothedExpensesTotal;
  let fetchProfitLossReportData: typeof import("@/lib/db/queries/reports").fetchProfitLossReportData;
  let getBIMetrics: typeof import("@/lib/db/queries/reports").getBIMetrics;
  let getAdvancedMonthlySalesData: typeof import("@/lib/db/queries/reports").getAdvancedMonthlySalesData;

  beforeAll(async () => {
    const finance = await import("@/lib/db/queries/finance");
    getCurrentMonthRevenue = finance.getCurrentMonthRevenue;
    getCurrentMonthCOGS = finance.getCurrentMonthCOGS;
    getCurrentMonthExpensesByCategory = finance.getCurrentMonthExpensesByCategory;
    getSmoothedExpensesTotal = finance.getSmoothedExpensesTotal;
    const reports = await import("@/lib/db/queries/reports");
    fetchProfitLossReportData = reports.fetchProfitLossReportData;
    getBIMetrics = reports.getBIMetrics;
    getAdvancedMonthlySalesData = reports.getAdvancedMonthlySalesData;
    db = await createFinanceReportsDb();
  });

  beforeEach(() => resetFinanceReportsDb(db));

  describe("getCurrentMonthRevenue / getCurrentMonthCOGS", () => {
    it("sums only this month's non-deleted sales for revenue, and their line items' cost for COGS", async () => {
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES
          ('s1', 'TXN-1', 10000, 10000, ?, 0),
          ('s2', 'TXN-2', 5000, 5000, ?, 0)`,
        [todayISO(), otherMonthISO()],
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES
          ('si1', 's1', 'prod1', 4, 1000, 4000, 500)`,
      );

      const window = currentMonthWindow();
      expect(await getCurrentMonthRevenue(window)).toBe(10000);
      expect(await getCurrentMonthCOGS(window)).toBe(2000); // 4 * 500, s2 excluded (wrong month)
    });

    it("excludes soft-deleted sales from revenue", async () => {
      db.run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 10000, 10000, ?, 1)`, [
        todayISO(),
      ]);

      expect(await getCurrentMonthRevenue(currentMonthWindow())).toBe(0);
    });

    it("returns 0, not null, when there are no sales this month", async () => {
      const window = currentMonthWindow();
      expect(await getCurrentMonthRevenue(window)).toBe(0);
      expect(await getCurrentMonthCOGS(window)).toBe(0);
    });
  });

  describe("date-only expenses.date vs. full ISO timestamp window bounds (High bug fix)", () => {
    it("getSmoothedExpensesTotal includes an expense dated exactly on the window's first day", async () => {
      // expenses.date is stored as a bare "YYYY-MM-DD" (see add-expense-
      // dialog.tsx), but the window bounds passed in are full ISO
      // timestamps (toISOString()) - a plain string compare made
      // '2026-01-01' >= '2026-01-01T00:00:00.000Z' false, silently
      // excluding this expense.
      const window = currentMonthWindow();
      const firstDayOfMonth = firstDayOfMonthLocal();
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES ('e1', 'Rent', 15000, ?, 0)`,
        [firstDayOfMonth],
      );

      expect(await getSmoothedExpensesTotal(window)).toBe(15000);
    });

    it("getCurrentMonthExpensesByCategory includes an expense dated exactly on the window's first day", async () => {
      const window = currentMonthWindow();
      const firstDayOfMonth = firstDayOfMonthLocal();
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES ('e1', 'Rent', 15000, ?, 0)`,
        [firstDayOfMonth],
      );

      const rows = await getCurrentMonthExpensesByCategory(window);
      expect(rows.find((r) => r.category === "Rent")?.total).toBe(15000);
    });

    it("fetchProfitLossReportData includes an expense dated exactly on dateFrom", async () => {
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 10000, 10000, '2026-03-15', 0)`,
      );
      // Bare date, matching dateFrom exactly - dateFrom passed to
      // fetchProfitLossReportData below is also a bare date string here
      // (as the report filter UI supplies), but expenses.date must still
      // be compared correctly regardless of which form either side takes.
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES ('e1', 'Rent', 5000, '2026-03-01', 0)`,
      );

      const rows = await fetchProfitLossReportData("2026-03-01", "2026-03-31");
      const march = rows.find((r) => r["Month"] === "2026-03");

      expect(march?.["Expenses"]).toBe("5000.00");
    });
  });

  // Medium bug fix: strftime('%Y-%m', transaction_date)/(created_at) with no
  // 'localtime' modifier bucketed by UTC month, disagreeing with the
  // dashboard/daily-close (which bucket by local time). This test suite
  // itself runs in Africa/Lagos (UTC+1, confirmed via the sandbox's system
  // timezone), so a sale timestamped just before UTC midnight on a
  // month-end already lands in the next local month, distinguishing the
  // fix from the old behavior without needing to force TZ.
  describe("report month-bucketing uses local time, not UTC (Medium bug fix)", () => {
    it("fetchProfitLossReportData buckets a late-local-evening, month-crossing sale into the local month", async () => {
      // 2026-01-31T23:30:00Z is local 2026-02-01T00:30 in Lagos (UTC+1) -
      // genuinely February locally, though still January in UTC.
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 10000, 10000, '2026-01-31T23:30:00.000Z', 0)`,
      );

      const rows = await fetchProfitLossReportData("2026-01-01", "2026-02-28");
      const jan = rows.find((r) => r["Month"] === "2026-01");
      const feb = rows.find((r) => r["Month"] === "2026-02");

      expect(feb?.Revenue).toBe("10000.00");
      expect(jan).toBeUndefined();
    });

    it("getAdvancedMonthlySalesData buckets the same sale into the local month", async () => {
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 10000, 10000, '2026-01-31T23:30:00.000Z', 0)`,
      );

      const { rawMonthlyData } = await getAdvancedMonthlySalesData("2026-01-01T00:00:00.000Z");
      const feb = rawMonthlyData.find((r) => r.month === "2026-02");

      expect(feb?.revenue).toBe(10000);
    });
  });

  describe("returned-item COGS uses the sale-time cost, not current stock cost (High bug fix)", () => {
    // Captured once per test and reused for both the inserted row and the
    // query's lower bound - calling todayISO() separately at insert time and
    // query time can straddle a millisecond boundary under load, making the
    // ">=" bound flakily exclude the very row just inserted.
    it("getBIMetrics.returnedCogsData reflects sale_items.cost_price even after the product's active batch cost changed", async () => {
      const now = todayISO();
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 4000, 4000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES ('si1', 's1', 'prod1', 4, 1000, 4000, 500)`,
      );
      // Cost basis changed after the sale - a stale-average-based query
      // would use this 800 instead of the 500 actually recorded at sale time.
      db.run(
        `INSERT INTO stock_batches (id, product_id, quantity, cost_price, is_active, _deleted) VALUES ('b1', 'prod1', 10, 800, 1, 0)`,
      );
      db.run(
        `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted) VALUES ('r1', 's1', 'u1', 2000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO return_items (id, return_id, product_id, quantity, unit_price, subtotal) VALUES ('ri1', 'r1', 'prod1', 2, 1000, 2000)`,
      );

      const { returnedCogsData } = await getBIMetrics(now, otherMonthISO());
      expect(returnedCogsData[0]?.total).toBe(1000); // 2 * 500 (sale-time cost), not 2 * 800
    });

    it("getBIMetrics.returnedCogsData is 0, not silently dropped, once the product has no active batches left", async () => {
      const now = todayISO();
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 4000, 4000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES ('si1', 's1', 'prod1', 4, 1000, 4000, 500)`,
      );
      // No stock_batches row at all for prod1 - an average-over-active-
      // batches query would IFNULL this to 0, overstating profit.
      db.run(
        `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted) VALUES ('r1', 's1', 'u1', 2000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO return_items (id, return_id, product_id, quantity, unit_price, subtotal) VALUES ('ri1', 'r1', 'prod1', 2, 1000, 2000)`,
      );

      const { returnedCogsData } = await getBIMetrics(now, otherMonthISO());
      expect(returnedCogsData[0]?.total).toBe(1000); // 2 * 500, still uses the recorded sale cost
    });

    it("getAdvancedMonthlySalesData.rawMonthlyReturns uses the same sale-time cost, and doesn't fan total_refunded out across the return's line items", async () => {
      const now = todayLocalStartISO();
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 5000, 5000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES
          ('si1', 's1', 'prod1', 4, 1000, 4000, 500),
          ('si2', 's1', 'prod2', 1, 1000, 1000, 700)`,
      );
      db.run(
        `INSERT INTO stock_batches (id, product_id, quantity, cost_price, is_active, _deleted) VALUES ('b1', 'prod1', 10, 800, 1, 0)`,
      );
      db.run(
        `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted) VALUES ('r1', 's1', 'u1', 3000, ?, 0)`,
        [now],
      );
      // TWO line items on one return: SUM(r.total_refunded) in the same query
      // as a return_items join would fan the returns row out and report
      // 2 * 3000 = 6000 refunded (a Critical bug this fixture now covers -
      // the old single-line-item fixture couldn't see it).
      db.run(
        `INSERT INTO return_items (id, return_id, product_id, quantity, unit_price, subtotal) VALUES
          ('ri1', 'r1', 'prod1', 2, 1000, 2000),
          ('ri2', 'r1', 'prod2', 1, 1000, 1000)`,
      );

      const { rawMonthlyReturns } = await getAdvancedMonthlySalesData(otherMonthISO());
      const thisMonth = rawMonthlyReturns.find((r) => r.month === todayLocalMonth());
      // 2 * 500 (prod1, sale-time cost) + 1 * 700 (prod2).
      expect(thisMonth?.returned_cogs).toBe(1700);
      // The return's own total, once - not once per returned line item.
      expect(thisMonth?.refunds).toBe(3000);
    });

    it("getBIMetrics.returnedCogsData doesn't fan out when a sale has two sale_items rows for the same product", async () => {
      // A prescription dispense (one sale_items row per instruction line) or
      // an online-order fulfillment can legitimately produce >1 sale_items
      // row for the same product within one sale - a plain join on
      // (sale_id, product_id) would multiply the return_items row across
      // both and overcount. The correct total uses the quantity-weighted
      // average cost across both rows.
      const now = todayISO();
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 4000, 4000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES
          ('si1', 's1', 'prod1', 2, 1000, 2000, 400),
          ('si2', 's1', 'prod1', 2, 1000, 2000, 600)`,
      );
      db.run(
        `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted) VALUES ('r1', 's1', 'u1', 2000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO return_items (id, return_id, product_id, quantity, unit_price, subtotal) VALUES ('ri1', 'r1', 'prod1', 2, 1000, 2000)`,
      );

      const { returnedCogsData } = await getBIMetrics(now, otherMonthISO());
      // Weighted-average cost across the two sale_items rows is
      // (2*400 + 2*600) / 4 = 500, so 2 returned units cost 1000 - not
      // double-counted across both matching rows (which would give 2000).
      expect(returnedCogsData[0]?.total).toBe(1000);
    });
  });
});
