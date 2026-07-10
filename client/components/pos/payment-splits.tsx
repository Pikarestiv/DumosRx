"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface PaymentSplitsProps {
  total: number;
  currencyCode?: string;
  paymentSplits?: { method: string; amount: number; accountId?: string }[];
  setPaymentSplits?: (
    splits: { method: string; amount: number; accountId?: string }[],
  ) => void;
  requirePaymentAccount?: boolean;
  paymentAccounts?: any[];
  selectedCustomer: any;
  defaults: Record<string, string>;
  storeProfileId?: string;
  isValidAccount: (method: string, accountId: string) => boolean | undefined;
}

export function PaymentSplits({
  total,
  currencyCode,
  paymentSplits,
  setPaymentSplits,
  requirePaymentAccount,
  paymentAccounts,
  selectedCustomer,
  defaults,
  storeProfileId,
  isValidAccount,
}: PaymentSplitsProps) {
  const handleAddSplit = (method: string) => {
    if (!setPaymentSplits || !paymentSplits) return;
    const remaining = Math.max(
      0,
      total - paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0),
    );

    let defaultAccountId = undefined;
    if ((method === "card" || method === "transfer") && storeProfileId) {
      const defaultId = defaults[`${storeProfileId}_${method}`];
      if (defaultId && isValidAccount(method, defaultId)) {
        defaultAccountId = defaultId;
      }
    }

    setPaymentSplits([
      ...paymentSplits,
      { method, amount: remaining, accountId: defaultAccountId },
    ]);
  };

  const updateSplit = (index: number, field: string, value: any) => {
    if (!setPaymentSplits || !paymentSplits) return;
    const newSplits = [...paymentSplits];
    newSplits[index] = { ...newSplits[index], [field]: value };

    if (field === "method") {
      if ((value === "card" || value === "transfer") && storeProfileId) {
        const defaultId = defaults[`${storeProfileId}_${value}`];
        if (defaultId && isValidAccount(value, defaultId)) {
          newSplits[index].accountId = defaultId;
        } else {
          delete newSplits[index].accountId;
        }
      } else {
        delete newSplits[index].accountId;
      }
    }

    setPaymentSplits(newSplits);
  };

  const removeSplit = (index: number) => {
    if (!setPaymentSplits || !paymentSplits) return;
    const newSplits = [...paymentSplits];
    newSplits.splice(index, 1);
    setPaymentSplits(newSplits);
  };

  return (
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
              <option value="credit" disabled={!selectedCustomer}>
                Credit
              </option>
            </select>

            <div className="flex-1 space-y-1">
              <Input
                type="number"
                placeholder="0.00"
                value={split.amount || ""}
                onChange={(e) =>
                  updateSplit(index, "amount", parseFloat(e.target.value) || 0)
                }
                onFocus={(e) => e.target.select()}
              />
              {(split.method === "card" || split.method === "transfer") &&
                paymentAccounts &&
                paymentAccounts.length > 0 && (
                  <select
                    className="flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-2 py-1 text-xs"
                    value={split.accountId || ""}
                    onChange={(e) =>
                      updateSplit(index, "accountId", e.target.value)
                    }
                  >
                    <option value="" disabled>
                      Select Account {requirePaymentAccount ? "*" : ""}
                    </option>
                    {paymentAccounts
                      ?.filter((a) =>
                        split.method === "card"
                          ? a.account_type === "pos_terminal"
                          : a.account_type !== "pos_terminal",
                      )
                      .map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} {acc.bank_name ? `(${acc.bank_name})` : ""}
                        </option>
                      ))}
                  </select>
                )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeSplit(index)}
            >
              <span className="text-destructive font-bold">X</span>
            </Button>
          </div>
        ))}

        <div className="flex gap-2 justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddSplit("cash")}
          >
            + Cash
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddSplit("transfer")}
          >
            + Transfer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddSplit("card")}
          >
            + Card
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!selectedCustomer) {
                toast.error("Please select a customer for credit sales");
                return;
              }
              handleAddSplit("credit");
            }}
          >
            + Credit
          </Button>
        </div>
      </div>

      {paymentSplits && (
        <div className="flex flex-col font-medium">
          <div className="flex justify-between">
            <span>
              Total Split:{" "}
              {formatCurrency(
                paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0),
                currencyCode,
              )}
            </span>
            <span
              className={
                paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) <
                total
                  ? "text-destructive"
                  : "text-green-600"
              }
            >
              {paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) >=
              total
                ? "Fully Covered"
                : "Short"}
            </span>
          </div>
          {paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) >
            total && (
            <div className="flex justify-between mt-1 text-sm text-muted-foreground">
              <span>Change:</span>
              <span>
                {formatCurrency(
                  paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) -
                    total,
                  currencyCode,
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
