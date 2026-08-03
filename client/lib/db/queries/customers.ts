import { query, insert, update } from "@/lib/db/local-database";
import { Customer, CustomerDbRow, CustomerTransactionRow } from "@/lib/types/customer";

export async function getCustomers() {
  return query<CustomerDbRow>(`
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

/**
 * Combined feed of every customer's transactions store-wide — grows the same way
 * stock_movements does (a row per sale), so `sinceDays` bounds the default recent
 * view. Omit it for full history, which the caller should only do when the user
 * is actively searching or filtering to a specific customer, so those still
 * match against every record, not just what's been loaded for browsing.
 */
export async function getCustomerTransactions(options: { sinceDays?: number } = {}) {
  const { sinceDays } = options;
  const dateFilter = sinceDays
    ? `AND s.transaction_date >= datetime('now', '-${sinceDays} days')`
    : "";
  return query<CustomerTransactionRow>(
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
    WHERE s.customer_id IS NOT NULL AND (s._deleted = 0 OR s._deleted IS NULL) ${dateFilter}
    ORDER BY s.transaction_date DESC`,
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

/** Minimal customer shape for contexts (e.g. POS transaction detail) that only
 * need enough to open the Record Payment modal, not the full customer record. */
export async function getCustomerById(id: string) {
  const rows = await query<any>(
    "SELECT id, first_name, last_name, outstanding_balance FROM customers WHERE id = ? AND _deleted = 0",
    [id],
  );
  return rows[0] || null;
}

/** Applies a credit payment to a customer's oldest outstanding credit sales
 * first (FIFO) — a sale is marked "completed" once its cumulative amount_paid
 * reaches its total, otherwise "partial". Doesn't touch the customer's
 * outstanding_balance; the caller (recordCustomerPayment) does that. */
async function applyCreditPaymentFIFO(customerId: string, amount: number) {
  const pendingSales = await query<any>(
    `SELECT id, total_amount, amount_paid FROM sales
     WHERE customer_id = ? AND payment_status IN ('pending', 'partial')
       AND (_deleted = 0 OR _deleted IS NULL)
     ORDER BY created_at ASC`,
    [customerId],
  );

  let remaining = amount;
  for (const sale of pendingSales) {
    if (remaining <= 0) break;
    const owed = (sale.total_amount || 0) - (sale.amount_paid || 0);
    if (owed <= 0) continue;

    const applied = Math.min(owed, remaining);
    const newAmountPaid = (sale.amount_paid || 0) + applied;
    const newStatus = newAmountPaid >= sale.total_amount ? "completed" : "partial";

    await update("sales", sale.id, {
      amount_paid: newAmountPaid,
      payment_status: newStatus,
    });

    remaining -= applied;
  }
}

/** Single source of truth for recording a customer debt payment — used by
 * both the Customer Directory and the Record Payment button on a specific
 * sale's transaction details. Self-contained (re-reads the customer's
 * current balance rather than trusting caller-held state) since it's called
 * from more than one page. */
export async function recordCustomerPayment(
  customerId: string,
  amount: number,
  paymentMethod: string,
  notes?: string,
): Promise<number> {
  const now = new Date().toISOString();
  await insert("customer_payments", {
    customer_id: customerId,
    amount,
    payment_method: paymentMethod,
    notes: notes || null,
    payment_date: now,
  });

  const balanceRows = await getCustomerBalance(customerId);
  const currentBalance = balanceRows[0]?.balance || 0;
  const newBalance = Math.max(0, currentBalance - amount);
  await update("customers", customerId, { outstanding_balance: newBalance });

  await applyCreditPaymentFIFO(customerId, amount);

  return newBalance;
}

export async function getAllCustomers(): Promise<Customer[]> {
  const items = await query<CustomerDbRow>(
    "SELECT * FROM customers WHERE _deleted = 0 ORDER BY first_name ASC"
  );

  return items.map((c) => ({
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
