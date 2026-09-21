"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { insert, update, transaction as runInTransaction } from "@/lib/db/local-database";
import { generateId } from "@/lib/db/core";
import { getCustomerBalance } from "@/lib/db/queries/customers";
import { recordSaleItemStock } from "@/lib/db/queries/inventory";
import { updatePrescriptionStatus, dispensePrescriptionRefill } from "@/lib/db/queries/prescriptions";
import { CartItem, RedeemedOption } from "./use-pos-cart";
import {
  validatePaymentReadiness,
  computeEarnedPoints,
  computeResellerCommission,
  applyLoyaltyPointsForSale,
  buildReceiptTransaction,
  type PaymentMethod,
  type PaymentSplit,
} from "./use-pos-payment-helpers";
import { calculateTaxPercentage, calculateMixedAmountPaid, calculateMixedChangeDue, calculateSalePaymentStatus } from "@/lib/utils/pos-calculations";
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
  requireSaleNotes?: boolean;
  dispensedRxId?: string | null;
  setDispensedRxId?: (id: string | null) => void;
  isRefillDispense?: boolean;
  /** Defense-in-depth: even if the POS UI's Redeem Reward control is somehow
   * bypassed (stale tab, plan downgrade mid-session), no loyalty_transactions
   * write — earn or redeem — happens unless the caller confirms the gate
   * (plan tier AND the store's own on/off toggle) is currently open. Fails
   * closed (defaults to false) — a caller that forgets to pass it gets no
   * loyalty writes rather than silently bypassing the gate. */
  canUseLoyaltyProgram?: boolean;
  isResellerSale?: boolean;
  /** Store-wide % of the markup remitted to the reseller - snapshotted onto
   * the sale at checkout time, never recalculated later. */
  resellerCommissionPercentage?: number;
  /** Store-configurable base earn rate (points per currency unit spent),
   * before any loyalty-tier multiplier is applied. */
  loyaltyPointsPerCurrency?: number;
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
  requireSaleNotes = false,
  dispensedRxId,
  setDispensedRxId,
  isRefillDispense = false,
  canUseLoyaltyProgram = false,
  isResellerSale = false,
  resellerCommissionPercentage = 0,
  loyaltyPointsPerCurrency = 0.01,
}: UsePOSPaymentProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
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
      setSaleNote("");
    }
  }, [cart.length]);

  const handlePayment = async () => {
    const validationError = validatePaymentReadiness({
      paymentMethod,
      requireSaleNotes,
      saleNote,
      amountPaid,
      total,
      paymentSplits,
      requirePaymentAccount,
      selectedAccountId,
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setProcessingPayment(true);

    try {
      const user = JSON.parse(localStorage.getItem("dumos_user") || "{}");
      const cashierId = user?.id || null;
      // Date.now() collides across two terminals checking out in the same
      // millisecond (or with clock skew) - transaction_number is UNIQUE NOT
      // NULL, so the losing terminal's sale hits a constraint violation and
      // never syncs. generateId() is the same collision-safe id generator
      // used everywhere else in the app.
      const transactionNumber = `TXN-${generateId().split("-")[0].toUpperCase()}`;

      const earnedPoints = await computeEarnedPoints({
        selectedCustomer,
        canUseLoyaltyProgram,
        total,
        loyaltyPointsPerCurrency,
      });

      const { resellerMarkup, resellerCommissionAmount } = computeResellerCommission({
        cart,
        isResellerSale,
        resellerCommissionPercentage,
      });

      // Every write below (the sale row, its line items + stock deduction,
      // any credit-balance update, loyalty points) must land together or
      // not at all: without a transaction, an interruption partway through
      // (app closed, a transient lock error, storage quota exceeded) leaves
      // a real `sales` row with only some stock deducted and no visible
      // error. A cashier who then retries the sale double-books revenue and
      // double-decrements whatever stock did get deducted the first time.
      const saleId = await runInTransaction(async () => {
        const newSaleId = await insert("sales", {
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
                ? calculateMixedChangeDue(paymentSplits, total)
                : 0,
          points_earned: earnedPoints,
          // Only ever set when a customer is selected — the UI gates the
          // redemption picker on that already, but guard here too in case a
          // stale redemption survives a customer being cleared mid-checkout.
          points_redeemed:
            selectedCustomer && canUseLoyaltyProgram
              ? redeemedOption?.pointsCost || 0
              : 0,
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
          notes: saleNote.trim() || "POS Sale",
          prescription_id: dispensedRxId || null,
          is_reseller_sale: isResellerSale ? 1 : 0,
          reseller_commission_percentage: isResellerSale ? resellerCommissionPercentage : 0,
          reseller_commission_amount: resellerCommissionAmount,
          reseller_markup_amount: resellerMarkup,
        });

        for (const item of cart) {
          await recordSaleItemStock({
            saleId: newSaleId,
            productId: item.id,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            costPrice: item.cost_price || 0,
            subtotal: item.subtotal,
            cashierId,
          });
        }

        // Re-read the current balance rather than trusting selectedCustomer
        // (captured when the cashier picked the customer, possibly stale by
        // the time checkout completes — e.g. another terminal recorded a
        // sale or payment for the same customer in between). Mirrors
        // recordCustomerPayment's own re-read for the same reason.
        if (paymentMethod === "credit" && selectedCustomer) {
          const balanceRows = await getCustomerBalance(selectedCustomer.id);
          const currentBalance = balanceRows[0]?.balance || 0;
          await update("customers", selectedCustomer.id, {
            outstanding_balance: currentBalance + total,
          });
        } else if (paymentMethod === "mixed" && selectedCustomer) {
          const creditSplit = paymentSplits.find((s) => s.method === "credit");
          if (creditSplit && creditSplit.amount > 0) {
            const balanceRows = await getCustomerBalance(selectedCustomer.id);
            const currentBalance = balanceRows[0]?.balance || 0;
            await update("customers", selectedCustomer.id, {
              outstanding_balance: currentBalance + creditSplit.amount,
            });
          }
        }

        await applyLoyaltyPointsForSale({
          selectedCustomer,
          canUseLoyaltyProgram,
          earnedPoints,
          redeemedOption,
          saleId: newSaleId,
        });

        return newSaleId;
      });

      refetchProducts();
      if (refetchSales) refetchSales();

      const transaction = buildReceiptTransaction({
        saleId,
        selectedCustomer,
        cashierUser: user,
        cart,
        subtotal,
        tax,
        discount,
        total,
        paymentMethod,
        paymentSplits,
        amountPaid,
      });

      setCompletedTransaction(transaction);
      clearCart();
      setSelectedCustomer?.(null);
      if (refetchSales) refetchSales();
      refetchProducts();
      setPaymentMethod("cash");
      setAmountPaid("");
      setSelectedAccountId("");
      setPaymentSplits([]);
      setSaleNote("");

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
    saleNote,
    setSaleNote,
    processingPayment,
    handlePayment,
    completedTransaction,
    showPaymentDialog,
    setShowPaymentDialog,
    showReceiptDialog,
    setShowReceiptDialog,
  };
}
