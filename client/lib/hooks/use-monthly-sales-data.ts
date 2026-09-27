import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAdvancedMonthlySalesData, type SalesFilters } from "@/lib/db/queries/reports";
import { queryKeys } from "@/lib/query-keys";
import type { MonthlySalesDataPoint } from "@/lib/types/analytics";

const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Hard ceiling on how many months the chart will ever render, independent
// of how wide a range is selected (e.g. an "all time" filter) - without
// this, a multi-year range would produce a bar per month indefinitely.
// Falls back to trimming to the most RECENT months within the ceiling,
// same as the previous hardcoded "last 6 months" behavior for a range
// that's still wider than this after the fix below.
const MAX_MONTHS = 24;

export function useMonthlySalesData(dateFilter: string, toFilter?: string, filters?: SalesFilters) {
  const { data: metrics } = useQuery({
    ...queryKeys.bi.monthlySales(dateFilter, filters?.staffId, filters?.paymentMethod),
    queryKey: [...queryKeys.bi.monthlySales(dateFilter, filters?.staffId, filters?.paymentMethod).queryKey, toFilter],
    queryFn: () => getAdvancedMonthlySalesData(dateFilter, toFilter, filters)
  });

  const monthlySalesData: MonthlySalesDataPoint[] = useMemo(() => {
    const rawMonthlyData = metrics?.rawMonthlyData || [];
    const rawMonthlyReturns = metrics?.rawMonthlyReturns || [];
    const rawExpenseData = metrics?.rawExpenseData || [];

    // Renders the months actually covered by the SELECTED range
    // (dateFilter..toFilter), not a fixed "last 6 calendar months from
    // today" - a range narrower or older than 6 months used to show
    // months outside it entirely (including months after the selected
    // range), while the KPI cards above the chart correctly honored it.
    const from = new Date(dateFilter);
    const to = toFilter ? new Date(toFilter) : new Date();

    const monthKeys: { key: string; m: number; y: number }[] = [];
    let m = from.getMonth();
    let y = from.getFullYear();
    const endKey = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}`;
    // Guard against a malformed/reversed range looping forever.
    for (let guard = 0; guard < 1200; guard++) {
      const key = `${y}-${String(m + 1).padStart(2, "0")}`;
      monthKeys.push({ key, m, y });
      if (key >= endKey) break;
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    const trimmedMonthKeys = monthKeys.slice(-MAX_MONTHS);

    return trimmedMonthKeys.map(({ key: monthKey, m, y }) => {
      const salesItem = rawMonthlyData.find((d) => d.month === monthKey);
      const returnsItem = rawMonthlyReturns.find((d) => d.month === monthKey);
      const expenseItem = rawExpenseData.find((d) => d.month === monthKey);

      const rawRevenue = salesItem?.revenue || 0;
      const rawTax = salesItem?.tax || 0;
      const rawCogs = salesItem?.cogs || 0;

      // Already ex-VAT (see getAdvancedMonthlySalesData's rawMonthlyRefunds) -
      // do not subtract rawTax's share of it again.
      const refundAmount = returnsItem?.refunds || 0;
      const returnedCogs = returnsItem?.returned_cogs || 0;
      const expenses = expenseItem?.expenses || 0;

      // Tax collected is pass-through, not real revenue - see use-bi-data.ts.
      const netRevenue = rawRevenue - rawTax - refundAmount;
      const netCogs = rawCogs - returnedCogs;
      const grossProfit = netRevenue - netCogs;
      const netProfit = grossProfit - expenses;

      return {
        month: `${monthNames[m]} ${y.toString().slice(2)}`,
        revenue: netRevenue,
        profit: netProfit,
        grossProfit: grossProfit,
        expenses: expenses,
        transactions: salesItem?.transactions || 0,
      };
    });
  }, [dateFilter, toFilter, metrics?.rawMonthlyData, metrics?.rawMonthlyReturns, metrics?.rawExpenseData]);

  return monthlySalesData;
}
