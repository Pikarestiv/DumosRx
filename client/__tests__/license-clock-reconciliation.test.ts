import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Covers the only route out of a clock-discrepancy lock (docs/KNOWN_BUGS.md
 * A-191). A device whose wall clock ran fast poisons
 * stores.last_monotonic_time with a future value; correcting the clock then
 * reads as a rollback and locks the till out permanently, because the pull
 * strips that column and a factory reset preserves it.
 *
 * The recovery is deliberately ONLINE-ONLY: the store owner is the party a
 * backdating check exists to stop, so there is no offline override.
 * See docs/superpowers/specs/2026-10-08-license-clock-recovery-design.md.
 */
const WATERMARK = "2026-10-08T22:56:40.000Z";

const profile = { current: { id: "store-1", last_monotonic_time: WATERMARK } as Record<string, unknown> | null };
const updateMonotonic = vi.fn(async (_id: string, _timeIso: string) => undefined);
const serverClock = { reading: null as unknown };

vi.mock("@/lib/db/queries/setup", () => ({
  getStoreProfile: vi.fn(async () => profile.current),
  updateStoreMonotonicTime: (id: string, t: string) => updateMonotonic(id, t),
}));

vi.mock("@/lib/licensing/server-clock", async () => {
  const actual = await vi.importActual<typeof import("@/lib/licensing/server-clock")>(
    "@/lib/licensing/server-clock",
  );
  return {
    ...actual,
    readServerClock: vi.fn(async () => serverClock.reading),
  };
});

function reading(serverIso: string, localIso: string) {
  const serverNow = new Date(serverIso);
  const localNow = new Date(localIso);
  const driftMs = localNow.getTime() - serverNow.getTime();
  return { serverNow, localNow, driftMs, agrees: Math.abs(driftMs) <= 5 * 60 * 1000 };
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
  it("resets a poisoned watermark when the local clock agrees with the server", async () => {
    serverClock.reading = reading("2026-10-08T11:00:00.000Z", "2026-10-08T11:00:30.000Z");

    const { reconcileClockWithServer } = await import("@/lib/licensing/licensing-manager");
    const result = await reconcileClockWithServer();

    expect(result.reconciled).toBe(true);
    expect(updateMonotonic).toHaveBeenCalledWith("store-1", "2026-10-08T11:00:00.000Z");
  });

  it("refuses when the device clock still disagrees with the server", async () => {
    serverClock.reading = reading("2026-10-08T11:00:00.000Z", "2026-10-08T22:48:00.000Z");

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

  it("refuses when the device clock is behind the server, not just ahead", async () => {
    serverClock.reading = reading("2026-10-08T11:00:00.000Z", "2026-10-07T11:00:00.000Z");

    const { reconcileClockWithServer } = await import("@/lib/licensing/licensing-manager");
    const result = await reconcileClockWithServer();

    expect(result.reconciled).toBe(false);
    expect(result.reason).toContain("behind");
    expect(updateMonotonic).not.toHaveBeenCalled();
  });
});
