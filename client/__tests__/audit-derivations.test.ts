import { describe, it, expect } from "vitest";
import {
  ALL_AUDIT_CATEGORIES,
  buildAuditCategoryOptions,
  selectAuditCategoryItems,
  selectCountedAuditItems,
  selectAdjustedAuditItems,
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
    countedQty: 10,
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
      item({ id: "e", countedQty: undefined }),
    ];

    expect(selectCountedAuditItems(edited).map((i) => i.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(
      selectAdjustedAuditItems(selectCountedAuditItems(edited)).map((i) => i.id),
    ).toEqual(["b", "c", "d"]);
  });

  it("reports unsaved edits only once a row actually differs", () => {
    expect(hasUnsavedAuditEdits(items)).toBe(false);
    expect(hasUnsavedAuditEdits([item({ countedQty: 11 })])).toBe(true);
    expect(hasUnsavedAuditEdits([item({ countedCostPrice: 111 })])).toBe(true);
  });
});
