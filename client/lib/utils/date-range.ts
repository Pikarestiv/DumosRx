import type { DateRangeValue } from "@/components/ui/date-range-picker";

/**
 * DateRangePicker works in plain yyyy-MM-dd date-only strings, but every
 * date-filtered query (getActivityLog, report queries) compares from/to
 * directly against a full ISO created_at timestamp, so a date-only value
 * has to be widened to the full day it represents or "to yesterday" would
 * silently exclude everything from today.
 */
export function toQueryRange(range: DateRangeValue): { from?: string; to?: string } {
  return {
    from: range.from ? `${range.from}T00:00:00.000Z` : undefined,
    to: range.to ? `${range.to}T23:59:59.999Z` : undefined,
  };
}
