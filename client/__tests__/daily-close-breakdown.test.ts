import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import {
  buildNetCashBreakdown,
  buildProfitBreakdown,
  type FigureBreakdown,
} from "@/lib/utils/daily-close-breakdown";

vi.mock("idb-keyval", () => ({
  get: vi.fn(() => Promise.resolve(undefined)),
  set: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));

const sumOfLines = (breakdown: FigureBreakdown) =>
  breakdown.lines.reduce((sum, line) => sum + line.amount, 0);

describe("daily close figure breakdowns", () => {
  it("nets cash refunds and cash expenses off cash sales", () => {
    const breakdown = buildNetCashBreakdown({
      cashSales: 1000.1,
      cashRefunds: 200.2,
      cashExpenses: 50.05,
      reportDate: "2026-10-23",
    });
    expect(breakdown.lines.map((l) => l.amount)).toEqual([1000.1, -200.2, -50.05]);
    expect(breakdown.total).toBe(sumOfLines(breakdown));
  });

  it("links the expenses line to the report day", () => {
    const breakdown = buildNetCashBreakdown({
      cashSales: 0,
      cashRefunds: 0,
      cashExpenses: 10,
      reportDate: "2026-10-23",
    });
    expect(breakdown.lines[2].href).toBe("/expenses?from=2026-10-23&to=2026-10-23");
  });

  it("derives profit from sales, refunds, tax, cost of goods and reseller payouts", () => {
    const breakdown = buildProfitBreakdown({
      grossSales: 900.3,
      refunds: 100.1,
      tax: 30.03,
      costOfGoods: 400.7,
      resellerPayouts: 20.2,
    });
    expect(breakdown.lines.map((l) => l.amount)).toEqual([900.3, -100.1, -30.03, -400.7, -20.2]);
    expect(breakdown.total).toBe(sumOfLines(breakdown));
  });

  it("leaves out the reseller payout line on a day with none", () => {
    const breakdown = buildProfitBreakdown({
      grossSales: 100,
      refunds: 0,
      tax: 0,
      costOfGoods: 60,
      resellerPayouts: 0,
    });
    expect(breakdown.lines).toHaveLength(4);
    expect(breakdown.total).toBe(40);
  });
});

describe("useDailyCloseData breakdowns", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let useDailyCloseData: typeof import("@/lib/hooks/use-daily-close-data").useDailyCloseData;
  const reportDate = "2026-09-18";

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    useDailyCloseData = (await import("@/lib/hooks/use-daily-close-data")).useDailyCloseData;
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
      `DELETE FROM sales; DELETE FROM sale_items; DELETE FROM returns; DELETE FROM return_items; DELETE FROM expenses;`,
    );
    core.setActiveStoreId(null);
  });

  it("headline figures are exactly the sum of their breakdown lines", async () => {
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, tax_amount, payment_method, payment_details, transaction_date) VALUES
        ('s1', 'TXN1', 500, 500, 25, 'cash', NULL, '2026-09-18T10:00:00.000Z'),
        ('s2', 'TXN2', 300, 300, 0, 'mixed', '{"splits":[{"method":"cash","amount":100},{"method":"transfer","amount":200}]}', '2026-09-18T11:00:00.000Z'),
        ('s3', 'TXN3', 200, 200, 0, 'card', NULL, '2026-09-18T12:00:00.000Z')
    `);
    db.run(`
      INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price) VALUES
        ('si1', 's1', 'p1', 5, 100, 60, 500),
        ('si2', 's2', 'p1', 3, 100, 60, 300),
        ('si3', 's3', 'p1', 2, 100, 60, 200)
    `);
    db.run(`
      INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at)
      VALUES ('r1', 's1', 'u1', 100, '2026-09-18T13:00:00.000Z')
    `);
    db.run(`
      INSERT INTO return_items (id, return_id, product_id, quantity, unit_price, subtotal)
      VALUES ('ri1', 'r1', 'p1', 1, 100, 100)
    `);
    db.run(`
      INSERT INTO expenses (id, category, amount, date, payment_method, _deleted)
      VALUES ('e1', 'Misc', 40, '2026-09-18', 'Cash', 0)
    `);

    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(() => useDailyCloseData(reportDate), { wrapper });
    await waitFor(() => expect(result.current.cashExpenses).toBe(40));
    await waitFor(() => expect(result.current.salesToday.length).toBe(3));

    const { netCashBreakdown, profitBreakdown, totalProfit } = result.current;
    expect(netCashBreakdown.lines.map((l) => l.amount)).toEqual([600, -100, -40]);
    expect(netCashBreakdown.total).toBe(460);
    expect(netCashBreakdown.total).toBe(sumOfLines(netCashBreakdown));

    expect(profitBreakdown.total).toBe(sumOfLines(profitBreakdown));
    expect(totalProfit).toBe(profitBreakdown.total);
    expect(profitBreakdown.lines.map((l) => l.amount)).toEqual([1000, -100, -20, -540]);
    expect(totalProfit).toBe(340);
  });
});
