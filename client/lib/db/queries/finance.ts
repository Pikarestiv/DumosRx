import { query } from "@/lib/db/local-database";

export interface Expense {
  id: string;
  category: string;
  amount: number;
  description: string;
  date: string;
  payment_method: string;
}

export async function getCurrentMonthRevenue() {
  const res = await query<{total: number}>(
    "SELECT SUM(total_amount) as total FROM sales WHERE _deleted = 0 AND strftime('%Y-%m', transaction_date) = strftime('%Y-%m', 'now')"
  );
  return res[0]?.total || 0;
}

export async function getCurrentMonthCOGS() {
  const res = await query<{total: number}>(
    "SELECT SUM(si.quantity * si.cost_price) as total FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s._deleted = 0 AND strftime('%Y-%m', s.transaction_date) = strftime('%Y-%m', 'now')"
  );
  return res[0]?.total || 0;
}

export async function getCurrentMonthExpensesByCategory() {
  return query<{total: number, category: string}>(
    "SELECT SUM(amount) as total, category FROM expenses WHERE _deleted = 0 AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now') GROUP BY category"
  );
}

export async function getAllExpenses() {
  return query<Expense>(
    "SELECT * FROM expenses WHERE _deleted = 0 ORDER BY date DESC"
  );
}
