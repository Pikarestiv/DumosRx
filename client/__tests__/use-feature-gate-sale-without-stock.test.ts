import { describe, it, expect } from "vitest";
import { isSaleWithoutStockEnabled } from "@/lib/hooks/use-feature-gate";

describe("isSaleWithoutStockEnabled", () => {
  it("is on only when the store toggle is 1, with no plan gating", () => {
    expect(isSaleWithoutStockEnabled(1)).toBe(true);
    expect(isSaleWithoutStockEnabled(0)).toBe(false);
    expect(isSaleWithoutStockEnabled(undefined)).toBe(false);
    expect(isSaleWithoutStockEnabled(null)).toBe(false);
  });
});
