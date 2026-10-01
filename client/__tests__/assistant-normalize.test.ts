import { describe, it, expect } from "vitest";
import { normalizeUtterance } from "@/lib/assistant/normalize";

describe("normalizeUtterance", () => {
  it("lowercases and collapses whitespace", () => {
    const result = normalizeUtterance("  How much GROSS profit   did we make?  ");
    expect(result.normalized).toBe("how much gross profit did we make");
    expect(result.tokens).toEqual(["how", "much", "gross", "profit", "did", "we", "make"]);
  });

  it("keeps ISO dates and DD/MM/YYYY dates intact", () => {
    const result = normalizeUtterance("profit on 2026-09-01 and stock on 15/09/2026?");
    expect(result.normalized).toContain("2026-09-01");
    expect(result.normalized).toContain("15/09/2026");
  });

  it("strips punctuation that is not part of a date", () => {
    const result = normalizeUtterance("What's low on stock, exactly!!");
    expect(result.normalized).toBe("whats low on stock exactly");
  });

  it("preserves the raw input untouched", () => {
    const result = normalizeUtterance("  Hello World  ");
    expect(result.raw).toBe("  Hello World  ");
  });
});
