import { query } from "@/lib/db";
import { getActiveStoreId } from "@/lib/db/core";
import {
  salesFilterClause,
  getSmoothedExpensesByMonth,
  type SalesFilters,
} from "./report-helpers";

export async function getAdvancedMonthlySalesData(dateFilter: string, toFilter?: string, filters?: SalesFilters) {
  const storeId = getActiveStoreId();
  // Upper bound of the range, capped at "now" like every other report query (getBIMetrics's `to`) - without this the chart ignored the selected…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L660
  const now = new Date().toISOString();
  const to = toFilter && toFilter < now ? toFilter : now;
  const p1 = storeId ? [dateFilter, to, storeId] : [dateFilter, to];
  const joined = salesFilterClause(filters, "s.");
  const p1Joined = [...p1, ...joined.params];

  // Note: SUM(si.cost_price * si.quantity) alongside SUM(s.total_amount) in one query double-counts total_amount/tax_amount once per sale_items…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L670
  const rawMonthlySales = await query<{ month: string; revenue: number; tax: number; transactions: number; }>(
    `SELECT strftime('%Y-%m', s.transaction_date, 'localtime') as month, SUM(s.total_amount) as revenue, SUM(s.tax_amount) as tax, COUNT(*) as transactions FROM sales s WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY strftime('%Y-%m', s.transaction_date, 'localtime') ORDER BY strftime('%Y-%m', s.transaction_date, 'localtime') ASC`, p1Joined
  );
  const rawMonthlyCogs = await query<{ month: string; cogs: number; }>(
    `SELECT strftime('%Y-%m', s.transaction_date, 'localtime') as month, SUM(si.cost_price * si.quantity) as cogs FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY strftime('%Y-%m', s.transaction_date, 'localtime')`, p1Joined
  );
  const rawMonthlyData = rawMonthlySales.map((s) => ({
    ...s,
    cogs: rawMonthlyCogs.find((c) => c.month === s.month)?.cogs || 0,
  }));

  // SPLIT IN TWO, for exactly the reason rawMonthlySales/rawMonthlyCogs above are:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L686
  const rawMonthlyRefunds = await query<{ month: string; refunds: number; }>(
    `SELECT strftime('%Y-%m', r.created_at, 'localtime') as month, SUM(CASE WHEN s.total_amount IS NOT NULL AND s.total_amount != 0 THEN r.total_refunded * (s.total_amount - IFNULL(s.tax_amount, 0)) / s.total_amount ELSE r.total_refunded END) as refunds FROM returns r LEFT JOIN sales s ON s.id = r.sale_id WHERE r.created_at >= ? AND r.created_at <= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause} GROUP BY strftime('%Y-%m', r.created_at, 'localtime') ORDER BY strftime('%Y-%m', r.created_at, 'localtime') ASC`, p1Joined
  );
  // See the matching comment on returnedCogsData in getBIMetrics above:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L700
  const rawMonthlyReturnedCogs = await query<{ month: string; returned_cogs: number; }>(
    `SELECT strftime('%Y-%m', r.created_at, 'localtime') as month, SUM(ri.quantity * IFNULL(si.avg_cost_price, 0)) as returned_cogs FROM return_items ri JOIN returns r ON ri.return_id = r.id LEFT JOIN sales s ON s.id = r.sale_id LEFT JOIN (SELECT sale_id, product_id, SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) as avg_cost_price FROM sale_items GROUP BY sale_id, product_id) si ON si.sale_id = r.sale_id AND si.product_id = ri.product_id WHERE r.created_at >= ? AND r.created_at <= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause} GROUP BY strftime('%Y-%m', r.created_at, 'localtime')`, p1Joined
  );
  // Merged by month in JS, the same way rawMonthlyData merges its two halves.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L707
  const returnMonths = Array.from(
    new Set([
      ...rawMonthlyRefunds.map((r) => r.month),
      ...rawMonthlyReturnedCogs.map((r) => r.month),
    ]),
  ).sort();
  const rawMonthlyReturns = returnMonths.map((month) => ({
    month,
    refunds: rawMonthlyRefunds.find((r) => r.month === month)?.refunds || 0,
    returned_cogs: rawMonthlyReturnedCogs.find((r) => r.month === month)?.returned_cogs || 0,
  }));

  // Smoothed, not a raw SUM(amount) per month - see getSmoothedExpensesByMonth.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L722
  const monthlyExpensesFilterable = !filters?.staffId && !filters?.paymentMethod;
  // Capped at the same `to` as every sales/refund query above (the selected range's end, never later than "now"):
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L728
  const expensesByMonth = monthlyExpensesFilterable
    ? await getSmoothedExpensesByMonth(dateFilter, to)
    : new Map<string, number>();
  const rawExpenseData = Array.from(expensesByMonth.entries())
    .map(([month, expenses]) => ({ month, expenses }))
    .sort((a, b) => a.month.localeCompare(b.month));

  return { rawMonthlyData, rawMonthlyReturns, rawExpenseData };
}

export async function getPurchasePatterns(dateFilter: string, filters?: SalesFilters) {
  const storeId = getActiveStoreId();
  const p1 = storeId ? [dateFilter, storeId] : [dateFilter];
  const bare = salesFilterClause(filters, "");
  const joined = salesFilterClause(filters, "s.");
  const p1Bare = [...p1, ...bare.params];
  const p1Joined = [...p1, ...joined.params];

  const timeSlotData = await query<{ slot: string; transactions: number; avg_value: number; }>(
    `SELECT CASE WHEN CAST(strftime('%H', transaction_date, 'localtime') AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', transaction_date, 'localtime') AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', transaction_date, 'localtime') AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END as slot, COUNT(*) as transactions, AVG(total_amount) as avg_value FROM sales WHERE transaction_date >= ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}${bare.clause} GROUP BY slot ORDER BY MIN(strftime('%H', transaction_date, 'localtime')) ASC`, p1Bare
  );

  // Products joined unfiltered on purpose, so a deleted product still carries its
  // category here: client/AGENTS.md, pinned by deleted-product-report-history.test.ts.
  const slotCategoryData = await query<{ slot: string; category: string; }>(
    `SELECT slot, category FROM (SELECT CASE WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END as slot, COALESCE(c.name, 'General') as category, COUNT(*) as cnt, ROW_NUMBER() OVER (PARTITION BY CASE WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END ORDER BY COUNT(*) DESC) as rn FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY slot, c.name) WHERE rn = 1`, p1Joined
  );

  return { timeSlotData, slotCategoryData };
}
