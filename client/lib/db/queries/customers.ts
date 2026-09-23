import { query, insert, update, transaction } from "@/lib/db/local-database";
import { softDelete } from "@/lib/db/base-helpers";
import { getActiveStoreId } from "@/lib/db/core";
import { Customer, CustomerDbRow, CustomerTransactionRow } from "@/lib/types/customer";

export async function getCustomers() {
  const storeId = getActiveStoreId();
  return query<CustomerDbRow>(
    `SELECT
      c.*,
      COALESCE(SUM(
        s.total_amount - COALESCE(
          (SELECT SUM(r.total_refunded) FROM returns r WHERE r.sale_id = s.id AND (r._deleted = 0 OR r._deleted IS NULL)),
          0
        )
      ), 0) as total_spent,
      MAX(s.transaction_date) as last_visit,
      COUNT(s.id) as visit_count
    FROM customers c
    LEFT JOIN sales s ON c.id = s.customer_id AND s._deleted = 0${storeId ? " AND s.store_id = ?" : ""}
    WHERE c._deleted = 0${storeId ? " AND c.store_id = ?" : ""}
    GROUP BY c.id
    ORDER BY c.first_name ASC`,
    storeId ? [storeId, storeId] : [],
  );
}

/** Net-of-refunds lifetime spend for one customer, as of right now - used at
 * POS checkout to find which loyalty tier a sale's points should earn at
 * (see getApplicableTierMultiplier). Same netting logic as getCustomers(),
 * scoped to a single customer instead of aggregating the whole store.
 * Scoped by store_id (not just customer_id) the same way
 * getCustomerTransactions() is - on a device with multi-store access, a
 * device-wide cache can hold another store's sales too, and customer_id
 * alone doesn't rule those out at the SQL level. */
export async function getCustomerTotalSpent(customerId: string): Promise<number> {
  const storeId = getActiveStoreId();
  const rows = await query<{ total_spent: number }>(
    `SELECT COALESCE(SUM(
      s.total_amount - COALESCE(
        (SELECT SUM(r.total_refunded) FROM returns r WHERE r.sale_id = s.id AND (r._deleted = 0 OR r._deleted IS NULL)),
        0
      )
    ), 0) as total_spent
    FROM sales s
    WHERE s.customer_id = ? AND s._deleted = 0${storeId ? " AND s.store_id = ?" : ""}`,
    storeId ? [customerId, storeId] : [customerId],
  );
  return rows[0]?.total_spent || 0;
}

/**
 * Combined feed of every customer's transactions store-wide: grows the same way
 * stock_movements does (a row per sale), so `sinceDays` bounds the default recent
 * view. Omit it for full history, which the caller should only do when the user
 * is actively searching or filtering to a specific customer, so those still
 * match against every record, not just what's been loaded for browsing.
 *
 * `from`/`to` (YYYY-MM-DD) take precedence over `sinceDays` when both are passed:
 * an explicit date-range pick from the UI overrides the relative window.
 */
export async function getCustomerTransactions(
  options: { sinceDays?: number; from?: string; to?: string } = {},
) {
  const { sinceDays, from, to } = options;
  const storeId = getActiveStoreId();
  const params: string[] = [];
  let dateFilter = "";
  if (from || to) {
    if (from) {
      dateFilter += " AND s.transaction_date >= ?";
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      dateFilter += " AND s.transaction_date <= ?";
      params.push(`${to} 23:59:59`);
    }
  } else if (sinceDays) {
    dateFilter = `AND s.transaction_date >= datetime('now', '-${sinceDays} days')`;
  }
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
    WHERE s.customer_id IS NOT NULL AND (s._deleted = 0 OR s._deleted IS NULL) ${dateFilter}${storeId ? " AND s.store_id = ?" : ""}
    ORDER BY s.transaction_date DESC`,
    [...params, ...(storeId ? [storeId] : [])],
  );
}

// Money is stored/compared in float columns, so a debt paid off exactly can
// leave sub-cent rounding dust (e.g. 2.8e-14) instead of a clean zero. 0.01
// treats anything below a cent as fully settled, both here and wherever a
// balance/payment amount is written (see recordCustomerPayment,
// applyCreditPaymentFIFO).
const MONEY_EPSILON = 0.01;

export async function getDebtors() {
  const storeId = getActiveStoreId();
  return query<CustomerDbRow>(
    `SELECT * FROM customers WHERE outstanding_balance > ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""} ORDER BY outstanding_balance DESC`,
    storeId ? [MONEY_EPSILON, storeId] : [MONEY_EPSILON],
  );
}

export async function getCustomerBalance(id: string) {
  return query<{ id: string; balance: number }>(
    "SELECT id, outstanding_balance as balance FROM customers WHERE id = ?",
    [id],
  );
}

export async function getCustomerLoyaltyPoints(id: string) {
  return query<{ id: string; loyalty_points: number }>(
    "SELECT id, loyalty_points FROM customers WHERE id = ?",
    [id],
  );
}

/** Minimal customer shape for contexts (e.g. POS transaction detail) that only
 * need enough to open the Record Payment modal, not the full customer record. */
export async function getCustomerById(id: string) {
  const rows = await query<{ id: string; first_name?: string; last_name?: string; outstanding_balance?: number }>(
    "SELECT id, first_name, last_name, outstanding_balance FROM customers WHERE id = ? AND _deleted = 0",
    [id],
  );
  return rows[0] || null;
}

/** Applies a credit payment to a customer's oldest outstanding credit sales
 * first (FIFO): a sale is marked "completed" once its cumulative amount_paid
 * reaches its total, otherwise "partial". Doesn't touch the customer's
 * outstanding_balance; the caller (recordCustomerPayment) does that. */
async function applyCreditPaymentFIFO(customerId: string, amount: number) {
  const storeId = getActiveStoreId();
  // Includes 'refunded'/'partially_refunded': a return against a credit sale
  // overwrites payment_status with one of those (see
  // use-process-return-mutation.ts), which would otherwise drop a sale that
  // still has a nonzero balance (partial return, credit portion only
  // partly forgiven) out of this ledger forever. The `owed <= 0` guard below
  // is what keeps a fully-settled/fully-forgiven sale from being touched.
  //
  // The payment_method guard on the refunded/partially_refunded branch below
  // protects against a legacy edge: a cash/card/transfer sale's amount_paid
  // can be left at the schema default of 0 (e.g. old synced rows predating
  // stricter writes), and once 'refunded'/'partially_refunded' are included
  // here, such a sale would otherwise look like it owes its full
  // total_amount and get swept into this credit ledger even though it was
  // never actually sold on credit. 'pending'/'partial' sales aren't gated on
  // payment_method - by construction (see calculateSalePaymentStatus) only a
  // credit/mixed-with-credit sale ever gets those statuses in the first
  // place.
  const pendingSales = await query<{
    id: string;
    total_amount: number;
    amount_paid?: number;
    payment_status: string;
  }>(
    `SELECT id, total_amount, amount_paid, payment_status FROM sales
     WHERE customer_id = ? AND payment_status IN ('pending', 'partial', 'refunded', 'partially_refunded')
       AND (payment_status IN ('pending', 'partial') OR payment_method IN ('credit', 'mixed'))
       AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
     ORDER BY created_at ASC`,
    storeId ? [customerId, storeId] : [customerId],
  );

  let remaining = amount;
  for (const sale of pendingSales) {
    if (remaining <= 0) break;
    const owed = (sale.total_amount || 0) - (sale.amount_paid || 0);
    if (owed <= 0) continue;

    const applied = Math.min(owed, remaining);
    const newAmountPaid = Math.round(((sale.amount_paid || 0) + applied) * 100) / 100;
    const isFullySettled = newAmountPaid >= sale.total_amount - MONEY_EPSILON;
    // A sale already marked 'refunded'/'partially_refunded' carries
    // information the Refunded tab/badge (pos-transaction-history.tsx,
    // transaction-item.tsx) key off of - overwriting it to
    // 'completed'/'partial' here would silently erase that a return ever
    // happened, even though this payment only settled the sale's remaining
    // (unforgiven) debt. Leave those statuses alone; only 'pending'/'partial'
    // sales get the normal completed/partial transition.
    const wasRefundStatus =
      sale.payment_status === "refunded" || sale.payment_status === "partially_refunded";
    const newStatus = wasRefundStatus
      ? sale.payment_status
      : isFullySettled
        ? "completed"
        : "partial";

    await update("sales", sale.id, {
      amount_paid: newAmountPaid,
      payment_status: newStatus,
    });

    remaining -= applied;
  }
}

/** Single source of truth for recording a customer debt payment: used by
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
  // The payment receipt, the balance reduction, and the FIFO settlement of
  // individual sales must land together: without a transaction, a throw
  // partway through (e.g. inside applyCreditPaymentFIFO's per-sale update
  // loop) could leave the balance already reduced and a payment receipt
  // already recorded while the underlying sales stay pending/partial - the
  // debtor ledger and the per-sale settlement then permanently disagree,
  // and the next payment re-settles sales that were already paid for.
  return transaction(async () => {
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
    const rawNewBalance = currentBalance - amount;
    const newBalance = rawNewBalance <= MONEY_EPSILON ? 0 : Math.round(rawNewBalance * 100) / 100;
    await update("customers", customerId, { outstanding_balance: newBalance });

    await applyCreditPaymentFIFO(customerId, amount);

    return newBalance;
  });
}

export async function getAllCustomers(): Promise<Customer[]> {
  const storeId = getActiveStoreId();
  const items = await query<CustomerDbRow>(
    `SELECT * FROM customers WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""} ORDER BY first_name ASC`,
    storeId ? [storeId] : [],
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

/**
 * Purchase-engagement metrics over the trailing 30 days, restricted to sales
 * that carry a customer_id (walk-in/anonymous sales are excluded from every
 * numerator and denominator here).
 *
 * The returned field names are historical; what they actually measure is:
 *  - `retentionRate`: customers with more than one sale inside the 30-day
 *    window / customers with at least one sale inside it, as a percentage.
 *    This is a repeat-purchase rate *within a single window* - it says nothing
 *    about retention of a prior cohort or of the store's customer base, so the
 *    UI labels it "Repeat Purchase Rate" (same resolution as the dashboard
 *    tile in lib/hooks/use-bi-data.ts). Computing true retention would need a
 *    cohort/baseline definition this app does not have, so the calculation is
 *    deliberately left as-is and only described accurately.
 *  - `avgVisits`: sales in the window / customers who bought in the window,
 *    i.e. visits per *buying* customer over ~one month. Not per registered
 *    customer, and not store-wide visits - hence "Avg Visits/Customer".
 *  - `avgTransactionValue`: net revenue (refunds deducted) / sales in the
 *    window.
 */
export async function getCustomerRetentionMetrics() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFilter = thirtyDaysAgo.toISOString();
  const storeId = getActiveStoreId();

  const data = await query<{
    total_customers_purchased?: number;
    returning_customers?: number;
    total_visits?: number;
    total_revenue?: number;
  }>(`
    SELECT
      COUNT(DISTINCT customer_id) as total_customers_purchased,
      COUNT(DISTINCT CASE WHEN cnt > 1 THEN customer_id END) as returning_customers,
      SUM(cnt) as total_visits,
      SUM(total_spent) as total_revenue
    FROM (
      SELECT customer_id, COUNT(*) as cnt, SUM(
        total_amount - COALESCE(
          (SELECT SUM(r.total_refunded) FROM returns r WHERE r.sale_id = sales.id AND (r._deleted = 0 OR r._deleted IS NULL)),
          0
        )
      ) as total_spent
      FROM sales
      WHERE transaction_date >= ? AND (_deleted = 0 OR _deleted IS NULL) AND customer_id IS NOT NULL${storeId ? " AND store_id = ?" : ""}
      GROUP BY customer_id
    )
  `, storeId ? [dateFilter, storeId] : [dateFilter]);

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

export async function deleteCustomer(id: string) {
  return await softDelete("customers", id);
}
