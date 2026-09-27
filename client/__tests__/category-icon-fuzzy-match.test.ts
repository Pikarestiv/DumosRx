import { describe, it, expect } from "vitest";
import { Wine, Cookie } from "lucide-react";
import { getCategoryIcon } from "@/lib/constants/category-icons";

/**
 * Regression test for a real bug Cynthia hit: "Site Safety & Accessories",
 * "Sanitary Ware", and "Plumbing & Pipe Fittings" all rendered the Wine
 * icon. fuzzyKeywordMatch()'s threshold (ceil(keyword.length / 3)) was too
 * loose for exactly-4-letter keywords like "wine": a distance of 2 out of 4
 * characters — half the word — was accepted, which is exactly the edit
 * distance between "wine" and each of "site", "ware" (from "sanitary
 * WARE"), and "pipe" (from "PIPE fittings"). Ordinary short English words
 * kept coincidentally landing within 2 edits of a 4-letter keyword.
 */
describe("getCategoryIcon() fuzzy matching", () => {
  it("does not mistake 'site' for the 'wine' keyword", () => {
    expect(getCategoryIcon("Site Safety & Accessories")).not.toBe(Wine);
  });

  it("does not mistake 'ware' (from 'sanitary ware') for the 'wine' keyword", () => {
    expect(getCategoryIcon("Sanitary Ware")).not.toBe(Wine);
  });

  it("does not mistake 'pipe' (from 'pipe fittings') for the 'wine' keyword", () => {
    expect(getCategoryIcon("Plumbing & Pipe Fittings")).not.toBe(Wine);
  });

  it("still matches a genuine misspelling of a longer keyword", () => {
    // The reproduction case the fuzzy matcher was originally built for.
    expect(getCategoryIcon("BUSICUIT")).toBe(Cookie);
  });

  it("still matches an exact keyword via substring", () => {
    expect(getCategoryIcon("Wines & Spirits")).toBe(Wine);
  });
});
