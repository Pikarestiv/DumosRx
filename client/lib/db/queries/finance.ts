import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import { parseLocalDateOnly } from "@/lib/utils/date-utils";
import {
  ADJUSTMENT_REASON_NOTE_SEPARATOR,
  STOCK_LOSS_REASON_LABELS,
} from "@/lib/constants/stock-adjustments";

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

// Net Sales for a [from, to) window:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-finance-ts-L26
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

// Cost value of the stock written off as damaged or lost in a [from, to] window:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-finance-L63
export async function getStockLossTotal({
  from,
  to,
}: {
  from: string;
  to: string;
}): Promise<number> {
  const storeId = getActiveStoreId();
  const reasonClause = STOCK_LOSS_REASON_LABELS.map(
    () => "(reason = ? OR reason LIKE ?)",
  ).join(" OR ");
  const reasonParams = STOCK_LOSS_REASON_LABELS.flatMap((label) => [
    label,
    `${label}${ADJUSTMENT_REASON_NOTE_SEPARATOR}%`,
  ]);

  const rows = await query<{ total: number | null }>(
    `SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total FROM stock_movements
     WHERE (_deleted = 0 OR _deleted IS NULL)
       AND movement_type = 'adjustment'
       AND (${reasonClause})
       AND COALESCE(movement_date, created_at) >= ?
       AND COALESCE(movement_date, created_at) <= ?
       ${storeId ? " AND store_id = ?" : ""}`,
    [...reasonParams, from, to, ...(storeId ? [storeId] : [])],
  );
  return rows[0]?.total || 0;
}

// How much of a single expense counts toward a [windowStart, windowEnd) period.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-finance-L105
export function getSmoothedAmountInWindow(
  expense: Pick<Expense, "amount" | "date" | "covers_months">,
  windowStart: Date,
  windowEnd: Date,
): number {
  // expense.date is a bare "YYYY-MM-DD" column; parsing it with `new Date()` reads it as UTC midnight while windowStart/windowEnd and the startO…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-finance-ts-L96
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

    // Prorate by the fraction of this installment's month that actually falls inside the window, rather than counting the full monthly amount for…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-finance-ts-L118
    const overlapMs = Math.min(bucketEndMs, windowEndMs) - Math.max(bucketStartMs, windowStartMs);
    if (overlapMs > 0) {
      const bucketDurationMs = bucketEndMs - bucketStartMs;
      total += monthlyAmount * (overlapMs / bucketDurationMs);
    }
  }
  return total;
}

// Sums expenses for a [from, to) window using {@link getSmoothedAmountInWindow} for each row.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-finance-ts-L139
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

  // date() on both sides:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-finance-ts-L148
  const plainResult = await query<{ total: number }>(
    `SELECT SUM(amount) as total FROM expenses
     WHERE _deleted = 0 AND date(date) >= date(?, 'localtime') AND date(date) <= date(?, 'localtime') AND (covers_months IS NULL OR covers_months <= 0)
     ${viewerId ? " AND user_id = ?" : ""}${storeId ? " AND store_id = ?" : ""}`,
    [from, to, ...scopeParams],
  );

  // Fetched unconditionally by date, not windowed:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-finance-ts-L174
  const amortized = await query<{ amount: number; date: string; covers_months: number }>(
    `SELECT amount, date, covers_months FROM expenses
     WHERE _deleted = 0 AND covers_months > 0
     ${viewerId ? " AND user_id = ?" : ""}${storeId ? " AND store_id = ?" : ""}`,
    scopeParams,
  );

  const windowStart = new Date(from);
  // getSmoothedAmountInWindow treats windowEnd as EXCLUSIVE; +1ms turns the inclusive `to` above into that exclusive bound, so an amortized inst…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-finance-ts-L185
  const windowEnd = new Date(new Date(to).getTime() + 1);

  const smoothedTotal = amortized.reduce(
    (sum, exp) => sum + getSmoothedAmountInWindow(exp, windowStart, windowEnd),
    0,
  );

  return (plainResult[0]?.total || 0) + smoothedTotal;
}

// Per-category breakdown for a [from, to) window, smoothed the same way as {@link getSmoothedExpensesTotal} so the two agree — the breakdown s…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-finance-ts-L210
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

  // See the matching comment in getSmoothedExpensesTotal above - `to` is inclusive here too, and 'localtime' is needed for the same reason (from…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-finance-ts-L213
  const plainRows = await query<{ category: string; total: number }>(
    `SELECT category, SUM(amount) as total FROM expenses
     WHERE _deleted = 0 AND date(date) >= date(?, 'localtime') AND date(date) <= date(?, 'localtime') AND (covers_months IS NULL OR covers_months <= 0)
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

export interface ExpensesPage {
  rows: Expense[];
  /** Every row matching the scope, not just the ones in this page - so a caller
   * can tell whether there is anything older left to load. */
  total: number;
  /** Sum of `amount` over every row matching the scope. */
  amount: number;
}

export const EXPENSES_PAGE_SIZE = 50;

// One page of the expense ledger, newest first.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-finance-ts-L272
export async function getExpensesPage({
  viewerId,
  search,
  category,
  from,
  to,
  limit = EXPENSES_PAGE_SIZE,
  offset = 0,
}: {
  viewerId?: string;
  // Matched against the description, the same field the Expenses page's search box has always filtered on - in SQL rather than client-side, so s…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-finance-ts-L289
  search?: string;
  /** Omitted or "All" means every category. */
  category?: string;
  /** Inclusive "YYYY-MM-DD" calendar dates; either may be omitted. */
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ExpensesPage> {
  const storeId = getActiveStoreId();
  const trimmedSearch = search?.trim();
  const categoryFilter = category && category !== "All" ? category : undefined;

  const scopeParams: (string | number)[] = [
    ...(viewerId ? [viewerId] : []),
    ...(storeId ? [storeId] : []),
    ...(trimmedSearch ? [`%${trimmedSearch}%`] : []),
    ...(categoryFilter ? [categoryFilter] : []),
    ...(from ? [from] : []),
    ...(to ? [to] : []),
  ];
  const scopeClause =
    `${viewerId ? " AND e.user_id = ?" : ""}` +
    `${storeId ? " AND e.store_id = ?" : ""}` +
    // LIKE is case-insensitive for ASCII in SQLite by default, matching the
    // toLowerCase()-based comparison this replaces.
    `${trimmedSearch ? " AND e.description LIKE ?" : ""}` +
    `${categoryFilter ? " AND e.category = ?" : ""}` +
    `${from ? " AND date(e.date) >= date(?)" : ""}` +
    `${to ? " AND date(e.date) <= date(?)" : ""}`;

  const [rows, countRows] = await Promise.all([
    query<Expense>(
      `SELECT e.*, TRIM(u.first_name || ' ' || u.last_name) as recorded_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e._deleted = 0${scopeClause}
       ORDER BY e.date DESC
       LIMIT ? OFFSET ?`,
      [...scopeParams, limit, offset],
    ),
    query<{ total: number; amount: number | null }>(
      `SELECT COUNT(*) as total, SUM(e.amount) as amount FROM expenses e WHERE e._deleted = 0${scopeClause}`,
      scopeParams,
    ),
  ]);

  return { rows, total: countRows[0]?.total || 0, amount: countRows[0]?.amount || 0 };
}

// The lifetime expense figure, summed in SQL.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-finance-ts-L335
export async function getExpensesLifetimeTotal(
  viewerId?: string,
): Promise<number> {
  const storeId = getActiveStoreId();
  const params = [
    ...(viewerId ? [viewerId] : []),
    ...(storeId ? [storeId] : []),
  ];
  const rows = await query<{ total: number | null }>(
    `SELECT SUM(amount) as total FROM expenses
     WHERE _deleted = 0${viewerId ? " AND user_id = ?" : ""}${storeId ? " AND store_id = ?" : ""}`,
    params,
  );
  return rows[0]?.total || 0;
}

// Cash that physically left the drawer on `reportDate` ("YYYY-MM-DD"), for till reconciliation.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-finance-ts-L360
export async function getCashExpensesForDate(reportDate: string): Promise<number> {
  const storeId = getActiveStoreId();
  const result = await query<{ total: number }>(
    `SELECT SUM(amount) as total FROM expenses
     WHERE _deleted = 0 AND date(date) = date(?)
       AND (lower(payment_method) = 'cash' OR payment_method IS NULL OR payment_method = '')
     ${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [reportDate, storeId] : [reportDate],
  );
  return result[0]?.total || 0;
}
