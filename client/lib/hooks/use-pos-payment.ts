"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { insert, update } from "@/lib/db/local-database";
import { getBatchesForProduct } from "@/lib/db/queries/inventory";
import { updatePrescriptionStatus, dispensePrescriptionRefill } from "@/lib/db/queries/prescriptions";
import { CartItem, RedeemedOption } from "./use-pos-cart";
import { calculateEarnedPoints, calculateLoyaltyPointsAfterSale } from "@/lib/utils/loyalty-calculator";
import {
  calculateTaxPercentage,
  calculateSplitShortage,
  calculateMixedAmountPaid,
  calculateSalePaymentStatus,
} from "@/lib/utils/pos-calculations";
import type { Customer } from "@/lib/types/customer";
import type { ReceiptTransaction } from "@/components/pos/receipt-view";

export type { Customer };

interface UsePOSPaymentProps {
  cart: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  rawDiscount?: number;
  discountType?: "fixed" | "percentage";
  redeemedOption?: RedeemedOption | null;
  selectedCustomer: Customer | null;
  setSelectedCustomer?: (customer: Customer | null) => void;
  clearCart: () => void;
  refetchProducts: () => void;
  refetchSales?: () => void;
  requirePaymentAccount?: boolean;
  dispensedRxId?: string | null;
  setDispensedRxId?: (id: string | null) => void;
  isRefillDispense?: boolean;
}

export function usePOSPayment({
  cart,
  subtotal,
  tax,
  total,
  discount,
  rawDiscount = 0,
  discountType = "fixed",
  redeemedOption = null,
  selectedCustomer,
  setSelectedCustomer,
  clearCart,
  refetchProducts,
  refetchSales,
  requirePaymentAccount = false,
  dispensedRxId,
  setDispensedRxId,
  isRefillDispense = false,
}: UsePOSPaymentProps) {
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "card" | "transfer" | "credit" | "mixed"
  >("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [paymentSplits, setPaymentSplits] = useState<
    { method: string; amount: number; accountId?: string }[]
  >([]);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [completedTransaction, setCompletedTransaction] =
    useState<ReceiptTransaction | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);

  useEffect(() => {
    if (cart.length === 0) {
      setPaymentMethod("cash");
      setAmountPaid("");
      setSelectedAccountId("");
      setPaymentSplits([]);
    }
  }, [cart.length]);

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
      if (!calculateSplitShortage(paymentSplits, total).isFullyCovered) {
        toast.error("Mixed payment splits do not cover the total amount");
        return;
      }

      if (requirePaymentAccount) {
        const missingAccount = paymentSplits.some(
          (s) =>
            (s.method === "card" || s.method === "transfer") && !s.accountId,
        );
        if (missingAccount) {
          toast.error(
            "Please select a destination account for all Card/Transfer splits",
          );
          return;
        }
      }
    } else if (paymentMethod === "card" || paymentMethod === "transfer") {
      if (requirePaymentAccount && !selectedAccountId) {
        toast.error(
          `Please select a destination account for this ${paymentMethod}`,
        );
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
        discount_amount: rawDiscount,
        discount_percentage: discountType === "percentage" ? rawDiscount : 0,
        discount_type: discountType,
        tax_amount: tax,
        // Derived from the actual charged amounts rather than hardcoded, so it
        // always matches whatever VAT rate was really applied (the store's
        // configured rate, which may not be 7.5%, or may be 0).
        tax_percentage: calculateTaxPercentage(tax, subtotal),
        total_amount: total,
        amount_paid:
          paymentMethod === "cash"
            ? Number.parseFloat(amountPaid) || total
            : paymentMethod === "mixed"
              ? calculateMixedAmountPaid(paymentSplits)
              : paymentMethod === "credit"
                ? 0
                : total,
        change_given:
          paymentMethod === "cash"
            ? Math.max(0, (Number.parseFloat(amountPaid) || 0) - total)
            : paymentMethod === "mixed"
              ? Math.max(
                  0,
                  paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) -
                    total,
                )
              : 0,
        points_earned: earnedPoints,
        // Only ever set when a customer is selected — the UI gates the
        // redemption picker on that already, but guard here too in case a
        // stale redemption survives a customer being cleared mid-checkout.
        points_redeemed: selectedCustomer ? redeemedOption?.pointsCost || 0 : 0,
        payment_method: paymentMethod,
        payment_status: calculateSalePaymentStatus(paymentMethod, paymentSplits),
        payment_details: JSON.stringify({
          splits: paymentMethod === "mixed" ? paymentSplits : [],
          accountId:
            paymentMethod === "card" || paymentMethod === "transfer"
              ? selectedAccountId
              : null,
        }),
        transaction_date: new Date().toISOString(),
        receipt_printed: 0,
        notes: "POS Sale",
        prescription_id: dispensedRxId || null,
      });

      for (const item of cart) {
        const batches = await getBatchesForProduct(item.id);

        const saleItemId = await insert("sale_items", {
          sale_id: saleId,
          product_id: item.id,
          // Primary/first batch consumed; retained for backward-compat display
          // only. Accurate per-batch accounting (for FEFO splits) lives in
          // sale_item_batches below.
          stock_batch_id: batches[0]?.id || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          cost_price: item.cost_price || 0,
          total_price: item.subtotal,
        });

        let remainingToDeduct = item.quantity;
        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;
          const deduction = Math.min(batch.quantity, remainingToDeduct);
          await update("stock_batches", batch.id, {
            quantity: batch.quantity - deduction,
          });

          await insert("sale_item_batches", {
            sale_item_id: saleItemId,
            stock_batch_id: batch.id,
            quantity: deduction,
          });

          await insert("stock_movements", {
            product_id: item.id,
            stock_batch_id: batch.id,
            movement_type: "sale",
            quantity: -Math.abs(deduction),
            unit_cost: item.cost_price || 0,
            total_cost: (item.cost_price || 0) * deduction,
            reference_id: saleId,
            reference_type: "sale",
            reason: "Customer sale",
            performed_by: cashierId,
            movement_date: new Date().toISOString(),
          });

          remainingToDeduct -= deduction;
        }
      }

      if (paymentMethod === "credit" && selectedCustomer) {
        await update("customers", selectedCustomer.id, {
          outstanding_balance:
            (selectedCustomer.outstanding_balance || 0) + total,
        });
      } else if (paymentMethod === "mixed" && selectedCustomer) {
        const creditSplit = paymentSplits.find((s) => s.method === "credit");
        if (creditSplit && creditSplit.amount > 0) {
          await update("customers", selectedCustomer.id, {
            outstanding_balance:
              (selectedCustomer.outstanding_balance || 0) + creditSplit.amount,
          });
        }
      }

      if ((earnedPoints > 0 || redeemedOption) && selectedCustomer) {
        await update("customers", selectedCustomer.id, {
          loyalty_points: calculateLoyaltyPointsAfterSale(
            selectedCustomer.loyalty_points || 0,
            earnedPoints,
            redeemedOption?.pointsCost || 0,
          ),
        });

        if (earnedPoints > 0) {
          await insert("loyalty_transactions", {
            id: `loyalty_${Date.now()}_earn`,
            customer_id: selectedCustomer.id,
            points: earnedPoints,
            type: "earned",
            transaction_id: saleId,
            created_at: new Date().toISOString(),
          });
        }

        if (redeemedOption) {
          await insert("loyalty_transactions", {
            id: `loyalty_${Date.now()}_redeem`,
            customer_id: selectedCustomer.id,
            points: -redeemedOption.pointsCost,
            type: "redeemed",
            transaction_id: saleId,
            created_at: new Date().toISOString(),
          });
        }
      }

      refetchProducts();
      if (refetchSales) refetchSales();

      const transaction: ReceiptTransaction = {
        id: saleId,
        date: new Date().toISOString(),
        customer: selectedCustomer
          ? {
              name: `${selectedCustomer.first_name} ${selectedCustomer.last_name || ""}`.trim(),
              phone: selectedCustomer.phone,
            }
          : null,
        cashier: user?.first_name
          ? `${user.first_name} ${user.last_name || ""}`.trim()
          : user?.username || "Cashier",
        items: [...cart],
        subtotal,
        tax,
        discount,
        total,
        paymentMethod,
        paymentSplits: paymentMethod === "mixed" ? paymentSplits : undefined,
        amountPaid:
          paymentMethod === "cash"
            ? Number.parseFloat(amountPaid)
            : paymentMethod === "mixed"
              ? paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0)
              : total,
        change:
          paymentMethod === "cash"
            ? Math.max(0, Number.parseFloat(amountPaid) - total)
            : paymentMethod === "mixed"
              ? Math.max(
                  0,
                  paymentSplits.reduce((acc, s) => acc + (s.amount || 0), 0) -
                    total,
                )
              : 0,
      };

      setCompletedTransaction(transaction);
      clearCart();
      setSelectedCustomer?.(null);
      if (refetchSales) refetchSales();
      refetchProducts();
      setPaymentMethod("cash");
      setAmountPaid("");
      setSelectedAccountId("");
      setPaymentSplits([]);

      // Update prescription status if this was a dispensed prescription
      if (dispensedRxId) {
        if (isRefillDispense) {
          await dispensePrescriptionRefill(dispensedRxId);
        } else {
          await updatePrescriptionStatus(dispensedRxId, "completed");
        }
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
