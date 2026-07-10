import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  getCurrentMonthRevenue,
  getCurrentMonthCOGS,
  getCurrentMonthExpensesByCategory,
  getAllExpenses,
  Expense
} from '../db/queries/finance';

export function usePnLReport() {
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchRealData = async () => {
    setLoading(true);
    try {
      const [revenue, cogs, expensesResult] = await Promise.all([
        getCurrentMonthRevenue(),
        getCurrentMonthCOGS(),
        getCurrentMonthExpensesByCategory()
      ]);

      const totalExpenses = expensesResult.reduce((acc, curr) => acc + (curr.total || 0), 0);
      
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

  const fetchExpenses = async () => {
    setIsLoading(true);
    try {
      const data = await getAllExpenses();
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
  }, []);

  return { expenses, isLoading, error, refetch: fetchExpenses };
}
