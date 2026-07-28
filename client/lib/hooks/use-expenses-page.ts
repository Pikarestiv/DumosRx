import { useMemo, useState } from "react";
import { useStore } from "@/lib/context/store-context";
import { useExpenseList } from "@/lib/hooks/use-finance-data";
import { Expense } from "@/lib/db/queries/finance";
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

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  const thisMonthExpenses = expenses
    .filter((exp) => {
      const expDate = new Date(exp.date);
      const now = new Date();
      return (
        expDate.getMonth() === now.getMonth() &&
        expDate.getFullYear() === now.getFullYear()
      );
    })
    .reduce((sum, exp) => sum + exp.amount, 0);

  // Calculate top category this month
  const categoryTotals = expenses
    .filter((exp) => {
      const expDate = new Date(exp.date);
      const now = new Date();
      return (
        expDate.getMonth() === now.getMonth() &&
        expDate.getFullYear() === now.getFullYear()
      );
    })
    .reduce(
      (acc, exp) => {
        acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
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
