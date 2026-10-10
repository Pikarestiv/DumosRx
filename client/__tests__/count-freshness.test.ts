import { describe, it, expect } from "vitest";
import {
  COUNT_STALE_AFTER_MINUTES,
  isCountBaselineStale,
  minutesSince,
} from "@/lib/utils/count-freshness";

/**
 * A-211: a stock count is stored as a delta against this device's own
 * figure, so the warning depends on knowing how stale that figure is.
 */
describe("count freshness", () => {
  const now = Date.parse("2026-10-10T12:00:00.000Z");

  it("treats a device that has never synced as stale", () => {
    expect(isCountBaselineStale(null, now)).toBe(true);
    expect(minutesSince(null, now)).toBeNull();
  });

  it("treats an unparseable timestamp as stale rather than fresh", () => {
    expect(isCountBaselineStale("not-a-date", now)).toBe(true);
  });

  it("is fresh just inside the threshold and stale on it", () => {
    const minuteMs = 60_000;
    const inside = new Date(
      now - (COUNT_STALE_AFTER_MINUTES - 1) * minuteMs,
    ).toISOString();
    const on = new Date(now - COUNT_STALE_AFTER_MINUTES * minuteMs).toISOString();

    expect(isCountBaselineStale(inside, now)).toBe(false);
    expect(isCountBaselineStale(on, now)).toBe(true);
    expect(minutesSince(on, now)).toBe(COUNT_STALE_AFTER_MINUTES);
  });

  it("never reports a negative age for a clock that is ahead", () => {
    expect(minutesSince(new Date(now + 600_000).toISOString(), now)).toBe(0);
  });
});
