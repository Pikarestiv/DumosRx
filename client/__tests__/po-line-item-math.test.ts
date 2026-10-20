import { describe, it, expect } from "vitest";
import { getImmediateUnitCost, getLineTotal, getValidatedAmountPaid, countSellingPriceOverrides, getTotalBaseUnits, immediateLineAmount, getOrderTotal } from "@/components/procurement/po-line-item-math";
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
  describe("an immediate line bills what the owner typed", () => {
    it("prices a carton of 3 at the carton cost, not 3x the rounded unit cost", () => {
      // A-261 rounds the per-unit cost to 333.33 for the batch's valuation.
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-po-line-item-math-test-ts-L21
      const line = item({ bulk_quantity: 1, unit_cost: 1000, units_per_bulk: 3 });
      expect(getImmediateUnitCost(line)).toBe(333.33);
      expect(getLineTotal(line, "immediate")).toBe(1000);
      expect(getOrderTotal([line], "immediate")).toBe(1000);
    });

    it("agrees with the standard-PO flow for the same line", () => {
      const line = item({ bulk_quantity: 2, unit_cost: 1000, units_per_bulk: 12 });
      expect(getLineTotal(line, "immediate")).toBe(
        getLineTotal(line, "standard"),
      );
    });

    it("multiplies an override up from the base unit, since that is how it was typed", () => {
      const line = item({
        bulk_quantity: 2,
        unit_cost: 1000,
        units_per_bulk: 10,
        cost_price_override: 90,
      });
      expect(immediateLineAmount(line)).toBe(1800);
      expect(getLineTotal(line, "immediate")).toBe(1800);
    });

    it("rounds an order total rather than leaving float noise", () => {
      const line = item({ bulk_quantity: 1, unit_cost: 1000, units_per_bulk: 3, cost_price_override: 333.333 });
      expect(Number.isInteger(getOrderTotal([line, line, line], "immediate") * 100)).toBe(true);
    });
  });

  describe("an amount paid is stored at two decimals", () => {
    it("rounds a typed over-precise amount", () => {
      expect(getValidatedAmountPaid("1000.005", 5000)).toBe(1000.01);
      expect(getValidatedAmountPaid("12.3456", 5000)).toBe(12.35);
    });

    it("still clamps to the order total and floors junk at zero", () => {
      expect(getValidatedAmountPaid("9999", 2700)).toBe(2700);
      expect(getValidatedAmountPaid("abc", 2700)).toBe(0);
      expect(getValidatedAmountPaid("-5", 2700)).toBe(0);
    });
  });

  describe("resolveBaseUnitCost rounding (A-261)", () => {
    it("rounds a per-unit cost that does not divide evenly", () => {
      // A ₦1,000 carton of 3.
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-po-line-item-math-test-ts-L69
      expect(
        getImmediateUnitCost(item({ unit_cost: 1000, units_per_bulk: 3 })),
      ).toBe(333.33);
    });

    it("rounds an override too, since that is also stored", () => {
      expect(
        getImmediateUnitCost(item({ cost_price_override: 12.3456 })),
      ).toBe(12.35);
    });

    it("leaves an evenly dividing cost exact", () => {
      expect(
        getImmediateUnitCost(item({ unit_cost: 1200, units_per_bulk: 60 })),
      ).toBe(20);
    });
  });

  describe("getImmediateUnitCost", () => {
    it("converts the catalog's per-bulk-unit cost down to per-base-unit when no override is set", () => {
      // Regression: the review-price popover previously showed the raw per-carton unit_cost (37,200) as "Cost", right next to a…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-po-line-item-math-test-ts-L93
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
      // Regression: entering a new per-tablet cost (650) previously produced a total of bulk_quantity * 650 = 650, silently drop…
      // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-po-line-item-math-test-ts-L119
      expect(getLineTotal(item({ cost_price_override: 650 }), "immediate")).toBe(39000);
    });

    it("immediate type, with override and multiple cartons", () => {
      expect(
        getLineTotal(item({ bulk_quantity: 3, cost_price_override: 650 }), "immediate"),
      ).toBe(117000);
    });
  });

  // Medium bug fix: `Number(amountPaid) || 0` alone silently recorded ₦0 paid for a blank/non-numeric amount, and accepted a…
  // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-po-line-item-math-test-ts-L132
  describe("getValidatedAmountPaid", () => {
    it("returns the parsed amount when it's a valid, positive number under the total", () => {
      expect(getValidatedAmountPaid("5000", 10000)).toBe(5000);
    });

    it("returns 0 for a blank input, instead of silently recording it as paid in full or zero-with-no-warning", () => {
      expect(getValidatedAmountPaid("", 10000)).toBe(0);
    });

    it("returns 0 for a non-numeric input", () => {
      expect(getValidatedAmountPaid("abc", 10000)).toBe(0);
    });

    it("returns 0 for a negative input", () => {
      expect(getValidatedAmountPaid("-500", 10000)).toBe(0);
    });

    it("caps at the order total instead of accepting an amount above it", () => {
      expect(getValidatedAmountPaid("999999", 10000)).toBe(10000);
    });

    it("accepts an amount exactly equal to the order total", () => {
      expect(getValidatedAmountPaid("10000", 10000)).toBe(10000);
    });
  });

  describe("countSellingPriceOverrides", () => {
    const products = [{ id: "p1", selling_price: 20 }];

    it("counts only lines with a real, non-blank selling_price override that actually differs from the product's current price", () => {
      const items = [
        item({ selling_price: 12.5 }), // differs - counts
        item({ selling_price: "" }), // blank - doesn't count
        item({ selling_price: undefined }), // unset - doesn't count
        item({ selling_price: null as unknown as undefined }), // a PO reloaded from the DB hands back SQL NULL, not undefined
      ];
      expect(countSellingPriceOverrides(items, products)).toBe(1);
    });

    it("returns 0 when no line has an override", () => {
      expect(countSellingPriceOverrides([item(), item()], products)).toBe(0);
    });

    it("does not count a line whose override equals the product's current price (no real change)", () => {
      expect(countSellingPriceOverrides([item({ selling_price: 20 })], products)).toBe(0);
    });

    it("counts a line whose override is a real, explicit zero, different from the current price", () => {
      expect(countSellingPriceOverrides([item({ selling_price: 0 })], products)).toBe(1);
    });
  });
});

// A line is one product, not one unit.
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-po-line-item-math-test-ts-L188
describe("getTotalBaseUnits", () => {
  it("converts every line's bulk quantity into base units", () => {
    expect(
      getTotalBaseUnits([
        item({ bulk_quantity: 2, units_per_bulk: 100 }),
        item({ bulk_quantity: 3, units_per_bulk: 10 }),
      ]),
    ).toBe(230);
  });

  it("treats a missing or zero units_per_bulk as one unit per bulk", () => {
    expect(
      getTotalBaseUnits([item({ bulk_quantity: 2, units_per_bulk: 0 })]),
    ).toBe(2);
  });

  it("is zero for an empty order", () => {
    expect(getTotalBaseUnits([])).toBe(0);
  });
});
