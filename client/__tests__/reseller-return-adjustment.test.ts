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

  it("records the refundable part of an already-paid commission as owed back and keeps the paid figures", () => {
    const paid = { ...(pending as object), reseller_commission_redeemed: 1, reseller_commission_claim_type: "commission", reseller_commission_redeemed_amount: 20 } as never;
    expect(resellerPatchAfterReturn(paid, [line("a", 150, 100, 4)], [{ id: "a", returnQuantity: 1 }])).toEqual({
      reseller_markup_amount: 150,
      reseller_commission_owed_back: 5,
    });
    expect(resellerPatchAfterReturn(paid, [line("a", 150, 100, 4)], [{ id: "a", returnQuantity: 4 }])).toEqual({
      reseller_markup_amount: 0,
      reseller_commission_owed_back: 20,
    });
  });

  it("owes nothing back when the surviving lines still earn what was paid", () => {
    const paid = { ...(pending as object), reseller_commission_redeemed: 1, reseller_commission_claim_type: "commission", reseller_commission_redeemed_amount: 5 } as never;
    expect(resellerPatchAfterReturn(paid, [line("a", 150, 100, 1), line("b", 20, 20, 1)], [{ id: "b", returnQuantity: 1 }])).toEqual({
      reseller_markup_amount: 50,
      reseller_commission_owed_back: 0,
    });
  });

  it("leaves a sale alone when a line has no list price", () => {
    expect(resellerPatchAfterReturn(pending, [line("a", 150, null)], [{ id: "a", returnQuantity: 1 }])).toBeNull();
  });

  it("adjusts only the markup when the store kept it", () => {
    const kept = { ...(pending as object), reseller_commission_redeemed: 1, reseller_commission_claim_type: "store_claim" } as never;
    expect(resellerPatchAfterReturn(kept, [line("a", 150, 100, 2)], [{ id: "a", returnQuantity: 1 }])).toEqual({
      reseller_markup_amount: 50,
    });
  });
});
