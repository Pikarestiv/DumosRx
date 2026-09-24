import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import { parseLocalDateOnly } from "@/lib/utils/date-utils";

export interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: string;
  payment_method: string;
  vendor_name?: string;
  reference_number?: string;
  notes?: string;
  user_id?: string;
  recorded_by_name?: string;
  created_at?: string;
  covers_months?: number | null;
}

/** Net Sales for a [from, to) window: total_amount already excludes discounts
 * (see pos-calculations.ts), so this only needs to also back out tax
 * collected (pass-through, not real revenue) and refunds - same definition
 * used by the Analytics BI dashboard's netSales, see use-bi-data.ts.
 * Takes an explicit local-timezone window (rather than SQLite's UTC-based
 * strftime('now')) so "this month" agrees with the expense side of the P&L
 * report, which is windowed the same way. */
export async function getCurrentMonthRevenue({ from, to }: { from: string; to: string }) {
  const storeId = getActiveStoreId();
  const params = storeId ? [from, to, storeId] : [from, to];
  const [salesRes, refundsRes] = await Promise.all([
    query<{ total: number; tax: number }>(
      `SELECT SUM(total_amount) as total, SUM(tax_amount) as tax FROM sales WHERE _deleted = 0 AND transaction_date >= ? AND transaction_date < ?${storeId ? " AND store_id = ?" : ""}`,
      params,
    ),
    query<{ total: number }>(
      `SELECT SUM(total_refunded) as total FROM returns WHERE (_deleted = 0 OR _deleted IS NULL) AND created_at >= ? AND created_at < ?${storeId ? " AND store_id = ?" : ""}`,
      params,
    ),
  ]);
  const gross = salesRes[0]?.total || 0;
  const tax = salesRes[0]?.tax || 0;
  const refunds = refundsRes[0]?.total || 0;
  return gross - tax - refunds;
}

/** Same [from, to) local-timezone windowing rationale as {@link getCurrentMonthRevenue}. */
export async function getCurrentMonthCOGS({ from, to }: { from: string; to: string }) {
  const storeId = getActiveStoreId();
  const params = storeId ? [from, to, storeId] : [from, to];
  const res = await query<{total: number}>(
    `SELECT SUM(si.quantity * si.cost_price) as total FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s._deleted = 0 AND s.transaction_date >= ? AND s.transaction_date < ?${storeId ? " AND s.store_id = ?" : ""}`,
    params,
  );
  return res[0]?.total || 0;
}

/**
 * How much of a single expense counts toward a [windowStart, windowEnd)
 * period. A plain expense counts in full if its date falls in the window.
 * A "prepaid" expense (`covers_months` set) is never counted as a lump sum
 * in whichever single period it was logged; it's split into
 * `covers_months` equal calendar-month installments starting from its own
 * date, and only the installments whose calendar month overlaps the window
 * are counted. A ₦270,000 rent payment logged in January with
 * covers_months=12 contributes ₦22,500 to January's total, ₦22,500 to
 * February's, and so on through December; never the full ₦270,000 to any
 * single period. Pure/synchronous so it works equally on a DB row or an
 * already-loaded in-memory `Expense`, without a second query.
 */
export function getSmoothedAmountInWindow(
  expense: Pick<Expense, "amount" | "date" | "covers_months">,
  windowStart: Date,
  windowEnd: Date,
): number {
  // expense.date is a bare "YYYY-MM-DD" column; parsing it with `new Date()`
  // reads it as UTC midnight while windowStart/windowEnd and the
  // startOfMonth/endOfMonth buckets below are local-time, shifting the first
  // installment a month early in negative-UTC timezones (same class of bug
  // fixed for expiry dates in date-utils.ts).
  const expenseDate = parseLocalDateOnly(expense.date);

  if (!expense.covers_months || expense.covers_months <= 0) {
    return expenseDate >= windowStart && expenseDate < windowEnd ? expense.amount : 0;
  }

  const monthlyAmount = expense.amount / expense.covers_months;
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();
  let total = 0;
  for (let i = 0; i < expense.covers_months; i++) {
    const bucketMonth = addMonths(expenseDate, i);
    const bucketStartMs = startOfMonth(bucketMonth).getTime();
    // endOfMonth() is inclusive (23:59:59.999); +1ms makes it an exclusive
    // bound so it lines up with windowEnd's [start, end) convention.
    const bucketEndMs = endOfMonth(bucketMonth).getTime() + 1;

    // Prorate by the fraction of this installment's month that actually
    // falls inside the window, rather than counting the full monthly amount
    // for any month the window merely touches. A calendar-month window
    // (from = startOfMonth, to = startOfMonth(next)) still gets the full
    // installment since it fully contains the bucket, but a rolling window
    // (e.g. "last 30 days") that straddles two calendar months no longer
    // double-counts by claiming the full installment from both months.
    const overlapMs = Math.min(bucketEndMs, windowEndMs) - Math.max(bucketStartMs, windowStartMs);
    if (overlapMs > 0) {
      const bucketDurationMs = bucketEndMs - bucketStartMs;
      total += monthlyAmount * (overlapMs / bucketDurationMs);
    }
  }
  return total;
}

/**
 * Sums expenses for a [from, to) window using {@link getSmoothedAmountInWindow}
 * for each row.
 *
 * @param viewerId - when provided, restricts results to expenses recorded by
 * this user (pass undefined for viewers allowed to see everyone's activity,
 * i.e. checkCanViewAllActivity(role) === true).
 */
export async function getSmoothedExpensesTotal({
  from,
  to,
  viewerId,
}: {
  from: string;
  to: string;
  viewerId?: string;
}): Promise<number> {
  const storeId = getActiveStoreId();
  const scopeParams = [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])];

  // date() on both sides: expenses.date is a date-only "YYYY-MM-DD" column,
  // but from/to here are full ISO timestamps (callers pass a JS Date's
  // toISOString()) - a plain string compare silently drops any expense
  // dated exactly on the window's start day. date() normalizes either form.
  //
  // `to` is INCLUSIVE, matching every other dateTo in these reports (see
  // reports.ts). A strict "< date(?)" here meant that when a caller passed
  // `to = now` (the common case - see getBIMetrics), every expense dated
  // TODAY was silently excluded from the BI dashboard's expense total, no
  // matter how far into the day it was logged.
  const plainResult = await query<{ total: number }>(
    `SELECT SUM(amount) as total FROM expenses
     WHERE _deleted = 0 AND date(date) >= date(?) AND date(date) <= date(?) AND (covers_months IS NULL OR covers_months <= 0)
     ${viewerId ? " AND user_id = ?" : ""}${storeId ? " AND store_id = ?" : ""}`,
    [from, to, ...scopeParams],
  );

  // Fetched unconditionally by date, not windowed: a prepaid expense
  // logged well before this window can still have unrecognized months
  // falling inside it.
  const amortized = await query<{ amount: number; date: string; covers_months: number }>(
    `SELECT amount, date, covers_months FROM expenses
     WHERE _deleted = 0 AND covers_months > 0
     ${viewerId ? " AND user_id = ?" : ""}${storeId ? " AND store_id = ?" : ""}`,
    scopeParams,
  );

  const windowStart = new Date(from);
  // getSmoothedAmountInWindow treats windowEnd as EXCLUSIVE; +1ms turns the
  // inclusive `to` above into that exclusive bound, so an amortized
  // installment overlapping the instant `to` itself is still counted -
  // matching the plain-expense query's now-inclusive semantics above.
  const windowEnd = new Date(new Date(to).getTime() + 1);

  const smoothedTotal = amortized.reduce(
    (sum, exp) => sum + getSmoothedAmountInWindow(exp, windowStart, windowEnd),
    0,
  );

  return (plainResult[0]?.total || 0) + smoothedTotal;
}

/**
 * Per-category breakdown for a [from, to) window, smoothed the same way as
 * {@link getSmoothedExpensesTotal} so the two agree — the breakdown summing
 * to something other than the headline P&L expense total would otherwise
 * read as a report bug, not the intentional design it's meant to be.
 */
export async function getCurrentMonthExpensesByCategory({
  from,
  to,
  viewerId,
}: {
  from: string;
  to: string;
  viewerId?: string;
}): Promise<{ category: string; total: number }[]> {
  const storeId = getActiveStoreId();
  const scopeParams = [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])];

  // See the matching comment in getSmoothedExpensesTotal above - `to` is
  // inclusive here too, for the same reason.
  const plainRows = await query<{ category: string; total: number }>(
    `SELECT category, SUM(amount) as total FROM expenses
     WHERE _deleted = 0 AND date(date) >= date(?) AND date(date) <= date(?) AND (covers_months IS NULL OR covers_months <= 0)
     ${viewerId ? " AND user_id = ?" : ""}${storeId ? " AND store_id = ?" : ""}
     GROUP BY category`,
    [from, to, ...scopeParams],
  );

  const amortized = await query<{ amount: number; date: string; covers_months: number; category: string }>(
    `SELECT amount, date, covers_months, category FROM expenses
     WHERE _deleted = 0 AND covers_months > 0
     ${viewerId ? " AND user_id = ?" : ""}${storeId ? " AND store_id = ?" : ""}`,
    scopeParams,
  );

  const windowStart = new Date(from);
  const windowEnd = new Date(new Date(to).getTime() + 1);

  const totalsByCategory = new Map<string, number>();
  for (const row of plainRows) {
    totalsByCategory.set(row.category, (totalsByCategory.get(row.category) || 0) + (row.total || 0));
  }
  for (const exp of amortized) {
    const smoothed = getSmoothedAmountInWindow(exp, windowStart, windowEnd);
    if (smoothed > 0) {
      totalsByCategory.set(exp.category, (totalsByCategory.get(exp.category) || 0) + smoothed);
    }
  }

  return Array.from(totalsByCategory.entries()).map(([category, total]) => ({ category, total }));
}

/** @param viewerId - when provided, restricts results to expenses recorded by this
 * user (pass undefined for viewers allowed to see everyone's activity, i.e.
 * checkCanViewAllActivity(role) === true). */
export async function getAllExpenses(viewerId?: string) {
  const storeId = getActiveStoreId();
  const params = [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])];
  return query<Expense>(
    `SELECT e.*, TRIM(u.first_name || ' ' || u.last_name) as recorded_by_name
     FROM expenses e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e._deleted = 0${viewerId ? " AND e.user_id = ?" : ""}${storeId ? " AND e.store_id = ?" : ""}
     ORDER BY e.date DESC`,
    params,
  );
}
