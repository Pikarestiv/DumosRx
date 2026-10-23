import type { AuditItem } from "./stock-audits";
import type { StockAuditSubmission } from "@/lib/db/queries/inventory";
import { genericFuzzySearch } from "@/lib/utils/search";
import { sortByAccessor, type SortDirection } from "@/lib/hooks/use-sortable-data";

export const ALL_AUDIT_CATEGORIES = "__all__";

export interface AuditCategoryOption {
  id: string;
  label: string;
  count: number;
}

// Category options with their item counts, built in ONE pass over `items`.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-derivations-ts-L12
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

// A row differs from the values the count opened with.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-derivations-ts-L34
function differsFromSystem(item: AuditItem): boolean {
  return (
    (item.countedQty !== undefined && item.countedQty !== item.systemQty) ||
    (item.countedCostPrice !== undefined &&
      item.countedCostPrice !== item.costPrice) ||
    (item.countedSellingPrice !== undefined &&
      item.countedSellingPrice !== item.sellingPrice)
  );
}

// Whether someone has actually been to the shelf for this row.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-derivations-ts-L47
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

// Whether the sheet may be rebuilt from a fresh products query.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-derivations-ts-L70
export function shouldRebuildAuditSheet(items: AuditItem[]): boolean {
  return !items.some(isAuditItemCounted);
}

// Refreshes each item's `lastAuditedAt` from fresh product data by id, leaving everything else on the row untouched.
// Rationale: docs/CLIENT_COMMENTS.md#stock-audits-last-audited-refresh
export function mergeFreshLastAuditedAt(
  items: AuditItem[],
  freshProducts: { id: string; last_audited_at?: string | null }[],
): AuditItem[] {
  const freshById = new Map(
    freshProducts.map((p) => [p.id, p.last_audited_at ?? null]),
  );
  let changed = false;
  const next = items.map((item) => {
    const fresh = freshById.get(item.id);
    if (fresh !== undefined && fresh !== item.lastAuditedAt) {
      changed = true;
      return { ...item, lastAuditedAt: fresh };
    }
    return item;
  });
  return changed ? next : items;
}

export type AuditCountStatus = "all" | "counted" | "uncounted" | "differences";

// The ledger's count-progress lens:
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-derivations-ts-L81
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

export interface AuditLens {
  category: string;
  status: AuditCountStatus;
  search: string;
}

export function selectAuditExportItems(
  items: AuditItem[],
  lens: AuditLens,
): AuditItem[] {
  return genericFuzzySearch(
    lens.search,
    selectAuditStatusItems(
      selectAuditCategoryItems(items, lens.category),
      lens.status,
    ),
    ["name", "sku"],
  ).results;
}

export function isAuditLensActive(lens: AuditLens): boolean {
  return (
    lens.category !== ALL_AUDIT_CATEGORIES ||
    lens.status !== "all" ||
    lens.search.trim() !== ""
  );
}

const AUDIT_STATUS_LABELS = new Map<AuditCountStatus, string>([
  ["counted", "Counted"],
  ["uncounted", "Not Counted"],
  ["differences", "Qty Differences"],
]);

export function describeAuditLens(
  lens: AuditLens,
  shown: number,
  total: number,
): string {
  if (!isAuditLensActive(lens)) return `${total} product(s)`;
  const search = lens.search.trim();
  return [
    `${shown} of ${total} product(s)`,
    lens.category !== ALL_AUDIT_CATEGORIES && `Category: ${lens.category}`,
    AUDIT_STATUS_LABELS.get(lens.status),
    search && `Search: "${search}"`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function auditExportFileName(
  lens: AuditLens,
  extension: string,
  date = new Date(),
): string {
  const slug =
    lens.category === ALL_AUDIT_CATEGORIES
      ? ""
      : lens.category.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const suffix = slug ? `_${slug}` : "";
  return `StockAudit_${date.toISOString().slice(0, 10)}${suffix}.${extension}`;
}

const diffQtyOf = (item: AuditItem) =>
  (item.countedQty ?? item.systemQty) - item.systemQty;

export const AUDIT_SORT_ACCESSORS = {
  name: (item: AuditItem) => item.name.toLowerCase(),
  countedQty: (item: AuditItem) => item.countedQty ?? item.systemQty,
  systemQty: (item: AuditItem) => item.systemQty,
  diffQty: diffQtyOf,
  costPrice: (item: AuditItem) => item.costPrice ?? 0,
  countedCost: (item: AuditItem) => item.countedCostPrice ?? item.costPrice ?? 0,
  diffCost: (item: AuditItem) =>
    item.costPrice !== undefined ? diffQtyOf(item) * item.costPrice : 0,
  sellingPrice: (item: AuditItem) => item.sellingPrice ?? 0,
  countedSelling: (item: AuditItem) =>
    item.countedSellingPrice ?? item.sellingPrice ?? 0,
  diffSelling: (item: AuditItem) =>
    item.sellingPrice !== undefined ? diffQtyOf(item) * item.sellingPrice : 0,
  lastAuditedAt: (item: AuditItem) =>
    item.lastAuditedAt ? new Date(item.lastAuditedAt).getTime() : 0,
};

export type AuditSortKey = keyof typeof AUDIT_SORT_ACCESSORS;

export function sortAuditItems(
  items: AuditItem[],
  key: AuditSortKey | null,
  direction: SortDirection,
): AuditItem[] {
  return key ? sortByAccessor(items, AUDIT_SORT_ACCESSORS[key], direction) : items;
}

export function selectAdjustedAuditItems(countedItems: AuditItem[]): AuditItem[] {
  return countedItems.filter(differsFromSystem);
}

/** True once any row differs from the values the count opened with, i.e. the
 * point from which backing out of the flow would lose real work. */
export function hasUnsavedAuditEdits(items: AuditItem[]): boolean {
  return selectAdjustedAuditItems(selectCountedAuditItems(items)).length > 0;
}

// What submitStockAudit() receives for the rows being posted.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-derivations-ts-L118
export function toStockAuditSubmissions(
  items: AuditItem[],
): StockAuditSubmission[] {
  return items.map((item) => ({
    productId: item.id,
    systemQty: item.systemQty,
    countedQty: item.countedQty,
    baselineQty: item.baselineQty,
    systemCostPrice: item.costPrice,
    countedCostPrice: item.countedCostPrice ?? item.costPrice,
    systemSellingPrice: item.sellingPrice,
    countedSellingPrice: item.countedSellingPrice ?? item.sellingPrice,
    reason: item.reason,
  }));
}

/** The typed figure, applied before the live re-read resolves so typing
 * never waits on the database. */
export function applyOptimisticCount(
  items: AuditItem[],
  id: string,
  countedQty: number,
): AuditItem[] {
  return items.map((item) =>
    item.id === id ? { ...item, countedQty, counted: true } : item,
  );
}

// The row as it stands once the live read lands:
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-derivations-ts-L160
export function applyCountBaseline(
  items: AuditItem[],
  id: string,
  countedQty: number | undefined,
  live: number,
): AuditItem[] {
  return items.map((item) =>
    item.id === id
      ? {
          ...item,
          systemQty: live,
          baselineQty: live,
          countedQty: countedQty ?? live,
          counted: true,
        }
      : item,
  );
}

// Keeps a row's live re-read from being overtaken by its own history.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-stock-batch-audit-derivations-ts-L183
export function createCountSequencer() {
  const tokens = new Map<string, number>();
  const bump = (id: string) => {
    const next = (tokens.get(id) ?? 0) + 1;
    tokens.set(id, next);
    return next;
  };
  return {
    begin: bump,
    isCurrent: (id: string, token: number) => tokens.get(id) === token,
    cancel: (id?: string) => {
      if (id === undefined) tokens.clear();
      else bump(id);
    },
  };
}
