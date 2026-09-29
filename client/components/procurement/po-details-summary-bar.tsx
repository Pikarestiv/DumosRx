"use client";

import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { formatDateToDDMMYYYY } from "@/lib/utils/date-utils";

interface PODetailsSummaryBarProps {
  vendorName: string;
  /** Omitted entirely on the edit page, where every PO is Standard and a
   * type badge would be redundant with the page's own "Edit Purchase
   * Order" title. */
  poTypeLabel?: string;
  /** Payment terms stay visible here once the details form collapses -
   * otherwise payment status, due date and amount paid are entered and then
   * disappear from the screen entirely until the dialog is reopened. */
  paymentStatus?: string;
  dueDate?: string;
  amountPaid?: string;
  onEdit: () => void;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  unpaid: "Unpaid",
  partial: "Partial payment",
  paid: "Fully paid",
};

function SummaryChip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 inline-flex items-center rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10.5px] font-semibold">
      {children}
    </span>
  );
}

/** Compact stand-in for the full details form once it's been confirmed:
 * shows just enough to orient the user (vendor, type, payment terms) plus a
 * way back into PODetailsFields via PODetailsDialog, so item entry can be
 * the dominant content on screen instead of competing with the form above
 * it. */
export function PODetailsSummaryBar({
  vendorName,
  poTypeLabel,
  paymentStatus,
  dueDate,
  amountPaid,
  onEdit,
}: PODetailsSummaryBarProps) {
  const paymentLabel = paymentStatus
    ? PAYMENT_STATUS_LABEL[paymentStatus] ?? paymentStatus
    : undefined;
  const showAmountPaid =
    paymentStatus === "partial" && !!amountPaid && Number(amountPaid) > 0;

  return (
    <div className="flex items-start justify-between gap-3 border border-border rounded-xl bg-card px-4 py-3 shadow-sm">
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Vendor
          </span>
          {poTypeLabel && (
            <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[10.5px] font-semibold">
              {poTypeLabel}
            </span>
          )}
        </div>
        <div className="text-[14px] font-semibold text-foreground break-words">
          {vendorName}
        </div>
        {(paymentLabel || dueDate || showAmountPaid) && (
          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
            {paymentLabel && <SummaryChip>{paymentLabel}</SummaryChip>}
            {showAmountPaid && (
              <SummaryChip>
                Paid {formatCurrency(Number(amountPaid))}
              </SummaryChip>
            )}
            {dueDate && (
              <SummaryChip>Due {formatDateToDDMMYYYY(dueDate)}</SummaryChip>
            )}
          </div>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        aria-label="Edit order details"
        title="Edit details"
        onClick={onEdit}
      >
        <Pencil className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
