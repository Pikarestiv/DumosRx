"use client";

import { HelpCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { SupplierCombobox } from "./supplier-combobox";
import { useFormatCurrency } from "@/lib/hooks/use-format-currency";
import { amountPaidForSave, derivePaymentStatus } from "./po-payment";

interface Supplier {
  id: string;
  name: string;
}

// Selecting this represents "no real vendor on file" — maps to a null supplier_id at submit time (see new/page.tsx, edit/p…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-details-fields-tsx-L30
export const SELF_PURCHASE_VENDOR_ID = "__self__";

const PAYMENT_STATUS_TEXT = {
  unpaid: "Unpaid",
  partial: "Part paid, a balance remains",
  paid: "Fully paid",
} as const;

interface PODetailsFieldsProps {
  suppliers: Supplier[];
  selectedSupplierId: string;
  setSelectedSupplierId: (id: string) => void;
  notes: string;
  setNotes: (notes: string) => void;
  paidInFull: boolean;
  setPaidInFull: (paidInFull: boolean) => void;
  dueDate: string;
  setDueDate: (date: string) => void;
  amountPaid: string;
  setAmountPaid: (amount: string) => void;
  // The order's running total, so the Amount Paid field can name the cap getValidatedAmountPaid applies to it at save time.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-details-fields-tsx-L50
  totalAmount?: number;
  onOpenAddSupplier: () => void;
}

/** Vendor/notes/payment/due-date fields, opened from the order's header bar. */
export function PODetailsFields({
  suppliers,
  selectedSupplierId,
  setSelectedSupplierId,
  notes,
  setNotes,
  paidInFull,
  setPaidInFull,
  dueDate,
  setDueDate,
  amountPaid,
  setAmountPaid,
  totalAmount = 0,
  onOpenAddSupplier,
}: PODetailsFieldsProps) {
  const formatCurrency = useFormatCurrency();
  const hasOrderTotal = totalAmount > 0;
  const exceedsOrderTotal =
    !paidInFull && hasOrderTotal && Number(amountPaid) > totalAmount;
  const shownAmount = paidInFull ? String(totalAmount) : amountPaid;
  const paymentStatus = derivePaymentStatus(amountPaidForSave({ paidInFull, amountPaid }, totalAmount), totalAmount);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1">
            Select Vendor
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 opacity-50 cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    The supplier you&apos;re ordering from. Pick
                    &quot;Self / Walk-in Purchase&quot; if there&apos;s no
                    vendor on file for this order.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <SupplierCombobox
            value={selectedSupplierId}
            suppliers={suppliers}
            onChange={setSelectedSupplierId}
            onCreateNew={onOpenAddSupplier}
            selfPurchaseId={SELF_PURCHASE_VENDOR_ID}
            className="border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-amount-paid" className="text-[12.5px] font-semibold text-foreground flex items-center gap-1">
            Amount Paid
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3 h-3 opacity-50 cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    What has been paid to the vendor so far. Unpaid, part paid or
                    fully paid follows from it. Doesn&apos;t affect receiving stock.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <div className="flex gap-2">
            <Input
              id="po-amount-paid"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              max={hasOrderTotal ? totalAmount : undefined}
              aria-label="Amount Paid"
              placeholder="0.00"
              className="w-full border border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm"
              value={shownAmount}
              onChange={(e) => setAmountPaid(e.target.value)}
            />
            <Button
              type="button"
              variant={paidInFull ? "default" : "outline"}
              className="h-11 shrink-0 rounded-[10px]"
              aria-pressed={paidInFull}
              onClick={() => setPaidInFull(!paidInFull)}
            >
              Paid in full
            </Button>
          </div>
          <p className="text-[11.5px] text-muted-foreground leading-snug">
            {PAYMENT_STATUS_TEXT[paymentStatus]}
            {hasOrderTotal
              ? ` · Max ${formatCurrency(totalAmount)}, the order total.`
              : " · The total comes from the items you add."}
          </p>
          {exceedsOrderTotal && (
            <p className="text-[11.5px] text-destructive font-medium leading-snug">
              Above the order total — this will be capped at{" "}
              {formatCurrency(totalAmount)}.
            </p>
          )}
        </div>
        {paymentStatus !== "paid" && (
          <div className="space-y-1.5">
            <Label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1">
              Due Date (Optional)
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 opacity-50 cursor-pointer" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      When payment is due to the vendor, not when the items are
                      expected to arrive.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <DatePickerInput
              value={dueDate}
              onChange={(val) => setDueDate(val)}
              disablePast
              fromYear={new Date().getFullYear()}
              toYear={new Date().getFullYear() + 3}
              className="w-full [&_input]:bg-card [&_input]:shadow-sm [&_input]:border [&_input]:border-border [&_input]:rounded-[10px] [&_input]:px-3.5 [&_input]:h-11 [&_input]:text-[13px]"
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-[12.5px] font-semibold text-foreground">
          Internal Notes
        </Label>
        <Textarea
          placeholder="Ref. # or special instructions"
          className="w-full border border-border rounded-[10px] px-3.5 py-2.5 text-[13px] bg-card shadow-sm min-h-[90px] resize-none"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
    </div>
  );
}
