import { describe, expect, it } from "vitest";

import { describeOpenStatus, formatClock, openStatus, summarizeHours, type OpeningHours } from "@/lib/storefront-hours";

const WEEKDAY_HOURS = { open: "08:00", close: "18:00" };
const monToSat: OpeningHours = {
  mon: WEEKDAY_HOURS,
  tue: WEEKDAY_HOURS,
  wed: WEEKDAY_HOURS,
  thu: WEEKDAY_HOURS,
  fri: WEEKDAY_HOURS,
  sat: WEEKDAY_HOURS,
  sun: null,
};

const monday = (hours: number, minutes = 0) => new Date(2026, 10, 16, hours, minutes);
const saturday = (hours: number) => new Date(2026, 10, 14, hours);

describe("storefront opening status", () => {
  it("says when an open store closes", () => {
    expect(describeOpenStatus(openStatus(monToSat, monday(10))!)).toBe("Open · closes at 6:00 pm");
  });

  it("treats the closing minute as closed and the opening minute as open", () => {
    expect(openStatus(monToSat, monday(18, 0))?.state).toBe("closed");
    expect(openStatus(monToSat, monday(8, 0))?.state).toBe("open");
  });

  it("says a store that has not opened yet opens today", () => {
    expect(describeOpenStatus(openStatus(monToSat, monday(7, 30))!)).toBe("Closed · opens today at 8:00 am");
  });

  it("says a store that has closed for the night opens tomorrow", () => {
    expect(describeOpenStatus(openStatus(monToSat, monday(19))!)).toBe("Closed · opens tomorrow at 8:00 am");
  });

  it("names the day when the next opening is not tomorrow, skipping closed days", () => {
    expect(describeOpenStatus(openStatus(monToSat, saturday(19))!)).toBe("Closed · opens Mon at 8:00 am");
  });

  it("finds tomorrow's opening across the end of the week", () => {
    const sundayOnly: OpeningHours = { sun: { open: "10:00", close: "14:00" } };

    expect(describeOpenStatus(openStatus(sundayOnly, saturday(12))!)).toBe("Closed · opens tomorrow at 10:00 am");
  });

  it("reports no status when no hours are set, none are usable, or every day is closed", () => {
    expect(openStatus(null, monday(10))).toBeNull();
    expect(openStatus(undefined, monday(10))).toBeNull();
    expect(openStatus({}, monday(10))).toBeNull();
    expect(openStatus({ mon: null, tue: null }, monday(10))).toBeNull();
    expect(openStatus({ mon: { open: "18:00", close: "08:00" } }, monday(10))).toBeNull();
    expect(openStatus({ mon: { open: "8am", close: "6pm" } }, monday(10))).toBeNull();
  });
});

describe("storefront hours formatting", () => {
  it.each([
    ["00:00", "12:00 am"],
    ["08:05", "8:05 am"],
    ["12:30", "12:30 pm"],
    ["18:00", "6:00 pm"],
  ])("formats %s as %s", (clock, expected) => {
    expect(formatClock(clock)).toBe(expected);
  });

  it("collapses consecutive identical days into one range", () => {
    expect(summarizeHours(monToSat)).toBe("Mon – Sat · 8:00 am – 6:00 pm");
  });

  it("splits days whose hours differ and keeps a lone day on its own", () => {
    const shortSaturday = { ...monToSat, sat: { open: "09:00", close: "13:00" } };

    expect(summarizeHours(shortSaturday)).toBe("Mon – Fri · 8:00 am – 6:00 pm; Sat · 9:00 am – 1:00 pm");
  });

  it("does not join identical days that are not neighbours", () => {
    const gap: OpeningHours = { mon: WEEKDAY_HOURS, wed: WEEKDAY_HOURS };

    expect(summarizeHours(gap)).toBe("Mon · 8:00 am – 6:00 pm; Wed · 8:00 am – 6:00 pm");
  });

  it("returns nothing when there are no usable hours", () => {
    expect(summarizeHours(null)).toBeNull();
    expect(summarizeHours({ mon: null })).toBeNull();
  });
});
