export interface StockValueDisplay {
  value: number;
  caption: string | null;
}

export function describeStockValue(
  costValue: number,
  retailValue: number,
  formatCurrency: (amount: number) => string,
): StockValueDisplay {
  if (costValue > 0) {
    return { value: costValue, caption: retailValue > 0 ? `Worth ${formatCurrency(retailValue)} at selling price` : null };
  }
  if (retailValue > 0) {
    return { value: retailValue, caption: "At selling price (no cost prices set)" };
  }
  return { value: 0, caption: null };
}
