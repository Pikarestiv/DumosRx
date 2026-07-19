"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { recordSupplierPayment } from "@/lib/db/supplier-debt-queries";

interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplierId: string;
  supplierName: string;
  poId: string;
  poNumber: string;
  amountOwed: number;
  onPaymentRecorded: () => void;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  supplierId,
  supplierName,
  poId,
  poNumber,
  amountOwed,
  onPaymentRecorded,
}: RecordPaymentDialogProps) {
  const [amount, setAmount] = useState(amountOwed.toString());
  const [paymentMethod, setPaymentMethod] = useState("transfer");
  const [referenceNote, setReferenceNote] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const paymentAmount = Number(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    
    if (paymentAmount > amountOwed) {
      toast.error("Payment amount cannot exceed the total amount owed");
      return;
    }

    setIsSubmitting(true);
    try {
      await recordSupplierPayment(
        supplierId,
        supplierName,
        poId,
        paymentAmount,
        paymentMethod,
        referenceNote,
        paymentDate
      );
      toast.success("Payment recorded successfully");
      onPaymentRecorded();
      onOpenChange(false);
      setAmount(amountOwed.toString());
      setReferenceNote("");
    } catch (error) {
      console.error("Failed to record payment:", error);
      toast.error("Error recording payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={<>Record Payment</>} description={<>Record a payment to {supplierName} for PO #{poNumber}</>} className="max-w-md bg-card/95 backdrop-blur-xl border-accent/20">

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Amount (Max: ₦{amountOwed.toLocaleString()})</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-muted/30"
              max={amountOwed}
            />
          </div>

          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="bg-muted/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="bg-muted/30"
            />
          </div>

          <div className="space-y-2">
            <Label>Reference Note</Label>
            <Input
              placeholder="Transaction ID or Cheque No."
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              className="bg-muted/30"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save Payment"}
          </Button>
        </div>
      </ResponsiveModal>
  );
}
