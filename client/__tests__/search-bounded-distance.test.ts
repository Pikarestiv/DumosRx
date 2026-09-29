import { describe, it, expect } from "vitest";
import {
  boundedLevenshteinDistance,
  calculateLevenshteinDistance,
  genericFuzzySearch,
  searchProducts,
} from "@/lib/utils/search";

/**
 * The fuzzy fallback ran a full Levenshtein matrix against every catalog
 * entry for every search key - which is exactly the state while someone is
 * mid-word typing a product name. Levenshtein distance can never be smaller
 * than the difference in the two lengths, so any candidate whose length is
 * further from the term than the allowed distance can be rejected before the
 * matrix is built, without changing a single result.
 */
describe("boundedLevenshteinDistance", () => {
  it("agrees with the full distance whenever the candidate is within the bound", () => {
    expect(boundedLevenshteinDistance("panadol", "panadl", 2)).toBe(
      calculateLevenshteinDistance("panadol", "panadl"),
    );
    expect(boundedLevenshteinDistance("panadol", "panadol", 1)).toBe(0);
  });

  it("returns Infinity for a candidate the length difference already rules out", () => {
    expect(boundedLevenshteinDistance("pan", "paracetamol syrup", 1)).toBe(
      Infinity,
    );
  });

  it("never rejects a candidate whose real distance is within the bound", () => {
    const term = "amoxil";
    const candidates = ["amoxil", "amoxi", "amoxill", "amoxyl", "zyrtec"];
    for (const candidate of candidates) {
      const real = calculateLevenshteinDistance(term, candidate);
      const bounded = boundedLevenshteinDistance(term, candidate, 2);
      if (real <= 2) expect(bounded).toBe(real);
      else expect(bounded).toBeGreaterThan(2);
    }
  });
});

describe("fuzzy fallback results are unchanged by the length prefilter", () => {
  const products = [
    { name: "Panadol Extra", generic_name: "Paracetamol", barcode: "111" },
    { name: "Zyrtec", generic_name: "Cetirizine", barcode: "222" },
    { name: "Amoxil", generic_name: "Amoxicillin", barcode: "333" },
  ];

  it("still surfaces a one-character typo", () => {
    const { results, isFuzzyFallback } = searchProducts("panadl", products);
    expect(isFuzzyFallback).toBe(true);
    expect(results.map((r) => r.name)).toContain("Panadol Extra");
  });

  it("still returns nothing for a term nothing is close to", () => {
    const { results } = searchProducts("qqqqqqqqqq", products);
    expect(results).toEqual([]);
  });

  it("keeps genericFuzzySearch's typo tolerance", () => {
    const rows = [{ vendor_name: "Acme Distributors" }, { vendor_name: "Zed" }];
    const { results, isFuzzyFallback } = genericFuzzySearch("distribtors", rows, [
      "vendor_name",
    ]);
    expect(isFuzzyFallback).toBe(true);
    expect(results.map((r) => r.vendor_name)).toEqual(["Acme Distributors"]);
  });
});
