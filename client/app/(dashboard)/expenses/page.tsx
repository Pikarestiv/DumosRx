"use client";

import { ExpenseList } from "@/components/expenses/expense-list";
import { AddExpenseDialog } from "@/components/expenses/add-expense-dialog";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay";

export default function ExpensesPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setIsAddDialogOpen(true);
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const newUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      router.replace(newUrl);
    }
  }, [searchParams, router, pathname]);

  return (
    <>
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Expenses" featureKey="expenses" />
        <div className="w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">

            <Button
              onClick={() => setIsAddDialogOpen(true)}
              className="gap-2 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Add Expense
            </Button>
          </div>

          <ExpenseList key={isAddDialogOpen ? "open" : "closed"} />

          <AddExpenseDialog
            open={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
          />
        </div>
      </div>
    </>
  );
}
