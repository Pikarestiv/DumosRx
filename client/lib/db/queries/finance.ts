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
