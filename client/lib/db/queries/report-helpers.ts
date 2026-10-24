import { query } from "@/lib/db";
import { getActiveStoreId } from "@/lib/db/core";
import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import { getSmoothedAmountInWindow } from "@/lib/db/queries/finance";
import { parseLocalDateOnly } from "@/lib/utils/date-utils";

export interface SalesFilters {
  staffId?: string;
  paymentMethod?: string;
}

// Builds the " AND alias.user_id = ? AND alias.payment_method = ?" tail (plus matching params, in the same order) shared by every report/BI qu…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-reports-ts-L24
export function salesFilterClause(filters: SalesFilters | undefined, alias: "" | "s.") {
  let clause = "";
  const params: string[] = [];
  if (filters?.staffId) {
    clause += ` AND ${alias}user_id = ?`;
    params.push(filters.staffId);
  }
  if (filters?.paymentMethod) {
    clause += ` AND ${alias}payment_method = ?`;
    params.push(filters.paymentMethod);
  }
  return { clause, params };
}

// Expenses per calendar month for a report window, SMOOTHED the same way getSmoothedExpensesTotal/getCurrentMonthExpensesByCategory smooth the…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-reports-L42
export async function getSmoothedExpensesByMonth(
  dateFrom?: string,
  dateTo?: string,
): Promise<Map<string, number>> {
  const storeId = getActiveStoreId();
  const params: string[] = [];
  // date() on both sides:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L48
  let where = "_deleted = 0 AND (covers_months IS NULL OR covers_months <= 0)";
  if (dateFrom) { where += " AND date(date) >= date(?, 'localtime')"; params.push(dateFrom); }
  if (dateTo) { where += " AND date(date) <= date(?, 'localtime')"; params.push(dateTo); }
  if (storeId) { where += " AND store_id = ?"; params.push(storeId); }

  const plainRows = await query<{ month: string; expenses?: number }>(
    `SELECT strftime('%Y-%m', date) as month, SUM(amount) as expenses
     FROM expenses WHERE ${where}
     GROUP BY strftime('%Y-%m', date)`,
    params,
  );

  // Fetched unconditionally by date, not windowed - same rationale as getSmoothedExpensesTotal:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L71
  const amortized = await query<{ amount: number; date: string; covers_months: number }>(
    `SELECT amount, date, covers_months FROM expenses
     WHERE _deleted = 0 AND covers_months > 0${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );

  const byMonth = new Map<string, number>();
  for (const row of plainRows) {
    byMonth.set(row.month, (byMonth.get(row.month) || 0) + (row.expenses || 0));
  }

  const rangeStartMs = dateFrom ? new Date(dateFrom).getTime() : -Infinity;
  // dateTo is an INCLUSIVE bound everywhere else in these reports; +1ms turns
  // it into the exclusive bound getSmoothedAmountInWindow expects.
  const rangeEndMs = dateTo ? new Date(dateTo).getTime() + 1 : Infinity;

  for (const exp of amortized) {
    const start = parseLocalDateOnly(exp.date);
    for (let i = 0; i < exp.covers_months; i++) {
      const bucket = addMonths(start, i);
      const bucketStartMs = startOfMonth(bucket).getTime();
      const bucketEndMs = endOfMonth(bucket).getTime() + 1;
      const windowStartMs = Math.max(bucketStartMs, rangeStartMs);
      const windowEndMs = Math.min(bucketEndMs, rangeEndMs);
      if (windowEndMs <= windowStartMs) continue;
      // The window never spans more than one calendar month, so only this
      // installment can contribute to it.
      const amount = getSmoothedAmountInWindow(
        exp,
        new Date(windowStartMs),
        new Date(windowEndMs),
      );
      if (!amount) continue;
      const key = `${bucket.getFullYear()}-${String(bucket.getMonth() + 1).padStart(2, "0")}`;
      byMonth.set(key, (byMonth.get(key) || 0) + amount);
    }
  }

  return byMonth;
}
