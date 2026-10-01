import { fetchProfitLossReportData } from "@/lib/db/queries/reports";
import { toQueryRange } from "@/lib/utils/date-range";
import type { AssistantTool } from "../types";
import { formatDateLabel, formatMoney } from "../reply-formatters";

export interface ProfitSummaryResult {
  revenue: number;
  cogs: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
  margin: number;
  from: string;
  to: string;
}

export const profitSummaryTool: AssistantTool<{ from: string; to: string }, ProfitSummaryResult> = {
  name: "profit_summary",
  description: "Reports revenue, COGS, gross/net profit, expenses, and margin for a date range.",
  parameters: {
    from: { type: "string", description: "Start date YYYY-MM-DD", required: true },
    to: { type: "string", description: "End date YYYY-MM-DD", required: true },
  },
  requiredPermission: "view_financial_reports",
  examples: ["net profit this month", "how much gross profit did we make on 2026-09-01"],
  execute: async ({ from, to }) => {
    const range = toQueryRange({ from, to });
    const rows = await fetchProfitLossReportData(range.from, range.to);

    let revenue = 0;
    let cogs = 0;
    let grossProfit = 0;
    let expenses = 0;
    let netProfit = 0;

    for (const row of rows) {
      revenue += Number(row["Revenue"]);
      cogs += Number(row["COGS"]);
      grossProfit += Number(row["Gross Profit"]);
      expenses += Number(row["Expenses"]);
      netProfit += Number(row["Net Profit"]);
    }

    const margin = revenue > 0 ? netProfit / revenue : 0;
    return { revenue, cogs, grossProfit, expenses, netProfit, margin, from, to };
  },
  format: (result, _args, ctx) => {
    const range =
      result.from === result.to
        ? formatDateLabel(result.from)
        : `${formatDateLabel(result.from)} to ${formatDateLabel(result.to)}`;

    return {
      kind: "answer",
      text: `${range}: revenue ${formatMoney(result.revenue, ctx)}, gross profit ${formatMoney(result.grossProfit, ctx)}, net profit ${formatMoney(result.netProfit, ctx)} (margin ${(result.margin * 100).toFixed(1)}%).`,
    };
  },
};
