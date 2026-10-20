import type { DateRangeValue } from "@/components/ui/date-range-picker";

// DateRangePicker works in plain yyyy-MM-dd date-only strings, but every date-filtered query (getActivityLog, report queries) compares from/to…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#utils-date-range-L3
export function toQueryRange(range: DateRangeValue): { from?: string; to?: string } {
  const startOfLocalDay = (dateOnly: string): string => {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  };
  const endOfLocalDay = (dateOnly: string): string => {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
  };
  return {
    from: range.from ? startOfLocalDay(range.from) : undefined,
    to: range.to ? endOfLocalDay(range.to) : undefined,
  };
}
