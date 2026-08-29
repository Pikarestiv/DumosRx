"use client";

import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SupplierCombobox } from "./supplier-combobox";

interface Supplier {
  id: string;
  name: string;
}

/** Selecting this represents "no real vendor on file" — maps to a null
 * supplier_id at submit time (see new/page.tsx, edit/page.tsx), the same
 * convention sales.customer_id uses for "Walk-in Customer". */
export const SELF_PURCHASE_VENDOR_ID = "__self__";

interface PODetailsFieldsProps {
  poType: "standard" | "immediate";
  setPoType: (type: "standard" | "immediate") => void;
  poTypeLocked?: boolean;
  suppliers: Supplier[];
  selectedSupplierId: string;
  setSelectedSupplierId: (id: string) => void;
  notes: string;
  setNotes: (notes: string) => void;
  paymentStatus: string;
  setPaymentStatus: (status: string) => void;
  dueDate: string;
  setDueDate: (date: string) => void;
  amountPaid: string;
  setAmountPaid: (amount: string) => void;
  totalAmount: number;
  onOpenAddSupplier: () => void;
  /** Editing an existing PO is only ever done for Standard POs (Immediate
   * ones are created already "received" and never enter an editable
   * state), so the edit page hides the toggle entirely rather than showing
   * a control whose "Immediate" option would silently do nothing. */
  hideTypeToggle?: boolean;
}

/** Vendor/type/notes/payment/due-date fields — the "Order Details" step
 * shown before item entry, and re-editable afterward via PODetailsDialog. */
export function PODetailsFields({
  poType,
  setPoType,
  poTypeLocked,
  suppliers,
  selectedSupplierId,
  setSelectedSupplierId,
  notes,
  setNotes,
  paymentStatus,
  setPaymentStatus,
  dueDate,
  setDueDate,
  amountPaid,
  setAmountPaid,
  totalAmount,
  onOpenAddSupplier,
  hideTypeToggle,
}: PODetailsFieldsProps) {
  return (
    <div className="flex flex-col gap-4">
      {!hideTypeToggle && (
        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-semibold text-foreground">
            Order Type
          </Label>
          <Tabs
            value={poType}
            onValueChange={(val) => setPoType(val as "immediate" | "standard")}
            className="w-fit"
          >
            <TabsList>
              <TabsTrigger
                value="immediate"
                disabled={poTypeLocked}
                title={poTypeLocked ? "Start a new PO to change type" : undefined}
              >
                Immediate Purchase
              </TabsTrigger>
              <TabsTrigger
                value="standard"
                disabled={poTypeLocked}
                title={poTypeLocked ? "Start a new PO to change type" : undefined}
              >
                Purchase Order
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-semibold text-foreground">
            Select Vendor
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
          <Label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1">
            Payment Status
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 opacity-50 cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    Whether the vendor has been paid for this order yet.
                    Doesn&apos;t affect receiving stock or item entry.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Select value={paymentStatus} onValueChange={setPaymentStatus}>
            <SelectTrigger className="w-full border border-border rounded-[10px] px-3.5 h-11 data-[size=default]:h-11 text-[13px] bg-card shadow-sm">
              <SelectValue placeholder="Select status..." />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value="unpaid">Unpaid (Full Credit)</SelectItem>
              <SelectItem value="partial">Partial Payment</SelectItem>
              <SelectItem value="paid">Fully Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-semibold text-foreground flex items-center gap-1">
            Due Date (Optional)
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="w-3 h-3 opacity-50 cursor-pointer" />
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
      </div>

      {paymentStatus !== "unpaid" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[12.5px] font-semibold text-foreground">
              Amount Paid (
              {paymentStatus === "paid" ? "Total" : "Initial Payment"})
            </Label>
            <Input
              type="number"
              placeholder="0.00"
              className="w-full border border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm"
              value={paymentStatus === "paid" ? totalAmount : amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              disabled={paymentStatus === "paid"}
            />
            {paymentStatus === "paid" && (
              <p className="text-[11px] text-muted-foreground">
                Automatically set to the order total — no need to enter it.
              </p>
            )}
          </div>
        </div>
      )}

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
