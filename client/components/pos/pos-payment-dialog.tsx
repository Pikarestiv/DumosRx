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
  paymentMethod: "cash" | "card" | "transfer" | "credit" | "mixed";
  setPaymentMethod: (method: "cash" | "card" | "transfer" | "credit" | "mixed") => void;
  amountPaid: string;
  setAmountPaid: (amount: string) => void;
  processingPayment: boolean;
  handlePayment: () => void;
  selectedCustomer: any;
  currencyCode?: string;
  selectedAccountId?: string;
  setSelectedAccountId?: (id: string) => void;
  paymentSplits?: {method: string; amount: number; accountId?: string}[];
  setPaymentSplits?: (splits: {method: string; amount: number; accountId?: string}[]) => void;
  requirePaymentAccount?: boolean;
  enabledPaymentMethods?: string[];
  paymentAccounts?: any[];
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
  selectedAccountId,
  setSelectedAccountId,
  paymentSplits,
  setPaymentSplits,
  requirePaymentAccount,
  enabledPaymentMethods = ["cash", "card", "transfer", "credit"],
  paymentAccounts = [],
}: POSPaymentDialogProps) {
  const isMethodEnabled = (method: string) => enabledPaymentMethods.includes(method);

  const handleAddSplit = (method: string) => {
    if (!setPaymentSplits || !paymentSplits) return;
    const remaining = Math.max(0, total - paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0));
    setPaymentSplits([...paymentSplits, { method, amount: remaining }]);
  };

  const updateSplit = (index: number, field: string, value: any) => {
    if (!setPaymentSplits || !paymentSplits) return;
    const newSplits = [...paymentSplits];
    newSplits[index] = { ...newSplits[index], [field]: value };
    setPaymentSplits(newSplits);
  };

  const removeSplit = (index: number) => {
    if (!setPaymentSplits || !paymentSplits) return;
    const newSplits = [...paymentSplits];
    newSplits.splice(index, 1);
    setPaymentSplits(newSplits);
  };

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
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
              {isMethodEnabled("cash") && (
                <Button
                  variant={paymentMethod === "cash" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("cash")}
                  className="flex flex-col gap-1 h-16"
                >
                  <Banknote className="h-5 w-5" />
                  <span className="text-xs">Cash</span>
                </Button>
              )}
              {isMethodEnabled("card") && (
                <Button
                  variant={paymentMethod === "card" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("card")}
                  className="flex flex-col gap-1 h-16"
                >
                  <CreditCard className="h-5 w-5" />
                  <span className="text-xs">Card</span>
                </Button>
              )}
              {isMethodEnabled("transfer") && (
                <Button
                  variant={paymentMethod === "transfer" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("transfer")}
                  className="flex flex-col gap-1 h-16"
                >
                  <Smartphone className="h-5 w-5" />
                  <span className="text-xs">Transfer</span>
                </Button>
              )}
              {isMethodEnabled("credit") && (
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
              )}
              {isMethodEnabled("mixed") && (
                <Button
                  variant={paymentMethod === "mixed" ? "default" : "outline"}
                  onClick={() => setPaymentMethod("mixed")}
                  className="flex flex-col gap-1 h-16"
                >
                  <Wallet className="h-5 w-5" />
                  <span className="text-xs">Mixed</span>
                </Button>
              )}
            </div>
          </div>

          {paymentMethod === "cash" && (
            <div>
              <label className="text-sm font-medium">Amount Paid (Cash)</label>
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

          {(paymentMethod === "card" || paymentMethod === "transfer") && requirePaymentAccount && (
            <div>
              <label className="text-sm font-medium">Destination Account</label>
              <select
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                value={selectedAccountId || ""}
                onChange={(e) => setSelectedAccountId && setSelectedAccountId(e.target.value)}
              >
                <option value="" disabled>Select an account...</option>
                {paymentAccounts?.filter(a => paymentMethod === "card" ? a.account_type === "pos_terminal" : a.account_type !== "pos_terminal").map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name} {acc.bank_name ? `(${acc.bank_name})` : ''}</option>
                ))}
              </select>
            </div>
          )}

          {paymentMethod === "mixed" && (
            <div className="space-y-4">
              <label className="text-sm font-medium">Split Payment Details</label>
              <div className="space-y-2 border rounded-md p-2">
                {paymentSplits?.map((split, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      className="flex h-10 w-1/3 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={split.method}
                      onChange={(e) => updateSplit(index, "method", e.target.value)}
                    >
                      <option value="cash">Cash</option>
                      <option value="card">Card</option>
                      <option value="transfer">Transfer</option>
                      <option value="credit" disabled={!selectedCustomer}>Credit</option>
                    </select>
                    
                    <div className="flex-1 space-y-1">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={split.amount || ""}
                        onChange={(e) => updateSplit(index, "amount", parseFloat(e.target.value) || 0)}
                        onFocus={(e) => e.target.select()}
                      />
                      {(split.method === "card" || split.method === "transfer") && requirePaymentAccount && (
                        <select
                          className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2 py-1 text-xs"
                          value={split.accountId || ""}
                          onChange={(e) => updateSplit(index, "accountId", e.target.value)}
                        >
                          <option value="" disabled>Select Account</option>
                          {paymentAccounts?.filter(a => split.method === "card" ? a.account_type === "pos_terminal" : a.account_type !== "pos_terminal").map(acc => (
                            <option key={acc.id} value={acc.id}>{acc.name}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <Button variant="ghost" size="icon" onClick={() => removeSplit(index)}>
                      <span className="text-destructive font-bold">X</span>
                    </Button>
                  </div>
                ))}

                <div className="flex gap-2 justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={() => handleAddSplit("cash")}>+ Cash</Button>
                  <Button variant="outline" size="sm" onClick={() => handleAddSplit("transfer")}>+ Transfer</Button>
                  <Button variant="outline" size="sm" onClick={() => handleAddSplit("card")}>+ Card</Button>
                  <Button variant="outline" size="sm" onClick={() => {
                    if (!selectedCustomer) {
                      toast.error("Please select a customer for credit sales");
                      return;
                    }
                    handleAddSplit("credit");
                  }}>+ Credit</Button>
                </div>
              </div>

              {paymentSplits && (
                <div className="flex justify-between font-medium">
                  <span>Total Split: {formatCurrency(paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0), currencyCode)}</span>
                  <span className={paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) < total ? "text-destructive" : "text-green-600"}>
                    {paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) >= total ? "Fully Covered" : "Short"}
                  </span>
                </div>
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
