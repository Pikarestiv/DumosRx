import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getExpensesAttributableToDate } from "@/lib/db/queries/finance";
import { queryKeys } from "@/lib/query-keys";
import { buildProfitAfterExpensesBreakdown, type FigureBreakdown } from "@/lib/utils/daily-close-breakdown";

export function useDailyCloseProfitAfterExpenses(
  reportDate: string,
  profitBreakdown: FigureBreakdown,
  showProfit: boolean,
): FigureBreakdown {
  const { data: dayExpenses = 0 } = useQuery({
    ...queryKeys.dailyClose.dayExpenses(reportDate),
    queryFn: () => getExpensesAttributableToDate(reportDate),
    enabled: showProfit,
  });
  return useMemo(
    () => buildProfitAfterExpensesBreakdown({ profitBreakdown, dayExpenses, reportDate }),
    [profitBreakdown, dayExpenses, reportDate],
  );
}
