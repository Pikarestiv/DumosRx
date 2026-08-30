import { describe, it, expect } from "vitest";
import { getImmediateUnitCost, getLineTotal } from "@/components/procurement/po-line-item-math";
import type { POLineItemDraft } from "@/components/procurement/po-item-ledger-table";

function item(overrides: Partial<POLineItemDraft> = {}): POLineItemDraft {
  return {
    product_id: "p1",
    product_name: "Zyrtec",
    bulk_unit: "Carton",
    bulk_quantity: 1,
    units_per_bulk: 60,
    unit_cost: 37200, // per carton: 620/tablet * 60 tablets/carton
    subtotal: 37200,
    ...overrides,
  };
}

describe("po-line-item-math", () => {
  describe("getImmediateUnitCost", () => {
    it("converts the catalog's per-bulk-unit cost down to per-base-unit when no override is set", () => {
      // Regression: the review-price popover previously showed the raw
      // per-carton unit_cost (37,200) as "Cost", right next to a sell price
      // meant to be entered per tablet — this is the value that must match
      // the catalog's per-tablet cost (620) instead.
      expect(getImmediateUnitCost(item())).toBe(620);
    });

    it("uses the override as-is, since it's already typed per base unit", () => {
      expect(getImmediateUnitCost(item({ cost_price_override: 650 }))).toBe(650);
    });

    it("treats an empty-string override the same as no override", () => {
      expect(getImmediateUnitCost(item({ cost_price_override: "" }))).toBe(620);
    });
  });

  describe("getLineTotal", () => {
    it("standard type: bulk_quantity times the per-carton unit_cost", () => {
      expect(getLineTotal(item({ bulk_quantity: 2 }), "standard")).toBe(74400);
    });

    it("immediate type, no override: matches the pre-override total (unit_cost is already per-carton)", () => {
      expect(getLineTotal(item(), "immediate")).toBe(37200);
    });

    it("immediate type, with override: scales the per-tablet override by units_per_bulk, not just bulk_quantity", () => {
      // Regression: entering a new per-tablet cost (650) previously produced
      // a total of bulk_quantity * 650 = 650, silently dropping the
      // 60-tablets-per-carton factor and understating the order by 60x.
      expect(getLineTotal(item({ cost_price_override: 650 }), "immediate")).toBe(39000);
    });

    it("immediate type, with override and multiple cartons", () => {
      expect(
        getLineTotal(item({ bulk_quantity: 3, cost_price_override: 650 }), "immediate"),
      ).toBe(117000);
    });
  });
});
