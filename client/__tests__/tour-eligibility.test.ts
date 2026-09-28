import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { isTourEligible } from "@/lib/utils/tour-eligibility";

describe("isTourEligible", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is eligible for a fresh install", () => {
    expect(isTourEligible()).toBe(true);
  });

  it("is not eligible once the tour has been completed", () => {
    localStorage.setItem("dumos_client_tour_completed", "true");
    expect(isTourEligible()).toBe(false);
  });

  it("is not eligible while the snooze window is still open", () => {
    localStorage.setItem(
      "dumos_client_tour_snoozed_until",
      String(Date.now() + 60_000),
    );
    expect(isTourEligible()).toBe(false);
  });

  it("is eligible again once the snooze window has elapsed", () => {
    localStorage.setItem(
      "dumos_client_tour_snoozed_until",
      String(Date.now() - 1),
    );
    expect(isTourEligible()).toBe(true);
  });

  it("ignores an unparseable snooze value", () => {
    localStorage.setItem("dumos_client_tour_snoozed_until", "not-a-number");
    expect(isTourEligible()).toBe(true);
  });
});
