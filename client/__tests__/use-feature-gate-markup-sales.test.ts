import { describe, it, expect } from "vitest";
import { isMarkupSalesEnabled } from "@/lib/hooks/use-feature-gate";

/**
 * canUseMarkupSales must require BOTH the plan-tier entitlement (Pro/
 * Enterprise, expressed as `tierAllows`) AND the store's own on/off toggle
 * (`stores.markup_sales_enabled`, DEFAULT 0). Unlike isLoyaltyProgramEnabled,
 * this defaults OFF - an owner has to explicitly opt in before any staff
 * can mark up a sale at all.
 */
describe("isMarkupSalesEnabled", () => {
  it("is false when the plan tier doesn't include reseller_commission, even with the toggle on", () => {
    expect(isMarkupSalesEnabled(false, 1)).toBe(false);
  });

  it("is true when the plan tier allows it and the toggle is explicitly on (1)", () => {
    expect(isMarkupSalesEnabled(true, 1)).toBe(true);
  });

  it("is false when the plan tier allows it but the toggle is off (0)", () => {
    expect(isMarkupSalesEnabled(true, 0)).toBe(false);
  });

  it("treats an undefined toggle (pre-migration rows) as off, matching DEFAULT 0", () => {
    expect(isMarkupSalesEnabled(true, undefined)).toBe(false);
  });

  it("treats a null toggle as off, matching DEFAULT 0", () => {
    expect(isMarkupSalesEnabled(true, null)).toBe(false);
  });
});
