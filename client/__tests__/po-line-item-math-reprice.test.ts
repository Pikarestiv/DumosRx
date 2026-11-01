import { describe, it, expect } from "vitest";
import { markRepricedLines } from "@/components/procurement/po-line-item-math";

const line = (product_id: string, selling_price?: number | string) => ({ product_id, selling_price });

describe("markRepricedLines", () => {
  it("flags only lines whose price changed from what the form was seeded with, and every newly typed one", () => {
    const seeded = new Map<string, number | string | undefined>([
      ["a", 10],
      ["b", undefined],
      ["c", 30],
    ]);
    const result = markRepricedLines(
      [line("a", 10), line("b", undefined), line("c", 35), line("d", 50), line("e", undefined)],
      seeded,
    );
    expect(result.map((r) => r.reprice)).toEqual([false, false, true, true, false]);
  });

  it("treats a number and its string form as the same price", () => {
    expect(markRepricedLines([line("a", "10")], new Map([["a", 10]]))[0].reprice).toBe(false);
  });
});
