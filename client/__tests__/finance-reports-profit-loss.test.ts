import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import type { Database } from "sql.js";
import {
  createFinanceReportsDb,
  resetFinanceReportsDb,
} from "./helpers/finance-reports-db";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

describe("reports.ts fetchProfitLossReportData", () => {
  let db: Database;
  let fetchProfitLossReportData: typeof import("@/lib/db/queries/reports").fetchProfitLossReportData;

  beforeAll(async () => {
    const reports = await import("@/lib/db/queries/reports");
    fetchProfitLossReportData = reports.fetchProfitLossReportData;
    db = await createFinanceReportsDb();
  });

  beforeEach(() => resetFinanceReportsDb(db));

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
      expect(march?.["Revenue"]).toBe("100000.00");
      expect(march?.["COGS"]).toBe("40000.00");
      expect(march?.["Gross Profit"]).toBe("60000.00"); // 100000 - 40000
      expect(march?.["Expenses"]).toBe("20000.00");
      expect(march?.["Net Profit"]).toBe("40000.00"); // 60000 - 20000
      expect(march?.["Margin %"]).toBe("40.0%"); // 40000 / 100000
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
      expect(may?.["Revenue"]).toBe("30000.00");
      // COGS legitimately sums across all 3 line items: 4000+3000+2000.
      expect(may?.["COGS"]).toBe("9000.00");
      expect(may?.["Gross Profit"]).toBe("21000.00");
    });

    it("defaults expenses to 0 for a month that has sales but no recorded expenses", async () => {
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 50000, 50000, '2026-04-01', 0)`,
      );

      const rows = await fetchProfitLossReportData("2026-01-01", "2026-12-31");
      const april = rows.find((r) => r["Month"] === "2026-04");

      expect(april?.["Expenses"]).toBe("0.00");
      expect(april?.["Net Profit"]).toBe("50000.00");
    });

    it("amortizes a prepaid expense across its covers_months instead of charging the whole lump sum to one month", async () => {
      // High bug fix: the P&L summed raw expenses.amount per month while the
      // BI dashboard already smoothed prepaid expenses via
      // getSmoothedExpensesTotal, so a month that merely happened to contain
      // the annual rent payment looked catastrophically unprofitable and the
      // two surfaces disagreed for the same period.
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 100000, 100000, '2026-03-15', 0)`,
      );
      db.run(
        `INSERT INTO expenses (id, category, amount, date, covers_months, _deleted) VALUES ('e1', 'Rent', 120000, '2026-03-01', 12, 0)`,
      );

      const rows = await fetchProfitLossReportData("2026-01-01", "2026-12-31");
      const march = rows.find((r) => r["Month"] === "2026-03");

      // 120000 / 12, not the raw 120000.
      expect(march?.["Expenses"]).toBe("10000.00");
      expect(march?.["Net Profit"]).toBe("90000.00"); // 100000 revenue - 10000
      // ...and the later installments land in their own months, which have no
      // sales at all - they must still be emitted (see the expense-only month
      // test below).
      expect(rows.find((r) => r["Month"] === "2026-06")?.["Expenses"]).toBe("10000.00");
    });

    it("emits a month that has expenses but no sales at all", async () => {
      // High bug fix: the report was built by mapping over revenue rows, so an
      // expense-only month simply vanished from the P&L.
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 100000, 100000, '2026-03-15', 0)`,
      );
      db.run(
        `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES ('e1', 'Rent', 20000, '2026-07-05', 0)`,
      );

      const rows = await fetchProfitLossReportData("2026-01-01", "2026-12-31");
      const july = rows.find((r) => r["Month"] === "2026-07");

      expect(july).toBeDefined();
      expect(july?.["Revenue"]).toBe("0.00");
      expect(july?.["COGS"]).toBe("0.00");
      expect(july?.["Expenses"]).toBe("20000.00");
      expect(july?.["Net Profit"]).toBe("-20000.00");
    });

    it("nets refunds out of Revenue and returned items' cost out of COGS", async () => {
      // High bug fix: the exported P&L reported GROSS revenue/COGS while every
      // other revenue surface (useBIData, getCurrentMonthRevenue) nets refunds.
      db.run(
        `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted) VALUES ('s1', 'TXN-1', 100000, 100000, '2026-03-15', 0)`,
      );
      db.run(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, total_price, cost_price) VALUES ('si1', 's1', 'prod1', 10, 10000, 100000, 4000)`,
      );
      db.run(
        `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, _deleted) VALUES ('r1', 's1', 'u1', 20000, '2026-03-20T10:00:00.000Z', 0)`,
      );
      db.run(
        `INSERT INTO return_items (id, return_id, product_id, quantity, unit_price, subtotal) VALUES ('ri1', 'r1', 'prod1', 2, 10000, 20000)`,
      );

      const rows = await fetchProfitLossReportData("2026-01-01", "2026-12-31");
      const march = rows.find((r) => r["Month"] === "2026-03");

      expect(march?.["Revenue"]).toBe("80000.00"); // 100000 - 20000 refunded
      expect(march?.["COGS"]).toBe("32000.00"); // 40000 - 2 * 4000 returned
      expect(march?.["Gross Profit"]).toBe("48000.00");
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
