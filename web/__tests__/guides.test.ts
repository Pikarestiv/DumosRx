import { describe, expect, it } from "vitest";
import { GUIDES, GUIDE_CATEGORIES, getGuideBySlug } from "../lib/guides-data";

describe("Guides & Video Tutorials Hub", () => {
  it("contains all core feature guides", () => {
    expect(GUIDES.length).toBe(23);
  });

  it("has valid categories for all guides", () => {
    const validCategorySet = new Set(GUIDE_CATEGORIES);
    for (const guide of GUIDES) {
      expect(validCategorySet.has(guide.category)).toBe(true);
    }
  });

  it("enforces unique and kebab-cased slugs (id)", () => {
    const seenSlugs = new Set<string>();
    const slugRegex = /^[a-z0-9-]+$/;

    for (const guide of GUIDES) {
      expect(guide.id).toMatch(slugRegex);
      expect(seenSlugs.has(guide.id)).toBe(false);
      seenSlugs.add(guide.id);
    }
  });

  it("requires essential content and steps on every guide", () => {
    for (const guide of GUIDES) {
      expect(guide.title.trim().length).toBeGreaterThan(0);
      expect(guide.summary.trim().length).toBeGreaterThan(0);
      expect(guide.videoDuration).toMatch(/^\d+:\d{2}$/);
      expect(guide.steps.length).toBeGreaterThanOrEqual(2);

      for (const step of guide.steps) {
        expect(step.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("retrieves guides by slug via getGuideBySlug", () => {
    const spotSourcing = getGuideBySlug("spot-sourcing");
    expect(spotSourcing).toBeDefined();
    expect(spotSourcing?.title).toContain("Spot Sourcing");

    const relink = getGuideBySlug("till-relink");
    expect(relink).toBeDefined();
    expect(relink?.title.toLowerCase()).toContain("re-link");

    const returnsGuide = getGuideBySlug("customer-returns-disposition");
    expect(returnsGuide).toBeDefined();
    expect(returnsGuide?.title).toContain("Customer Returns");

    const serviceSalesGuide = getGuideBySlug("service-sales");
    expect(serviceSalesGuide).toBeDefined();
    expect(serviceSalesGuide?.title).toContain("Service POS");

    const nonExistent = getGuideBySlug("non-existent-feature-xyz");
    expect(nonExistent).toBeUndefined();
  });
});
