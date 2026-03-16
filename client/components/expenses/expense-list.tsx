"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { query, softDelete } from "@/lib/db/local-database";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Trash2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/context/store-context";

interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: string;
  payment_method: string;
}

export function ExpenseList() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { storeProfile } = useStore();

  const fetchExpenses = async () => {
    try {
      const data = await query<Expense>(
        "SELECT * FROM expenses WHERE _deleted = 0 ORDER BY date DESC"
      );
      setExpenses(data);
    } catch (error) {
      console.error("Failed to fetch expenses:", error);
      toast.error("Failed to load expenses");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this expense?")) return;

    try {
      await softDelete("expenses", id);
      toast.success("Expense deleted");
      fetchExpenses();
    } catch (error) {
      console.error("Failed to delete expense:", error);
      toast.error("Failed to delete expense");
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center">Loading expenses...</div>;
  }

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatCurrency(totalExpenses, storeProfile?.currency || "NGN")}</div>
            <p className="text-xs text-muted-foreground">Total Expenses (All Time)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <ReceiptText className="h-8 w-8 opacity-20" />
                      <p>No expenses recorded yet</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell>{format(new Date(expense.date), "MMM dd, yyyy")}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground">
                        {expense.category}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate">
                      {expense.description || "-"}
                    </TableCell>
                    <TableCell>{expense.payment_method}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(expense.amount, storeProfile?.currency || "NGN")}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(expense.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
