import { describe, it, expect } from "vitest";
import {
  ALL_AUDIT_CATEGORIES,
  buildAuditCategoryOptions,
  selectAuditCategoryItems,
  selectCountedAuditItems,
  selectAdjustedAuditItems,
  selectAuditStatusItems,
  matchesAuditStatus,
  isAuditItemCounted,
  hasUnsavedAuditEdits,
} from "@/components/stock-batch/audit-derivations";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

function item(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    id: "i1",
    name: "Panadol",
    sku: "SKU-1",
    category: "Analgesics",
    systemQty: 10,
    // An untouched row: Counted Qty opens EMPTY, so there is no quantity
    // here until someone enters one.
    countedQty: undefined,
    costPrice: 100,
    countedCostPrice: 100,
    sellingPrice: 150,
    countedSellingPrice: 150,
    ...overrides,
  };
}

/**
 * P1/U4: the cycle-count screen derived its category groupings with an
 * O(categories x items) filter-per-category pass, unmemoized, on every
 * render; and it had no way to tell whether a count had unsaved work in it.
 * Both now live in pure helpers the screen memoizes.
 */
describe("stock audit derivations", () => {
  const items: AuditItem[] = [
    item({ id: "a", category: "Analgesics" }),
    item({ id: "b", category: "Analgesics" }),
    item({ id: "c", category: "Vitamins" }),
    item({ id: "d", category: "Antibiotics" }),
    item({ id: "e", category: "Analgesics" }),
    item({ id: "f", category: "Vitamins" }),
  ];

  it("counts every category in one pass, ordered by size", () => {
    expect(buildAuditCategoryOptions(items)).toEqual([
      { id: "Analgesics", label: "Analgesics", count: 3 },
      { id: "Vitamins", label: "Vitamins", count: 2 },
      { id: "Antibiotics", label: "Antibiotics", count: 1 },
    ]);
  });

  it("matches what a filter-per-category pass would have produced", () => {
    const viaFilter = Array.from(new Set(items.map((i) => i.category)))
      .map((cat) => ({
        id: cat,
        label: cat,
        count: items.filter((i) => i.category === cat).length,
      }))
      .sort((a, b) => b.count - a.count);

    expect(buildAuditCategoryOptions(items)).toEqual(viaFilter);
  });

  it("returns the same array identity for the all-categories lens", () => {
    expect(selectAuditCategoryItems(items, ALL_AUDIT_CATEGORIES)).toBe(items);
    expect(selectAuditCategoryItems(items, "Vitamins").map((i) => i.id)).toEqual([
      "c",
      "f",
    ]);
  });

  it("treats only genuinely changed rows as adjustments", () => {
    const edited = [
      item({ id: "a" }),
      item({ id: "b", countedQty: 12 }),
      item({ id: "c", countedCostPrice: 90 }),
      item({ id: "d", countedSellingPrice: 199 }),
      item({ id: "e", countedQty: 10 }),
    ];

    // "a" has not been counted at all; "e" was counted and matched.
    expect(selectCountedAuditItems(edited).map((i) => i.id)).toEqual([
      "b",
      "c",
      "d",
      "e",
    ]);
    // Only the rows that actually differ are ever posted to stock - a row
    // counted at exactly the system figure writes nothing.
    expect(
      selectAdjustedAuditItems(selectCountedAuditItems(edited)).map((i) => i.id),
    ).toEqual(["b", "c", "d"]);
  });

  it("counts an entered quantity, even one that matched the system", () => {
    expect(isAuditItemCounted(item())).toBe(false);
    expect(isAuditItemCounted(item({ countedQty: 10 }))).toBe(true);
    expect(isAuditItemCounted(item({ countedQty: 0 }))).toBe(true);
    expect(isAuditItemCounted(item({ countedQty: 12 }))).toBe(true);
    // The hand-ticked row, and a row where only a price was corrected.
    expect(isAuditItemCounted(item({ counted: true }))).toBe(true);
    expect(isAuditItemCounted(item({ countedCostPrice: 90 }))).toBe(true);
    // An un-entered quantity is never an adjustment - it would submit as
    // `undefined`.
    expect(selectAdjustedAuditItems([item()])).toEqual([]);
  });

  it("lenses the ledger by count progress", () => {
    const rows = [
      item({ id: "a" }),
      item({ id: "b", countedQty: 10 }),
      item({ id: "c", countedQty: 12 }),
    ];
    expect(selectAuditStatusItems(rows, "all")).toBe(rows);
    expect(selectAuditStatusItems(rows, "counted").map((i) => i.id)).toEqual([
      "b",
      "c",
    ]);
    expect(selectAuditStatusItems(rows, "uncounted").map((i) => i.id)).toEqual([
      "a",
    ]);
    // A row counted at the system figure is not a difference.
    expect(
      selectAuditStatusItems(rows, "differences").map((i) => i.id),
    ).toEqual(["c"]);
  });

  it("exposes a per-row status predicate, so the ledger can keep a row it has just counted on screen", () => {
    const counted = item({ countedQty: 10 });
    expect(matchesAuditStatus(counted, "uncounted")).toBe(false);
    expect(matchesAuditStatus(counted, "counted")).toBe(true);
    expect(matchesAuditStatus(item(), "uncounted")).toBe(true);
    // The "all" lens matches everything, counted or not.
    expect(matchesAuditStatus(item(), "all")).toBe(true);
  });

  it("reports unsaved edits only once a row actually differs", () => {
    expect(hasUnsavedAuditEdits(items)).toBe(false);
    expect(hasUnsavedAuditEdits([item({ countedQty: 11 })])).toBe(true);
    expect(hasUnsavedAuditEdits([item({ countedCostPrice: 111 })])).toBe(true);
  });
});
