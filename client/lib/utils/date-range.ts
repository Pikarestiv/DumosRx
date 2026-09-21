import type { DateRangeValue } from "@/components/ui/date-range-picker";

/**
 * DateRangePicker works in plain yyyy-MM-dd date-only strings, but every
 * date-filtered query (getActivityLog, report queries) compares from/to
 * directly against a full ISO created_at/transaction_date timestamp, so a
 * date-only value has to be widened to the full day it represents or "to
 * yesterday" would silently exclude everything from today.
 *
 * That widening must happen in the store's LOCAL calendar, not UTC: the
 * picker's date-only value represents a day on the store's own wall clock
 * (the same clock the dashboard/daily-close bucket by via SQLite's
 * 'localtime' modifier - see getDashboardOverviewData). Anchoring the
 * bounds to literal UTC midnight instead shifted every report's day/month
 * boundaries by the store's UTC offset relative to the dashboard, so the
 * two could disagree about which day (or, at month-end, which month) a
 * sale belonged to. Constructing local Date objects and letting
 * toISOString() convert them to their UTC-equivalent instant keeps the
 * comparison correct against the UTC timestamps sales/returns/expenses are
 * actually stored with.
 */
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
