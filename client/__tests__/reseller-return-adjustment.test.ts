import { describe, it, expect } from "vitest";
import { resellerPatchAfterReturn } from "@/lib/utils/reseller-return-adjustment";

const line = (id: string, unit_price: number, list_price: number | null, quantity = 1, returned_quantity = 0) =>
  ({ id, unit_price, list_price, quantity, returned_quantity }) as never;

const pending = { is_reseller_sale: 1, markup_type: "reseller", reseller_commission_percentage: 10, reseller_commission_redeemed: 0 } as never;

describe("resellerPatchAfterReturn", () => {
  it("drops the markup and commission of a returned marked-up line", () => {
    const items = [line("a", 150, 100), line("b", 20, 20)];
    expect(resellerPatchAfterReturn(pending, items, [{ id: "a", returnQuantity: 1 }])).toEqual({
      reseller_markup_amount: 0,
      reseller_commission_amount: 0,
    });
  });

  it("recomputes the net across surviving lines: return the markup line, keep the cut line", () => {
    const items = [line("a", 150, 100), line("b", 70, 100)];
    expect(resellerPatchAfterReturn(pending, items, [{ id: "a", returnQuantity: 1 }])).toEqual({
      reseller_markup_amount: 0,
      reseller_commission_amount: 0,
    });
  });

  it("accounts for earlier returns and partial quantities", () => {
    const items = [line("a", 150, 100, 4, 1)];
    expect(resellerPatchAfterReturn(pending, items, [{ id: "a", returnQuantity: 1 }])).toEqual({
      reseller_markup_amount: 100,
      reseller_commission_amount: 10,
    });
  });

  it("leaves a sale alone when commission was already paid out or a line has no list price", () => {
    const items = [line("a", 150, 100)];
    const paid = { ...(pending as object), reseller_commission_redeemed: 1, reseller_commission_claim_type: "commission" } as never;
    expect(resellerPatchAfterReturn(paid, items, [{ id: "a", returnQuantity: 1 }])).toBeNull();
    expect(resellerPatchAfterReturn(pending, [line("a", 150, null)], [{ id: "a", returnQuantity: 1 }])).toBeNull();
  });

  it("adjusts only the markup when the store kept it", () => {
    const kept = { ...(pending as object), reseller_commission_redeemed: 1, reseller_commission_claim_type: "store_claim" } as never;
    expect(resellerPatchAfterReturn(kept, [line("a", 150, 100, 2)], [{ id: "a", returnQuantity: 1 }])).toEqual({
      reseller_markup_amount: 50,
    });
  });
});
