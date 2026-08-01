"use client";

import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { Receipt } from "lucide-react";
import { DetailRow } from "./detail-row";

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
      title="Expense detail"
      className="sm:max-w-[440px] p-0 gap-0 overflow-hidden"
      headerClassName="px-5 py-4 pt-0 sm:pt-4 border-b border-border m-0"
    >
      <div className="px-5 py-[18px]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-rose-500/10 text-rose-600">
            <Receipt className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold truncate capitalize">
              {expense.category}
            </div>
            <div className="text-[12px] text-muted-foreground/70">
              {formatDateTime(expense.date || expense.created_at)}
            </div>
          </div>
          <div className="text-[18px] font-semibold text-rose-600 shrink-0">
            -{formatCurrency(expense.amount, currencyCode)}
          </div>
        </div>

        <div className="border-t border-border pt-3.5 flex flex-col gap-3">
          <DetailRow
            label="Payment method"
            value={expense.payment_method || "N/A"}
            valueClassName="capitalize"
          />
          {expense.reference_number && (
            <DetailRow
              label="Reference number"
              value={expense.reference_number}
            />
          )}
          {expense.vendor_name && (
            <DetailRow label="Vendor name" value={expense.vendor_name} />
          )}
          {expense.recorded_by_name && (
            <DetailRow label="Recorded by" value={expense.recorded_by_name} />
          )}
          <div>
            <div className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide mb-1">
              Description
            </div>
            <div className="text-[13px] text-foreground bg-muted/30 p-3 rounded-md">
              {expense.description || "No description provided."}
            </div>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
