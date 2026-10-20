import { describe, it, expect } from "vitest";
import {
  Wine,
  Cookie,
  Smartphone,
  Zap,
  Lightbulb,
  PaintBucket,
  Droplet,
  Bath,
  HardHat,
  Wrench,
} from "lucide-react";
import { getCategoryIcon } from "@/lib/constants/category-icons";

// Regression test for a real bug Cynthia hit:
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-category-icon-fuzzy-match-test-ts-L16
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

  it("still matches a real 'electronics' category", () => {
    expect(getCategoryIcon("Electronics")).toBe(Smartphone);
  });
});

// Cynthia's own construction-materials store categories, previously uncovered by the pharmacy/grocery keyword sets and lan…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-category-icon-fuzzy-match-test-ts-L53
describe("getCategoryIcon() construction/hardware coverage", () => {
  it.each([
    // "electrical" wins over "lighting" as the earlier KEYWORD_ICONS entry when a name contains both - still a purpose-built i…
    // Rationale: docs/CLIENT_COMMENTS.md#line-__tests__-category-icon-fuzzy-match-test-ts-L60
    ["Electrical - Lighting", Zap],
    ["Lighting & Bulbs", Lightbulb],
    ["Electrical - Wiring & Sockets", Zap],
    ["Plumbing & Pipe Fittings", Droplet],
    ["Paints & Coatings", PaintBucket],
    ["Sanitary Ware", Bath],
    ["Site Safety & Accessories", HardHat],
    ["Tools & Hardware", Wrench],
  ])("%s gets a purpose-built icon", (name, expectedIcon) => {
    expect(getCategoryIcon(name)).toBe(expectedIcon);
  });
});
