/**
 * Pure functions for POS and Cart calculations to ensure easy unit testing.
 * These do not rely on React state, Context, or SQLite databases.
 */

// Money is stored/summed as floats throughout (no integer minor-units), so
// every function here that produces a value meant to be stored (not just
// displayed) rounds to the cent/kobo - otherwise the stored value can drift
// from what the receipt/UI rounds and displays, and SUM()s in reports don't
// tie out to the sum of displayed line values.
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
const MONEY_EPSILON = 0.01;

export function calculateSubtotal(items: { subtotal: number }[]): number {
  return roundMoney(items.reduce((sum, item) => sum + (item.subtotal || 0), 0));
}

export function calculateTax(subtotal: number, vatPercentage: number): number {
  if (subtotal < 0 || vatPercentage < 0) return 0;
  return roundMoney(subtotal * (vatPercentage / 100));
}

export function calculateDiscountAmount(
  subtotal: number,
  discount: number,
  discountType: "fixed" | "percentage"
): number {
  if (discount < 0 || subtotal < 0) return 0;
  if (discountType === "percentage") {
    return roundMoney(subtotal * (discount / 100));
  }
  return roundMoney(discount);
}

export function calculateTotal(
  subtotal: number,
  tax: number,
  discountAmount: number
): number {
  return roundMoney(Math.max(0, subtotal + tax - discountAmount));
}

export function calculateChangeDue(amountPaid: number, total: number): number {
  if (amountPaid < 0 || total < 0) return 0;
  return Math.max(0, amountPaid - total);
}

export function calculateTaxPercentage(
  taxAmount: number,
  subtotal: number
): number {
  if (subtotal <= 0) return 0;
  return (taxAmount / subtotal) * 100;
}

export function calculateProportionalRefund(params: {
  itemsSubtotal: number;
  saleSubtotal: number;
  saleTaxAmount: number;
  saleDiscountAmount: number;
}): number {
  const { itemsSubtotal, saleSubtotal, saleTaxAmount, saleDiscountAmount } =
    params;
  const returnShare = saleSubtotal > 0 ? itemsSubtotal / saleSubtotal : 0;
  const taxShare = returnShare * (saleTaxAmount || 0);
  const discountShare = returnShare * (saleDiscountAmount || 0);
  return Math.max(0, itemsSubtotal + taxShare - discountShare);
}

export function calculateNetSaleAmount(
  totalAmount: number,
  totalRefunded: number
): number {
  return Math.max(0, (totalAmount || 0) - (totalRefunded || 0));
}

export function calculateAvgBasket(
  sales: { totalAmount: number; totalRefunded?: number }[]
): number {
  if (sales.length === 0) return 0;
  const netTotal = sales.reduce(
    (acc, s) => acc + calculateNetSaleAmount(s.totalAmount, s.totalRefunded || 0),
    0
  );
  return netTotal / sales.length;
}

export function calculateSplitShortage(
  splits: { amount: number }[],
  total: number
): {
  isFullyCovered: boolean;
  totalSplitAmount: number;
  shortageAmount: number;
  changeDueAmount: number;
} {
  // Negative splits are floored here too, not just at the input: a negative
  // amount would otherwise offset a larger positive one and make an
  // under-collected sale look fully covered.
  const totalSplitAmount = roundMoney(
    splits.reduce((acc, s) => acc + Math.max(0, s.amount || 0), 0),
  );

  return {
    isFullyCovered: totalSplitAmount >= total - MONEY_EPSILON,
    totalSplitAmount,
    shortageAmount: Math.max(0, roundMoney(total - totalSplitAmount)),
    changeDueAmount: Math.max(0, roundMoney(totalSplitAmount - total)),
  };
}

interface PaymentSplit {
  method: string;
  amount: number;
}

/** How much of a mixed-payment sale was actually collected at sale time —
 * excludes any credit split, since that portion is owed, not paid. Using
 * the raw split total here (including credit) is what previously made a
 * mixed sale with an unpaid credit portion look fully paid. Negative split
 * amounts are floored to 0: no tender can subtract from what was collected. */
export function calculateMixedAmountPaid(splits: PaymentSplit[]): number {
  return splits.reduce(
    (acc, s) => acc + (s.method === "credit" ? 0 : Math.max(0, s.amount || 0)),
    0,
  );
}

/** Change due for a mixed-payment sale, computed against non-credit tender
 * only. A credit split is money the customer still owes, not money they
 * handed over, so it can never produce change - using the raw split total
 * here (including credit) previously let an over-allocated credit split
 * make the sale look overpaid, handing real cash back for an "overpayment"
 * that was never actually tendered. */
export function calculateMixedChangeDue(splits: PaymentSplit[], total: number): number {
  return Math.max(0, calculateMixedAmountPaid(splits) - total);
}

/** A mixed sale with a nonzero credit split still owes that amount, so it
 * must be "partial" — the same status recordCustomerPayment()/
 * applyCreditPaymentFIFO() already look for — not "completed", or debt
 * repayment later can never find and settle it. */
export function calculateSalePaymentStatus(
  paymentMethod: "cash" | "card" | "transfer" | "credit" | "mixed",
  splits: PaymentSplit[],
): "pending" | "partial" | "completed" {
  if (paymentMethod === "credit") return "pending";
  if (
    paymentMethod === "mixed" &&
    splits.some((s) => s.method === "credit" && (s.amount || 0) > 0)
  ) {
    return "partial";
  }
  return "completed";
}
