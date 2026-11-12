import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";

export async function getSalesTotalsByPaymentMethod(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const startIso = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  const endIso = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
  const storeId = getActiveStoreId();

  return query<{ payment_method: string; total: number }>(
    `SELECT payment_method, SUM(total_amount) as total
     FROM sales
     WHERE transaction_date >= ? AND transaction_date <= ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}
     GROUP BY payment_method`,
    storeId ? [startIso, endIso, storeId] : [startIso, endIso],
  );
}

export async function getTransactionCountByDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const startIso = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  const endIso = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
  const storeId = getActiveStoreId();

  const res = await query<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM sales
     WHERE transaction_date >= ? AND transaction_date <= ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""} `,
    storeId ? [startIso, endIso, storeId] : [startIso, endIso],
  );
  return res[0]?.count || 0;
}

export async function getTopStaffByDate(dateStr: string) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const startIso = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  const endIso = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
  const storeId = getActiveStoreId();

  return query<{ user_name: string; total_sales: number }>(
    `SELECT TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')) as user_name, SUM(s.total_amount) as total_sales
     FROM sales s
     JOIN users u ON s.user_id = u.id
     WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}
     GROUP BY s.user_id
     ORDER BY total_sales DESC
     LIMIT 5`,
    storeId ? [startIso, endIso, storeId] : [startIso, endIso],
  );
}

