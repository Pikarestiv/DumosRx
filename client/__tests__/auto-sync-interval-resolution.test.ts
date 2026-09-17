import { describe, it, expect } from "vitest";
import { resolveAutoSyncInterval } from "@/hooks/use-settings";

describe("resolveAutoSyncInterval", () => {
  it("passes through 0 (instant sync) unmolested when the plan allows it", () => {
    expect(resolveAutoSyncInterval("0", true, 0)).toBe(0);
  });

  it("clamps 0 up to the plan minimum when the plan doesn't allow instant sync", () => {
    expect(resolveAutoSyncInterval("0", true, 30)).toBe(30);
  });

  it("clamps a below-minimum positive value up to the plan minimum", () => {
    expect(resolveAutoSyncInterval("5", true, 15)).toBe(15);
  });

  it("leaves a value at or above the minimum unchanged", () => {
    expect(resolveAutoSyncInterval("60", true, 15)).toBe(60);
  });

  it("does not clamp when auto-sync is disabled", () => {
    expect(resolveAutoSyncInterval("0", false, 360)).toBe(0);
  });

  it("falls back to 15 for unparseable input", () => {
    expect(resolveAutoSyncInterval("", true, 0)).toBe(15);
    expect(resolveAutoSyncInterval("abc", true, 0)).toBe(15);
  });
});
