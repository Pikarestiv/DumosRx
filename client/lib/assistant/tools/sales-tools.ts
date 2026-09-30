import { getRecentSales, getSalesTotalsByPaymentMethod, getTransactionCountByDate } from "@/lib/db/queries/sales";
import { calculateNetSaleAmount } from "@/lib/utils/pos-calculations";
import type { AssistantTool } from "../types";
import { toDateOnly } from "../date-phrases";
import { formatDateLabel, formatMoney } from "../reply-formatters";

export interface MySalesTodayResult {
  count: number;
  netTotal: number;
}

export const mySalesTodayTool: AssistantTool<Record<string, never>, MySalesTodayResult> = {
  name: "my_sales_today",
  description: "Reports the signed-in cashier's own sales for today.",
  parameters: {},
  requiredPermission: "process_sales",
  examples: ["my sales today", "how much have i sold today"],
  execute: async (_args, ctx) => {
    const today = toDateOnly(ctx.now);
    const sales = await getRecentSales(ctx.user?.id, { from: today, to: today });

    const netTotal = sales.reduce(
      (total, sale) => total + calculateNetSaleAmount(Number(sale.total_amount) || 0, Number(sale.total_refunded) || 0),
      0,
    );

    return { count: sales.length, netTotal };
  },
  format: (result, _args, ctx) => ({
    kind: "answer",
    text: `You've made ${result.count} sale(s) today, totalling ${formatMoney(result.netTotal, ctx)}.`,
  }),
};

export interface SalesSummaryResult {
  total: number;
  count: number;
  date: string;
}

export const salesSummaryTool: AssistantTool<{ date: string }, SalesSummaryResult> = {
  name: "sales_summary",
  description: "Reports store-wide sales total and transaction count for a date.",
  parameters: { date: { type: "string", description: "Date in YYYY-MM-DD", required: true } },
  requiredPermission: "view_reports",
  examples: ["how many sales today", "total sales yesterday"],
  execute: async ({ date }) => {
    const totals = await getSalesTotalsByPaymentMethod(date);
    const count = await getTransactionCountByDate(date);
    const total = totals.reduce((sum, row) => sum + (Number(row.total) || 0), 0);
    return { total, count, date };
  },
  format: (result, _args, ctx) => ({
    kind: "answer",
    text: `${formatDateLabel(result.date)}: ${result.count} sale(s) totalling ${formatMoney(result.total, ctx)}.`,
  }),
};
