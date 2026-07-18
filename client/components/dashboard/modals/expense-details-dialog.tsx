"use client";

import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency, formatDateTime } from "@/lib/utils";

interface ExpenseDetailsDialogProps {
  expense: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currencyCode?: string;
}

export function ExpenseDetailsDialog({
  expense,
  open,
  onOpenChange,
  currencyCode = "NGN",
}: ExpenseDetailsDialogProps) {
  if (!expense) return null;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Expense Details"
      description={`Category: ${expense.category}`}
      className="sm:max-w-md"
    >
      <div className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Amount</p>
            <p className="font-medium text-lg text-foreground">
              {formatCurrency(expense.amount, currencyCode)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Date</p>
            <p className="font-medium">
              {formatDateTime(expense.date || expense.created_at)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Payment Method</p>
            <p className="font-medium capitalize">{expense.payment_method || "N/A"}</p>
          </div>
          {expense.reference_number && (
            <div>
              <p className="text-sm text-muted-foreground">Reference Number</p>
              <p className="font-medium">{expense.reference_number}</p>
            </div>
          )}
          {expense.vendor_name && (
            <div className="col-span-2">
              <p className="text-sm text-muted-foreground">Vendor Name</p>
              <p className="font-medium">{expense.vendor_name}</p>
            </div>
          )}
          <div className="col-span-2">
            <p className="text-sm text-muted-foreground">Description</p>
            <p className="font-medium bg-muted/30 p-3 rounded-md mt-1">
              {expense.description || "No description provided."}
            </p>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
