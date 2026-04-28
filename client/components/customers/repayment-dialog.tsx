"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { formatCurrency } from "@/lib/utils";
import { insert, update } from "@/lib/db/local-database";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface RepaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: any;
  onSuccess: () => void;
  currencyCode?: string;
}

export function RepaymentDialog({
  open,
  onOpenChange,
  customer,
  onSuccess,
  currencyCode,
}: RepaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async () => {
    const paymentAmount = parseFloat(amount);
    if (!paymentAmount || paymentAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (paymentAmount > customer.outstanding_balance) {
      toast.warning("Payment amount exceeds outstanding balance");
    }

    setProcessing(true);
    try {
      // 1. Record the payment
      await insert("customer_payments", {
        customer_id: customer.id,
        amount: paymentAmount,
        payment_method: method,
        notes: notes,
        payment_date: new Date().toISOString(),
      });

      // 2. Update customer balance
      const newBalance = Math.max(0, customer.outstanding_balance - paymentAmount);
      await update("customers", customer.id, {
        outstanding_balance: newBalance,
      });

      toast.success("Repayment recorded successfully");
      onSuccess();
      onOpenChange(false);
      setAmount("");
      setNotes("");
    } catch (error) {
      console.error("Repayment failed", error);
      toast.error("Failed to record repayment");
    } finally {
      setProcessing(false);
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Record Repayment</DialogTitle>
          <DialogDescription>
            Record a payment from {customer.name} to reduce their debt.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="bg-muted/50 p-3 rounded-lg flex justify-between items-center">
            <span className="text-sm font-medium">Current Debt:</span>
            <span className="text-lg font-bold text-destructive">
              {formatCurrency(customer.outstanding_balance, currencyCode)}
            </span>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount">Payment Amount</Label>
            <Input
              id="amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="method">Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="pos">POS Terminal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="e.g. Partial payment for Feb sales"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={processing}>
            {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
