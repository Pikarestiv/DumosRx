export interface ReturnableSaleItem {
  id: string;
  quantity: number;
  /** Total already returned across any prior returns on this sale. */
  returned_quantity?: number;
}

/** How much of a sale line item is still eligible to return. Never negative,
 * even if returned_quantity somehow exceeds quantity. */
export function getMaxReturnable(item: ReturnableSaleItem): number {
  return Math.max(0, item.quantity - (item.returned_quantity || 0));
}

/** Whether every line item on the sale has had its full remaining balance
 * returned once this return (the given selections) is applied — across
 * both this return and any prior ones, not just what's touched right now.
 * An item with nothing left to return (already fully returned before this
 * action) doesn't need to be selected to count as "done". */
export function isFullyReturned(
  items: ReturnableSaleItem[],
  selections: { id: string; returnQuantity: number }[],
): boolean {
  return items.every((item) => {
    const remaining = getMaxReturnable(item);
    if (remaining <= 0) return true;
    const selected = selections.find((s) => s.id === item.id);
    return selected ? selected.returnQuantity === remaining : false;
  });
}
