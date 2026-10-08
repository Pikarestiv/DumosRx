import { describe, it, expect } from "vitest";
import { searchProducts } from "@/lib/utils/search";

/**
 * Reported by staff at the till: "M&B and M B may not really match M & B".
 * Confirmed — before this fix, searching "M&B" or "MB" found only the exact
 * spelling, so a product stored as "m & b" was invisible to the spellings a
 * cashier actually types at speed.
 */
const products = [
  { id: "1", name: "m&b" },
  { id: "2", name: "m & b" },
  { id: "3", name: "m b" },
  { id: "4", name: "mb" },
];

const found = (q: string) =>
  searchProducts(q, products)
    .results.map((p) => p.name)
    .sort();

const ALL = ["m & b", "m b", "m&b", "mb"];

describe("search tolerates punctuation and spacing variants", () => {
  it.each(["M&B", "M B", "M & B", "MB", "m&b", "m b"])(
    "query %s finds every spelling",
    (query) => {
      expect(found(query)).toEqual(ALL);
    },
  );

  it("handles the hyphen case the same way", () => {
    const vitamins = [
      { id: "1", name: "vitamin b-12" },
      { id: "2", name: "vitamin b12" },
    ];
    expect(searchProducts("vitamin b12", vitamins).results).toHaveLength(2);
    expect(searchProducts("B-12", vitamins).results).toHaveLength(2);
  });

  it("still ranks an exact match first", () => {
    expect(searchProducts("mb", products).results[0].name).toBe("mb");
    expect(searchProducts("m&b", products).results[0].name).toBe("m&b");
  });

  it("does not match an unrelated product", () => {
    const mixed = [{ id: "1", name: "m&b" }, { id: "2", name: "panadol" }];
    expect(searchProducts("m&b", mixed).results.map((p) => p.name)).toEqual(["m&b"]);
  });
});
