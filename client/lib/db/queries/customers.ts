import { query } from "@/lib/db/local-database";

export async function getCustomers() {
  return query<any>(`
    SELECT 
      c.*,
      COALESCE(SUM(s.total_amount), 0) as total_spent,
      MAX(s.transaction_date) as last_visit
    FROM customers c
    LEFT JOIN sales s ON c.id = s.customer_id AND s._deleted = 0
    WHERE c._deleted = 0
    GROUP BY c.id
    ORDER BY c.first_name ASC
  `);
}

export async function getCustomerTransactions(limit = 100) {
  return query<any>(
    `SELECT
      s.id,
      s.transaction_number,
      s.customer_id,
      c.first_name,
      c.last_name,
      s.total_amount,
      s.points_earned,
      s.transaction_date,
      (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id AND (si._deleted = 0 OR si._deleted IS NULL)) as item_count,
      (SELECT GROUP_CONCAT(pr.name, '||') FROM sale_items si JOIN products pr ON si.product_id = pr.id WHERE si.sale_id = s.id AND (si._deleted = 0 OR si._deleted IS NULL)) as item_names
    FROM sales s
    JOIN customers c ON s.customer_id = c.id
    WHERE s.customer_id IS NOT NULL AND (s._deleted = 0 OR s._deleted IS NULL)
    ORDER BY s.transaction_date DESC
    LIMIT ?`,
    [limit]
  );
}

export async function getDebtors() {
  return query<any>(
    "SELECT * FROM customers WHERE outstanding_balance > 0 AND _deleted = 0 ORDER BY outstanding_balance DESC"
  );
}

export async function getCustomerBalance(id: string) {
  return query<{ id: string; balance: number }>(
    "SELECT id, outstanding_balance as balance FROM customers WHERE id = ?",
    [id],
  );
}

export async function getAllCustomers() {
  const items = await query<any>(
    "SELECT * FROM customers WHERE _deleted = 0 ORDER BY first_name ASC"
  );
  
  return items.map((c: any) => ({
    id: c.id,
    first_name: c.first_name || "",
    last_name: c.last_name || "",
    phone: c.phone || "",
    loyalty_points: c.loyalty_points || 0,
    outstanding_balance: c.outstanding_balance || 0,
  }));
}

export async function getCustomerRetentionMetrics() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFilter = thirtyDaysAgo.toISOString();

  const data = await query<any>(`
    SELECT 
      COUNT(DISTINCT customer_id) as total_customers_purchased,
      COUNT(DISTINCT CASE WHEN cnt > 1 THEN customer_id END) as returning_customers,
      SUM(cnt) as total_visits,
      SUM(total_spent) as total_revenue
    FROM (
      SELECT customer_id, COUNT(*) as cnt, SUM(total_amount) as total_spent
      FROM sales 
      WHERE transaction_date >= ? AND (_deleted = 0 OR _deleted IS NULL) AND customer_id IS NOT NULL 
      GROUP BY customer_id
    )
  `, [dateFilter]);

  if (!data || data.length === 0) return { retentionRate: 0, avgVisits: 0, avgTransactionValue: 0 };

  const row = data[0];
  const total = row.total_customers_purchased || 0;
  const returning = row.returning_customers || 0;
  const totalVisits = row.total_visits || 0;
  const totalRevenue = row.total_revenue || 0;

  const retentionRate = total > 0 ? (returning / total) * 100 : 0;
  const avgVisits = total > 0 ? (totalVisits / total) : 0;
  const avgTransactionValue = totalVisits > 0 ? (totalRevenue / totalVisits) : 0;

  return {
    retentionRate,
    avgVisits,
    avgTransactionValue,
  };
}
