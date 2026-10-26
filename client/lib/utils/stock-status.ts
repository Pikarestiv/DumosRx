export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export type StockLevel = "out" | "low" | "in";

const STATUS_WORDS: Record<StockLevel, string> = {
  out: "Out of stock",
  low: "Low stock",
  in: "In stock",
};

export function lowStockThreshold(reorderLevel?: number | null): number {
  return reorderLevel || DEFAULT_LOW_STOCK_THRESHOLD;
}

export function stockLevel(qty: number, reorderLevel?: number | null): StockLevel {
  if (qty <= 0) return "out";
  return qty <= lowStockThreshold(reorderLevel) ? "low" : "in";
}

export function describeStock(
  qty: number,
  reorderLevel: number | null | undefined,
  canSeeQuantities: boolean,
): string {
  const level = stockLevel(qty, reorderLevel);
  return level === "out" || !canSeeQuantities ? STATUS_WORDS[level] : `${qty} left`;
}

export function formatInsufficientStock(available: number, canSeeQuantities: boolean): string {
  if (!canSeeQuantities) return "Not enough stock for that quantity";
  return `Insufficient stock — only ${available} unit${available === 1 ? "" : "s"} available`;
}

export function formatBackorderWarning(onHand: number, requested: number, canSeeQuantities: boolean): string {
  if (!canSeeQuantities) return "More than the recorded stock. The extra will be recorded as owed.";
  const inStock = Math.max(0, onHand);
  const head = inStock > 0 ? `Only ${inStock} in stock.` : "Nothing in stock.";
  return `${head} ${requested - inStock} will be recorded as owed until stock is received.`;
}

export function describeOwedSettlement(owed: number, receiving: number, canSeeQuantities: boolean): string {
  if (!canSeeQuantities) return "Some of this was already sold before the delivery and is taken off what goes on the shelf.";
  const head = `${owed} already sold before this delivery.`;
  if (receiving <= owed) return `${head} All ${receiving} go to those sales; none go on the shelf.`;
  return `${head} ${receiving - owed} will go on the shelf.`;
}
