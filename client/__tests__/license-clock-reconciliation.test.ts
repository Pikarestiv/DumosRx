import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CLOCK_AGREEMENT_TOLERANCE_MS } from "@/lib/licensing/server-clock";

// Covers the only route out of a clock-discrepancy lock (docs/KNOWN_BUGS.md A-191).
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-license-clock-reconciliation-test-ts-L3
const WATERMARK = "2026-10-08T22:56:40.000Z";

const profile = { current: { id: "store-1", last_monotonic_time: WATERMARK } as Record<string, unknown> | null };
const updateMonotonic = vi.fn((_id: string, _timeIso: string) => Promise.resolve(undefined));
const serverClock = { reading: null as unknown };

vi.mock("@/lib/db/queries/setup", () => ({
  getStoreProfile: vi.fn(() => Promise.resolve(profile.current)),
  updateStoreMonotonicTime: (id: string, t: string) => updateMonotonic(id, t),
}));

vi.mock("@/lib/licensing/server-clock", async () => {
  const actual = await vi.importActual<typeof import("@/lib/licensing/server-clock")>(
    "@/lib/licensing/server-clock",
  );
  return {
    ...actual,
    readServerClock: vi.fn(() => Promise.resolve(serverClock.reading)),
  };
});

function reading(serverIso: string, localIso: string) {
  const serverNow = new Date(serverIso);
  const localNow = new Date(localIso);
  const driftMs = localNow.getTime() - serverNow.getTime();
  return { serverNow, localNow, driftMs, agrees: Math.abs(driftMs) <= CLOCK_AGREEMENT_TOLERANCE_MS };
}

beforeEach(() => {
  profile.current = { id: "store-1", last_monotonic_time: WATERMARK };
  serverClock.reading = null;
  updateMonotonic.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("reconcileClockWithServer", () => {
  it("resets a poisoned watermark when the local clock agrees with the server (even with a 2-hour offset)", async () => {
    serverClock.reading = reading("2026-10-08T11:00:00.000Z", "2026-10-08T13:00:00.000Z");

    const { reconcileClockWithServer } = await import("@/lib/licensing/licensing-manager");
    const result = await reconcileClockWithServer();

    expect(result.reconciled).toBe(true);
    expect(updateMonotonic).toHaveBeenCalledWith("store-1", "2026-10-08T11:00:00.000Z");
  });

  it("refuses when the device clock disagrees with the server by more than 24h", async () => {
    serverClock.reading = reading("2026-10-08T11:00:00.000Z", "2026-10-10T11:00:00.000Z");

    const { reconcileClockWithServer } = await import("@/lib/licensing/licensing-manager");
    const result = await reconcileClockWithServer();

    expect(result.reconciled).toBe(false);
    expect(result.reason).toContain("ahead of our servers");
    expect(updateMonotonic).not.toHaveBeenCalled();
  });

  it("refuses offline, leaving the lock in place", async () => {
    serverClock.reading = null;

    const { reconcileClockWithServer } = await import("@/lib/licensing/licensing-manager");
    const result = await reconcileClockWithServer();

    expect(result.reconciled).toBe(false);
    expect(result.reason).toContain("Connect to the internet");
    expect(updateMonotonic).not.toHaveBeenCalled();
  });

  it("does not move a watermark that is not ahead of server time", async () => {
    profile.current = { id: "store-1", last_monotonic_time: "2026-10-08T09:00:00.000Z" };
    serverClock.reading = reading("2026-10-08T11:00:00.000Z", "2026-10-08T11:00:10.000Z");

    const { reconcileClockWithServer } = await import("@/lib/licensing/licensing-manager");
    const result = await reconcileClockWithServer();

    expect(result.reconciled).toBe(false);
    expect(updateMonotonic).not.toHaveBeenCalled();
  });

  it("refuses when the device clock is behind the server by more than 24h", async () => {
    serverClock.reading = reading("2026-10-08T11:00:00.000Z", "2026-10-06T11:00:00.000Z");

    const { reconcileClockWithServer } = await import("@/lib/licensing/licensing-manager");
    const result = await reconcileClockWithServer();

    expect(result.reconciled).toBe(false);
    expect(result.reason).toContain("behind");
    expect(updateMonotonic).not.toHaveBeenCalled();
  });
});

describe("describeDrift", () => {
  it("formats minutes, hours, and days drift correctly", async () => {
    const { describeDrift } = await import("@/lib/licensing/server-clock");

    expect(describeDrift(5 * 60 * 1000)).toBe("5m ahead of our servers");
    expect(describeDrift(-15 * 60 * 1000)).toBe("15m behind our servers");
    expect(describeDrift(2 * 3600 * 1000)).toBe("2h ahead of our servers");
    expect(describeDrift(2 * 3600 * 1000 + 15 * 60 * 1000)).toBe("2h 15m ahead of our servers");
    expect(describeDrift(26 * 3600 * 1000)).toBe("1d 2h ahead of our servers");
    expect(describeDrift(-48 * 3600 * 1000)).toBe("2d behind our servers");
  });
});
