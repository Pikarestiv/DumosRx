"use client";

import { useState } from "react";
import { toast } from "sonner";
import { insert, update } from "@/lib/db/local-database";
import { CartItem } from "./use-pos-cart";
import { calculateEarnedPoints } from "@/lib/utils/loyalty-calculator";

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
  outstanding_balance: number;
}

interface UsePOSPaymentProps {
  cart: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  selectedCustomer: Customer | null;
  clearCart: () => void;
  refetchProducts: () => void;
  refetchSales?: () => void;
  requirePaymentAccount?: boolean;
  dispensedRxId?: string | null;
  setDispensedRxId?: (id: string | null) => void;
}

export function usePOSPayment({
  cart,
  subtotal,
  tax,
  total,
  discount,
  selectedCustomer,
  clearCart,
  refetchProducts,
  refetchSales,
  requirePaymentAccount = false,
  dispensedRxId,
  setDispensedRxId,
}: UsePOSPaymentProps) {
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "transfer" | "credit" | "mixed">("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [paymentSplits, setPaymentSplits] = useState<{method: string; amount: number; accountId?: string}[]>([]);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [completedTransaction, setCompletedTransaction] = useState<any>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);

  const handlePayment = async () => {
    if (!paymentMethod) {
      toast.error("Please select a payment method");
      return;
    }

    if (paymentMethod === "cash") {
      const paid = Number.parseFloat(amountPaid);
      if (!paid || paid < total) {
        toast.error("Insufficient payment amount");
        return;
      }
    } else if (paymentMethod === "mixed") {
      const totalSplits = paymentSplits.reduce((acc, split) => acc + (split.amount || 0), 0);
      if (totalSplits < total) {
        toast.error("Mixed payment splits do not cover the total amount");
        return;
      }
      
      if (requirePaymentAccount) {
        const missingAccount = paymentSplits.some(s => (s.method === "card" || s.method === "transfer") && !s.accountId);
        if (missingAccount) {
          toast.error("Please select a destination account for all Card/Transfer splits");
          return;
        }
      }
    } else if (paymentMethod === "card" || paymentMethod === "transfer") {
      if (requirePaymentAccount && !selectedAccountId) {
        toast.error(`Please select a destination account for this ${paymentMethod}`);
        return;
      }
    }

    setProcessingPayment(true);

    try {
      const user = JSON.parse(localStorage.getItem("dumos_user") || "{}");
      const cashierId = user?.id || null;
      const transactionNumber = `TXN${Date.now()}`;
      const earnedPoints = selectedCustomer ? calculateEarnedPoints(total) : 0;

      const saleId = await insert("sales", {
        transaction_number: transactionNumber,
        customer_id: selectedCustomer?.id || null,
        user_id: cashierId,
        subtotal,
        discount_total: discount,
        discount_percentage: 0,
        tax_amount: tax,
        tax_percentage: 7.5,
        total_amount: total,
        amount_paid:
          paymentMethod === "cash"
            ? Number.parseFloat(amountPaid) || total
            : paymentMethod === "mixed"
              ? paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0)
              : paymentMethod === "credit"
                ? 0
                : total,
        change_given:
          paymentMethod === "cash"
            ? Math.max(0, (Number.parseFloat(amountPaid) || 0) - total)
            : paymentMethod === "mixed"
              ? Math.max(0, paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) - total)
              : 0,
        points_earned: earnedPoints,
        points_redeemed: 0,
        payment_method: paymentMethod,
        payment_status: paymentMethod === "credit" ? "pending" : "completed",
        payment_details: JSON.stringify({
          splits: paymentMethod === "mixed" ? paymentSplits : [],
          accountId: (paymentMethod === "card" || paymentMethod === "transfer") ? selectedAccountId : null,
        }),
        transaction_date: new Date().toISOString(),
        receipt_printed: 0,
        notes: "POS Sale",
      });

      for (const item of cart) {
        await insert("sale_items", {
          sale_id: saleId,
          product_id: item.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          cost_price: item.cost_price || 0,
          total_price: item.subtotal,
        });

        const newStock = Math.max(0, item.stock - item.quantity);
        await update("products", item.id, { stock_quantity: newStock });
      }

      if (paymentMethod === "credit" && selectedCustomer) {
        await update("customers", selectedCustomer.id, {
          outstanding_balance: (selectedCustomer.outstanding_balance || 0) + total
        });
      } else if (paymentMethod === "mixed" && selectedCustomer) {
        const creditSplit = paymentSplits.find(s => s.method === "credit");
        if (creditSplit && creditSplit.amount > 0) {
          await update("customers", selectedCustomer.id, {
            outstanding_balance: (selectedCustomer.outstanding_balance || 0) + creditSplit.amount
          });
        }
      }

      if (earnedPoints > 0 && selectedCustomer) {
        await update("customers", selectedCustomer.id, {
          loyalty_points: (selectedCustomer.loyalty_points || 0) + earnedPoints
        });

        await insert("loyalty_transactions", {
          id: `loyalty_${Date.now()}`,
          customer_id: selectedCustomer.id,
          points: earnedPoints,
          type: 'earned',
          transaction_id: saleId,
          created_at: new Date().toISOString()
        });
      }

      refetchProducts();
      if (refetchSales) refetchSales();

      const transaction = {
        id: saleId,
        date: new Date().toISOString(),
        customer: selectedCustomer,
        cashier: user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.username || "Cashier"),
        items: [...cart],
        subtotal,
        tax,
        discount,
        total,
        paymentMethod,
        paymentSplits: paymentMethod === "mixed" ? paymentSplits : null,
        amountPaid: paymentMethod === "cash" 
          ? Number.parseFloat(amountPaid) 
          : paymentMethod === "mixed"
            ? paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0)
            : total,
        change: paymentMethod === "cash" 
          ? Math.max(0, Number.parseFloat(amountPaid) - total) 
          : paymentMethod === "mixed"
            ? Math.max(0, paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) - total)
            : 0,
      };

      setCompletedTransaction(transaction);
      clearCart();
      if (refetchSales) refetchSales();
      refetchProducts();
      setPaymentMethod("cash");
      setAmountPaid("");
      setSelectedAccountId("");
      setPaymentSplits([]);
      
      // Update prescription status if this was a dispensed prescription
      if (dispensedRxId) {
        await update("prescriptions", dispensedRxId, {
          status: "completed"
        });
        setDispensedRxId?.(null);
      }
      
      setShowReceiptDialog(true);
      setShowPaymentDialog(false);
      toast.success("Transaction completed successfully!");
    } catch (error) {
      console.error("Payment failed", error);
      toast.error("An error occurred while processing payment");
    } finally {
      setProcessingPayment(false);
    }
  };

  return {
    paymentMethod,
    setPaymentMethod,
    amountPaid,
    setAmountPaid,
    selectedAccountId,
    setSelectedAccountId,
    paymentSplits,
    setPaymentSplits,
    processingPayment,
    handlePayment,
    completedTransaction,
    showPaymentDialog,
    setShowPaymentDialog,
    showReceiptDialog,
    setShowReceiptDialog,
  };
}
