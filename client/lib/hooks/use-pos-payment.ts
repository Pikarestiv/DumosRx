"use client";

import { useState } from "react";
import { toast } from "sonner";
import { insert, update } from "@/lib/db/local-database";
import { CartItem } from "./use-pos-cart";

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
}

interface UsePOSPaymentProps {
  cart: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  selectedCustomer: Customer | null;
  clearCart: () => void;
  refetchMedicines: () => void;
}

export function usePOSPayment({
  cart,
  subtotal,
  tax,
  total,
  discount,
  selectedCustomer,
  clearCart,
  refetchMedicines,
}: UsePOSPaymentProps) {
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mobile" | "credit" | "">("");
  const [amountPaid, setAmountPaid] = useState("");
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
    }

    setProcessingPayment(true);

    try {
      const user = JSON.parse(localStorage.getItem("dumos_user") || "{}");
      const cashierId = user?.id || null;
      const transactionNumber = `TXN${Date.now()}`;

      const saleId = insert("sales", {
        transaction_number: transactionNumber,
        customer_id: selectedCustomer?.id || null,
        cashier_id: cashierId,
        subtotal,
        discount_amount: discount,
        discount_percentage: 0,
        tax_amount: tax,
        tax_percentage: 7.5,
        total_amount: total,
        amount_paid:
          paymentMethod === "cash"
            ? Number.parseFloat(amountPaid) || total
            : paymentMethod === "credit"
              ? 0
              : total,
        change_given:
          paymentMethod === "cash"
            ? Math.max(0, (Number.parseFloat(amountPaid) || 0) - total)
            : 0,
        points_earned: 0,
        points_redeemed: 0,
        payment_method: paymentMethod,
        payment_status: paymentMethod === "credit" ? "pending" : "completed",
        transaction_date: new Date().toISOString(),
        receipt_printed: 0,
        notes: "POS Sale",
      });

      cart.forEach((item) => {
        insert("sale_items", {
          sale_id: saleId,
          medicine_id: item.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.subtotal,
        });

        const newStock = Math.max(0, item.stock - item.quantity);
        update("medicines", item.id, { stock_quantity: newStock });
      });

      if (paymentMethod === "credit" && selectedCustomer) {
        const currentBalance = (selectedCustomer as any).outstanding_balance || 0;
        update("customers", selectedCustomer.id, {
          outstanding_balance: currentBalance + total
        });
      }

      refetchMedicines();

      const transaction = {
        id: saleId,
        date: new Date().toISOString(),
        customer: selectedCustomer,
        items: [...cart],
        subtotal,
        tax,
        discount,
        total,
        paymentMethod,
        amountPaid: paymentMethod === "cash" ? Number.parseFloat(amountPaid) : total,
        change: paymentMethod === "cash" ? Math.max(0, Number.parseFloat(amountPaid) - total) : 0,
      };

      setCompletedTransaction(transaction);
      clearCart();
      setPaymentMethod("");
      setAmountPaid("");
      setShowPaymentDialog(false);
      setShowReceiptDialog(true);
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
    processingPayment,
    handlePayment,
    completedTransaction,
    showPaymentDialog,
    setShowPaymentDialog,
    showReceiptDialog,
    setShowReceiptDialog,
  };
}
