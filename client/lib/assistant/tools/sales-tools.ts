import { getRecentSales } from "@/lib/db/queries/sales";
import { calculateNetSaleAmount } from "@/lib/utils/pos-calculations";
import type { AssistantTool } from "../types";
import { toDateOnly } from "../date-phrases";
import { formatMoney } from "../reply-formatters";

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
