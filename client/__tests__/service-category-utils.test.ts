import { describe, it, expect } from "vitest";
import { groupServiceCategories, resolveServiceCategory } from "@/lib/utils/service-category";

describe("groupServiceCategories", () => {
  it("merges case and spacing variants under the most used spelling and counts them", () => {
    const groups = groupServiceCategories([
      { category: "Consultation" },
      { category: "consultation " },
      { category: "Consultation" },
      { category: "Lab  Test" },
      { category: "" },
      { category: null },
    ]);
    expect(groups).toEqual([
      { name: "Consultation", count: 3 },
      { name: "Lab Test", count: 1 },
    ]);
  });
});

describe("resolveServiceCategory", () => {
  it("reuses the existing spelling when only the case differs", () => {
    expect(resolveServiceCategory("consultation", ["Consultation"])).toBe("Consultation");
  });

  it("keeps a genuinely new category as typed, tidied", () => {
    expect(resolveServiceCategory("  Dental   Care ", ["Consultation"])).toBe("Dental Care");
  });

  it("returns null for a blank category", () => {
    expect(resolveServiceCategory("   ", ["Consultation"])).toBeNull();
  });
});
