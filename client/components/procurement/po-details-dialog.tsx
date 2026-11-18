"use client";

import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { PODetailsFields } from "./po-details-fields";

interface Supplier {
  id: string;
  name: string;
}

interface PODetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  totalAmount?: number;
  onOpenAddSupplier: () => void;
}

// Re-opens PODetailsFields after the order-details step has been confirmed, so vendor/notes/payment/due-date stay editable…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-procurement-po-details-dialog-tsx-L33
export function PODetailsDialog({
  open,
  onOpenChange,
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
}: PODetailsDialogProps) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Order Details"
      description="Vendor, payment terms, and other order-level details."
      footer={
        <Button className="w-full sm:w-auto ml-auto" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      <PODetailsFields
        suppliers={suppliers}
        selectedSupplierId={selectedSupplierId}
        setSelectedSupplierId={setSelectedSupplierId}
        notes={notes}
        setNotes={setNotes}
        paymentStatus={paymentStatus}
        setPaymentStatus={setPaymentStatus}
        dueDate={dueDate}
        setDueDate={setDueDate}
        amountPaid={amountPaid}
        setAmountPaid={setAmountPaid}
        totalAmount={totalAmount}
        onOpenAddSupplier={onOpenAddSupplier}
      />
    </ResponsiveModal>
  );
}
