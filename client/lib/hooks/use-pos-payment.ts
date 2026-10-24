"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { generateShortId } from "@/lib/db/core";
import { writeSaleTransaction } from "./pos-sale-writer";
import { CartItem, RedeemedOption } from "./use-pos-cart";
import {
  validatePaymentReadiness,
  computeEarnedPoints,
  computeResellerCommission,
  buildReceiptTransaction,
  InsufficientLoyaltyPointsError,
  LoyaltyRedemptionBelowMinimumError,
  type PaymentMethod,
  type PaymentSplit,
} from "./use-pos-payment-helpers";
import type { Customer } from "@/lib/types/customer";
import type { ReceiptTransaction } from "@/components/pos/receipt-view";
import { getStoredUser } from "@/lib/storage-keys";

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
  // Defense-in-depth: even if the POS UI's Redeem Reward control is somehow bypassed (stale tab, plan downgrade mid-session), no loyalty_transac…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-pos-payment-ts-L49
  canUseLoyaltyProgram?: boolean;
  isResellerSale?: boolean;
  // "reseller" (commission owed, goes through the redeem/store-claim flow) or "store" (markup kept by the store, pre-settled at checkout - see u…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-pos-payment-ts-L57
  markupType?: "reseller" | "store" | null;
  /** Store-wide % of the markup remitted to the reseller - snapshotted onto
   * the sale at checkout time, never recalculated later. */
  resellerCommissionPercentage?: number;
  /** Store-configurable base earn rate (points per currency unit spent),
   * before any loyalty-tier multiplier is applied. */
  loyaltyPointsPerCurrency?: number;
  // Called when the sale is rejected because the customer's real current points balance can't cover the redemption picked earlier in checkout (s…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-pos-payment-ts-L69
  onInsufficientLoyaltyPoints?: () => void;
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
  markupType = null,
  resellerCommissionPercentage = 0,
  loyaltyPointsPerCurrency = 0.01,
  onInsufficientLoyaltyPoints,
}: UsePOSPaymentProps) {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [saleNote, setSaleNote] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([]);
  const [processingPayment, setProcessingPayment] = useState(false);
  // Synchronous re-entrancy guard:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L99
  const processingPaymentRef = useRef(false);
  const [completedTransaction, setCompletedTransaction] =
    useState<ReceiptTransaction | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);

  const cartIsEmpty = cart.length === 0;
  const [wasCartEmpty, setWasCartEmpty] = useState(cartIsEmpty);
  if (cartIsEmpty !== wasCartEmpty) {
    setWasCartEmpty(cartIsEmpty);
    if (cartIsEmpty) {
      setPaymentMethod("cash");
      setAmountPaid("");
      setSelectedAccountId("");
      setPaymentSplits([]);
      setSaleNote("");
    }
  }

  const handlePayment = async () => {
    if (processingPaymentRef.current) return;

    const validationError = validatePaymentReadiness({
      paymentMethod,
      requireSaleNotes,
      saleNote,
      amountPaid,
      total,
      paymentSplits,
      requirePaymentAccount,
      selectedAccountId,
      isResellerSale,
      markupType,
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }

    processingPaymentRef.current = true;
    setProcessingPayment(true);

    try {
      const user = getStoredUser() ?? {};
      const cashierId = user?.id || null;
      // Date.now() collides across two terminals checking out in the same millisecond (or with clock skew) - transaction_number is UNIQUE NOT NULL,…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L154
      const transactionNumber = `TXN-${generateShortId()}`;

      const earnedPoints = await computeEarnedPoints({
        selectedCustomer,
        canUseLoyaltyProgram,
        total,
        loyaltyPointsPerCurrency,
      });

      const { resellerMarkup, resellerCommissionAmount } = computeResellerCommission({
        cart,
        isResellerSale,
        markupType,
        resellerCommissionPercentage,
      });
      const saleId = await writeSaleTransaction({
        cart,
        subtotal,
        tax,
        total,
        discount,
        rawDiscount,
        discountType,
        redeemedOption,
        selectedCustomer,
        canUseLoyaltyProgram,
        isResellerSale,
        markupType,
        resellerCommissionPercentage,
        resellerMarkup,
        resellerCommissionAmount,
        paymentMethod,
        amountPaid,
        paymentSplits,
        selectedAccountId,
        saleNote,
        dispensedRxId,
        isRefillDispense,
        cashierId,
        transactionNumber,
        earnedPoints,
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

      // Prescription status is already updated atomically with the sale
      // inside runInTransaction() above; just clear the local UI state here.
      if (dispensedRxId) {
        setDispensedRxId?.(null);
      }

      setShowReceiptDialog(true);
      setShowPaymentDialog(false);
      toast.success("Transaction completed successfully!");
    } catch (error) {
      console.error("Payment failed", error);
      if (
        error instanceof InsufficientLoyaltyPointsError ||
        error instanceof LoyaltyRedemptionBelowMinimumError
      ) {
        onInsufficientLoyaltyPoints?.();
        toast.error(`${error.message}. The reward has been removed - please try the sale again.`);
      } else {
        toast.error(
          "Payment failed — nothing was saved and your cart is intact. Please try again.",
        );
      }
    } finally {
      processingPaymentRef.current = false;
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
