import { useState, useEffect } from 'react';
import { format, startOfMonth, addMonths } from 'date-fns';
import {
  getCurrentMonthRevenue,
  getCurrentMonthCOGS,
  getCurrentMonthExpensesByCategory,
  getSmoothedExpensesTotal,
  getAllExpenses,
  Expense
} from '../db/queries/finance';
import { useAuth, checkCanViewAllActivity } from '../context/auth-context';

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
        getCurrentMonthRevenue(),
        getCurrentMonthCOGS(),
        getCurrentMonthExpensesByCategory(),
        // Category breakdown above still shows each expense's full amount in
        // whichever category/month it was logged — only this headline total
        // (and therefore Net Profit) accounts for prepaid smoothing.
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

export function useExpenseList() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { user } = useAuth();
  const viewerId = checkCanViewAllActivity(user?.role) ? undefined : user?.id;

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const data = await getAllExpenses(viewerId);
      setExpenses(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch expenses:", err);
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerId]);

  return { expenses, isLoading, error, refetch: fetchExpenses };
}
