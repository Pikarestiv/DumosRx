/**
 * Pure functions for POS and Cart calculations to ensure easy unit testing.
 * These do not rely on React state, Context, or SQLite databases.
 */

// Money is stored/summed as floats throughout (no integer minor-units), so every function here that produces a value meant to be stored (not j…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-pos-calculations-ts-L6
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
const MONEY_EPSILON = 0.01;

export function calculateSubtotal(items: { subtotal: number }[]): number {
  return roundMoney(items.reduce((sum, item) => sum + (item.subtotal || 0), 0));
}

// VAT is charged on the net-of-discount amount, not the raw subtotal — a discount is a reduction in the price charged, so tax should never be…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-pos-calculations-ts-L20
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

// NOTE: this still subtracts discountAmount from the raw subtotal even though tax should be computed net-of-discount (see calculateTax above).
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-pos-calculations-ts-L42
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

// How much is still owed on a cash tender, 0 once it covers the total.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-pos-calculations-ts-L62
export function calculateCashShortfall(amountPaid: number, total: number): number {
  if (!Number.isFinite(amountPaid) || total < 0) return 0;
  return roundMoney(Math.max(0, total - Math.max(0, amountPaid)));
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
  return roundMoney(Math.max(0, itemsSubtotal + taxShare - discountShare));
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
  // Negative splits are floored here too, not just at the input:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-utils-pos-calculations-ts-L118
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

// How much of a mixed-payment sale was actually collected at sale time — excludes any credit split, since that portion is owed, not paid.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-pos-calculations-ts-L139
export function calculateMixedAmountPaid(splits: PaymentSplit[]): number {
  return roundMoney(
    splits.reduce(
      (acc, s) => acc + (s.method === "credit" ? 0 : Math.max(0, s.amount || 0)),
      0,
    ),
  );
}

// Change due for a mixed-payment sale, computed against non-credit tender only.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-pos-calculations-ts-L153
export function calculateMixedChangeDue(splits: PaymentSplit[], total: number): number {
  return roundMoney(Math.max(0, calculateMixedAmountPaid(splits) - total));
}

// The largest credit split a mixed sale can carry:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-pos-calculations-ts-L163
export function calculateMaxAllowedCreditSplit(splits: PaymentSplit[], total: number): number {
  return Math.max(0, roundMoney(total - calculateMixedAmountPaid(splits)));
}

export function calculateCreditSplitTotal(splits: PaymentSplit[]): number {
  return roundMoney(
    splits.reduce(
      (acc, s) => acc + (s.method === "credit" ? Math.max(0, s.amount || 0) : 0),
      0,
    ),
  );
}

export function isCreditSplitOverAllocated(splits: PaymentSplit[], total: number): boolean {
  return (
    calculateCreditSplitTotal(splits) >
    calculateMaxAllowedCreditSplit(splits, total) + MONEY_EPSILON
  );
}

// A mixed sale with a nonzero credit split still owes that amount, so it must be "partial" — the same status recordCustomerPayment()/ applyCre…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-pos-calculations-ts-L187
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
