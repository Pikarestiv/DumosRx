import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  checkLoginLockout,
  recordLoginFailure,
  recordLoginSuccess,
  formatLockoutRemaining,
} from "@/lib/utils/login-lockout";

describe("login-lockout", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("does not lock out before the failure threshold is reached", () => {
    for (let i = 0; i < 4; i++) recordLoginFailure("admin");
    expect(checkLoginLockout("admin")).toEqual({ locked: false, remainingMs: 0 });
  });

  it("locks out once the 5th failure is recorded", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("admin");
    const status = checkLoginLockout("admin");
    expect(status.locked).toBe(true);
    expect(status.remainingMs).toBe(30_000); // first lockout: 30s
  });

  it("escalates the lockout duration exponentially on further failures", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("admin"); // -> 30s
    vi.advanceTimersByTime(30_000); // let it expire
    recordLoginFailure("admin"); // 6th overall failure -> 60s
    expect(checkLoginLockout("admin").remainingMs).toBe(60_000);

    vi.advanceTimersByTime(60_000);
    recordLoginFailure("admin"); // 7th -> 120s
    expect(checkLoginLockout("admin").remainingMs).toBe(120_000);
  });

  it("caps the lockout duration at 30 minutes", () => {
    for (let i = 0; i < 20; i++) {
      recordLoginFailure("admin");
      vi.advanceTimersByTime(30 * 60_000 + 1);
    }
    const status = checkLoginLockout("admin");
    expect(status.remainingMs).toBeLessThanOrEqual(30 * 60_000);
  });

  it("unlocks automatically once the lockout duration has elapsed", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("admin");
    expect(checkLoginLockout("admin").locked).toBe(true);

    vi.advanceTimersByTime(30_000);
    expect(checkLoginLockout("admin")).toEqual({ locked: false, remainingMs: 0 });
  });

  it("clears all failure history on a successful login", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("admin");
    expect(checkLoginLockout("admin").locked).toBe(true);

    recordLoginSuccess("admin");

    vi.advanceTimersByTime(30_000); // even after what would've been the lockout window
    expect(checkLoginLockout("admin")).toEqual({ locked: false, remainingMs: 0 });

    // And the failure counter is genuinely reset, not just the lock cleared -
    // 4 more failures alone shouldn't re-lock (would need 5 fresh ones).
    for (let i = 0; i < 4; i++) recordLoginFailure("admin");
    expect(checkLoginLockout("admin").locked).toBe(false);
  });

  it("scopes lockouts per-identifier, not per-device", () => {
    // Locking out "cashier1" must not affect "owner" trying to log in on
    // the same shared device.
    for (let i = 0; i < 5; i++) recordLoginFailure("cashier1");
    expect(checkLoginLockout("cashier1").locked).toBe(true);
    expect(checkLoginLockout("owner").locked).toBe(false);
  });

  it("is case-insensitive and trims whitespace on the identifier key", () => {
    for (let i = 0; i < 5; i++) recordLoginFailure("  Admin  ");
    expect(checkLoginLockout("admin").locked).toBe(true);
    expect(checkLoginLockout("ADMIN").locked).toBe(true);
  });

  describe("formatLockoutRemaining", () => {
    it("formats sub-minute durations in seconds", () => {
      expect(formatLockoutRemaining(30_000)).toBe("30s");
      expect(formatLockoutRemaining(1_500)).toBe("2s"); // rounds up
    });

    it("formats minute-scale durations in minutes", () => {
      expect(formatLockoutRemaining(60_000)).toBe("1m");
      expect(formatLockoutRemaining(90_000)).toBe("2m"); // rounds up
    });
  });
});
