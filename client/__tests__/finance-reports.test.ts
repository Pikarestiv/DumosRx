import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises the revenue/COGS/expense aggregation queries against a genuine
 * in-memory SQLite engine (sql.js), not a mocked query(). These are the
 * numbers that feed the P&L report and dashboard, so a silent aggregation
 * bug here (wrong join, wrong sign, wrong date filter) is exactly the class
 * of bug that showed 0s in the suppliers table without ever throwing.
 */
describe("finance.ts / reports.ts financial aggregates", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let getCurrentMonthRevenue: typeof import("@/lib/db/queries/finance").getCurrentMonthRevenue;
  let getCurrentMonthCOGS: typeof import("@/lib/db/queries/finance").getCurrentMonthCOGS;
  let getCurrentMonthExpensesByCategory: typeof import("@/lib/db/queries/finance").getCurrentMonthExpensesByCategory;
  let getSmoothedExpensesTotal: typeof import("@/lib/db/queries/finance").getSmoothedExpensesTotal;
  let getAllExpenses: typeof import("@/lib/db/queries/finance").getAllExpenses;
  let fetchProfitLossReportData: typeof import("@/lib/db/queries/reports").fetchProfitLossReportData;
  let getBIMetrics: typeof import("@/lib/db/queries/reports").getBIMetrics;
  let getAdvancedMonthlySalesData: typeof import("@/lib/db/queries/reports").getAdvancedMonthlySalesData;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const finance = await import("@/lib/db/queries/finance");
    getCurrentMonthRevenue = finance.getCurrentMonthRevenue;
    getCurrentMonthCOGS = finance.getCurrentMonthCOGS;
    getCurrentMonthExpensesByCategory = finance.getCurrentMonthExpensesByCategory;
    getSmoothedExpensesTotal = finance.getSmoothedExpensesTotal;
    getAllExpenses = finance.getAllExpenses;

    const reports = await import("@/lib/db/queries/reports");
    fetchProfitLossReportData = reports.fetchProfitLossReportData;
    getBIMetrics = reports.getBIMetrics;
    getAdvancedMonthlySalesData = reports.getAdvancedMonthlySalesData;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(
      `DELETE FROM sales; DELETE FROM sale_items; DELETE FROM expenses; DELETE FROM users;
       DELETE FROM returns; DELETE FROM return_items; DELETE FROM stock_batches;`,
    );
  });

  const todayISO = () => new Date().toISOString();
  const otherMonthISO = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return d.toISOString();
  };
  // getCurrentMonthRevenue/getCurrentMonthCOGS take an explicit local-timezone
  // window rather than relying on SQLite's UTC-based strftime('now'), matching
  // how use-finance-data.ts derives it.
  const currentMonthWindow = () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    return { from, to };
  };

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
      const firstDayOfMonth = window.from.slice(0, 10); // "YYYY-MM-DD"
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES ('e1', 'Rent', 15000, ?, 0)`,
        [firstDayOfMonth],
      );

      expect(await getSmoothedExpensesTotal(window)).toBe(15000);
    });

    it("getCurrentMonthExpensesByCategory includes an expense dated exactly on the window's first day", async () => {
      const window = currentMonthWindow();
      const firstDayOfMonth = window.from.slice(0, 10);
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

      expect(march!["Expenses"]).toBe("5000.00");
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

    it("getAdvancedMonthlySalesData.rawMonthlyReturns uses the same sale-time cost", async () => {
      const now = todayISO();
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 4000, 4000, ?, 0)`,
        [now],
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES ('si1', 's1', 'prod1', 4, 1000, 4000, 500)`,
      );
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

      const { rawMonthlyReturns } = await getAdvancedMonthlySalesData(otherMonthISO());
      const thisMonth = rawMonthlyReturns.find((r) => r.month === now.slice(0, 7));
      expect(thisMonth?.returned_cogs).toBe(1000);
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

  describe("getCurrentMonthExpensesByCategory", () => {
    it("groups this month's expenses by category, excluding other months", async () => {
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES
          ('e1', 'Rent', 20000, ?, 0),
          ('e2', 'Rent', 5000, ?, 0),
          ('e3', 'Utilities', 3000, ?, 0),
          ('e4', 'Rent', 99999, ?, 0)`,
        [todayISO(), todayISO(), todayISO(), otherMonthISO()],
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
        [todayISO(), todayISO()],
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

  describe("getAllExpenses", () => {
    it("restricts to a single user's expenses when viewerId is passed, joins their display name", async () => {
      db.run(`INSERT INTO users (id, first_name, last_name) VALUES ('u1', 'Ada', 'Obi'), ('u2', 'Bo', 'Lee')`);
      db.run(
        `INSERT INTO expenses (id, category, amount, date, user_id, _deleted) VALUES
          ('e1', 'Rent', 1000, ?, 'u1', 0),
          ('e2', 'Rent', 2000, ?, 'u2', 0)`,
        [todayISO(), todayISO()],
      );

      const mine = await getAllExpenses("u1");
      expect(mine).toHaveLength(1);
      expect(mine[0]).toMatchObject({ id: "e1", recorded_by_name: "Ada Obi" });

      const everyone = await getAllExpenses(undefined);
      expect(everyone).toHaveLength(2);
    });
  });

  describe("fetchProfitLossReportData", () => {
    it("computes gross profit, net profit, and margin correctly per month", async () => {
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 100000, 100000, '2026-03-15', 0)`,
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES ('si1', 's1', 'prod1', 10, 10000, 100000, 4000)`, // COGS = 40000
      );
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES ('e1', 'Rent', 20000, '2026-03-05', 0)`,
      );

      const rows = await fetchProfitLossReportData("2026-01-01", "2026-12-31");
      const march = rows.find((r) => r["Month"] === "2026-03");

      expect(march).toBeDefined();
      expect(march!["Revenue"]).toBe("100000.00");
      expect(march!["COGS"]).toBe("40000.00");
      expect(march!["Gross Profit"]).toBe("60000.00"); // 100000 - 40000
      expect(march!["Expenses"]).toBe("20000.00");
      expect(march!["Net Profit"]).toBe("40000.00"); // 60000 - 20000
      expect(march!["Margin %"]).toBe("40.0%"); // 40000 / 100000
    });

    it("does not multiply a sale's revenue by its number of line items", async () => {
      // Regression coverage for a Critical bug (docs/KNOWN_BUGS.md): revenue
      // used to be SUM(s.total_amount) in the same query as a LEFT JOIN to
      // sale_items, which fans a sale out once per line item and triples
      // this sale's revenue since it has 3 items.
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 30000, 30000, '2026-05-15', 0)`,
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES
          ('si1', 's1', 'prod1', 1, 10000, 10000, 4000),
          ('si2', 's1', 'prod2', 1, 10000, 10000, 3000),
          ('si3', 's1', 'prod3', 1, 10000, 10000, 2000)`,
      );

      const rows = await fetchProfitLossReportData("2026-01-01", "2026-12-31");
      const may = rows.find((r) => r["Month"] === "2026-05");

      expect(may).toBeDefined();
      // Not 90000.00 (30000 * 3 items) - the actual sale total, once.
      expect(may!["Revenue"]).toBe("30000.00");
      // COGS legitimately sums across all 3 line items: 4000+3000+2000.
      expect(may!["COGS"]).toBe("9000.00");
      expect(may!["Gross Profit"]).toBe("21000.00");
    });

    it("defaults expenses to 0 for a month that has sales but no recorded expenses", async () => {
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 50000, 50000, '2026-04-01', 0)`,
      );

      const rows = await fetchProfitLossReportData("2026-01-01", "2026-12-31");
      const april = rows.find((r) => r["Month"] === "2026-04");

      expect(april!["Expenses"]).toBe("0.00");
      expect(april!["Net Profit"]).toBe("50000.00");
    });

    it("respects the dateFrom/dateTo filters", async () => {
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES
          ('s1', 'TXN-1', 1000, 1000, '2025-01-01', 0),
          ('s2', 'TXN-2', 2000, 2000, '2026-06-01', 0)`,
      );

      const rows = await fetchProfitLossReportData("2026-01-01", "2026-12-31");

      expect(rows.map((r) => r["Month"])).toEqual(["2026-06"]);
    });
  });
});
