"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { insert, update, transaction as runInTransaction } from "@/lib/db/local-database";
import { generateShortId, generateId } from "@/lib/db/core";
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
  InsufficientLoyaltyPointsError,
  LoyaltyRedemptionBelowMinimumError,
  type PaymentMethod,
  type PaymentSplit,
} from "./use-pos-payment-helpers";
import { calculateTaxPercentage, calculateMixedAmountPaid, calculateMixedChangeDue, calculateSalePaymentStatus, calculateMaxAllowedCreditSplit } from "@/lib/utils/pos-calculations";
import type { Customer } from "@/lib/types/customer";
import type { ReceiptTransaction } from "@/components/pos/receipt-view";
import { getStoredUser } from "@/lib/storage-keys";
import { roundMoney } from "@/lib/utils/pos-calculations";

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
      // A store-markup sale has no reseller to pay, so there's nothing to redeem later - settle it right here, at checkout, instead of leaving it si…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L174
      const isStoreMarkup = isResellerSale && markupType === "store";

      // Every write below (the sale row, its line items + stock deduction, any credit-balance update, loyalty points) must land together or not at a…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L180
      const saleId = await runInTransaction(async () => {
        // Pre-generated (rather than letting insert() assign one) so every other write this sale makes - line items, stock deduction, credit-balance u…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L188
        const newSaleId = generateId();
        await insert("sales", {
          id: newSaleId,
          transaction_number: transactionNumber,
          customer_id: selectedCustomer?.id || null,
          user_id: cashierId,
          subtotal,
          discount_total: discount,
          discount_amount: rawDiscount,
          discount_percentage: discountType === "percentage" ? rawDiscount : 0,
          discount_type: discountType,
          tax_amount: tax,
          // Derived from the actual charged amounts rather than hardcoded, so it always matches whatever VAT rate was really applied (the store's config…
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L206
          tax_percentage: calculateTaxPercentage(tax, subtotal),
          total_amount: total,
          amount_paid:
            paymentMethod === "cash"
              ? roundMoney(Number.parseFloat(amountPaid) || total)
              : paymentMethod === "mixed"
                ? calculateMixedAmountPaid(paymentSplits)
                : paymentMethod === "credit"
                  ? 0
                  : total,
          change_given: roundMoney(
            paymentMethod === "cash"
              ? Math.max(0, (Number.parseFloat(amountPaid) || 0) - total)
              : paymentMethod === "mixed"
                ? calculateMixedChangeDue(paymentSplits, total)
                : 0,
          ),
          points_earned: earnedPoints,
          // Only ever set when a customer is selected — the UI gates the redemption picker on that already, but guard here too in case a stale redemptio…
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L227
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
          markup_type: isResellerSale ? markupType : null,
          reseller_commission_percentage: isResellerSale ? resellerCommissionPercentage : 0,
          reseller_commission_amount: resellerCommissionAmount,
          reseller_markup_amount: resellerMarkup,
          ...(isStoreMarkup && {
            reseller_commission_redeemed: 1,
            reseller_commission_redeemed_amount: 0,
            reseller_commission_claim_type: "store_claim",
            reseller_commission_redeemed_at: new Date().toISOString(),
            reseller_commission_redeemed_by: cashierId,
          }),
        }, { correlationId: newSaleId });

        for (const item of cart) {
          await recordSaleItemStock({
            saleId: newSaleId,
            productId: item.id,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            costPrice: item.cost_price || 0,
            subtotal: item.subtotal,
            cashierId,
            correlationId: newSaleId,
          });
        }

        // Re-read the current balance rather than trusting selectedCustomer (captured when the cashier picked the customer, possibly stale by the time…
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L274
        if (paymentMethod === "credit" && selectedCustomer) {
          const balanceRows = await getCustomerBalance(selectedCustomer.id);
          const currentBalance = balanceRows[0]?.balance || 0;
          await update(
            "customers",
            selectedCustomer.id,
            { outstanding_balance: roundMoney(currentBalance + total) },
            { correlationId: newSaleId },
          );
        } else if (paymentMethod === "mixed" && selectedCustomer) {
          const creditSplit = paymentSplits.find((s) => s.method === "credit");
          // Clamped to what this sale can actually still owe:
          // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L290
          const creditOwed = Math.min(
            creditSplit?.amount ?? 0,
            calculateMaxAllowedCreditSplit(paymentSplits, total),
          );
          if (creditOwed > 0) {
            const balanceRows = await getCustomerBalance(selectedCustomer.id);
            const currentBalance = balanceRows[0]?.balance || 0;
            await update(
              "customers",
              selectedCustomer.id,
              { outstanding_balance: roundMoney(currentBalance + creditOwed) },
              { correlationId: newSaleId },
            );
          }
        }

        await applyLoyaltyPointsForSale({
          selectedCustomer,
          canUseLoyaltyProgram,
          earnedPoints,
          redeemedOption,
          saleId: newSaleId,
          correlationId: newSaleId,
        });

        // Committed inside the same transaction as the sale itself, not after it:
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L319
        if (dispensedRxId) {
          if (isRefillDispense) {
            await dispensePrescriptionRefill(dispensedRxId);
          } else {
            await updatePrescriptionStatus(dispensedRxId, "completed");
          }
        }

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
