import { describe, it, expect } from "vitest";
import { getDefaultMinimumSyncIntervalMinutes } from "@/lib/hooks/use-feature-gate";

// Fallback used only when the server's subscription_plans config has no explicit `limits.sync_interval` for a tier — see g…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-use-feature-gate-sync-interval-test-ts-L4
describe("getDefaultMinimumSyncIntervalMinutes", () => {
  it("enterprise defaults to 0 (sync instantly after every change)", () => {
    expect(getDefaultMinimumSyncIntervalMinutes(true, false, false)).toBe(0);
  });

  it("pro defaults to 15 minutes", () => {
    expect(getDefaultMinimumSyncIntervalMinutes(false, true, false)).toBe(15);
  });

  it("starter defaults to 30 minutes", () => {
    expect(getDefaultMinimumSyncIntervalMinutes(false, false, true)).toBe(30);
  });

  it("falls back to 360 minutes when none of the tier flags are set (free)", () => {
    expect(getDefaultMinimumSyncIntervalMinutes(false, false, false)).toBe(360);
  });
});
