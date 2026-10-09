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

  it("ranks the product that really contains the term above one that only straddles a word boundary", () => {
    const catalogue = [
      { id: "1", name: "paracetamol tab 12s" },
      { id: "2", name: "vitamin b-12 injection" },
    ];

    // "paracetamol ta|b 12|s" squashes to a string containing "b12". A flat
    // score once put it first, so a cashier typing b12 at speed rang up
    // paracetamol.
    const results = searchProducts("b12", catalogue).results.map((p) => p.name);

    expect(results[0]).toBe("vitamin b-12 injection");
  });

  it("does not let a short term match across a squashed word boundary", () => {
    const catalogue = [
      { id: "1", name: "zinc tablet" },
      { id: "2", name: "vitamin c" },
    ];

    // "vitamin c" only contains "nc" once the space is squashed away, so the
    // punctuation tier must not surface it. "zinc tablet" still matches, but
    // through the pre-existing token substring tier, not this one.
    const names = searchProducts("nc", catalogue).results.map((p) => p.name);

    expect(names).not.toContain("vitamin c");
  });

  it("still finds a product whose name starts with the squashed term", () => {
    const catalogue = [{ id: "1", name: "vitamin b-12 injection" }];

    expect(searchProducts("vitaminb", catalogue).results).toHaveLength(1);
  });

  it("prefers a word-start match over one that straddles a squashed boundary, at any length", () => {
    // The b12 case above is also saved by the minimum-length gate, so it
    // cannot prove the grading. This term is long enough to clear that gate,
    // leaving only the 18/14/12/6 bands to decide the order.
    const catalogue = [
      { id: "1", name: "paracetamol tab 120s" },
      { id: "2", name: "vitamin b-120 syrup" },
    ];

    const results = searchProducts("b120", catalogue).results.map((p) => p.name);

    expect(results[0]).toBe("vitamin b-120 syrup");
  });
});
