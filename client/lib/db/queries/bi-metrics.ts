import { query } from "@/lib/db";
import { getActiveStoreId } from "@/lib/db/core";
import {
  getSmoothedExpensesTotal,
  getStockLossTotal,
} from "@/lib/db/queries/finance";
import { salesFilterClause, type SalesFilters } from "./report-helpers";

// @param dateFilter - inclusive lower bound of the selected period.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-reports-L454
export async function getBIMetrics(
  dateFilter: string,
  prevDateFilter: string,
  filters?: SalesFilters,
  toFilter?: string,
) {
  const storeId = getActiveStoreId();
  const sPrev = storeId ? [prevDateFilter, dateFilter, storeId] : [prevDateFilter, dateFilter];
  const storeOnly = storeId ? [storeId] : [];
  // Bare-table queries (FROM sales, no alias) vs.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L431
  const bare = salesFilterClause(filters, "");
  const joined = salesFilterClause(filters, "s.");
  const sPrevBare = [...sPrev, ...bare.params];
  // Refunds/returned-COGS are filtered through the return's ORIGINAL SALE (returns has no payment_method of its own, and its user_id is whoever…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L439
  const sPrevJoined = [...sPrev, ...joined.params];

  // Upper bound of the current period:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L447
  const now = new Date().toISOString();
  const to = toFilter && toFilter < now ? toFilter : now;
  const s1BareCapped = storeId
    ? [dateFilter, to, storeId, ...bare.params]
    : [dateFilter, to, ...bare.params];
  const s1JoinedCapped = storeId
    ? [dateFilter, to, storeId, ...joined.params]
    : [dateFilter, to, ...joined.params];
  const s1Capped = storeId ? [dateFilter, to, storeId] : [dateFilter, to];
  const s1CappedJoined = [...s1Capped, ...joined.params];

  // Every read below is independent of the others, so they all go out at once rather than one await at a time - same shape as getCurrentMonthRev…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L462
  const [
    revenueData,
    grossSalesData,
    taxData,
    totalRefundsData,
    cogsData,
    returnedCogsData,
    smoothedExpensesTotal,
    stockLossTotal,
    transactionData,
    stock_batchValueData,
    customerData,
    loyaltyData,
    retentionData,
    prevRevenueData,
    prevTaxData,
    prevRefundsData,
    prevTransactionData,
    prevCustomerData,
    topSellingByRevenue,
    topSellingByQuantity,
    categoryDistribution,
    productPerformance,
    cashierPerformance,
  ] = await Promise.all([
    // Current Period
    query<{ total: number }>(`SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, s1BareCapped),

    // Gross Sales: list-price total before any discount, tax, or refund - subtotal is captured pre-discount at sale time (see pos-calculations.ts:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L493
    query<{ total: number }>(`SELECT SUM(subtotal) as total FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, s1BareCapped),

    // Tax collected is pass-through, not real business revenue - subtracted out of total_amount to get Net Sales (see getBIMetrics's totalRevenue…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L498
    query<{ total: number }>(`SELECT SUM(tax_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, s1BareCapped),

    // EX-VAT refunds. r.total_refunded is VAT-INCLUSIVE (calculateProportionalRefund in pos-calculations.ts bakes the refunded line's tax share in…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L503
    query<{ total: number }>(`SELECT SUM(CASE WHEN s.total_amount IS NOT NULL AND s.total_amount != 0 THEN r.total_refunded * (s.total_amount - IFNULL(s.tax_amount, 0)) / s.total_amount ELSE r.total_refunded END) as total FROM returns r LEFT JOIN sales s ON s.id = r.sale_id WHERE r.created_at >= ? AND r.created_at <= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause}`, s1CappedJoined),

    query<{ total: number }>(`SELECT SUM(si.cost_price * si.quantity) as total FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause}`, s1JoinedCapped),

    // Uses the cost_price recorded on the original sale_items row, not a recomputed current-stock average - the product's cost basis can change be…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L519
    query<{ total: number }>(`SELECT SUM(ri.quantity * IFNULL(si.avg_cost_price, 0)) as total FROM return_items ri JOIN returns r ON ri.return_id = r.id LEFT JOIN sales s ON s.id = r.sale_id LEFT JOIN (SELECT sale_id, product_id, SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) as avg_cost_price FROM sale_items GROUP BY sale_id, product_id) si ON si.sale_id = r.sale_id AND si.product_id = ri.product_id WHERE r.created_at >= ? AND r.created_at <= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause}`, s1CappedJoined),

    // Smoothed, not a raw SUM:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L534
    getSmoothedExpensesTotal({
      from: dateFilter,
      to,
    }),

    // Not staff/payment-method filterable for the same reason expenses aren't (see the JUDGEMENT CALL note on fetchProfitLossReportData):
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L543
    getStockLossTotal({ from: dateFilter, to }),

    query<{ count: number }>(`SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, s1BareCapped),

    // Matches getStockBatchStats/fetchStockBatchReportData's scoping - see
    // client/AGENTS.md "Three places compute inventory/stock value".
    query<{ value: number }>(
      `SELECT SUM(inv.quantity * inv.cost_price) as value FROM products m JOIN stock_batches inv ON inv.product_id = m.id WHERE (inv._deleted = 0 OR inv._deleted IS NULL) AND (m._deleted = 0 OR m._deleted IS NULL)${storeId ? " AND m.store_id = ? AND inv.store_id = ?" : ""}`,
      storeId ? [storeId, storeId] : [],
    ),

    query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}`, storeOnly),

    query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE loyalty_points > 0 AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`, storeOnly),

    query<{ returning_count: number; total: number }>(`SELECT COUNT(DISTINCT CASE WHEN cnt > 1 THEN customer_id END) as returning_count, COUNT(DISTINCT customer_id) as total FROM (SELECT customer_id, COUNT(*) as cnt FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL) AND customer_id IS NOT NULL${storeId ? " AND store_id = ?" : ""} GROUP BY customer_id)`, s1Capped),

    // Previous Period
    query<{ total: number }>(`SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, sPrevBare),

    // The previous period's tax and refunds, so the revenue-change and avg-transaction-change percentages compare like with like.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L566
    query<{ total: number }>(`SELECT SUM(tax_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, sPrevBare),

    // Ex-VAT, exactly like totalRefundsData above - the baseline has to be the
    // same definition as the current period's netSales it's compared against.
    query<{ total: number }>(`SELECT SUM(CASE WHEN s.total_amount IS NOT NULL AND s.total_amount != 0 THEN r.total_refunded * (s.total_amount - IFNULL(s.tax_amount, 0)) / s.total_amount ELSE r.total_refunded END) as total FROM returns r LEFT JOIN sales s ON s.id = r.sale_id WHERE r.created_at >= ? AND r.created_at < ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause}`, sPrevJoined),

    query<{ count: number }>(`SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, sPrevBare),

    // The customer base as it stood at the start of the current period (i.e.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L580
    query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE created_at < ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`, storeId ? [dateFilter, storeId] : [dateFilter]),

    // Top Selling Products & Categories. Products joined unfiltered on purpose:
    // client/AGENTS.md, pinned by deleted-product-report-history.test.ts.
    query<{ name: string; sales: number; units: number; category: string; }>(`SELECT m.name, SUM(si.total_price) as sales, SUM(si.quantity) as units, COALESCE(c.name, 'Uncategorized') as category FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY m.id ORDER BY sales DESC LIMIT 5`, s1JoinedCapped),

    query<{ name: string; sales: number; units: number; category: string; }>(`SELECT m.name, SUM(si.total_price) as sales, SUM(si.quantity) as units, COALESCE(c.name, 'Uncategorized') as category FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY m.id ORDER BY units DESC LIMIT 5`, s1JoinedCapped),

    query<{ name: string; value: number; }>(`SELECT COALESCE(c.name, 'Uncategorized') as name, SUM(si.total_price) as value FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY COALESCE(c.name, 'Uncategorized')`, s1JoinedCapped),

    // Full product performance (not top-N):
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L596
    query<{
      id: string;
      name: string;
      category: string;
      revenue: number;
      units: number;
      cost: number;
    }>(
      `SELECT m.id, m.name, COALESCE(c.name, 'Uncategorized') as category,
         SUM(si.total_price) as revenue, SUM(si.quantity) as units,
         SUM(si.cost_price * si.quantity) as cost
       FROM sale_items si
       -- Unfiltered products join on purpose: a deleted product must still name
       -- its history (client/AGENTS.md; deleted-product-report-history.test.ts).
       JOIN products m ON si.product_id = m.id
       LEFT JOIN categories c ON m.category_id = c.id
       JOIN sales s ON si.sale_id = s.id
       WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause}
       GROUP BY m.id
       ORDER BY revenue DESC`,
      s1JoinedCapped,
    ),

    // Per-cashier performance:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L624
    query<{
      id: string;
      name: string;
      transactionCount: number;
      totalSales: number;
    }>(
      `SELECT u.id, TRIM(u.first_name || ' ' || u.last_name) as name,
         COUNT(*) as transactionCount, SUM(s.total_amount) as totalSales
       FROM sales s
       JOIN users u ON u.id = s.user_id
       WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause}
       GROUP BY u.id
       ORDER BY totalSales DESC`,
      s1JoinedCapped,
    ),
  ]);

  const expensesData = [{ total: smoothedExpensesTotal }];
  const stockLossData = [{ total: stockLossTotal }];

  return {
    revenueData, grossSalesData, taxData, totalRefundsData, cogsData, returnedCogsData, expensesData,
    stockLossData,
    transactionData, stock_batchValueData, customerData, loyaltyData, retentionData,
    prevRevenueData, prevTaxData, prevRefundsData, prevTransactionData, prevCustomerData,
    topSellingByRevenue, topSellingByQuantity, categoryDistribution,
    productPerformance, cashierPerformance
  };
}
