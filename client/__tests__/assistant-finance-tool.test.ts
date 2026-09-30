import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import type { ToolContext } from "@/lib/assistant/types";

describe("assistant finance tool", () => {
  let db: Database;
  let core: typeof import("@/lib/db/core");
  let profitSummaryTool: typeof import("@/lib/assistant/tools/finance-tools").profitSummaryTool;
  let fetchProfitLossReportData: typeof import("@/lib/db/queries/reports").fetchProfitLossReportData;
  let toQueryRange: typeof import("@/lib/utils/date-range").toQueryRange;

  beforeAll(async () => {
    core = await import("@/lib/db/core");
    profitSummaryTool = (await import("@/lib/assistant/tools/finance-tools")).profitSummaryTool;
    fetchProfitLossReportData = (await import("@/lib/db/queries/reports")).fetchProfitLossReportData;
    toQueryRange = (await import("@/lib/utils/date-range")).toQueryRange;

    const { SCHEMA_SQL } = await import("@/lib/db/schema");
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
    core.__setDatabaseForTesting(db);
  });

  beforeEach(() => {
    db.run(`DELETE FROM sales; DELETE FROM sale_items; DELETE FROM expenses;
            DELETE FROM returns; DELETE FROM return_items;`);
    core.setActiveStoreId(null);
  });

  const ctx: ToolContext = {
    user: { id: "u1", role: "store_owner" },
    permissionGroup: { permissions: ["view_financial_reports"] },
    currencyCode: "NGN",
    expiryWarningDays: 90,
    storeType: "pharmacy",
    t: (k: string) => k,
    now: new Date(2026, 8, 15),
  };

  function localNoon(dateOnly: string): string {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
  }

  function seedDay(dateOnly: string) {
    db.run(
      `INSERT INTO sales (id, transaction_number, subtotal, total_amount, transaction_date, _deleted)
       VALUES ('s1', 'TXN-1', 500, 500, ?, 0)`,
      [localNoon(dateOnly)],
    );
    db.run(
      `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, _deleted)
       VALUES ('si1', 's1', 'p1', 1, 500, 200, 500, 0)`,
    );
    db.run(
      `INSERT INTO expenses (id, category, amount, date, _deleted) VALUES ('e1', 'Rent', 50, ?, 0)`,
      [dateOnly],
    );
  }

  it("matches the numbers fetchProfitLossReportData reports for the same window", async () => {
    seedDay("2026-09-15");

    const { from, to } = toQueryRange({ from: "2026-09-15", to: "2026-09-15" });
    const reportRows = await fetchProfitLossReportData(from, to);
    const expectedRevenue = reportRows.reduce((sum, row) => sum + Number(row["Revenue"]), 0);
    const expectedNet = reportRows.reduce((sum, row) => sum + Number(row["Net Profit"]), 0);

    const result = await profitSummaryTool.execute({ from: "2026-09-15", to: "2026-09-15" }, ctx);

    expect(result.revenue).toBeCloseTo(expectedRevenue, 2);
    expect(result.netProfit).toBeCloseTo(expectedNet, 2);
  });

  it("covers the whole of the last day of the range, not just its midnight instant", async () => {
    seedDay("2026-09-15");

    const result = await profitSummaryTool.execute({ from: "2026-09-15", to: "2026-09-15" }, ctx);

    expect(result.revenue).toBeCloseTo(500, 2);
    expect(result.cogs).toBeCloseTo(200, 2);
    expect(result.grossProfit).toBeCloseTo(300, 2);
    expect(result.expenses).toBeCloseTo(50, 2);
    expect(result.netProfit).toBeCloseTo(250, 2);
    expect(result.margin).toBeCloseTo(0.5, 4);
  });

  it("reports zero margin rather than dividing by zero when there is no revenue", async () => {
    const result = await profitSummaryTool.execute({ from: "2026-09-15", to: "2026-09-15" }, ctx);

    expect(result.revenue).toBe(0);
    expect(result.margin).toBe(0);
  });

  it("names the range and the headline figures in its reply", () => {
    const reply = profitSummaryTool.format(
      {
        revenue: 500,
        cogs: 200,
        grossProfit: 300,
        expenses: 50,
        netProfit: 250,
        margin: 0.5,
        from: "2026-09-15",
        to: "2026-09-15",
      },
      { from: "2026-09-15", to: "2026-09-15" },
      ctx,
    );

    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("15/09/2026");
    expect(reply.text).toContain("500");
    expect(reply.text).toContain("250");
    expect(reply.text).toContain("50.0%");
  });

  it("defaults the date range to today when the utterance has no date phrase", async () => {
    const { FINANCE_INTENTS } = await import("@/lib/assistant/intents/finance-intents");
    const intent = FINANCE_INTENTS.find((i) => i.id === "profit_summary")!;

    const args = intent.buildArgs({}, "gross profit", ctx) as { from: string; to: string };

    expect(args.from).toBe("2026-09-15");
    expect(args.to).toBe("2026-09-15");
  });

  it("uses the utterance's date phrase when it has one", async () => {
    const { FINANCE_INTENTS } = await import("@/lib/assistant/intents/finance-intents");
    const intent = FINANCE_INTENTS.find((i) => i.id === "profit_summary")!;

    const args = intent.buildArgs({}, "net profit last month", ctx) as { from: string; to: string };

    expect(args.from).toBe("2026-08-01");
    expect(args.to).toBe("2026-08-31");
  });

  it("routes a profit question through the registry to profit_summary", async () => {
    const { answer } = await import("@/lib/assistant/router");
    seedDay("2026-09-15");

    const reply = await answer("what is our gross profit today", ctx);

    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("15/09/2026");
  });
});
