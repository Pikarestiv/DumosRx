"use client";

import { ExpenseList } from "@/components/expenses";
import { AddExpenseDialog } from "@/components/expenses/add-expense-dialog";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay";
import { RequireRole } from "@/components/auth/require-role";

function ExpensesPageContent() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setIsAddDialogOpen(true);
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const newUrl =
        pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      router.replace(newUrl);
    }
  }, [searchParams, router, pathname]);

  return (
    <>
      {/* The page design has no title slot; a top-level heading is still
          required for screen-reader/landmark navigation (WCAG 1.3.1/2.4.6). */}
      <h1 className="sr-only">Expenses</h1>
      <div className="relative w-full h-full min-h-[500px]">
        <LockedModuleOverlay featureName="Expenses" featureKey="expenses" />
        <div className="w-full">
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

export default function ExpensesPage() {
  return (
    <RequireRole allowSalesStaff>
      <ExpensesPageContent />
    </RequireRole>
  );
}
