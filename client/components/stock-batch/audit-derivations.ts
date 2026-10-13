import type { AuditItem } from "./stock-audits";
import type { StockAuditSubmission } from "@/lib/db/queries/inventory";

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
export function matchesAuditStatus(
  item: AuditItem,
  status: AuditCountStatus,
): boolean {
  switch (status) {
    case "counted":
      return isAuditItemCounted(item);
    case "uncounted":
      return !isAuditItemCounted(item);
    case "differences":
      return (item.countedQty ?? item.systemQty) !== item.systemQty;
    case "all":
      return true;
  }
}

export function selectAuditStatusItems(
  items: AuditItem[],
  status: AuditCountStatus,
): AuditItem[] {
  if (status === "all") return items;
  return items.filter((item) => matchesAuditStatus(item, status));
}

export function selectAdjustedAuditItems(countedItems: AuditItem[]): AuditItem[] {
  return countedItems.filter(differsFromSystem);
}

/** True once any row differs from the values the count opened with, i.e. the
 * point from which backing out of the flow would lose real work. */
export function hasUnsavedAuditEdits(items: AuditItem[]): boolean {
  return selectAdjustedAuditItems(selectCountedAuditItems(items)).length > 0;
}

/** What submitStockAudit() receives for the rows being posted.
 *
 * `countedQty` is passed through as-is, `undefined` included: a row where
 * only a price was corrected has no counted quantity, and submitStockAudit
 * then resolves it against the quantity it re-reads INSIDE its transaction.
 * Coalescing it to `systemQty` here would post a phantom adjustment.
 *
 * `systemQty` travels as `baselineQty`: since A-263 it is the live figure
 * read when THIS row was counted, not the one the sheet was built with, so
 * the discrepancy is measured at the moment of the count and anything that
 * moved afterwards is preserved. See client/AGENTS.md.
 */
export function toStockAuditSubmissions(
  items: AuditItem[],
): StockAuditSubmission[] {
  return items.map((item) => ({
    productId: item.id,
    systemQty: item.systemQty,
    countedQty: item.countedQty,
    baselineQty: item.systemQty,
    systemCostPrice: item.costPrice,
    countedCostPrice: item.countedCostPrice ?? item.costPrice,
    systemSellingPrice: item.sellingPrice,
    countedSellingPrice: item.countedSellingPrice ?? item.sellingPrice,
    reason: item.reason,
  }));
}
