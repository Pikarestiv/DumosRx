"use client";

import { useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Search, ReceiptText, ChevronRight } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { useExpensesPage } from "@/lib/hooks/use-expenses-page";
import { ExpenseDetailDialog } from "./expense-detail-dialog";
import { AddExpenseDialog } from "./add-expense-dialog";
import { ExpenseCategoryFilter } from "./expense-category-filter";
import { Card } from "@/components/ui/card";
import { Expense } from "@/lib/db/queries/finance";
import { ExpenseInsightsStrip } from "./expense-insights-strip";
import { SortableHeaderCell } from "@/components/ui/sortable-header-cell";
import { useSortableData } from "@/lib/hooks/use-sortable-data";
import { update } from "@/lib/db/local-database";
import { ExpenseDesktopRow, CATEGORY_META, type ExpenseDraft } from "./expense-desktop-row";

type ExpenseSortKey = "date" | "category" | "description" | "method" | "amount";

const DESKTOP_ROW_HEIGHT = 56;

export function ExpenseList() {
  const {
    CATEGORIES,
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
    expenses,
  } = useExpensesPage();

  const { sortKey, direction, toggleSort, sortedData: sortedExpenses } =
    useSortableData<Expense, ExpenseSortKey>(filteredExpenses, {
      date: (e) => e.date,
      category: (e) => e.category.toLowerCase(),
      description: (e) => (e.description || "").toLowerCase(),
      method: (e) => (e.payment_method || "").toLowerCase(),
      amount: (e) => e.amount,
    });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);

  const startQuickEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setDraft({ amount: expense.amount, category: expense.category });
  };

  const saveQuickEdit = async (expense: Expense) => {
    if (!draft) return;
    try {
      await update("expenses", expense.id, {
        amount: draft.amount,
        category: draft.category,
      });
      toast.success("Expense updated");
      fetchExpenses();
    } catch {
      toast.error("Failed to update expense. Please try again.");
    } finally {
      setEditingId(null);
      setDraft(null);
    }
  };

  const desktopScrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: sortedExpenses.length,
    getScrollElement: () => desktopScrollRef.current,
    estimateSize: () => DESKTOP_ROW_HEIGHT,
    overscan: 8,
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground font-medium">
        Loading expenses...
      </div>
    );
  }

  const EmptyState = (
    <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
      <ReceiptText className="h-10 w-10 opacity-20 mb-3" />
      <p className="text-sm font-medium">No expenses found</p>
    </div>
  );

  const SearchInput = (
    <div className="flex items-center gap-2 bg-card border border-border md:bg-muted md:border-none rounded-[10px] px-3.5 py-2.5">
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

        <div className="grid grid-cols-[110px_150px_1fr_130px_120px_28px] gap-2 px-5 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wide border-b border-border bg-muted/20">
          <SortableHeaderCell
            label="Date"
            active={sortKey === "date"}
            direction={direction}
            onClick={() => toggleSort("date")}
          />
          <SortableHeaderCell
            label="Category"
            active={sortKey === "category"}
            direction={direction}
            onClick={() => toggleSort("category")}
          />
          <SortableHeaderCell
            label="Description"
            active={sortKey === "description"}
            direction={direction}
            onClick={() => toggleSort("description")}
          />
          <SortableHeaderCell
            label="Method"
            active={sortKey === "method"}
            direction={direction}
            onClick={() => toggleSort("method")}
          />
          <SortableHeaderCell
            label="Amount"
            active={sortKey === "amount"}
            direction={direction}
            onClick={() => toggleSort("amount")}
            className="justify-end"
          />
          <div />
        </div>

        <div ref={desktopScrollRef} className="flex-1 overflow-y-auto">
          {sortedExpenses.length === 0 && EmptyState}
          {sortedExpenses.length > 0 && (
            <div
              className="relative w-full"
              style={{ height: rowVirtualizer.getTotalSize() }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const expense = sortedExpenses[virtualRow.index];
                const isEditingRow = editingId === expense.id;
                return (
                  <ExpenseDesktopRow
                    key={expense.id}
                    expense={expense}
                    currencyCode={storeProfile?.currency}
                    style={{
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    isEditing={isEditingRow}
                    draft={isEditingRow ? draft : null}
                    onDraftChange={setDraft}
                    onSelect={() => setSelectedExpenseId(expense.id)}
                    onStartEdit={() => startQuickEdit(expense)}
                    onSave={() => saveQuickEdit(expense)}
                    onCancel={() => {
                      setEditingId(null);
                      setDraft(null);
                    }}
                  />
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
