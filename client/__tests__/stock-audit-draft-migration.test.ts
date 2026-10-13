import { describe, it, expect } from "vitest";
import { migrateStockAuditDraft } from "@/lib/hooks/use-stock-audit-draft";
import type { AuditItem } from "@/components/stock-batch/stock-audits";

function row(overrides: Partial<AuditItem> = {}): AuditItem {
  return {
    id: "p1",
    name: "Panadol",
    sku: "SKU-1",
    category: "Analgesics",
    systemQty: 10,
    countedQty: 10,
    ...overrides,
  };
}

/**
 * Reported live by the store owner the moment the blank-field build was
 * opened on a device with an older draft: "why did all the rows become
 * ticked all of a sudden?" A v0 draft pre-filled every countedQty with the
 * system quantity, and an entered quantity is now what marks a row counted,
 * so the whole sheet rehydrated as counted.
 */
describe("stock audit draft migration to the blank Counted Qty field", () => {
  it("clears a v0 row that only carried the old prefill", () => {
    const { items } = migrateStockAuditDraft({ items: [row({ id: "a" })] }, 0);
    expect(items[0].countedQty).toBeUndefined();
  });

  it("keeps a v0 row the counter actually edited", () => {
    const { items } = migrateStockAuditDraft(
      {
        items: [
          row({ id: "differs", countedQty: 8 }),
          row({ id: "ticked", countedQty: 10, counted: true }),
          row({ id: "priced", countedQty: 10, counted: true, countedCostPrice: 90 }),
        ],
      },
      0,
    );
    expect(items.map((i) => i.countedQty)).toEqual([8, 10, 10]);
  });

  it("leaves a current draft alone", () => {
    const { items } = migrateStockAuditDraft(
      { items: [row({ countedQty: undefined }), row({ id: "b", countedQty: 4 })] },
      1,
    );
    expect(items.map((i) => i.countedQty)).toEqual([undefined, 4]);
  });

  it("survives a persisted blob with no items at all", () => {
    expect(migrateStockAuditDraft(undefined, 0)).toEqual({ items: [] });
    expect(migrateStockAuditDraft({}, 0)).toEqual({ items: [] });
  });
});
