import { insert, update, transaction as runInTransaction } from "@/lib/db/local-database";
import { generateId } from "@/lib/db/core";
import { getCustomerBalance } from "@/lib/db/queries/customers";
import { recordSaleItemStock } from "@/lib/db/queries/inventory";
import { updatePrescriptionStatus, dispensePrescriptionRefill } from "@/lib/db/queries/prescriptions";
import { SPOT_SOURCING_EXPENSE_CATEGORY } from "@/lib/db/queries/finance";
import { getLocalTodayDate } from "@/lib/utils";
import { applyLoyaltyPointsForSale, type PaymentMethod, type PaymentSplit } from "./use-pos-payment-helpers";
import { calculateTaxPercentage, calculateMixedAmountPaid, calculateMixedChangeDue, calculateSalePaymentStatus, calculateMaxAllowedCreditSplit, roundMoney } from "@/lib/utils/pos-calculations";
import type { CartItem, RedeemedOption } from "./use-pos-cart-store";
import type { Customer } from "@/lib/types/customer";

export interface SaleWriteInput {
  cart: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  rawDiscount: number;
  discountType: "fixed" | "percentage";
  redeemedOption: RedeemedOption | null;
  selectedCustomer: Customer | null;
  canUseLoyaltyProgram: boolean;
  isResellerSale: boolean;
  markupType: "reseller" | "store" | null;
  resellerCommissionPercentage: number;
  resellerMarkup: number;
  resellerCommissionAmount: number;
  paymentMethod: PaymentMethod;
  amountPaid: string;
  paymentSplits: PaymentSplit[];
  selectedAccountId: string;
  saleNote: string;
  dispensedRxId?: string | null;
  isRefillDispense: boolean;
  cashierId: string | null;
  transactionNumber: string;
  earnedPoints: number;
  recordShortfallAsOwed?: boolean;
}

export async function writeSaleTransaction({
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
  recordShortfallAsOwed = false,
}: SaleWriteInput): Promise<string> {
  // A store-markup sale has no reseller to pay, so there's nothing to redeem later - settle it right here, at checkout, instead of leaving it si…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L174
  const isStoreMarkup = isResellerSale && markupType === "store";

  // Every write below (the sale row, its line items + stock deduction, any credit-balance update, loyalty points) must land together or not at a…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L180
  return runInTransaction(async () => {
    // Pre-generated (rather than letting insert() assign one) so every other write this sale makes - line items, stock deduction, credit-balance u…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-pos-payment-ts-L188
    const newSaleId = generateId();
    const spotSourcedItems = cart.filter((i) => i.is_spot_sourced);
    const spotSummary = spotSourcedItems.length > 0
      ? ` [Spot Sourced: ${spotSourcedItems.map((i) => `${i.quantity}x ${i.name}`).join(", ")}]`
      : "";

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
        ...(spotSourcedItems.length > 0
          ? {
              spot_sourcing: spotSourcedItems.map((i) => ({
                product_id: i.id,
                product_name: i.name,
                quantity: i.quantity,
                unit_cost: i.sourcing_cost ?? i.cost_price ?? 0,
                payment_source: i.sourcing_payment_source || "cash_drawer",
                partner: i.sourcing_partner || null,
              })),
            }
          : {}),
      }),
      transaction_date: new Date().toISOString(),
      receipt_printed: 0,
      notes: (saleNote.trim() || "POS Sale") + spotSummary,
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
      if (item.is_spot_sourced) {
        const sourcingCost = item.sourcing_cost ?? item.cost_price ?? 0;
        await recordSaleItemStock({
          saleId: newSaleId,
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          listPrice: item.original_unit_price,
          costPrice: sourcingCost,
          subtotal: item.subtotal,
          cashierId,
          correlationId: newSaleId,
          recordShortfallAsOwed: false,
          isSpotSourced: true,
        });

        if (item.sourcing_payment_source === "cash_drawer") {
          const sourcingTotal = roundMoney(sourcingCost * item.quantity);
          if (sourcingTotal > 0) {
            await insert("expenses", {
              id: generateId(),
              user_id: cashierId,
              category: SPOT_SOURCING_EXPENSE_CATEGORY,
              description: `Spot sourced: ${item.quantity}x ${item.name}`,
              amount: sourcingTotal,
              date: getLocalTodayDate(),
              payment_method: "cash",
              vendor_name: item.sourcing_partner || "Spot Sourcing",
              reference_number: transactionNumber,
              notes: `Paid from till cash drawer for sale #${transactionNumber}`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { correlationId: newSaleId });
          }
        }
      } else {
        await recordSaleItemStock({
          saleId: newSaleId,
          productId: item.id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          listPrice: item.original_unit_price,
          costPrice: item.cost_price || 0,
          subtotal: item.subtotal,
          cashierId,
          correlationId: newSaleId,
          recordShortfallAsOwed,
        });
      }
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
}
