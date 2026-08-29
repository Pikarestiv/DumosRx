"use client";

import { Plus, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { POItemBuilder } from "./po-item-builder";
import type { ProductViewModel } from "@/lib/types/product";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";

interface Supplier {
  id: string;
  name: string;
}

/** Selecting this represents "no real vendor on file" — maps to a null
 * supplier_id at submit time (see new/page.tsx, edit/page.tsx), the same
 * convention sales.customer_id uses for "Walk-in Customer". */
export const SELF_PURCHASE_VENDOR_ID = "__self__";
const CREATE_SUPPLIER_OPTION = "__create_supplier__";

interface POOrderFormFieldsProps {
  poType: "standard" | "immediate";
  setPoType: (type: "standard" | "immediate") => void;
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
  products: POProduct[];
  items: POLineItemDraft[];
  onItemsChange: (items: POLineItemDraft[]) => void;
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId: string | null;
  onNewlyCreatedProductConsumed: () => void;
  onOpenAddSupplier: () => void;
  /** Editing an existing PO is only ever done for Standard POs (Immediate
   * ones are created already "received" and never enter an editable
   * state), so the edit page hides the toggle entirely rather than showing
   * a control whose "Immediate" option would silently do nothing. */
  hideTypeToggle?: boolean;
}

/** Vendor/notes/payment/due-date/add-item fields shared by the create and
 * edit purchase order desktop panels. */
export function POOrderFormFields({
  poType,
  setPoType,
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
  products,
  items,
  onItemsChange,
  onOpenAddProduct,
  newlyCreatedProductId,
  onNewlyCreatedProductConsumed,
  onOpenAddSupplier,
  hideTypeToggle,
}: POOrderFormFieldsProps) {
  const handleVendorChange = (value: string) => {
    if (value === CREATE_SUPPLIER_OPTION) {
      onOpenAddSupplier();
      return;
    }
    setSelectedSupplierId(value);
  };

  return (
    <>
      {!hideTypeToggle && (
        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-semibold text-foreground">
            Order Type
          </Label>
          <div className="inline-flex rounded-[10px] border border-border bg-muted p-1">
            {(["immediate", "standard"] as const).map((type) => (
              <button
                key={type}
                type="button"
                disabled={items.length > 0}
                title={items.length > 0 ? "Start a new PO to change type" : undefined}
                onClick={() => setPoType(type)}
                className={`px-3.5 h-8 rounded-[8px] text-[12.5px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  poType === type ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                }`}
              >
                {type === "immediate" ? "Immediate Purchase" : "Purchase Order"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-semibold text-foreground">
            Select Vendor
          </Label>
          <Select value={selectedSupplierId} onValueChange={handleVendorChange}>
            <SelectTrigger className="w-full border border-border rounded-[10px] px-3.5 h-11 data-[size=default]:h-11 text-[13px] bg-card shadow-sm">
              <SelectValue placeholder="Choose a supplier..." />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              <SelectItem value={CREATE_SUPPLIER_OPTION} className="font-semibold text-primary focus:text-primary">
                <span className="flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Create Supplier
                </span>
              </SelectItem>
              <SelectItem value={SELF_PURCHASE_VENDOR_ID}>
                Self / Walk-in Purchase
              </SelectItem>
              {suppliers.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-semibold text-foreground">
            Internal Notes
          </Label>
          <Input
            placeholder="Ref. # or special instructions"
            className="w-full border border-border rounded-[10px] px-3.5 h-11 text-[13px] bg-card shadow-sm"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-semibold text-foreground">
            Payment Status
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
          <Label className="text-[12.5px] font-semibold text-foreground">
            Due Date (Optional)
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        </div>
      )}

      <div className="border border-border rounded-xl bg-card mt-2 shadow-sm">
        <div className="bg-primary/5 px-4 py-3 flex items-center gap-2 border-b border-border rounded-t-[11px]">
          <ShoppingCart className="w-4 h-4 text-primary" />
          <div className="text-[13.5px] font-semibold text-foreground">
            Add Items to Order
          </div>
        </div>
        <div className="p-4">
          <POItemBuilder
            poType={poType}
            products={products}
            items={items}
            onItemsChange={onItemsChange}
            onOpenAddProduct={onOpenAddProduct}
            newlyCreatedProductId={newlyCreatedProductId}
            onNewlyCreatedProductConsumed={onNewlyCreatedProductConsumed}
          />
        </div>
      </div>
      <div className="text-[11.5px] text-muted-foreground px-1">
        <span className="lg:hidden">
          Items appear in the Order Summary below as you add them.
        </span>
        <span className="hidden lg:inline">
          Items appear in the Order Summary panel on the right as you add
          them.
        </span>
      </div>
    </>
  );
}
