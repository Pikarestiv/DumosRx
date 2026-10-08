import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  anchorClock,
  boundedWallClock,
  resetClockAnchor,
  MAX_FORWARD_DRIFT_MS,
} from "@/lib/licensing/monotonic-clock";

/**
 * §2 of docs/superpowers/specs/2026-10-08-license-clock-recovery-design.md.
 *
 * A-191: a laptop's wall clock ran ~12 hours fast, every checkLicenseStatus()
 * wrote that future time into stores.last_monotonic_time, and correcting the
 * clock then locked the till out permanently. Bounding the write against a
 * monotonic reference stops the watermark being poisoned in the first place.
 */
const BASE = Date.UTC(2026, 9, 8, 11, 0, 0);

let perf = 0;

beforeEach(() => {
  perf = 0;
  vi.spyOn(performance, "now").mockImplementation(() => perf);
  resetClockAnchor();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetClockAnchor();
});

describe("boundedWallClock", () => {
  it("passes an ordinary tick straight through", () => {
    anchorClock(BASE);

    perf = 30_000;
    expect(boundedWallClock(BASE + 30_000)).toBe(BASE + 30_000);
  });

  it("clamps a 12-hour forward jump to what the monotonic clock can justify", () => {
    anchorClock(BASE);

    perf = 60_000;
    const jumped = BASE + 12 * 60 * 60 * 1000;
    const result = boundedWallClock(jumped);

    expect(result).toBeLessThan(jumped);
    expect(result).toBe(BASE + 60_000);
    expect(result).toBeLessThan(BASE + MAX_FORWARD_DRIFT_MS + 60_000);
  });

  it("stays clamped across repeated writes while the clock remains fast", () => {
    anchorClock(BASE);
    const jumped = BASE + 12 * 60 * 60 * 1000;

    perf = 60_000;
    const first = boundedWallClock(jumped);
    perf = 120_000;
    const second = boundedWallClock(jumped + 60_000);

    expect(second).toBeLessThan(jumped);
    expect(second - first).toBeLessThanOrEqual(60_000 + 1);
  });

  it("never raises a value, only lowers it", () => {
    anchorClock(BASE);

    perf = 10 * 60 * 1000;
    const behind = BASE + 1000;

    expect(boundedWallClock(behind)).toBe(behind);
  });

  it("allows a long legitimate gap when the monotonic clock advanced with it", () => {
    anchorClock(BASE);

    const eightHours = 8 * 60 * 60 * 1000;
    perf = eightHours;

    expect(boundedWallClock(BASE + eightHours)).toBe(BASE + eightHours);
  });

  it("re-anchoring to server time re-bases the ceiling", () => {
    anchorClock(BASE);
    perf = 1000;
    boundedWallClock(BASE + 12 * 60 * 60 * 1000);

    const trueServerNow = BASE + 2 * 60 * 60 * 1000;
    anchorClock(trueServerNow);
    perf = 2000;

    expect(boundedWallClock(trueServerNow + 1000)).toBe(trueServerNow + 1000);
  });

  it("adopts the first value when there is no anchor yet", () => {
    const result = boundedWallClock(BASE);
    expect(result).toBe(BASE);
  });
});
