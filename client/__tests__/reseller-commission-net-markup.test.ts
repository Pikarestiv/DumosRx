import { describe, it, expect } from "vitest";
import { computeResellerCommission } from "@/lib/hooks/use-pos-payment-helpers";

const line = (unit_price: number, original_unit_price: number, quantity = 1) =>
  ({ id: "x", unit_price, original_unit_price, quantity }) as never;

const commission = (cart: never[], markupType: "reseller" | "store" = "reseller") =>
  computeResellerCommission({ cart, isResellerSale: true, markupType, resellerCommissionPercentage: 10 });

describe("computeResellerCommission net markup", () => {
  it("lets a cut on one line offset a markup on another", () => {
    expect(commission([line(120, 100), line(85, 100)])).toEqual({ resellerMarkup: 5, resellerCommissionAmount: 0.5 });
  });

  it("floors the sale at zero when cuts exceed markups", () => {
    expect(commission([line(110, 100), line(70, 100)])).toEqual({ resellerMarkup: 0, resellerCommissionAmount: 0 });
  });

  it("scales by quantity and pays nothing on a store markup", () => {
    expect(commission([line(120, 100, 3)])).toEqual({ resellerMarkup: 60, resellerCommissionAmount: 6 });
    expect(commission([line(120, 100, 3)], "store").resellerCommissionAmount).toBe(0);
  });
});
