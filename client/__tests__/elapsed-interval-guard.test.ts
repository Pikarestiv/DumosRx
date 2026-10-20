import { describe, it, expect } from "vitest";
import { isIntervalElapsed } from "@/lib/utils/elapsed";

// A-247/A-234: a device whose clock is ahead writes that future time into localStorage, and a `now - stored < interval` gu…
// Rationale: docs/CLIENT_COMMENTS.md#block-__tests__-elapsed-interval-guard-test-ts-L4
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-14T12:00:00.000Z");

describe("isIntervalElapsed", () => {
  it("is due when nothing has been stored", () => {
    expect(isIntervalElapsed(null, DAY, NOW)).toBe(true);
    expect(isIntervalElapsed(undefined, DAY, NOW)).toBe(true);
  });

  it("is due when the stored value cannot be read", () => {
    expect(isIntervalElapsed("not-a-date", DAY, NOW)).toBe(true);
    expect(isIntervalElapsed(Number.NaN, DAY, NOW)).toBe(true);
    expect(isIntervalElapsed(Number.POSITIVE_INFINITY, DAY, NOW)).toBe(true);
  });

  it("is due when the stored stamp is in the future, however far", () => {
    // The A-247 shape: a till ~8 hours fast stamps 8 hours ahead and would
    // otherwise skip for 8 hours. A clock reset makes it permanent.
    expect(isIntervalElapsed(NOW + 1, DAY, NOW)).toBe(true);
    expect(isIntervalElapsed(NOW + 8 * 60 * 60 * 1000, DAY, NOW)).toBe(true);
    expect(isIntervalElapsed(NOW + 365 * DAY, DAY, NOW)).toBe(true);
  });

  it("is not due inside the interval", () => {
    expect(isIntervalElapsed(NOW - 1, DAY, NOW)).toBe(false);
    expect(isIntervalElapsed(NOW - (DAY - 1), DAY, NOW)).toBe(false);
  });

  it("is due on the interval and past it", () => {
    expect(isIntervalElapsed(NOW - DAY, DAY, NOW)).toBe(true);
    expect(isIntervalElapsed(NOW - 3 * DAY, DAY, NOW)).toBe(true);
  });

  it("reads epoch milliseconds stored as a string, the form the health check uses", () => {
    // Date.parse cannot read "1760...", so treating every string as ISO made
    // every device read as "never checked" and run the check on every open.
    expect(isIntervalElapsed(String(NOW - 1000), DAY, NOW)).toBe(false);
    expect(isIntervalElapsed(String(NOW - 2 * DAY), DAY, NOW)).toBe(true);
    expect(isIntervalElapsed(String(NOW + 8 * 60 * 60 * 1000), DAY, NOW)).toBe(true);
  });

  it("reads an ISO string as well as a number", () => {
    expect(isIntervalElapsed("2026-10-14T11:59:59.000Z", DAY, NOW)).toBe(false);
    expect(isIntervalElapsed("2026-10-10T12:00:00.000Z", DAY, NOW)).toBe(true);
    expect(isIntervalElapsed("2026-10-20T12:00:00.000Z", DAY, NOW)).toBe(true);
  });
});
