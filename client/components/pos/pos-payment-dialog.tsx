"use client";

import { PaymentMethodSelector } from "./payment-method-selector";
import { PaymentSplits } from "./payment-splits";

import { useEffect } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Loader2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

import { useDefaultPaymentAccounts } from "@/lib/hooks/use-default-payment-accounts";
import { useStore } from "@/lib/context/store-context";

interface POSPaymentDialogProps {
  showPaymentDialog: boolean;
  setShowPaymentDialog: (show: boolean) => void;
  total: number;
  paymentMethod: "cash" | "card" | "transfer" | "credit" | "mixed";
  setPaymentMethod: (
    method: "cash" | "card" | "transfer" | "credit" | "mixed",
  ) => void;
  amountPaid: string;
  setAmountPaid: (amount: string) => void;
  processingPayment: boolean;
  handlePayment: () => void;
  selectedCustomer: any;
  currencyCode?: string;
  selectedAccountId?: string;
  setSelectedAccountId?: (id: string) => void;
  paymentSplits?: { method: string; amount: number; accountId?: string }[];
  setPaymentSplits?: (
    splits: { method: string; amount: number; accountId?: string }[],
  ) => void;
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
  const { storeProfile } = useStore();
  const { defaults, setDefaultAccount, clearDefaultAccount } =
    useDefaultPaymentAccounts();

  useEffect(() => {
    if (showPaymentDialog && (!amountPaid || amountPaid === "0")) {
      setAmountPaid(total.toString());
    }
  }, [showPaymentDialog, total, paymentMethod]);

  const isValidAccount = (method: string, accountId: string) => {
    return paymentAccounts?.some(
      (a) =>
        a.id === accountId &&
        (method === "card"
          ? a.account_type === "pos_terminal"
          : a.account_type !== "pos_terminal"),
    );
  };

  // Auto-fill default account when switching methods
  useEffect(() => {
    if (!storeProfile?.id || !setSelectedAccountId || !showPaymentDialog)
      return;

    if (paymentMethod === "card" || paymentMethod === "transfer") {
      const defaultId = defaults[`${storeProfile.id}_${paymentMethod}`];
      if (defaultId && isValidAccount(paymentMethod, defaultId)) {
        setSelectedAccountId(defaultId);
      }
    }
  }, [paymentMethod, storeProfile?.id, showPaymentDialog]);

  const isCurrentDefault =
    selectedAccountId && storeProfile?.id
      ? selectedAccountId === defaults[`${storeProfile.id}_${paymentMethod}`]
      : false;

  const handleSetDefaultToggle = () => {
    if (!storeProfile?.id || !selectedAccountId) return;
    if (isCurrentDefault) {
      clearDefaultAccount(storeProfile.id, paymentMethod);
    } else {
      setDefaultAccount(storeProfile.id, paymentMethod, selectedAccountId);
    }
  };



  return (
    <ResponsiveModal open={showPaymentDialog} onOpenChange={setShowPaymentDialog} title={<>Payment</>} description={<>Total amount: {formatCurrency(total, currencyCode)}</>} className="max-w-md">

        <div className="space-y-4">
          <PaymentMethodSelector
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            enabledPaymentMethods={enabledPaymentMethods}
            selectedCustomer={selectedCustomer}
          />

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
                  {formatCurrency(
                    Number.parseFloat(amountPaid) - total,
                    currencyCode,
                  )}
                </p>
              )}
            </div>
          )}

          {(paymentMethod === "card" || paymentMethod === "transfer") &&
            paymentAccounts &&
            paymentAccounts.length > 0 && (
              <div>
                <label className="text-sm font-medium">
                  Destination Account{" "}
                  {requirePaymentAccount && (
                    <span className="text-destructive">*</span>
                  )}
                </label>
                <select
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                  value={selectedAccountId || ""}
                  onChange={(e) =>
                    setSelectedAccountId && setSelectedAccountId(e.target.value)
                  }
                >
                  <option value="" disabled>
                    Select an account...
                  </option>
                  {paymentAccounts
                    ?.filter((a) =>
                      paymentMethod === "card"
                        ? a.account_type === "pos_terminal"
                        : a.account_type !== "pos_terminal",
                    )
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} {acc.bank_name ? `(${acc.bank_name})` : ""}
                      </option>
                    ))}
                </select>

                {selectedAccountId && (
                  <div className="flex items-center gap-2 mt-2 ml-1">
                    <input
                      type="checkbox"
                      id="setDefaultToggle"
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                      checked={isCurrentDefault}
                      onChange={handleSetDefaultToggle}
                    />
                    <label
                      htmlFor="setDefaultToggle"
                      className="text-xs text-muted-foreground cursor-pointer select-none"
                    >
                      Set as default for{" "}
                      <span className="font-bold">
                        {paymentMethod === "card" ? "Card" : "Transfer"}
                      </span>{" "}
                      on this device
                    </label>
                  </div>
                )}
              </div>
            )}

          {paymentMethod === "mixed" && (
            <PaymentSplits
              total={total}
              currencyCode={currencyCode}
              paymentSplits={paymentSplits}
              setPaymentSplits={setPaymentSplits}
              requirePaymentAccount={requirePaymentAccount}
              paymentAccounts={paymentAccounts}
              selectedCustomer={selectedCustomer}
              defaults={defaults}
              storeProfileId={storeProfile?.id}
              isValidAccount={isValidAccount}
            />
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
      </ResponsiveModal>
  );
}
