import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import initSqlJs, { type Database } from "sql.js";
import {
  buildProfitAfterExpensesBreakdown,
  buildProfitBreakdown,
  type FigureBreakdown,
} from "@/lib/utils/daily-close-breakdown";
import { getExpenseAmountForDay } from "@/lib/db/queries/finance";

vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
}));

vi.mock("@/lib/context/store-context", () => ({
  useStore: () => ({ storeProfile: { currency: "NGN" } }),
}));

const sumOfLines = (breakdown: FigureBreakdown) =>
  breakdown.lines.reduce((sum, line) => sum + line.amount, 0);

const spread = (amount: number, date: string, covers_months: number) => ({ amount, date, covers_months });

describe("getExpenseAmountForDay", () => {
  it("counts a normal expense in full on its own date only", () => {
    expect(getExpenseAmountForDay(spread(500, "2026-10-20", 0), "2026-10-20")).toBe(500);
    expect(getExpenseAmountForDay({ amount: 500, date: "2026-10-20", covers_months: null }, "2026-10-20")).toBe(500);
    expect(getExpenseAmountForDay(spread(500, "2026-10-19", 0), "2026-10-20")).toBe(0);
  });

  it("counts a one-month expense in full on its date, not as a day share", () => {
    expect(getExpenseAmountForDay(spread(3100, "2026-10-20", 1), "2026-10-20")).toBe(3100);
    expect(getExpenseAmountForDay(spread(3100, "2026-10-20", 1), "2026-10-21")).toBe(0);
  });

  it("rounds a spread expense's day share to 2 decimals in a 31-day month", () => {
    expect(getExpenseAmountForDay(spread(22500, "2026-10-05", 3), "2026-10-20")).toBe(241.94);
  });

  it("divides by 28 in a 28-day February installment month", () => {
    expect(getExpenseAmountForDay(spread(22500, "2026-12-10", 3), "2027-02-14")).toBe(267.86);
  });

  it("counts the share on a day other than the entry day, in a later installment month", () => {
    expect(getExpenseAmountForDay(spread(9000, "2026-08-10", 3), "2026-09-01")).toBe(100);
  });

  it("counts only the day share on the entry day itself, not the full amount", () => {
    expect(getExpenseAmountForDay(spread(22500, "2026-10-05", 3), "2026-10-05")).toBe(241.94);
  });

  it("counts nothing outside the installment months", () => {
    expect(getExpenseAmountForDay(spread(22500, "2026-10-05", 3), "2027-01-01")).toBe(0);
    expect(getExpenseAmountForDay(spread(22500, "2026-10-05", 3), "2026-09-30")).toBe(0);
  });
});

describe("buildProfitAfterExpensesBreakdown", () => {
  const before = buildProfitBreakdown({
    grossSales: 900.3,
    refunds: 100.1,
    tax: 30.03,
    costOfGoods: 400.7,
    resellerPayouts: 0,
  });

  it("is the before-expenses lines followed by a negative expenses line, summing to its total", () => {
    const after = buildProfitAfterExpensesBreakdown({ profitBreakdown: before, dayExpenses: 241.94, reportDate: "2026-10-20" });
    expect(after.lines.slice(0, -1)).toEqual(before.lines);
    const last = after.lines[after.lines.length - 1];
    expect(last.label).toBe("Expenses for this day");
    expect(last.amount).toBe(-241.94);
    expect(last.href).toBe("/expenses?from=2026-10-20&to=2026-10-20");
    expect(after.total).toBe(sumOfLines(after));
  });
});

describe("useDailyCloseData profit after expenses", () => {
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
    db.run(`
      INSERT INTO sales (id, transaction_number, subtotal, total_amount, tax_amount, payment_method, payment_details, transaction_date)
      VALUES ('s1', 'TXN1', 1000, 1000, 0, 'cash', NULL, '2026-09-18T10:00:00.000Z')
    `);
    db.run(`
      INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price)
      VALUES ('si1', 's1', 'p1', 10, 100, 60, 1000)
    `);
    db.run(`
      INSERT INTO expenses (id, category, amount, date, payment_method, covers_months, _deleted) VALUES
        ('card-today', 'Misc', 100, '2026-09-18', 'Card', NULL, 0),
        ('rent-spread', 'Rent', 9000, '2026-08-10', 'Transfer', 3, 0),
        ('old-spread', 'Rent', 6000, '2026-06-01', 'Transfer', 2, 0),
        ('yesterday', 'Misc', 70, '2026-09-17', 'Cash', NULL, 0),
        ('deleted-today', 'Misc', 500, '2026-09-18', 'Cash', NULL, 1),
        ('deleted-spread', 'Rent', 9000, '2026-09-01', 'Cash', 3, 1)
    `);
  });

  const render = (showProfit: boolean) => {
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children);
    return renderHook(() => useDailyCloseData(reportDate, showProfit), { wrapper });
  };

  it("deducts the card expense dated that day and the day's share of a covering spread expense", async () => {
    const { result } = render(true);
    await waitFor(() => expect(result.current.totalProfit).toBe(400));
    await waitFor(() => expect(result.current.profitAfterExpenses).toBe(200));
    const { profitAfterExpensesBreakdown, profitAfterExpenses } = result.current;
    expect(profitAfterExpensesBreakdown.lines.at(-1)?.amount).toBe(-200);
    expect(profitAfterExpenses).toBe(sumOfLines(profitAfterExpensesBreakdown));
  });

  it("does not run the expenses query when profit is hidden", async () => {
    const { result } = render(false);
    await waitFor(() => expect(result.current.salesToday.length).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(Math.abs(result.current.profitAfterExpensesBreakdown.lines.at(-1)?.amount ?? NaN)).toBe(0);
  });
});
