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

export interface ExpenseStats {
  /** Lifetime total: a real ledger figure (how much cash has actually been
   * recorded as spent, ever), deliberately NOT smoothed - smoothing only makes
   * sense when attributing an expense to a specific period. */
  totalExpenses: number;
  /** Smoothed, same as Net Profit elsewhere: a prepaid expense (covers_months
   * set) must not dump its full amount into whichever single month it was
   * logged in. */
  thisMonthExpenses: number;
  categoryTotals: Record<string, number>;
  topCategoryStr: string;
}

/** Derived in one pass over the whole list, because an expense logged in an
 * earlier month can still have an installment recognized in this one - so
 * nothing here can be pre-filtered to the month's own date range. */
export function deriveExpenseStats(
  expenses: Expense[],
  monthStart: Date,
  monthEnd: Date,
): ExpenseStats {
  let totalExpenses = 0;
  let thisMonthExpenses = 0;
  const categoryTotals: Record<string, number> = {};

  for (const exp of expenses) {
    totalExpenses += exp.amount;
    const smoothed = getSmoothedAmountInWindow(exp, monthStart, monthEnd);
    thisMonthExpenses += smoothed;
    // The category breakdown skips a zero share so a category with nothing
    // recognized this month can't win the "top category" reduce below.
    if (smoothed > 0) {
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + smoothed;
    }
  }

  const categories = Object.keys(categoryTotals);
  const topCategoryStr =
    categories.length > 0
      ? categories.reduce((a, b) => (categoryTotals[a] > categoryTotals[b] ? a : b))
      : "N/A";

  return { totalExpenses, thisMonthExpenses, categoryTotals, topCategoryStr };
}

/** All business logic for the Expenses page: data, search/category filtering, and derived stats. */
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

  // One memoized pass over the list for all four derived figures: this used
  // to run on every render, and called getSmoothedAmountInWindow() twice per
  // expense across two separate reduce passes.
  const { totalExpenses, thisMonthExpenses, categoryTotals, topCategoryStr } =
    useMemo(() => {
      const now = new Date();
      return deriveExpenseStats(
        expenses,
        startOfMonth(now),
        startOfMonth(addMonths(now, 1)),
      );
    }, [expenses]);

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
