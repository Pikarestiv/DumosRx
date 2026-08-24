"use client";

import { useState } from "react";
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
import { POAddItemForm } from "./po-add-item-form";
import type { Product, ProductViewModel } from "@/lib/types/product";
import type { DraftPOLineItem } from "@/lib/db/procurement";

interface Supplier {
  id: string;
  name: string;
}

interface POOrderFormFieldsProps {
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
  products: Product[];
  onAddLineItem: (item: DraftPOLineItem) => void;
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId: string | null;
  onNewlyCreatedProductConsumed: () => void;
  onOpenAddSupplier: () => void;
}

/** Vendor/notes/payment/due-date/add-item fields shared by the create and
 * edit purchase order desktop panels. */
export function POOrderFormFields({
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
  onAddLineItem,
  onOpenAddProduct,
  newlyCreatedProductId,
  onNewlyCreatedProductConsumed,
  onOpenAddSupplier,
}: POOrderFormFieldsProps) {
  // Controlled so the empty-state "Add a supplier first" link can force this
  // closed before opening the add-supplier dialog. stopPropagation() on
  // that click (needed to stop it from also selecting a SelectItem) also
  // blocks Radix Select's own outside-click-close detection, so left
  // uncontrolled the popover stayed open behind the dialog and ate its clicks.
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-[12.5px] font-semibold text-foreground">
            Select Vendor
          </Label>
          <div className="flex gap-2">
            <Select
              value={selectedSupplierId}
              onValueChange={setSelectedSupplierId}
              open={isSelectOpen}
              onOpenChange={setIsSelectOpen}
            >
              <SelectTrigger className="w-full border border-border rounded-[10px] px-3.5 h-11 data-[size=default]:h-11 text-[13px] bg-card shadow-sm">
                <SelectValue placeholder="Choose a supplier..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {suppliers.length === 0 ? (
                  <div className="py-4 text-center text-[12.5px] text-muted-foreground px-2 flex flex-col items-center justify-center gap-1.5">
                    <span>No suppliers available</span>
                    <Button
                      variant="link"
                      className="h-auto p-0 text-[11px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsSelectOpen(false);
                        onOpenAddSupplier();
                      }}
                    >
                      Add a supplier first
                    </Button>
                  </div>
                ) : (
                  suppliers.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-11 w-11 shrink-0 rounded-[10px] border-border bg-card shadow-sm"
              title="Add New Supplier"
              onClick={onOpenAddSupplier}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
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
          <POAddItemForm
            products={products}
            onAddItem={onAddLineItem}
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
