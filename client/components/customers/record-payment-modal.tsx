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

interface RecordPaymentModalProps {
  customer: Customer | null;
  currencyCode?: string;
  onClose: () => void;
  onSubmit: (amount: number, paymentMethod: string, notes: string) => Promise<void>;
}

export function RecordPaymentModal({
  customer,
  currencyCode = "NGN",
  onClose,
  onSubmit,
}: RecordPaymentModalProps) {
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (customer) {
      setAmount(customer.outstanding_balance.toString());
      setPaymentMethod("cash");
      setNotes("");
    }
  }, [customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    const numericAmount = parseFloat(amount);
    if (!numericAmount || numericAmount <= 0) return;

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
    >
      {customer && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-accent hover:bg-accent/90">
              {loading ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      )}
    </ResponsiveModal>
  );
}
