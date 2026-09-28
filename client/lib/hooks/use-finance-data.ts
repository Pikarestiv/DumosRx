import { useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import {
  getCurrentMonthRevenue,
  getCurrentMonthCOGS,
  getCurrentMonthExpensesByCategory,
  getSmoothedExpensesTotal,
  getExpensesPage,
  getExpensesLifetimeTotal,
  EXPENSES_PAGE_SIZE,
  Expense
} from '../db/queries/finance';
import { queryKeys } from '../query-keys';

const EMPTY_EXPENSES: Expense[] = [];
import { useAuth } from '../context/auth-context';
import { useHasPermission } from './use-permissions';

export interface PnLReportData {
  period: string;
  revenue: number;
  cogs: number;
  expenses: number;
  netProfit: number;
  expenseBreakdown: { category: string; amount: number }[];
}

export function usePnLReport() {
  const [reportData, setReportData] = useState<PnLReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRealData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now).toISOString();
      const nextMonthStart = startOfMonth(addMonths(now, 1)).toISOString();

      const [revenue, cogs, expensesResult, totalExpenses] = await Promise.all([
        getCurrentMonthRevenue({ from: monthStart, to: nextMonthStart }),
        getCurrentMonthCOGS({ from: monthStart, to: nextMonthStart }),
        // Smoothed the same way as the headline total below, so the
        // breakdown's line items actually sum to it.
        getCurrentMonthExpensesByCategory({ from: monthStart, to: nextMonthStart }),
        getSmoothedExpensesTotal({ from: monthStart, to: nextMonthStart }),
      ]);

      setReportData({
        period: format(new Date(), "MMMM yyyy"),
        revenue,
        cogs,
        expenses: totalExpenses,
        netProfit: revenue - cogs - totalExpenses,
        expenseBreakdown: expensesResult.map(e => ({ category: e.category, amount: e.total }))
      });
      setError(null);
    } catch (err) {
      console.error("Failed to fetch P&L report data:", err);
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setLoading(false);
    }
  };

  return { reportData, loading, error, refetch: fetchRealData };
}

/**
 * The expense ledger, newest first, read a page at a time with the search and
 * category filters applied in SQL so they reach the whole ledger rather than
 * only the loaded page.
 *
 * `limit` is how many rows to load; raising it is the "load older" affordance.
 * The query is keyed on it, so a wider window is a new cache entry rather than
 * a mutation of the current one.
 */
export function useExpenseList({
  limit = EXPENSES_PAGE_SIZE,
  search,
  category,
}: {
  limit?: number;
  search?: string;
  category?: string;
} = {}) {
  const { user } = useAuth();
  const viewerId = useHasPermission("view_all_expenses") ? undefined : user?.id;

  const { data, isLoading, error, refetch } = useQuery({
    ...queryKeys.expenses.page(viewerId, limit, search, category),
    queryFn: () => getExpensesPage({ viewerId, limit, search, category }),
    // Keeps the current rows on screen while a wider window or a new search
    // term resolves, instead of flashing an empty list.
    placeholderData: keepPreviousData,
  });

  return {
    expenses: data?.rows ?? EMPTY_EXPENSES,
    /** Every expense in scope, not just the loaded ones. */
    totalCount: data?.total ?? 0,
    hasMore: (data?.total ?? 0) > (data?.rows.length ?? 0),
    isLoading,
    error: error instanceof Error ? error : null,
    refetch,
  };
}

/** The lifetime ledger figure and this month's smoothed figures, all aggregated
 * in SQL over every expense rather than over whatever the list has loaded. */
export function useExpenseTotals() {
  const { user } = useAuth();
  const viewerId = useHasPermission("view_all_expenses") ? undefined : user?.id;

  const { from, to } = useMemo(() => {
    const now = new Date();
    // endOfMonth, not the start of next month: getSmoothedExpensesTotal and
    // getCurrentMonthExpensesByCategory both treat `to` as INCLUSIVE (see their
    // doc comments), so next month's 1st would otherwise be counted here.
    return {
      from: startOfMonth(now).toISOString(),
      to: endOfMonth(now).toISOString(),
    };
  }, []);

  const { data: lifetimeTotal } = useQuery({
    ...queryKeys.expenses.lifetimeTotal(viewerId),
    queryFn: () => getExpensesLifetimeTotal(viewerId),
  });

  const { data: monthStats } = useQuery({
    ...queryKeys.expenses.monthStats(viewerId, from, to),
    queryFn: async () => {
      const [total, byCategory] = await Promise.all([
        getSmoothedExpensesTotal({ from, to, viewerId }),
        getCurrentMonthExpensesByCategory({ from, to, viewerId }),
      ]);
      return { total, byCategory };
    },
  });

  return useMemo(() => {
    const byCategory = monthStats?.byCategory ?? [];
    const categoryTotals: Record<string, number> = {};
    let topCategoryStr = "N/A";
    let topTotal = 0;
    for (const row of byCategory) {
      categoryTotals[row.category] = row.total;
      if (row.total > topTotal) {
        topTotal = row.total;
        topCategoryStr = row.category;
      }
    }

    return {
      totalExpenses: lifetimeTotal ?? 0,
      thisMonthExpenses: monthStats?.total ?? 0,
      categoryTotals,
      topCategoryStr,
    };
  }, [lifetimeTotal, monthStats]);
}
