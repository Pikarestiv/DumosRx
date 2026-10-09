import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  startTillInspectionSession,
  getTillInspectionSession,
  isTillInspectionSession,
  endTillInspectionSession,
  extendTillInspectionSession,
  msUntilInspectionExpiry,
  IDLE_TIMEOUT_MS,
  type TillInspectionSession,
} from "@/lib/utils/till-inspection";

/**
 * An inspection session is an overlay on whatever the till was already doing:
 * it never moves the local DB's current user, never touches the active store
 * or the sync token, and dies on restart. See
 * docs/superpowers/specs/2026-10-09-on-till-admin-inspection-design.md.
 */
const live = (): TillInspectionSession => ({
  admin: {
    id: "a1",
    first_name: "Ops",
    last_name: "Admin",
    email: "ops@dumosrx.com",
    role: "platform_admin",
  },
  sessionId: "sess-1",
  hardExpiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  idleExpiresAt: new Date(Date.now() + IDLE_TIMEOUT_MS).toISOString(),
  storeId: "store-1",
  deviceId: "till-7",
});

describe("till inspection session", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("is inactive when nothing has been started", () => {
    expect(isTillInspectionSession()).toBe(false);
    expect(getTillInspectionSession()).toBeNull();
    expect(msUntilInspectionExpiry()).toBeNull();
  });

  it("reads back a started session", () => {
    startTillInspectionSession(live());

    expect(isTillInspectionSession()).toBe(true);
    expect(getTillInspectionSession()?.admin.email).toBe("ops@dumosrx.com");
    expect(getTillInspectionSession()?.sessionId).toBe("sess-1");
  });

  it("treats an idle-expired session as absent, so a stale entry cannot leave a till read-only", () => {
    startTillInspectionSession({
      ...live(),
      idleExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    expect(isTillInspectionSession()).toBe(false);
    expect(getTillInspectionSession()).toBeNull();
  });

  it("honours the hard cap even when the idle deadline is still in the future", () => {
    startTillInspectionSession({
      ...live(),
      idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      hardExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    expect(isTillInspectionSession()).toBe(false);
  });

  it("extends the idle deadline without moving the hard cap", () => {
    const original = live();
    startTillInspectionSession(original);
    vi.setSystemTime(new Date(Date.now() + 5_000));
    extendTillInspectionSession();

    const extended = getTillInspectionSession();
    expect(new Date(extended!.idleExpiresAt).getTime()).toBeGreaterThan(
      new Date(original.idleExpiresAt).getTime(),
    );
    expect(extended!.hardExpiresAt).toBe(original.hardExpiresAt);
    vi.useRealTimers();
  });

  it("cannot resurrect an already-expired session by extending it", () => {
    startTillInspectionSession({
      ...live(),
      idleExpiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    extendTillInspectionSession();

    expect(isTillInspectionSession()).toBe(false);
  });

  it("reports the nearer of the two deadlines", () => {
    startTillInspectionSession({
      ...live(),
      idleExpiresAt: new Date(Date.now() + 30_000).toISOString(),
      hardExpiresAt: new Date(Date.now() + 90_000).toISOString(),
    });

    const remaining = msUntilInspectionExpiry()!;
    expect(remaining).toBeGreaterThan(25_000);
    expect(remaining).toBeLessThanOrEqual(30_000);
  });

  it("clears on end", () => {
    startTillInspectionSession(live());
    endTillInspectionSession();

    expect(isTillInspectionSession()).toBe(false);
    expect(sessionStorage.getItem("dumos_till_inspection")).toBeNull();
  });

  it("never touches the staff session it overlays", () => {
    localStorage.setItem("dumos_user", '{"id":"u1"}');
    localStorage.setItem("dumos_active_store_id", "store-1");
    localStorage.setItem("auth_token", "till-token");

    startTillInspectionSession(live());
    extendTillInspectionSession();
    endTillInspectionSession();

    expect(localStorage.getItem("dumos_user")).toBe('{"id":"u1"}');
    expect(localStorage.getItem("dumos_active_store_id")).toBe("store-1");
    expect(localStorage.getItem("auth_token")).toBe("till-token");
  });

  it("lives in sessionStorage, not localStorage, so it dies with the tab", () => {
    startTillInspectionSession(live());

    expect(sessionStorage.getItem("dumos_till_inspection")).not.toBeNull();
    expect(localStorage.getItem("dumos_till_inspection")).toBeNull();
  });

  it("answers false rather than throwing when storage is unavailable", () => {
    const spy = vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(isTillInspectionSession()).toBe(false);
    expect(msUntilInspectionExpiry()).toBeNull();
    spy.mockRestore();
  });

  it("answers false on a corrupt entry rather than throwing", () => {
    sessionStorage.setItem("dumos_till_inspection", "{not json");

    expect(isTillInspectionSession()).toBe(false);
  });

  it("answers false on an entry with no session id", () => {
    sessionStorage.setItem(
      "dumos_till_inspection",
      JSON.stringify({ ...live(), sessionId: "" }),
    );

    expect(isTillInspectionSession()).toBe(false);
  });
});
