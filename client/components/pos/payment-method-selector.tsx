"use client";

import { Button } from "@/components/ui/button";
import { Banknote, CreditCard, Smartphone, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { Customer } from "@/lib/types/customer";

interface PaymentMethodSelectorProps {
  paymentMethod: string;
  setPaymentMethod: (method: "cash" | "card" | "transfer" | "credit" | "mixed") => void;
  enabledPaymentMethods: string[];
  selectedCustomer: Customer | null;
}

export function PaymentMethodSelector({
  paymentMethod,
  setPaymentMethod,
  enabledPaymentMethods,
  selectedCustomer,
}: PaymentMethodSelectorProps) {
  const isMethodEnabled = (method: string) => enabledPaymentMethods.includes(method);

  return (
    <div>
      <label className="text-sm font-medium">Payment Method</label>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
        {isMethodEnabled("cash") && (
          <Button
            variant={paymentMethod === "cash" ? "default" : "outline"}
            onClick={() => setPaymentMethod("cash")}
            className="flex flex-col gap-1 h-16"
          >
            <Banknote className="h-5 w-5" /> <span className="text-xs">Cash</span>
          </Button>
        )}
        {isMethodEnabled("card") && (
          <Button
            variant={paymentMethod === "card" ? "default" : "outline"}
            onClick={() => setPaymentMethod("card")}
            className="flex flex-col gap-1 h-16"
          >
            <CreditCard className="h-5 w-5" /> <span className="text-xs">Card</span>
          </Button>
        )}
        {isMethodEnabled("transfer") && (
          <Button
            variant={paymentMethod === "transfer" ? "default" : "outline"}
            onClick={() => setPaymentMethod("transfer")}
            className="flex flex-col gap-1 h-16"
          >
            <Smartphone className="h-5 w-5" /> <span className="text-xs">Transfer</span>
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
            <Wallet className="h-5 w-5" /> <span className="text-xs">Credit</span>
          </Button>
        )}
        {isMethodEnabled("mixed") && (
          <Button
            variant={paymentMethod === "mixed" ? "default" : "outline"}
            onClick={() => setPaymentMethod("mixed")}
            className="flex flex-col gap-1 h-16"
          >
            <Wallet className="h-5 w-5" /> <span className="text-xs">Mixed</span>
          </Button>
        )}
      </div>
    </div>
  );
}
