import { describe, it, expect } from "vitest";
import { clearImmediateOnlyFields, costOverriddenLines, markRepricedLines } from "@/components/procurement/po-line-item-math";

const line = (product_id: string, selling_price?: number | string, id?: string) => ({ id, product_id, selling_price });

describe("markRepricedLines", () => {
  it("flags only lines whose price changed from what the form was seeded with, and every newly typed one", () => {
    const seeded = new Map<string, number | string | undefined>([
      ["l1", 10],
      ["l2", undefined],
      ["l3", 30],
    ]);
    const result = markRepricedLines(
      [line("a", 10, "l1"), line("b", undefined, "l2"), line("c", 35, "l3"), line("d", 50), line("e", undefined)],
      seeded,
    );
    expect(result.map((r) => r.reprice)).toEqual([false, false, true, true, false]);
  });

  it("treats a number and its string form as the same price", () => {
    expect(markRepricedLines([line("a", "10", "l1")], new Map([["l1", 10]]))[0].reprice).toBe(false);
  });

  it("judges two lines of the same product separately instead of letting one overwrite the other's seed", () => {
    const seeded = new Map<string, number | string | undefined>([["l1", 500], ["l2", undefined]]);
    const result = markRepricedLines([line("p", 500, "l1"), line("p", undefined, "l2")], seeded);
    expect(result.map((r) => r.reprice)).toEqual([false, false]);
  });
});

describe("costOverriddenLines", () => {
  it("ignores a line received at quantity zero, since no batch is created for it", () => {
    const lines = costOverriddenLines([
      { product_id: "a", cost_price: 5, quantity: 3 },
      { product_id: "b", cost_price: 7, quantity: 0 },
      { product_id: "c", cost_price: 9 },
    ]);
    expect(lines.map((l) => l.productId)).toEqual(["a", "c"]);
  });
});

describe("clearImmediateOnlyFields", () => {
  it("drops the price, cost, lot and expiry a Standard PO has no inputs for, keeping the rest of the line", () => {
    const [cleared] = clearImmediateOnlyFields([
      { product_id: "a", bulk_quantity: 3, selling_price: 9, cost_price_override: 4, lot_number: "L", expiry_date: "2027-01-01" },
    ]);
    expect(cleared).toEqual({ product_id: "a", bulk_quantity: 3 });
  });
});
