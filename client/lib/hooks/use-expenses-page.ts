import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { DateRangeValue } from "@/components/ui/date-range-picker";
import { useStore } from "@/lib/context/store-context";
import { useExpenseList, useExpenseTotals } from "@/lib/hooks/use-finance-data";
import { Expense, EXPENSES_PAGE_SIZE } from "@/lib/db/queries/finance";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function rangeFromParams(params: URLSearchParams): DateRangeValue {
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !ISO_DATE.test(from)) return {};
  return { from, to: to && ISO_DATE.test(to) ? to : from };
}

const CATEGORIES = [
  "All",
  "Rent",
  "Utilities",
  "Salaries",
  "Maintenance",
  "Marketing",
  "Other",
];

/** All business logic for the Expenses page: paged data, search/category/date
 * filtering (all pushed into SQL), and the headline figures. */
export function useExpensesPage() {
  const { storeProfile } = useStore();
  const searchParams = useSearchParams();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(
    null,
  );
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);
  const [limit, setLimit] = useState(EXPENSES_PAGE_SIZE);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => rangeFromParams(searchParams));
  const appliedRange = useMemo<DateRangeValue>(
    () =>
      dateRange.from
        ? { from: dateRange.from, to: dateRange.to ?? dateRange.from }
        : {},
    [dateRange.from, dateRange.to],
  );
  const isRangeActive = !!appliedRange.from;

  // The filters are part of the query key, so a keystroke would otherwise be a
  // round trip to SQLite per character.
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 250);

  const {
    expenses,
    totalCount,
    totalAmount,
    hasMore,
    isLoading,
    refetch: fetchExpenses,
  } = useExpenseList({
    limit,
    search: debouncedSearchTerm,
    category: selectedCategory,
    dateRange: appliedRange,
  });

  // Aggregated in SQL over every expense, not reduced over the loaded page, so
  // these stay correct however little of the list has been read.
  const { totalExpenses: lifetimeExpenses, thisMonthExpenses, topCategoryStr } =
    useExpenseTotals(appliedRange);

  usePullToRefreshHandler(async () => {
    await fetchExpenses();
  });

  const loadMore = useCallback(
    () => setLimit((prev) => prev + EXPENSES_PAGE_SIZE),
    [],
  );

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
    dateRange,
    setDateRange,
    appliedRange,
    selectedExpenseId,
    setSelectedExpenseId,
    expenseToEdit,
    setExpenseToEdit,
    /** Already filtered and ordered by the query - kept under this name so the
     * list component's own sort/virtualization wiring doesn't change. */
    filteredExpenses: expenses,
    /** Every expense matching the current filters, not just the loaded ones. */
    totalCount,
    hasMore,
    loadMore,
    /** The filtered ledger's sum while a date range is set, else the lifetime figure. */
    totalExpenses: isRangeActive ? totalAmount : lifetimeExpenses,
    thisMonthExpenses,
    topCategoryStr,
    selectedExpense,
  };
}
