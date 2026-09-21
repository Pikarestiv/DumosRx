import { insert, update } from "@/lib/db/local-database";
import { getCustomerLoyaltyPoints, getCustomerTotalSpent } from "@/lib/db/queries/customers";
import { getLoyaltyTiers } from "@/lib/db/queries/loyalty";
import {
  calculateEarnedPoints,
  calculateLoyaltyPointsAfterSale,
  getApplicableTierMultiplier,
} from "@/lib/utils/loyalty-calculator";
import { calculateSplitShortage, calculateMixedAmountPaid, calculateMixedChangeDue } from "@/lib/utils/pos-calculations";
import { CartItem, RedeemedOption } from "./use-pos-cart";
import type { Customer } from "@/lib/types/customer";
import type { ReceiptTransaction } from "@/components/pos/receipt-view";

export type PaymentMethod = "cash" | "card" | "transfer" | "credit" | "mixed";

/** Thrown by applyLoyaltyPointsForSale when the customer's real current
 * balance can't cover a redemption picked earlier in checkout (e.g. a
 * second terminal already spent the points, or a stale cached balance) -
 * distinguished from a generic Error so the caller can show an actionable
 * message and clear the stale redemption instead of a bare failure toast. */
export class InsufficientLoyaltyPointsError extends Error {
  constructor() {
    super("Customer no longer has enough points for this reward");
    this.name = "InsufficientLoyaltyPointsError";
  }
}

export interface PaymentSplit {
  method: string;
  amount: number;
  accountId?: string;
}

/** Returns an error message if checkout isn't ready to proceed, or null when
 * every method-specific requirement (notes, amount covered, destination
 * account) is satisfied. */
export function validatePaymentReadiness(params: {
  paymentMethod: PaymentMethod;
  requireSaleNotes: boolean;
  saleNote: string;
  amountPaid: string;
  total: number;
  paymentSplits: PaymentSplit[];
  requirePaymentAccount: boolean;
  selectedAccountId: string;
}): string | null {
  const {
    paymentMethod,
    requireSaleNotes,
    saleNote,
    amountPaid,
    total,
    paymentSplits,
    requirePaymentAccount,
    selectedAccountId,
  } = params;

  if (!paymentMethod) return "Please select a payment method";
  if (requireSaleNotes && !saleNote.trim()) {
    return "Please add a note for this sale";
  }

  if (paymentMethod === "cash") {
    const paid = Number.parseFloat(amountPaid);
    if (!paid || paid < total) return "Insufficient payment amount";
  } else if (paymentMethod === "mixed") {
    // Checked before coverage: the shortage math floors negatives, so a
    // negative split would otherwise pass silently as "covered" while
    // under-recording the cash actually collected.
    if (paymentSplits.some((s) => (s.amount || 0) < 0)) {
      return "Payment splits cannot have a negative amount";
    }
    if (!calculateSplitShortage(paymentSplits, total).isFullyCovered) {
      return "Mixed payment splits do not cover the total amount";
    }
    if (requirePaymentAccount) {
      const missingAccount = paymentSplits.some(
        (s) =>
          (s.method === "card" || s.method === "transfer") && !s.accountId,
      );
      if (missingAccount) {
        return "Please select a destination account for all Card/Transfer splits";
      }
    }
  } else if (paymentMethod === "card" || paymentMethod === "transfer") {
    if (requirePaymentAccount && !selectedAccountId) {
      return `Please select a destination account for this ${paymentMethod}`;
    }
  }

  return null;
}

/** Defense-in-depth: when the Loyalty Program gate (plan tier AND the
 * store's own on/off toggle) is closed, no points are earned at all. Tier is
 * based on spend *before* this sale - a customer's standing history
 * determines the rate this transaction earns at, not the transaction
 * itself. */
export async function computeEarnedPoints(params: {
  selectedCustomer: Customer | null;
  canUseLoyaltyProgram: boolean;
  total: number;
  loyaltyPointsPerCurrency: number;
}): Promise<number> {
  const { selectedCustomer, canUseLoyaltyProgram, total, loyaltyPointsPerCurrency } =
    params;
  if (!selectedCustomer || !canUseLoyaltyProgram) return 0;

  const [totalSpentBeforeSale, tiers] = await Promise.all([
    getCustomerTotalSpent(selectedCustomer.id),
    getLoyaltyTiers(),
  ]);
  const tierMultiplier = getApplicableTierMultiplier(tiers, totalSpentBeforeSale);
  return calculateEarnedPoints(total, loyaltyPointsPerCurrency, tierMultiplier);
}

/** Markup is clamped to >= 0 by construction (updateUnitPrice never lets
 * unit_price go below original_unit_price), but Math.max here is a second
 * layer of defense, not the only one. */
export function computeResellerCommission(params: {
  cart: CartItem[];
  isResellerSale: boolean;
  resellerCommissionPercentage: number;
}): { resellerMarkup: number; resellerCommissionAmount: number } {
  const { cart, isResellerSale, resellerCommissionPercentage } = params;

  const resellerMarkup = isResellerSale
    ? cart.reduce(
        (sum, item) =>
          sum + Math.max(0, item.unit_price - item.original_unit_price) * item.quantity,
        0,
      )
    : 0;
  const resellerCommissionAmount = isResellerSale
    ? resellerMarkup * (resellerCommissionPercentage / 100)
    : 0;

  return { resellerMarkup, resellerCommissionAmount };
}

/** Writes the customer's new points balance plus one loyalty_transactions
 * row per earn/redeem event on this sale. No-ops entirely (no writes at all)
 * when the loyalty gate is closed or nothing was earned/redeemed. */
export async function applyLoyaltyPointsForSale(params: {
  selectedCustomer: Customer | null;
  canUseLoyaltyProgram: boolean;
  earnedPoints: number;
  redeemedOption: RedeemedOption | null | undefined;
  saleId: string;
}): Promise<void> {
  const { selectedCustomer, canUseLoyaltyProgram, earnedPoints, redeemedOption, saleId } =
    params;

  if (
    !((earnedPoints > 0 || redeemedOption) && selectedCustomer && canUseLoyaltyProgram)
  ) {
    return;
  }

  // Re-read the current points balance rather than trusting selectedCustomer
  // (captured when the cashier picked the customer, possibly stale by the
  // time checkout completes) — same staleness risk as the outstanding
  // balance write in use-pos-payment.ts.
  const pointsRows = await getCustomerLoyaltyPoints(selectedCustomer.id);
  const currentPoints = pointsRows[0]?.loyalty_points || 0;

  // Reject rather than clamp: calculateLoyaltyPointsAfterSale floors the
  // resulting balance at 0, which used to mean a customer who no longer
  // actually has the points (a second terminal already spent them, or a
  // stale cached balance) still got the redemption discount applied for
  // free. Checked against the balance just re-read above, inside the same
  // transaction the sale itself runs in, so throwing here rolls back the
  // whole sale rather than leaving a half-applied discount.
  if (redeemedOption && currentPoints < redeemedOption.pointsCost) {
    throw new InsufficientLoyaltyPointsError();
  }

  await update("customers", selectedCustomer.id, {
    loyalty_points: calculateLoyaltyPointsAfterSale(
      currentPoints,
      earnedPoints,
      redeemedOption?.pointsCost || 0,
    ),
  });

  if (earnedPoints > 0) {
    await insert("loyalty_transactions", {
      customer_id: selectedCustomer.id,
      points: earnedPoints,
      type: "earned",
      transaction_id: saleId,
      created_at: new Date().toISOString(),
    });
  }

  if (redeemedOption) {
    await insert("loyalty_transactions", {
      customer_id: selectedCustomer.id,
      points: -redeemedOption.pointsCost,
      type: "redeemed",
      transaction_id: saleId,
      created_at: new Date().toISOString(),
    });
  }
}

export function buildReceiptTransaction(params: {
  saleId: string;
  selectedCustomer: Customer | null;
  cashierUser: { first_name?: string; last_name?: string; username?: string } | null;
  cart: CartItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentSplits: PaymentSplit[];
  amountPaid: string;
}): ReceiptTransaction {
  const {
    saleId,
    selectedCustomer,
    cashierUser,
    cart,
    subtotal,
    tax,
    discount,
    total,
    paymentMethod,
    paymentSplits,
    amountPaid,
  } = params;

  return {
    id: saleId,
    date: new Date().toISOString(),
    customer: selectedCustomer
      ? {
          name: `${selectedCustomer.first_name} ${selectedCustomer.last_name || ""}`.trim(),
          phone: selectedCustomer.phone,
        }
      : null,
    cashier: cashierUser?.first_name
      ? `${cashierUser.first_name} ${cashierUser.last_name || ""}`.trim()
      : cashierUser?.username || "Cashier",
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
          ? calculateMixedAmountPaid(paymentSplits)
          : total,
    change:
      paymentMethod === "cash"
        ? Math.max(0, Number.parseFloat(amountPaid) - total)
        : paymentMethod === "mixed"
          ? calculateMixedChangeDue(paymentSplits, total)
          : 0,
  };
}
