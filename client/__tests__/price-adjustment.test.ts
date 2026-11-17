import { describe, it, expect } from "vitest";
import { sumPriceAdjustments } from "@/lib/utils/price-adjustment";

describe("sumPriceAdjustments", () => {
  it("sums markups and cuts separately across lines, per unit times quantity", () => {
    const result = sumPriceAdjustments([
      { quantity: 2, unit_price: 120, list_price: 100 },
      { quantity: 3, unit_price: 85, list_price: 100 },
      { quantity: 1, unit_price: 50, list_price: 50 },
    ]);
    expect(result).toEqual({ markup: 40, cut: 45 });
  });

  it("ignores lines recorded before list_price existed", () => {
    expect(sumPriceAdjustments([{ quantity: 1, unit_price: 10, list_price: null }, { quantity: 1, unit_price: 10 }])).toEqual({ markup: 0, cut: 0 });
  });

  it("reduces adjustment totals proportionally when lines have returned quantities", () => {
    const result = sumPriceAdjustments([
      { quantity: 4, returned_quantity: 1, unit_price: 150, list_price: 100 },
      { quantity: 3, returned_quantity: 1, unit_price: 80, list_price: 100 },
    ]);
    expect(result).toEqual({ markup: 150, cut: 40 });
  });

  it("excludes fully returned lines from markup and cut calculations", () => {
    const result = sumPriceAdjustments([
      { quantity: 2, returned_quantity: 2, unit_price: 200, list_price: 100 },
      { quantity: 1, returned_quantity: 0, unit_price: 60, list_price: 80 },
    ]);
    expect(result).toEqual({ markup: 0, cut: 20 });
  });
});
