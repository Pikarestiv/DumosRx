"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banknote, CreditCard, Smartphone, Wallet, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface POSPaymentDialogProps {
  showPaymentDialog: boolean;
  setShowPaymentDialog: (show: boolean) => void;
  total: number;
  paymentMethod: "cash" | "card" | "transfer" | "credit";
  setPaymentMethod: (method: "cash" | "card" | "transfer" | "credit") => void;
  amountPaid: string;
  setAmountPaid: (amount: string) => void;
  processingPayment: boolean;
  handlePayment: () => void;
  selectedCustomer: any;
  currencyCode?: string;
}

export function POSPaymentDialog({
  showPaymentDialog,
  setShowPaymentDialog,
  total,
  paymentMethod,
  setPaymentMethod,
  amountPaid,
  setAmountPaid,
  processingPayment,
  handlePayment,
  selectedCustomer,
  currencyCode,
}: POSPaymentDialogProps) {
  return (
    <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif font-bold">Payment</DialogTitle>
          <DialogDescription>
            Total amount: {formatCurrency(total, currencyCode)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Payment Method</label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Button
                variant={paymentMethod === "cash" ? "default" : "outline"}
                onClick={() => setPaymentMethod("cash")}
                className="flex flex-col gap-1 h-16"
              >
                <Banknote className="h-5 w-5" />
                <span className="text-xs">Cash</span>
              </Button>
              <Button
                variant={paymentMethod === "card" ? "default" : "outline"}
                onClick={() => setPaymentMethod("card")}
                className="flex flex-col gap-1 h-16"
              >
                <CreditCard className="h-5 w-5" />
                <span className="text-xs">Card</span>
              </Button>
              <Button
                variant={paymentMethod === "transfer" ? "default" : "outline"}
                onClick={() => setPaymentMethod("transfer")}
                className="flex flex-col gap-1 h-16"
              >
                <Smartphone className="h-5 w-5" />
                <span className="text-xs">Transfer</span>
              </Button>
              <Button
                variant={paymentMethod === "credit" ? "default" : "outline"}
                onClick={() => {
                  if (!selectedCustomer) {
                    toast.error("Please select a customer for credit sales");
                    return;
                  }
                  setPaymentMethod("credit");
                }}
                className="flex flex-col gap-1 h-16"
              >
                <Wallet className="h-5 w-5" />
                <span className="text-xs">Credit</span>
              </Button>
            </div>
          </div>

          {paymentMethod === "cash" && (
            <div>
              <label className="text-sm font-medium">Amount Paid</label>
              <Input
                type="number"
                placeholder="0.00"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="mt-1"
              />
              {amountPaid && Number.parseFloat(amountPaid) >= total && (
                <p className="text-sm text-muted-foreground mt-1">
                  Change:{" "}
                  {formatCurrency(Number.parseFloat(amountPaid) - total, currencyCode)}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPaymentDialog(false)}
              className="flex-1"
              disabled={processingPayment}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePayment}
              className="flex-1 bg-accent hover:bg-accent/90"
              disabled={processingPayment}
            >
              {processingPayment && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {processingPayment ? "Processing..." : "Process Payment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
