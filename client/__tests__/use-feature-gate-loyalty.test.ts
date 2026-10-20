import { describe, it, expect } from "vitest";
import { isLoyaltyProgramEnabled } from "@/lib/hooks/use-feature-gate";

// canUseLoyaltyProgram must require BOTH the plan-tier entitlement (Pro/ Enterprise, expressed as `tierAllows`) AND the st…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-use-feature-gate-loyalty-test-ts-L4
describe("isLoyaltyProgramEnabled", () => {
  it("is false when the plan tier doesn't include loyalty_program, even with the toggle on", () => {
    expect(isLoyaltyProgramEnabled(false, 1)).toBe(false);
  });

  it("is true when the plan tier allows it and the toggle is on (1)", () => {
    expect(isLoyaltyProgramEnabled(true, 1)).toBe(true);
  });

  it("is false when the plan tier allows it but the store toggled it off (0)", () => {
    expect(isLoyaltyProgramEnabled(true, 0)).toBe(false);
  });

  it("treats an undefined toggle (pre-migration rows) as on, matching DEFAULT 1", () => {
    expect(isLoyaltyProgramEnabled(true, undefined)).toBe(true);
  });

  it("treats a null toggle as on, matching DEFAULT 1", () => {
    expect(isLoyaltyProgramEnabled(true, null)).toBe(true);
  });
});
