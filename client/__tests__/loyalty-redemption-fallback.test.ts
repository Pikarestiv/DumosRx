import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Regression coverage for: "Points Redemption Options section is empty
 * until Loyalty Settings is opened once" (docs/features/_findings-log.md).
 *
 * Root cause: ensureLoyaltyDefaultsSeeded() (lib/db/queries/loyalty.ts) only
 * runs as a side effect of the Loyalty Settings dialog's `open` useEffect,
 * so a store that never opened that dialog saw "No redemption options
 * configured yet." on the main Loyalty tab even though tiers never had this
 * problem — use-customer-management.ts's buildFallbackTiers() already
 * covers that gap for tiers. This adds the equivalent
 * buildFallbackRedemptionOptions() and asserts the same real-data-wins
 * precedence rule tiers already follow.
 */
describe("buildFallbackRedemptionOptions", () => {
  it("returns a non-empty preview list mirroring DEFAULT_REDEMPTION_OPTIONS content", async () => {
    const { buildFallbackRedemptionOptions } = await import(
      "@/lib/hooks/use-customer-management"
    );
    const { DEFAULT_REDEMPTION_OPTIONS } = await import(
      "@/lib/db/queries/loyalty"
    );

    const fallback = buildFallbackRedemptionOptions();
    expect(fallback.length).toBe(DEFAULT_REDEMPTION_OPTIONS.length);

    // Same content a user would see once ensureLoyaltyDefaultsSeeded()
    // actually seeds the DB — not invented placeholder content.
    fallback.forEach((option, i) => {
      const seedEquivalent = DEFAULT_REDEMPTION_OPTIONS[i];
      expect(option.label).toBe(seedEquivalent.label);
      expect(option.points_cost).toBe(seedEquivalent.points_cost);
      expect(option.discount_value).toBe(seedEquivalent.discount_value);
      expect(option.description).toBe(seedEquivalent.description);
      expect(option.icon_key).toBe(seedEquivalent.icon_key);
      expect(option.is_active).toBe(1);
      // Each fallback row needs a stable id: loyalty-tab.tsx uses it as a
      // React list key, same as real DB rows' `id`.
      expect(typeof option.id).toBe("string");
      expect(option.id.length).toBeGreaterThan(0);
    });
  });

  it("every fallback option has a unique id", async () => {
    const { buildFallbackRedemptionOptions } = await import(
      "@/lib/hooks/use-customer-management"
    );
    const ids = buildFallbackRedemptionOptions().map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("LoyaltyTab redemption options precedence", () => {
  it("falls back to buildFallbackRedemptionOptions() only when the real (active) list is empty, matching buildFallbackTiers()'s precedence rule for tiers", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../components/customers/loyalty-tab.tsx"),
      "utf-8",
    );

    expect(source).toContain("buildFallbackRedemptionOptions");

    // The precedence expression must gate on the *real* data's length, not
    // unconditionally prefer the fallback or drop the real data.
    const precedenceMatch = source.match(
      /const redemptionOptions =\s*\n?\s*([\s\S]{0,160}?);/,
    );
    expect(precedenceMatch).not.toBeNull();
    const expr = precedenceMatch![1];
    expect(expr).toContain(".length > 0");
    expect(expr).toContain("buildFallbackRedemptionOptions()");
  });

  it("use-customer-management.ts's buildFallbackRedemptionOptions is exported (consumable from loyalty-tab.tsx, mirroring how buildFallbackTiers backs the tiers prop)", async () => {
    const hookSource = fs.readFileSync(
      path.join(__dirname, "../lib/hooks/use-customer-management.ts"),
      "utf-8",
    );
    expect(hookSource).toMatch(/export function buildFallbackRedemptionOptions/);
    expect(hookSource).toMatch(/function buildFallbackTiers/);
  });
});
