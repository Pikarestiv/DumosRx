import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";

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

export async function getCurrentMonthRevenue() {
  const storeId = getActiveStoreId();
  const res = await query<{total: number}>(
    `SELECT SUM(total_amount) as total FROM sales WHERE _deleted = 0 AND strftime('%Y-%m', transaction_date) = strftime('%Y-%m', 'now')${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
  return res[0]?.total || 0;
}

export async function getCurrentMonthCOGS() {
  const storeId = getActiveStoreId();
  const res = await query<{total: number}>(
    `SELECT SUM(si.quantity * si.cost_price) as total FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s._deleted = 0 AND strftime('%Y-%m', s.transaction_date) = strftime('%Y-%m', 'now')${storeId ? " AND s.store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
  return res[0]?.total || 0;
}

export async function getCurrentMonthExpensesByCategory() {
  const storeId = getActiveStoreId();
  return query<{total: number, category: string}>(
    `SELECT SUM(amount) as total, category FROM expenses WHERE _deleted = 0 AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now')${storeId ? " AND store_id = ?" : ""} GROUP BY category`,
    storeId ? [storeId] : [],
  );
}

/**
 * Sums expenses for a [from, to) window, but a "prepaid" expense (one with
 * `covers_months` set) is never counted as a lump sum in whichever single
 * period it was logged — it's split into `covers_months` equal calendar-
 * month installments starting from its own date, and only the installments
 * whose calendar month overlaps the window are counted. A ₦270,000 rent
 * payment logged in January with covers_months=12 contributes ₦22,500 to
 * January's total, ₦22,500 to February's, and so on through December —
 * never the full ₦270,000 to any single period.
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

  const plainResult = await query<{ total: number }>(
    `SELECT SUM(amount) as total FROM expenses
     WHERE _deleted = 0 AND date >= ? AND date < ? AND (covers_months IS NULL OR covers_months <= 0)
     ${viewerId ? " AND user_id = ?" : ""}${storeId ? " AND store_id = ?" : ""}`,
    [from, to, ...scopeParams],
  );

  // Fetched unconditionally by date, not windowed — a prepaid expense
  // logged well before this window can still have unrecognized months
  // falling inside it.
  const amortized = await query<{ amount: number; date: string; covers_months: number }>(
    `SELECT amount, date, covers_months FROM expenses
     WHERE _deleted = 0 AND covers_months > 0
     ${viewerId ? " AND user_id = ?" : ""}${storeId ? " AND store_id = ?" : ""}`,
    scopeParams,
  );

  const windowStart = new Date(from);
  const windowEnd = new Date(to);

  let smoothedTotal = 0;
  for (const exp of amortized) {
    const monthlyAmount = exp.amount / exp.covers_months;
    const expenseDate = new Date(exp.date);
    for (let i = 0; i < exp.covers_months; i++) {
      const bucketMonth = addMonths(expenseDate, i);
      const bucketStart = startOfMonth(bucketMonth);
      const bucketEnd = endOfMonth(bucketMonth);
      if (bucketStart < windowEnd && bucketEnd >= windowStart) {
        smoothedTotal += monthlyAmount;
      }
    }
  }

  return (plainResult[0]?.total || 0) + smoothedTotal;
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
