"use client";

import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { ExpenseList } from "@/components/expenses/expense-list";
import { AddExpenseDialog } from "@/components/expenses/add-expense-dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay";

export default function ExpensesPage() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  return (
    <DashboardLayout>
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Expenses" featureKey="expenses" />
        <div className="container mx-auto p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
              <p className="text-muted-foreground">
                Track and manage your business operational costs
              </p>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
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
    </DashboardLayout>
  );
}
