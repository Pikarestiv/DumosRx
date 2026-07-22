"use client";

import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Search, ReceiptText } from "lucide-react";
import { useStore } from "@/lib/context/store-context";
import { useExpenseList } from "@/lib/hooks/use-finance-data";
import { ExpenseDetailDialog } from "./expense-detail-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CATEGORIES = [
  "All",
  "Rent",
  "Inventory Purchase",
  "Utilities",
  "Salaries",
  "Maintenance",
  "Marketing",
  "Other"
];

const CATEGORY_META: Record<string, { badgeClass: string }> = {
  'Rent':               { badgeClass: 'bg-chart-1/10 text-chart-1' },
  'Inventory Purchase': { badgeClass: 'bg-primary/10 text-primary' },
  'Utilities':          { badgeClass: 'bg-chart-3/10 text-chart-3' },
  'Salaries':           { badgeClass: 'bg-emerald-600/10 text-emerald-600' },
  'Maintenance':        { badgeClass: 'bg-muted text-muted-foreground' },
  'Marketing':          { badgeClass: 'bg-chart-2/10 text-chart-2' },
  'Other':              { badgeClass: 'bg-muted text-muted-foreground' },
  'Unknown':            { badgeClass: 'bg-muted text-muted-foreground' }
};

export function ExpenseList() {
  const { expenses, isLoading, refetch: fetchExpenses } = useExpenseList();
  const { storeProfile } = useStore();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);

  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchesSearch = !searchTerm || (exp.description?.toLowerCase() || "").includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === "All" || exp.category === selectedCategory;
      return matchesSearch && matchesCategory;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [expenses, searchTerm, selectedCategory]);

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  
  const thisMonthExpenses = expenses.filter(exp => {
    const expDate = new Date(exp.date);
    const now = new Date();
    return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
  }).reduce((sum, exp) => sum + exp.amount, 0);

  // Calculate top category this month
  const categoryTotals = expenses.filter(exp => {
    const expDate = new Date(exp.date);
    const now = new Date();
    return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
  }).reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>);
  
  const topCategoryStr = Object.keys(categoryTotals).length > 0 
    ? Object.keys(categoryTotals).reduce((a, b) => categoryTotals[a] > categoryTotals[b] ? a : b)
    : "—";

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground font-medium">Loading expenses...</div>;
  }

  const selectedExpense = expenses.find(e => e.id === selectedExpenseId) || null;

  return (
    <div className="flex flex-col min-h-0">
      
      {/* INSIGHTS STRIP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[12.5px] text-muted-foreground font-medium">Total expenses</div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3H8v4h8V3z"/></svg>
            </div>
          </div>
          <div className="text-2xl font-semibold font-serif tracking-tight mb-1.5">{formatCurrency(totalExpenses, storeProfile?.currency || "NGN")}</div>
          <div className="text-xs text-muted-foreground">all time</div>
        </div>
        
        <div className="bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[12.5px] text-muted-foreground font-medium">This month</div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-chart-1/10 text-chart-1">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            </div>
          </div>
          <div className="text-2xl font-semibold font-serif tracking-tight mb-1.5">{formatCurrency(thisMonthExpenses, storeProfile?.currency || "NGN")}</div>
          <div className="text-xs text-muted-foreground">{format(new Date(), "MMMM yyyy")}</div>
        </div>
        
        <div className="bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[12.5px] text-muted-foreground font-medium">Top category</div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="M7 15l4-6 3 4 4-7"/></svg>
            </div>
          </div>
          <div className="text-2xl font-semibold font-serif tracking-tight mb-1.5 truncate">{topCategoryStr}</div>
          <div className="text-xs text-muted-foreground">highest spend this month</div>
        </div>
        
        <div className="bg-card border border-border rounded-[14px] p-[18px] px-5 shadow-sm">
          <div className="flex items-center justify-between mb-3.5">
            <div className="text-[12.5px] text-muted-foreground font-medium">Transactions</div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            </div>
          </div>
          <div className="text-2xl font-semibold font-serif tracking-tight mb-1.5">{expenses.length}</div>
          <div className="text-xs text-muted-foreground">recorded all time</div>
        </div>
      </div>

      {/* CATEGORIES (Tabs) ABOVE TABLE */}
      <div className="mb-4">
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
          <TabsList className="w-full md:w-max justify-start overflow-x-auto overflow-y-hidden hide-scrollbar">
            {CATEGORIES.map(cat => (
              <TabsTrigger key={cat} value={cat}>
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* TABLE */}
      <div className="bg-card border border-border rounded-2xl flex-1 flex flex-col overflow-hidden">
        {/* Search */}
        <div className="p-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2 bg-muted border border-border rounded-[10px] px-3.5 py-2.5 max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <input 
              type="text" 
              placeholder="Search by description" 
              className="border-0 outline-none text-[13px] w-full bg-transparent text-foreground placeholder:text-muted-foreground"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:grid grid-cols-[110px_150px_1fr_130px_120px] gap-2 px-5 py-3 text-[11px] font-bold text-muted-foreground/80 uppercase tracking-wide border-b border-border bg-muted/20">
          <div>Date</div><div>Category</div><div>Description</div><div>Method</div><div className="text-right">Amount</div>
        </div>
        
        {/* List Content */}
        <div className="flex-1 overflow-y-auto">
          {filteredExpenses.length === 0 && (
                              <div className="flex flex-col items-center justify-center p-10 text-muted-foreground">
                                <ReceiptText className="h-10 w-10 opacity-20 mb-3" />
                                <p className="text-sm font-medium">No expenses found</p>
                              </div>
                            )}
                  {!(filteredExpenses.length === 0) && (
                              <div className="flex flex-col divide-y divide-border/50">
                                {filteredExpenses.map(expense => {
                                  const meta = CATEGORY_META[expense.category] || CATEGORY_META['Unknown'];
                                  return (
                                    <div 
                                      key={expense.id} 
                                      className="grid grid-cols-1 md:grid-cols-[110px_150px_1fr_130px_120px] gap-2 md:gap-2 items-center px-4 md:px-5 py-3.5 hover:bg-muted/50 cursor-pointer transition-colors"
                                      onClick={() => setSelectedExpenseId(expense.id)}
                                    >
                                      {/* Date */}
                                      <div className="text-[13px] font-medium hidden md:block">
                                        {format(new Date(expense.date), "MMM dd, yyyy")}
                                      </div>
                                      
                                      {/* Mobile top row: Description & Amount */}
                                      <div className="flex justify-between items-start md:hidden mb-1.5">
                                        <div className="text-[14px] font-semibold text-foreground truncate max-w-[75%]">{expense.description || "-"}</div>
                                        <div className="text-[15px] font-bold text-foreground">{formatCurrency(expense.amount, storeProfile?.currency || "NGN")}</div>
                                      </div>

                                      {/* Category */}
                                      <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}>
                                          {expense.category}
                                        </span>
                                      </div>
                                      
                                      {/* Description (Desktop) */}
                                      <div className="text-[13px] text-foreground truncate hidden md:block">
                                        {expense.description || "-"}
                                      </div>

                                      {/* Mobile bottom row: Date & Method */}
                                      <div className="flex items-center justify-between md:hidden mt-1 text-[12px] text-muted-foreground">
                                        <div>{format(new Date(expense.date), "MMM dd, yyyy")}</div>
                                        <div>{expense.payment_method}</div>
                                      </div>

                                      {/* Method (Desktop) */}
                                      <div className="text-[13px] text-muted-foreground hidden md:block">
                                        {expense.payment_method}
                                      </div>
                                      
                                      {/* Amount (Desktop) */}
                                      <div className="text-[14px] font-bold text-foreground text-right hidden md:block">
                                        {formatCurrency(expense.amount, storeProfile?.currency || "NGN")}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
        </div>
      </div>

      <ExpenseDetailDialog 
        expense={selectedExpense} 
        open={!!selectedExpenseId} 
        onOpenChange={(open) => !open && setSelectedExpenseId(null)}
        onDeleted={() => {
          setSelectedExpenseId(null);
          fetchExpenses();
        }}
      />
    </div>
  );
}
