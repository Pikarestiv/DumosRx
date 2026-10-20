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
  mergeFreshLastAuditedAt,
  shouldRebuildAuditSheet,
  toStockAuditSubmissions,
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

// P1/U4: the cycle-count screen derived its category groupings with an O(categories x items) filter-per-category pass, unm…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-audit-derivations-test-ts-L35
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

  it("sends a price-only row with NO counted quantity, so the submit uses the live figure", () => {
    // The row's own systemQty was frozen when the sheet was built.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-audit-derivations-test-ts-L145
    const [submission] = toStockAuditSubmissions([
      item({ systemQty: 20, countedQty: undefined, countedCostPrice: 150 }),
    ]);
    expect(submission.countedQty).toBeUndefined();
    expect(submission.systemQty).toBe(20);
    expect(submission.countedCostPrice).toBe(150);
  });

  it("carries the baseline stamped when the row was counted", () => {
    const [submission] = toStockAuditSubmissions([
      item({ systemQty: 0, baselineQty: 0, countedQty: 10 }),
    ]);
    expect(submission.baselineQty).toBe(0);
    expect(submission.countedQty).toBe(10);
  });

  it("sends NO baseline for a row that was never re-baselined, so the submit re-reads instead", () => {
    // A draft resumed from a build before A-263 has a typed countedQty beside a systemQty frozen at sheet-build.
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-audit-derivations-test-ts-L165
    const [submission] = toStockAuditSubmissions([
      item({ systemQty: 10, countedQty: 5 }),
    ]);
    expect(submission.baselineQty).toBeUndefined();
  });

  it("passes a counted quantity straight through, zero included", () => {
    expect(
      toStockAuditSubmissions([item({ countedQty: 0 })])[0].countedQty,
    ).toBe(0);
    expect(
      toStockAuditSubmissions([item({ countedQty: 12 })])[0].countedQty,
    ).toBe(12);
  });

  it("reports unsaved edits only once a row actually differs", () => {
    expect(hasUnsavedAuditEdits(items)).toBe(false);
    expect(hasUnsavedAuditEdits([item({ countedQty: 11 })])).toBe(true);
    expect(hasUnsavedAuditEdits([item({ countedCostPrice: 111 })])).toBe(true);
  });
});

describe("shouldRebuildAuditSheet", () => {
  it("rebuilds an empty sheet and a sheet nobody has touched", () => {
    expect(shouldRebuildAuditSheet([])).toBe(true);
    expect(shouldRebuildAuditSheet([item({ id: "a" }), item({ id: "b" })])).toBe(
      true,
    );
  });

  it("refuses once a row is entered, ticked or price-corrected", () => {
    expect(shouldRebuildAuditSheet([item({ countedQty: 10 })])).toBe(false);
    expect(shouldRebuildAuditSheet([item({ countedQty: 0 })])).toBe(false);
    expect(shouldRebuildAuditSheet([item({ counted: true })])).toBe(false);
    expect(shouldRebuildAuditSheet([item({ countedCostPrice: 90 })])).toBe(
      false,
    );
  });

  it("refuses when any row in a long sheet has been counted", () => {
    const sheet = [item({ id: "a" }), item({ id: "b", countedQty: 3 }), item({ id: "c" })];
    expect(shouldRebuildAuditSheet(sheet)).toBe(false);
  });
});

describe("mergeFreshLastAuditedAt", () => {
  it("updates lastAuditedAt by id without touching anything else on the row", () => {
    const sheet = [
      item({ id: "a", lastAuditedAt: null, countedQty: 5 }),
      item({ id: "b", lastAuditedAt: "2026-10-01T00:00:00Z" }),
    ];
    const merged = mergeFreshLastAuditedAt(sheet, [
      { id: "a", last_audited_at: "2026-10-20T12:00:00Z" },
      { id: "b", last_audited_at: "2026-10-01T00:00:00Z" },
    ]);
    expect(merged[0].lastAuditedAt).toBe("2026-10-20T12:00:00Z");
    expect(merged[0].countedQty).toBe(5); // the in-progress count survives
    expect(merged[1]).toBe(sheet[1]); // unchanged row keeps its identity
  });

  it("returns the same array reference when nothing changed", () => {
    const sheet = [item({ id: "a", lastAuditedAt: "2026-10-20T12:00:00Z" })];
    const merged = mergeFreshLastAuditedAt(sheet, [
      { id: "a", last_audited_at: "2026-10-20T12:00:00Z" },
    ]);
    expect(merged).toBe(sheet);
  });

  it("ignores a product id that isn't on the sheet", () => {
    const sheet = [item({ id: "a", lastAuditedAt: null })];
    const merged = mergeFreshLastAuditedAt(sheet, [
      { id: "z", last_audited_at: "2026-10-20T12:00:00Z" },
    ]);
    expect(merged).toBe(sheet);
  });
});
