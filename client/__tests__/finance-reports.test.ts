import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import initSqlJs, { type Database } from "sql.js";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

/**
 * Exercises the revenue/COGS/expense aggregation queries against a genuine
 * in-memory SQLite engine (sql.js), not a mocked query() — these are the
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
  let getAllExpenses: typeof import("@/lib/db/queries/finance").getAllExpenses;
  let fetchProfitLossReportData: typeof import("@/lib/db/queries/reports").fetchProfitLossReportData;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    const finance = await import("@/lib/db/queries/finance");
    getCurrentMonthRevenue = finance.getCurrentMonthRevenue;
    getCurrentMonthCOGS = finance.getCurrentMonthCOGS;
    getCurrentMonthExpensesByCategory = finance.getCurrentMonthExpensesByCategory;
    getAllExpenses = finance.getAllExpenses;

    const reports = await import("@/lib/db/queries/reports");
    fetchProfitLossReportData = reports.fetchProfitLossReportData;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM sale_items; DELETE FROM expenses; DELETE FROM users;`);
  });

  // strftime('now') is used by the "current month" queries, so fixtures use
  // today's date rather than a fixed string.
  const todayISO = () => new Date().toISOString();
  const otherMonthISO = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 2);
    return d.toISOString();
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

      expect(await getCurrentMonthRevenue()).toBe(10000);
      expect(await getCurrentMonthCOGS()).toBe(2000); // 4 * 500, s2 excluded (wrong month)
    });

    it("excludes soft-deleted sales from revenue", async () => {
      db.run(`INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 10000, 10000, ?, 1)`, [
        todayISO(),
      ]);

      expect(await getCurrentMonthRevenue()).toBe(0);
    });

    it("returns 0, not null, when there are no sales this month", async () => {
      expect(await getCurrentMonthRevenue()).toBe(0);
      expect(await getCurrentMonthCOGS()).toBe(0);
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

      const rows = await getCurrentMonthExpensesByCategory();
      const byCategory = Object.fromEntries(rows.map((r) => [r.category, r.total]));

      expect(byCategory["Rent"]).toBe(25000);
      expect(byCategory["Utilities"]).toBe(3000);
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
