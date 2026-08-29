import { describe, it, expect } from "vitest";
import { getMaxReturnable, isFullyReturned } from "@/lib/utils/returns-calculations";

describe("getMaxReturnable", () => {
  it("returns the full quantity when nothing has been returned yet", () => {
    expect(getMaxReturnable({ id: "i1", quantity: 5 })).toBe(5);
  });

  it("subtracts what's already been returned", () => {
    expect(getMaxReturnable({ id: "i1", quantity: 5, returned_quantity: 3 })).toBe(2);
  });

  it("floors at 0 instead of going negative if returned_quantity somehow exceeds quantity", () => {
    expect(getMaxReturnable({ id: "i1", quantity: 5, returned_quantity: 5 })).toBe(0);
    expect(getMaxReturnable({ id: "i1", quantity: 5, returned_quantity: 8 })).toBe(0);
  });
});

describe("isFullyReturned", () => {
  it("is false when a return only partially covers a line item", () => {
    // Regression: sale of 5 units, this is the first return of 3 — the sale
    // isn't fully returned yet, and the remaining 2 must still be returnable
    // later (not double-returnable up to the original 5 again).
    const items = [{ id: "i1", quantity: 5 }];
    expect(isFullyReturned(items, [{ id: "i1", returnQuantity: 3 }])).toBe(false);
  });

  it("is true once a return exactly covers what's left, even across multiple partial returns", () => {
    // Regression: 5 sold, 3 already returned in a prior return, this return
    // covers the remaining 2 — should now count as fully returned, unlike
    // the old buggy check which compared against the original quantity (5)
    // and would never flip to true across split returns.
    const items = [{ id: "i1", quantity: 5, returned_quantity: 3 }];
    expect(isFullyReturned(items, [{ id: "i1", returnQuantity: 2 }])).toBe(true);
  });

  it("treats an item with nothing left to return as already done without needing to be selected", () => {
    const items = [
      { id: "i1", quantity: 5, returned_quantity: 5 },
      { id: "i2", quantity: 2 },
    ];
    expect(isFullyReturned(items, [{ id: "i2", returnQuantity: 2 }])).toBe(true);
  });

  it("is false if any line item with remaining balance is left unselected", () => {
    const items = [
      { id: "i1", quantity: 5 },
      { id: "i2", quantity: 2 },
    ];
    expect(isFullyReturned(items, [{ id: "i1", returnQuantity: 5 }])).toBe(false);
  });
});
