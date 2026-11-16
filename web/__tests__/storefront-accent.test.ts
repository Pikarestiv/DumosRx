import { describe, expect, it } from "vitest";

import { contrastRatio, isHexColour, readableForeground } from "@/lib/storefront-accent";

const INK = "#141412";

describe("storefront accent contrast", () => {
  it("measures black on white at the WCAG maximum", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("puts white text on an accent dark enough to carry it", () => {
    const result = readableForeground("#0F6B58", INK);

    expect(result.foreground).toBe("#ffffff");
    expect(result.readable).toBe(true);
  });

  it("switches to ink text on a light accent such as safety gold", () => {
    const result = readableForeground("#F2B705", INK);

    expect(result.foreground).toBe(INK);
    expect(result.readable).toBe(true);
  });

  it("flags a mid-tone accent that neither white nor ink can carry", () => {
    const result = readableForeground("#7d7d7d", INK);

    expect(result.readable).toBe(false);
    expect(result.contrast).toBeLessThan(4.5);
  });

  it.each(["#F2B705", "#0f6b58", "#000000"])("accepts the six-digit hex %s", (value) => {
    expect(isHexColour(value)).toBe(true);
  });

  it.each([undefined, null, 5, "", "red", "#fff", "F2B705", "#12345g", "#F2B7055"])("rejects %s", (value) => {
    expect(isHexColour(value)).toBe(false);
  });
});
