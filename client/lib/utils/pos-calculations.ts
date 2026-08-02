/**
 * Pure functions for POS and Cart calculations to ensure easy unit testing.
 * These do not rely on React state, Context, or SQLite databases.
 */

export function calculateSubtotal(items: { subtotal: number }[]): number {
  return items.reduce((sum, item) => sum + (item.subtotal || 0), 0);
}

export function calculateTax(subtotal: number, vatPercentage: number): number {
  if (subtotal < 0 || vatPercentage < 0) return 0;
  return subtotal * (vatPercentage / 100);
}

export function calculateDiscountAmount(
  subtotal: number,
  discount: number,
  discountType: "fixed" | "percentage"
): number {
  if (discount < 0 || subtotal < 0) return 0;
  if (discountType === "percentage") {
    return subtotal * (discount / 100);
  }
  return discount;
}

export function calculateTotal(
  subtotal: number,
  tax: number,
  discountAmount: number
): number {
  return Math.max(0, subtotal + tax - discountAmount);
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
  const totalSplitAmount = splits.reduce((acc, s) => acc + (s.amount || 0), 0);
  
  return {
    isFullyCovered: totalSplitAmount >= total,
    totalSplitAmount,
    shortageAmount: Math.max(0, total - totalSplitAmount),
    changeDueAmount: Math.max(0, totalSplitAmount - total),
  };
}
