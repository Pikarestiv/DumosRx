import { describe, expect, it } from "vitest";

import { contrastRatio, isHexColour, readableTextOn } from "@/lib/utils/storefront-accent";

describe("till storefront accent contrast (mirrors web/lib/storefront-accent.ts)", () => {
  it("measures black on white at the WCAG maximum", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("finds white text readable on a deep green and dark text readable on gold", () => {
    expect(readableTextOn("#0F6B58", "#141412").readable).toBe(true);
    expect(readableTextOn("#F2B705", "#141412").readable).toBe(true);
  });

  it("flags a mid-tone that neither white nor dark text can carry", () => {
    const result = readableTextOn("#7d7d7d", "#141412");

    expect(result.readable).toBe(false);
    expect(result.contrast).toBeLessThan(4.5);
  });

  it.each(["red", "#fff", "F2B705", "#12345g", ""])("rejects %s as a hex colour", (value) => {
    expect(isHexColour(value)).toBe(false);
  });
});
