import { describe, it, expect, vi, beforeEach } from "vitest";

const { clock, store } = vi.hoisted(() => ({
  clock: {
    reading: null as null | { serverNow: Date; agrees: boolean; driftMs: number },
    serverNow: new Date("2026-10-09T12:00:00Z") as Date | null,
    serverAccepts: ["sess-1"] as string[],
  },
  store: { profile: null as null | { id: string }, written: [] as string[] },
}));

vi.mock("@/lib/licensing/server-clock", () => ({
  readServerClock: vi.fn(async () => clock.reading),
  describeDrift: (ms: number) => `${ms}ms off`,
}));

vi.mock("@/lib/api/admin-till-session", () => ({
  // Mirrors the server: time is served only for a session the SERVER accepts,
  // so a forged sessionStorage flag cannot authorise an override.
  readInspectionServerClock: vi.fn(async (sessionId: string) =>
    clock.serverAccepts.includes(sessionId) ? clock.serverNow : null,
  ),
}));

vi.mock("@/lib/db/queries/setup", () => ({
  getStoreProfile: vi.fn(async () => store.profile),
  updateStoreMonotonicTime: vi.fn(async (_id: string, iso: string) => {
    store.written.push(iso);
  }),
}));

import { overrideClockLockout } from "@/lib/licensing/licensing-manager";
import {
  startTillInspectionSession,
  endTillInspectionSession,
  IDLE_TIMEOUT_MS,
  type TillInspectionSession,
} from "@/lib/utils/till-inspection";

const live = (): TillInspectionSession => ({
  admin: {
    id: "a1",
    first_name: "Ops",
    last_name: "Admin",
    email: "ops@dumosrx.com",
    role: "platform_admin",
  },
  sessionId: "sess-1",
  hardExpiresAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
  idleExpiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString(),
  storeId: "s1",
  deviceId: "till-7",
});

/**
 * The override is the admin-present form of reconcileClockWithServer: still
 * requires a live server reading, but skips the `agrees` refusal, which is the
 * case a physically-present admin exists to resolve.
 */
describe("overrideClockLockout", () => {
  beforeEach(() => {
    sessionStorage.clear();
    store.profile = { id: "s1" };
    store.written = [];
    clock.reading = { serverNow: new Date("2026-10-09T12:00:00Z"), agrees: true, driftMs: 0 };
    clock.serverNow = new Date("2026-10-09T12:00:00Z");
    clock.serverAccepts = ["sess-1"];
  });

  it("refuses without an inspection session", async () => {
    await expect(overrideClockLockout()).rejects.toThrow(/inspection session/i);
    expect(store.written).toEqual([]);
  });

  it("writes the server's time as the new watermark", async () => {
    startTillInspectionSession(live());

    const result = await overrideClockLockout();

    expect(result.ok).toBe(true);
    expect(store.written).toEqual(["2026-10-09T12:00:00.000Z"]);
  });

  it("still works when the device's own clock disagrees, which reconcile refuses", async () => {
    // reconcileClockWithServer() bails on !agrees. That is exactly the device
    // an admin is standing in front of, so the override must proceed.
    clock.reading = { serverNow: new Date("2026-10-09T12:00:00Z"), agrees: false, driftMs: 9_000_000 };
    startTillInspectionSession(live());

    const result = await overrideClockLockout();

    expect(result.ok).toBe(true);
    expect(store.written).toEqual(["2026-10-09T12:00:00.000Z"]);
  });

  it("refuses when the server cannot be reached, so an offline device cannot self-clear", async () => {
    clock.serverNow = null;
    clock.serverAccepts = [];
    startTillInspectionSession(live());

    const result = await overrideClockLockout();

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/connection/i);
    expect(store.written).toEqual([]);
  });

  it("refuses once the session has ended", async () => {
    startTillInspectionSession(live());
    endTillInspectionSession();

    await expect(overrideClockLockout()).rejects.toThrow(/inspection session/i);
  });

  it("reports a missing store profile rather than throwing", async () => {
    store.profile = null;
    startTillInspectionSession(live());

    const result = await overrideClockLockout();

    expect(result.ok).toBe(false);
    expect(store.written).toEqual([]);
  });

  it("refuses a forged session the server does not recognise", async () => {
    // The sessionStorage flag is forgeable in devtools; the authority is a
    // live admin_till_sessions row, which only the server can confirm.
    clock.serverAccepts = [];
    startTillInspectionSession({ ...live(), sessionId: "forged" });

    const result = await overrideClockLockout();

    expect(result.ok).toBe(false);
    expect(store.written).toEqual([]);
  });
});
