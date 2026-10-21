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
});
