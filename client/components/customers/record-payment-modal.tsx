"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Customer } from "@/lib/hooks/use-customer-data";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface RecordPaymentModalProps {
  customer: Customer | null;
  currencyCode?: string;
  onClose: () => void;
  onSubmit: (
    amount: number,
    paymentMethod: string,
    notes: string,
  ) => Promise<void>;
  // Prefill amount when it should differ from the customer's full outstanding_balance, e.g.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-customers-record-payment-modal-tsx-L30
  defaultAmount?: number;
  // Extra note shown under the description, e.g.
  // Rationale: docs/CLIENT_COMMENTS.md#block-components-customers-record-payment-modal-tsx-L34
  helperNote?: string;
}

export function RecordPaymentModal({
  customer,
  currencyCode = "NGN",
  onClose,
  onSubmit,
  defaultAmount,
  helperNote,
}: RecordPaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (customer) {
      setAmount((defaultAmount ?? customer.outstanding_balance).toString());
      setPaymentMethod("cash");
      setNotes("");
    }
  }, [customer, defaultAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) return;

    // The `max` on the amount input is only an HTML hint — enforce it here too.
    // Rationale: docs/CLIENT_COMMENTS.md#line-components-customers-record-payment-modal-tsx-L67
    if (numericAmount > customer.outstanding_balance) {
      toast.error(
        `Payment cannot exceed the outstanding balance of ${formatCurrency(customer.outstanding_balance, currencyCode)}.`,
      );
      return;
    }

    setLoading(true);
    try {
      await onSubmit(numericAmount, paymentMethod, notes);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal
      open={!!customer}
      onOpenChange={(open) => !open && onClose()}
      title={<span className="font-serif font-bold">Record Payment</span>}
      description={
        customer
          ? `Log a debt payment for ${customer.name}. Outstanding balance: ${formatCurrency(customer.outstanding_balance, currencyCode)}.`
          : undefined
      }
      className="sm:max-w-md"
      footer={
        customer && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="record-payment-form"
              disabled={loading}
              className="bg-accent hover:bg-accent/90"
            >
              {loading ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        )
      }
    >
      {customer && (
        <form
          id="record-payment-form"
          onSubmit={(e) => void handleSubmit(e)}
          className="space-y-4"
        >
          {helperNote && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2.5">
              {helperNote}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              inputMode="decimal"
              min={0}
              max={customer.outstanding_balance}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger id="paymentMethod">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this payment..."
            />
          </div>
        </form>
      )}
    </ResponsiveModal>
  );
}
