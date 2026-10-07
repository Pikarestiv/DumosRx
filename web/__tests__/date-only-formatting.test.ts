import { describe, it, expect } from "vitest";
import { formatDateOnlyToDDMMYYYY, formatDateToDDMMYYYY } from "@/lib/utils/date-utils";

/**
 * A bare "YYYY-MM-DD" parsed by `new Date()` is UTC midnight, but getDate()
 * reads local time — so every date-only value renders a day early anywhere
 * west of UTC, including this project's own EDT production host
 * (.agents/AGENTS.md §7).
 */
describe("formatDateOnlyToDDMMYYYY", () => {
  it("renders a date-only string without shifting it across timezones", () => {
    expect(formatDateOnlyToDDMMYYYY("2026-10-07")).toBe("07/10/2026");
    expect(formatDateOnlyToDDMMYYYY("2026-01-01")).toBe("01/01/2026");
    expect(formatDateOnlyToDDMMYYYY("2026-12-31")).toBe("31/12/2026");
  });

  it("falls back to the timestamp formatter for a full ISO string", () => {
    expect(formatDateOnlyToDDMMYYYY("2026-10-07T09:00:00Z")).toBe(
      formatDateToDDMMYYYY("2026-10-07T09:00:00Z"),
    );
  });

  it("returns an empty string for missing or malformed input", () => {
    expect(formatDateOnlyToDDMMYYYY(null)).toBe("");
    expect(formatDateOnlyToDDMMYYYY(undefined)).toBe("");
    expect(formatDateOnlyToDDMMYYYY("not-a-date")).toBe("");
  });
});
