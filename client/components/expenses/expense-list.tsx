"use client";

import { useMemo, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Search, ReceiptText, ChevronRight } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";

const DESKTOP_ROW_HEIGHT = 56;
import { useStore } from "@/lib/context/store-context";
import { useExpenseList } from "@/lib/hooks/use-finance-data";
import { ExpenseDetailDialog } from "./expense-detail-dialog";
import { AddExpenseDialog } from "./add-expense-dialog";
import { ExpenseCategoryFilter } from "./expense-category-filter";
import { Card } from "@/components/ui/card";
import { Expense } from "@/lib/db/queries/finance";
import { ExpenseInsightsStrip } from "./expense-insights-strip";
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

const CATEGORY_META: Record<string, { badgeClass: string }> = {
  Rent: { badgeClass: "bg-chart-1/10 text-chart-1" },
  Utilities: { badgeClass: "bg-chart-3/10 text-chart-3" },
  Salaries: { badgeClass: "bg-emerald-600/10 text-emerald-600" },
  Maintenance: { badgeClass: "bg-muted text-muted-foreground" },
  Marketing: { badgeClass: "bg-chart-2/10 text-chart-2" },
  Other: { badgeClass: "bg-muted text-muted-foreground" },
  Unknown: { badgeClass: "bg-muted text-muted-foreground" },
};

export function ExpenseList() {
  const { expenses, isLoading, refetch: fetchExpenses } = useExpenseList();

  usePullToRefreshHandler(async () => {
    await fetchExpenses();
  });
  const { storeProfile } = useStore();

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

  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredExpenses.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => DESKTOP_ROW_HEIGHT,
    overscan: 8,
  });

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

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground font-medium">
        Loading expenses...
      </div>
    );
  }

  const selectedExpense =
    expenses.find((e) => e.id === selectedExpenseId) || null;

  const EmptyState = (
    <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
      <ReceiptText className="h-10 w-10 opacity-20 mb-3" />
      <p className="text-sm font-medium">No expenses found</p>
    </div>
  );

  const SearchInput = (
    <div className="flex items-center gap-2 bg-card border border-border md:bg-muted md:border-none rounded-[10px] px-3.5 py-2.5 max-w-none md:max-w-sm">
      <Search className="w-4 h-4 text-muted-foreground shrink-0" />
      <input
        type="text"
        placeholder="Search by description"
        className="border-0 outline-none text-[13px] w-full bg-transparent text-foreground placeholder:text-muted-foreground"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  );

  return (
    <div className="flex flex-col min-h-0">
      <ExpenseInsightsStrip
        totalExpenses={totalExpenses}
        thisMonthExpenses={thisMonthExpenses}
        topCategoryStr={topCategoryStr}
        transactionCount={expenses.length}
        currencyCode={storeProfile?.currency}
      />

      {/* Mobile: search bar stands alone above the category chips */}
      <div className="md:hidden mb-4">{SearchInput}</div>

      <ExpenseCategoryFilter
        categories={CATEGORIES}
        value={selectedCategory}
        onChange={setSelectedCategory}
      />

      {/* Mobile: flat card list, no wrapping table card */}
      <div className="md:hidden flex flex-col gap-2">
        {filteredExpenses.length === 0 && EmptyState}
        {filteredExpenses.map((expense: Expense) => {
          const meta =
            CATEGORY_META[expense.category] || CATEGORY_META["Unknown"];
          return (
            <div
              key={expense.id}
              onClick={() => setSelectedExpenseId(expense.id)}
              className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-primary/5 cursor-pointer transition-colors"
            >
              <div className="w-10 h-10 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <ReceiptText className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold truncate">
                  {expense.description || "-"}
                </div>
                <div className="text-[11.5px] text-muted-foreground truncate">
                  {format(new Date(expense.date), "MMM dd, yyyy")} &middot;{" "}
                  {expense.payment_method}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[13.5px] font-bold text-foreground whitespace-nowrap">
                  {formatCurrency(
                    expense.amount,
                    storeProfile?.currency || "NGN",
                  )}
                </span>
                <span
                  className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}
                >
                  {expense.category}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </div>
          );
        })}
      </div>

      {/* Desktop: table card, own search bar in its header */}
      <Card className="hidden md:flex flex-col gap-0 py-0 border border-border rounded-2xl flex-1 overflow-hidden">
        <div className="p-4 pb-3 border-b border-border">{SearchInput}</div>

        <div className="grid grid-cols-[110px_150px_1fr_130px_120px] gap-2 px-5 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wide border-b border-border bg-muted/20">
          <div>Date</div>
          <div>Category</div>
          <div>Description</div>
          <div>Method</div>
          <div className="text-right">Amount</div>
        </div>

        <div ref={desktopScrollRef} className="flex-1 overflow-y-auto">
          {filteredExpenses.length === 0 && EmptyState}
          {filteredExpenses.length > 0 && (
            <div
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const expense = filteredExpenses[virtualRow.index];
                const meta =
                  CATEGORY_META[expense.category] || CATEGORY_META["Unknown"];
                return (
                  <div
                    key={expense.id}
                    className="absolute top-0 left-0 w-full grid grid-cols-[110px_150px_1fr_130px_120px] gap-2 items-center px-5 py-3.5 border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    onClick={() => setSelectedExpenseId(expense.id)}
                  >
                    <div className="text-[13px] font-medium">
                      {format(new Date(expense.date), "MMM dd, yyyy")}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}
                      >
                        {expense.category}
                      </span>
                    </div>
                    <div className="text-[13px] text-foreground truncate">
                      {expense.description || "-"}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {expense.payment_method}
                    </div>
                    <div className="text-[14px] font-bold text-foreground text-right">
                      {formatCurrency(
                        expense.amount,
                        storeProfile?.currency || "NGN",
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <ExpenseDetailDialog
        expense={selectedExpense}
        open={!!selectedExpenseId}
        onOpenChange={(open) => !open && setSelectedExpenseId(null)}
        onDeleted={() => {
          setSelectedExpenseId(null);
          fetchExpenses();
        }}
        onEdit={() => {
          setExpenseToEdit(selectedExpense || null);
          setSelectedExpenseId(null);
        }}
      />

      <AddExpenseDialog
        open={!!expenseToEdit}
        onOpenChange={(open) => !open && setExpenseToEdit(null)}
        expenseToEdit={expenseToEdit}
        onSaved={() => {
          setExpenseToEdit(null);
          fetchExpenses();
        }}
      />
    </div>
  );
}
