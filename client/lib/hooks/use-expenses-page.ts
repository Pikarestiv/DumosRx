import { useMemo, useState } from "react";
import { startOfMonth, addMonths } from "date-fns";
import { useStore } from "@/lib/context/store-context";
import { useExpenseList } from "@/lib/hooks/use-finance-data";
import { Expense, getSmoothedAmountInWindow } from "@/lib/db/queries/finance";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";

const CATEGORIES = [
  "All",
  "Rent",
  "Utilities",
  "Salaries",
  "Maintenance",
  "Marketing",
  "Other",
];

/** All business logic for the Expenses page — data, search/category filtering, and derived stats. */
export function useExpensesPage() {
  const { expenses, isLoading, refetch: fetchExpenses } = useExpenseList();
  const { storeProfile } = useStore();

  usePullToRefreshHandler(async () => {
    await fetchExpenses();
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(
    null,
  );
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  const filteredExpenses = useMemo(() => {
    return expenses
      .filter((exp) => {
        const matchesSearch =
          !searchTerm ||
          (exp.description?.toLowerCase() || "").includes(
            searchTerm.toLowerCase(),
          );
        const matchesCategory =
          selectedCategory === "All" || exp.category === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, searchTerm, selectedCategory]);

  // Lifetime total: a real ledger figure (how much cash has actually been
  // recorded as spent, ever), deliberately NOT smoothed — smoothing only
  // makes sense when attributing an expense to a specific period.
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  // "This month" and the category breakdown below both need smoothing,
  // same as Net Profit elsewhere: a prepaid expense (covers_months set)
  // must not dump its full amount into whichever single month it was
  // logged. Iterates every expense (not pre-filtered to this month's
  // dates) because an expense logged in an earlier month can still have an
  // installment recognized this month.
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = startOfMonth(addMonths(now, 1));

  const thisMonthExpenses = expenses.reduce(
    (sum, exp) => sum + getSmoothedAmountInWindow(exp, monthStart, monthEnd),
    0,
  );

  // Calculate top category this month
  const categoryTotals = expenses.reduce(
    (acc, exp) => {
      const smoothed = getSmoothedAmountInWindow(exp, monthStart, monthEnd);
      if (smoothed > 0) {
        acc[exp.category] = (acc[exp.category] || 0) + smoothed;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  const topCategoryStr =
    Object.keys(categoryTotals).length > 0
      ? Object.keys(categoryTotals).reduce((a, b) =>
          categoryTotals[a] > categoryTotals[b] ? a : b,
        )
      : "—";

  const selectedExpense =
    expenses.find((e) => e.id === selectedExpenseId) || null;

  return {
    CATEGORIES,
    expenses,
    isLoading,
    fetchExpenses,
    storeProfile,
    searchTerm,
    setSearchTerm,
    selectedCategory,
    setSelectedCategory,
    selectedExpenseId,
    setSelectedExpenseId,
    expenseToEdit,
    setExpenseToEdit,
    filteredExpenses,
    totalExpenses,
    thisMonthExpenses,
    topCategoryStr,
    selectedExpense,
  };
}
