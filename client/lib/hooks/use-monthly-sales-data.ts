import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdvancedMonthlySalesData } from "@/lib/db/queries/reports";
import { queryKeys } from "@/lib/query-keys";
import type { MonthlySalesDataPoint } from "@/lib/types/analytics";

export function useMonthlySalesData(dateFilter: string) {
  const { data: metrics } = useQuery({
    ...queryKeys.bi.monthlySales(dateFilter),
    queryFn: () => getAdvancedMonthlySalesData(dateFilter)
  });

  const rawMonthlyData = metrics?.rawMonthlyData || [];
  const rawMonthlyReturns = metrics?.rawMonthlyReturns || [];
  const rawExpenseData = metrics?.rawExpenseData || [];

  const monthlySalesData: MonthlySalesDataPoint[] = useMemo(() => {
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const result = [];

    for (let i = 5; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      if (m < 0) {
        m += 12;
        y -= 1;
      }
      const monthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
      
      const salesItem = rawMonthlyData.find((d) => d.month === monthKey);
      const returnsItem = rawMonthlyReturns.find((d) => d.month === monthKey);
      const expenseItem = rawExpenseData.find((d) => d.month === monthKey);

      const rawRevenue = salesItem?.revenue || 0;
      const rawTax = salesItem?.tax || 0;
      const rawCogs = salesItem?.cogs || 0;

      const refundAmount = returnsItem?.refunds || 0;
      const returnedCogs = returnsItem?.returned_cogs || 0;
      const expenses = expenseItem?.expenses || 0;

      // Tax collected is pass-through, not real revenue - see use-bi-data.ts.
      const netRevenue = rawRevenue - rawTax - refundAmount;
      const netCogs = rawCogs - returnedCogs;
      const grossProfit = netRevenue - netCogs;
      const netProfit = grossProfit - expenses;

      result.push({
        month: `${monthNames[m]} ${y.toString().slice(2)}`,
        revenue: Math.max(0, netRevenue),
        profit: Math.max(0, netProfit),
        grossProfit: Math.max(0, grossProfit),
        expenses: expenses,
        transactions: salesItem?.transactions || 0,
      });
    }

    return result;
  }, [rawMonthlyData, rawMonthlyReturns, rawExpenseData]);

  return monthlySalesData;
}
