import type { AuditItem } from "./stock-audits";

export const ALL_AUDIT_CATEGORIES = "__all__";

export interface AuditCategoryOption {
  id: string;
  label: string;
  count: number;
}

/** Category options with their item counts, built in ONE pass over `items`.
 * The previous shape ran `items.filter(...)` once per distinct category
 * (O(categories x items)) unmemoized, i.e. on every keystroke in any of the
 * ledger's hundreds of number inputs. */
export function buildAuditCategoryOptions(items: AuditItem[]): AuditCategoryOption[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }
  return Array.from(counts, ([id, count]) => ({ id, label: id, count })).sort(
    (a, b) => b.count - a.count,
  );
}

export function selectAuditCategoryItems(
  items: AuditItem[],
  selectedCategory: string,
): AuditItem[] {
  if (selectedCategory === ALL_AUDIT_CATEGORIES) return items;
  return items.filter((item) => item.category === selectedCategory);
}

/** A row differs from the values the count opened with. A row whose
 * countedQty is undefined has not been entered at all, so it is never a
 * difference - submitting one would post `undefined` as a quantity. */
function differsFromSystem(item: AuditItem): boolean {
  return (
    (item.countedQty !== undefined && item.countedQty !== item.systemQty) ||
    (item.countedCostPrice !== undefined &&
      item.countedCostPrice !== item.costPrice) ||
    (item.countedSellingPrice !== undefined &&
      item.countedSellingPrice !== item.sellingPrice)
  );
}

/** Whether someone has actually been to the shelf for this row. Counted Qty
 * opens empty, so an entered quantity IS the record of a count - including
 * one that happens to equal the system figure. `counted` additionally covers
 * a row ticked by hand (which fills the quantity for you) and a row where
 * only a price was corrected.
 *
 * A row that differs counts regardless of either: that keeps drafts
 * persisted before this existed (zustand `stock-audit-draft`, which
 * pre-filled Counted Qty with the system quantity) correct, and both
 * fallbacks can be retired from this check once no device can still be
 * carrying such a draft - i.e. one release after 2026-10-13. */
export function isAuditItemCounted(item: AuditItem): boolean {
  return (
    item.countedQty !== undefined ||
    item.counted === true ||
    differsFromSystem(item)
  );
}

export function selectCountedAuditItems(items: AuditItem[]): AuditItem[] {
  return items.filter(isAuditItemCounted);
}

export type AuditCountStatus = "all" | "counted" | "uncounted" | "differences";

/** The ledger's count-progress lens: what's left to count, what's been
 * done, and which rows disagreed with the system badly enough to be worth
 * a recount. */
export function selectAuditStatusItems(
  items: AuditItem[],
  status: AuditCountStatus,
): AuditItem[] {
  switch (status) {
    case "counted":
      return items.filter(isAuditItemCounted);
    case "uncounted":
      return items.filter((item) => !isAuditItemCounted(item));
    case "differences":
      return items.filter(
        (item) => (item.countedQty ?? item.systemQty) !== item.systemQty,
      );
    default:
      return items;
  }
}

export function selectAdjustedAuditItems(countedItems: AuditItem[]): AuditItem[] {
  return countedItems.filter(differsFromSystem);
}

/** True once any row differs from the values the count opened with, i.e. the
 * point from which backing out of the flow would lose real work. */
export function hasUnsavedAuditEdits(items: AuditItem[]): boolean {
  return selectAdjustedAuditItems(selectCountedAuditItems(items)).length > 0;
}
