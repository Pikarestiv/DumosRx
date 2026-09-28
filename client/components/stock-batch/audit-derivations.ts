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

export function selectCountedAuditItems(items: AuditItem[]): AuditItem[] {
  return items.filter((item) => item.countedQty !== undefined);
}

export function selectAdjustedAuditItems(countedItems: AuditItem[]): AuditItem[] {
  return countedItems.filter(
    (item) =>
      item.countedQty !== item.systemQty ||
      (item.countedCostPrice !== undefined &&
        item.countedCostPrice !== item.costPrice) ||
      (item.countedSellingPrice !== undefined &&
        item.countedSellingPrice !== item.sellingPrice),
  );
}

/** True once any row differs from the values the count opened with, i.e. the
 * point from which backing out of the flow would lose real work. */
export function hasUnsavedAuditEdits(items: AuditItem[]): boolean {
  return selectAdjustedAuditItems(selectCountedAuditItems(items)).length > 0;
}
