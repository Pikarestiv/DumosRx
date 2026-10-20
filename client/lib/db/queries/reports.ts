import { query } from "@/lib/db";
import { getActiveStoreId } from "@/lib/db/core";
import { getLocalTodayDate } from "@/lib/utils";
import type { DashboardActivity } from "@/lib/types/dashboard-activity";
import type { SaleWithDetails } from "@/lib/types/sale";
import type { StockMovementHistoryRow } from "@/lib/types/stock-movement";
import { HIDDEN_MOVEMENT_TYPES, HIDDEN_MOVEMENT_TYPES_SQL } from "@/lib/db/movement-types";
import type { PurchaseOrder } from "@/lib/db/procurement";
import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import {
  getSmoothedExpensesTotal,
  getSmoothedAmountInWindow,
  getStockLossTotal,
} from "@/lib/db/queries/finance";
import type { Expense } from "@/lib/db/queries/finance";
import { parseLocalDateOnly } from "@/lib/utils/date-utils";
import type { PrescriptionRow } from "@/lib/types/prescription";

export interface SalesFilters {
  staffId?: string;
  paymentMethod?: string;
}

// Builds the " AND alias.user_id = ? AND alias.payment_method = ?" tail (plus matching params, in the same order) shared by every report/BI qu…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-reports-ts-L24
function salesFilterClause(filters: SalesFilters | undefined, alias: "" | "s.") {
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
async function getSmoothedExpensesByMonth(
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

// @param viewerId - when provided, restricts the recent-activity feed (sales, stock movements, purchase orders, expenses, prescriptions) to en…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-reports-ts-L117
export async function getDashboardOverviewData(viewerId?: string) {
  const today = getLocalTodayDate();
  const storeId = getActiveStoreId();

  const dateYesterday = new Date();
  dateYesterday.setDate(dateYesterday.getDate() - 1);
  const yesterday = `${dateYesterday.getFullYear()}-${String(dateYesterday.getMonth() + 1).padStart(2, '0')}-${String(dateYesterday.getDate()).padStart(2, '0')}`;

  // None of the reads below depend on each other's results, so they go out together rather than one await at a time - the same shape as getCurre…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L125
  const [
    salesToday,
    refundsToday,
    recentSales,
    recentMovements,
    recentReturns,
    recentPurchaseOrders,
    recentExpenses,
    recentPrescriptions,
    recentProducts,
    salesYesterday,
    refundsYesterday,
    activeCategories,
  ] = await Promise.all([
    query<{
      total: number;
      count: number;
      cash: number;
      card: number;
      debt: number;
    }>(
      `SELECT
        SUM(total_amount) as total,
        COUNT(*) as count,
        SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash,
        SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END) as card,
        SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END) as debt
       FROM sales
       WHERE date(transaction_date, 'localtime') = ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`,
      storeId ? [today, storeId] : [today],
    ),

    query<{
      total: number;
      cash: number;
      card: number;
      debt: number;
    }>(
      `SELECT
        SUM(r.total_refunded) as total,
        SUM(CASE WHEN s.payment_method = 'cash' OR s.payment_method = 'mixed' THEN r.total_refunded ELSE 0 END) as cash,
        SUM(CASE WHEN s.payment_method = 'card' THEN r.total_refunded ELSE 0 END) as card,
        SUM(CASE WHEN s.payment_method = 'credit' THEN r.total_refunded ELSE 0 END) as debt
       FROM returns r
       JOIN sales s ON r.sale_id = s.id
       WHERE date(r.created_at, 'localtime') = ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}`,
      storeId ? [today, storeId] : [today],
    ),

    query<SaleWithDetails>(
      `SELECT s.*, TRIM(u.first_name || ' ' || u.last_name) as cashier_name
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s._deleted = 0${viewerId ? " AND s.user_id = ?" : ""}${storeId ? " AND s.store_id = ?" : ""}
       ORDER BY s.created_at DESC LIMIT 5`,
      [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
    ),

    // Excludes movements already represented by their own richer feed entry below (a sale's stock deduction, a PO's receipt, a return's restock);…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L186
    query<StockMovementHistoryRow>(
      `SELECT sm.*, TRIM(u.first_name || ' ' || u.last_name) as performed_by_name
       FROM stock_movements sm
       LEFT JOIN users u ON u.id = sm.performed_by
       WHERE sm._deleted = 0
         AND (sm.reference_type IS NULL OR sm.reference_type NOT IN ('sale', 'purchase_order', 'return'))
         AND sm.movement_type NOT IN ${HIDDEN_MOVEMENT_TYPES_SQL}
         ${viewerId ? " AND sm.performed_by = ?" : ""}${storeId ? " AND sm.store_id = ?" : ""}
       ORDER BY sm.created_at DESC LIMIT 5`,
      [...HIDDEN_MOVEMENT_TYPES, ...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
    ),

    query<{
      id: string;
      sale_id: string;
      reason?: string;
      total_refunded: number;
      created_at: string;
      transaction_number?: string;
    }>(
      `SELECT r.*, s.transaction_number
       FROM returns r
       LEFT JOIN sales s ON s.id = r.sale_id
       WHERE r._deleted = 0${viewerId ? " AND r.user_id = ?" : ""}${storeId ? " AND r.store_id = ?" : ""}
       ORDER BY r.created_at DESC LIMIT 5`,
      [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
    ),

    query<PurchaseOrder>(
      `SELECT po.*, TRIM(u.first_name || ' ' || u.last_name) as ordered_by_name
       FROM purchase_orders po
       LEFT JOIN users u ON u.id = po.ordered_by
       WHERE po._deleted = 0${viewerId ? " AND po.ordered_by = ?" : ""}${storeId ? " AND po.store_id = ?" : ""}
       ORDER BY po.created_at DESC LIMIT 5`,
      [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
    ),

    query<Expense>(
      `SELECT e.*, TRIM(u.first_name || ' ' || u.last_name) as recorded_by_name
       FROM expenses e
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e._deleted = 0${viewerId ? " AND e.user_id = ?" : ""}${storeId ? " AND e.store_id = ?" : ""}
       ORDER BY e.created_at DESC LIMIT 5`,
      [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
    ),

    query<PrescriptionRow>(
      `SELECT p.*, TRIM(u.first_name || ' ' || u.last_name) as created_by_name
       FROM prescriptions p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p._deleted = 0${viewerId ? " AND p.user_id = ?" : ""}${storeId ? " AND p.store_id = ?" : ""}
       ORDER BY p.created_at DESC LIMIT 5`,
      [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
    ),

    // Products have no creator/user column, so unlike every other feed source above, this can't be scoped to the viewer's own actions - skip it en…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L248
    viewerId
      ? Promise.resolve(
          [] as {
            id: string;
            name: string;
            selling_price?: number;
            created_at: string;
          }[],
        )
      : query<{
          id: string;
          name: string;
          selling_price?: number;
          created_at: string;
        }>(
          `SELECT id, name, selling_price, created_at
           FROM products
           WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}
           ORDER BY created_at DESC LIMIT 5`,
          storeId ? [storeId] : [],
        ),

    query<{ total?: number }>(
      `SELECT SUM(total_amount) as total FROM sales WHERE date(transaction_date, 'localtime') = ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`,
      storeId ? [yesterday, storeId] : [yesterday],
    ),

    // Yesterday's refunds, so the dashboard's "x% vs yesterday" comparison divides a net-of-refunds today by a net-of-refunds yesterday.
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L279
    query<{ total?: number }>(
      `SELECT SUM(r.total_refunded) as total
       FROM returns r
       WHERE date(r.created_at, 'localtime') = ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}`,
      storeId ? [yesterday, storeId] : [yesterday],
    ),

    query<{ count?: number }>(
      `SELECT COUNT(DISTINCT category_id) as count FROM products WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}`,
      storeId ? [storeId] : [],
    ),
  ]);

  const allActivities: DashboardActivity[] = [
    ...(recentSales || []).map((s): DashboardActivity => ({ ...s, activity_type: 'sale' })),
    ...(recentMovements || []).map((m): DashboardActivity => ({ ...m, activity_type: 'stock_movement' })),
    ...(recentReturns || []).map((r): DashboardActivity => ({ ...r, activity_type: 'return' })),
    ...(recentPurchaseOrders || []).map((po): DashboardActivity => ({ ...po, activity_type: 'purchase_order' })),
    ...(recentExpenses || []).map((e): DashboardActivity => ({ ...e, activity_type: 'expense' })),
    ...(recentPrescriptions || []).map((p): DashboardActivity => ({ ...p, activity_type: 'prescription' })),
    ...(recentProducts || []).map((p): DashboardActivity => ({ ...p, activity_type: 'product' }))
  ].sort((a, b) => {
    const timeA = new Date(a.created_at || a.date || a.transaction_date || 0).getTime();
    const timeB = new Date(b.created_at || b.date || b.transaction_date || 0).getTime();
    return timeB - timeA;
  }).slice(0, 10);

  return {
    salesToday: salesToday[0] || { total: 0, count: 0, cash: 0, card: 0, debt: 0 },
    refundsToday: refundsToday[0] || { total: 0, cash: 0, card: 0, debt: 0 },
    salesYesterday: salesYesterday[0] || { total: 0 },
    refundsYesterday: refundsYesterday[0] || { total: 0 },
    activeCategories: activeCategories[0]?.count || 0,
    recentSales: recentSales || [],
    recentActivities: allActivities || []
  };
}

export async function fetchSalesReportData(dateFrom?: string, dateTo?: string, filters?: SalesFilters) {
  const params: string[] = [];
  let where = "s._deleted = 0";
  if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }
  const storeId = getActiveStoreId();
  if (storeId) { where += " AND s.store_id = ?"; params.push(storeId); }
  const extra = salesFilterClause(filters, "s.");
  where += extra.clause; params.push(...extra.params);

  return query<Record<string, unknown>>(
    `SELECT
      s.transaction_number as "Transaction #",
      date(s.transaction_date, 'localtime') as "Date",
      COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), 'Walk-in') as "Customer",
      TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')) as "Cashier",
      s.payment_method as "Payment Method",
      s.subtotal as "Subtotal",
      s.tax_amount as "Tax",
      s.discount_total as "Discount",
      s.total_amount as "Total",
      COALESCE(r.refunded, 0) as "Refunded",
      s.total_amount - COALESCE(r.refunded, 0) as "Net Total",
      s.payment_status as "Status"
     FROM sales s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN users u ON s.user_id = u.id
     LEFT JOIN (
       SELECT sale_id, SUM(total_refunded) as refunded
       FROM returns
       WHERE _deleted = 0
       GROUP BY sale_id
     ) r ON r.sale_id = s.id
     WHERE ${where}
     ORDER BY s.transaction_date DESC`,
    params
  );
}

export async function fetchStockBatchReportData() {
  const storeId = getActiveStoreId();
  return query<Record<string, unknown>>(
    `SELECT
      m.name as "Product",
      m.generic_name as "Generic Name",
      m.dosage_form as "Form",
      m.strength as "Strength",
      SUM(inv.quantity) as "Stock Qty",
      m.reorder_level as "Reorder Level",
      SUM(inv.quantity * inv.cost_price) * 1.0 / NULLIF(SUM(inv.quantity), 0) as "Cost Price",
      m.selling_price as "Selling Price",
      SUM(inv.quantity * inv.cost_price) as "Stock Value",
      MIN(date(inv.expiry_date)) as "Nearest Expiry"
     FROM stock_batches inv
     JOIN products m ON inv.product_id = m.id
     WHERE inv._deleted = 0 AND m._deleted = 0${storeId ? " AND m.store_id = ? AND inv.store_id = ?" : ""}
     GROUP BY m.id
     ORDER BY m.name ASC`,
    storeId ? [storeId, storeId] : [],
  );
}

// Ranked by revenue, not quantity:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-reports-ts-L396
export async function fetchTopSellersReportData(dateFrom?: string, dateTo?: string, filters?: SalesFilters) {
  const params: string[] = [];
  let where = "s._deleted = 0 AND (si._deleted = 0 OR si._deleted IS NULL)";
  if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }
  const storeId = getActiveStoreId();
  if (storeId) { where += " AND s.store_id = ?"; params.push(storeId); }
  const extra = salesFilterClause(filters, "s.");
  where += extra.clause; params.push(...extra.params);

  return query<Record<string, unknown>>(
    `SELECT
      p.name as "Product",
      c.name as "Category",
      SUM(si.quantity) as "Qty Sold",
      SUM(si.total_price) as "Revenue",
      ROUND(SUM(si.total_price) * 1.0 / NULLIF(SUM(si.quantity), 0), 2) as "Avg Price"
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     -- Unfiltered products join on purpose: a deleted product must still name
     -- its history (client/AGENTS.md; deleted-product-report-history.test.ts).
     JOIN products p ON si.product_id = p.id
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE ${where}
     GROUP BY p.id
     ORDER BY "Revenue" DESC
     LIMIT 50`,
    params
  );
}

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

export async function fetchProfitLossReportData(dateFrom?: string, dateTo?: string, filters?: SalesFilters) {
  const params: string[] = [];
  // Permissive (OR IS NULL), matching retWhere below:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L766
  let where = "(s._deleted = 0 OR s._deleted IS NULL)";
  if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }
  const storeId = getActiveStoreId();
  if (storeId) { where += " AND s.store_id = ?"; params.push(storeId); }
  const extra = salesFilterClause(filters, "s.");
  where += extra.clause; params.push(...extra.params);

  // Revenue and COGS are aggregated in separate queries rather than one query joined to sale_items:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L778
  const revenueRows = await query<Record<string, unknown>>(
    `SELECT
      strftime('%Y-%m', s.transaction_date, 'localtime') as "Month",
      SUM(s.total_amount - IFNULL(s.tax_amount, 0)) as "Revenue"
     FROM sales s
     WHERE ${where}
     GROUP BY strftime('%Y-%m', s.transaction_date, 'localtime')
     ORDER BY 1 ASC`,
    params
  );
  const cogsRows = await query<{ Month: string; COGS: number }>(
    `SELECT
      strftime('%Y-%m', s.transaction_date, 'localtime') as "Month",
      SUM(si.cost_price * si.quantity) as "COGS"
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE ${where}
     GROUP BY strftime('%Y-%m', s.transaction_date, 'localtime')`,
    params
  );
  // Returns/refunds, netted out of Revenue and COGS the same way every other revenue surface in this codebase does (useBIData's netSales/totalCo…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L809
  const retParams: string[] = [];
  let retWhere = "(r._deleted = 0 OR r._deleted IS NULL)";
  if (dateFrom) { retWhere += " AND r.created_at >= ?"; retParams.push(dateFrom); }
  if (dateTo) { retWhere += " AND r.created_at <= ?"; retParams.push(dateTo); }
  if (storeId) { retWhere += " AND r.store_id = ?"; retParams.push(storeId); }
  // Same staff/payment-method filter as the revenue side, applied through the return's ORIGINAL SALE:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L824
  retWhere += extra.clause; retParams.push(...extra.params);

  // r.total_refunded is VAT-INCLUSIVE (calculateProportionalRefund in pos-calculations.ts bakes the refunded line's tax share into it), while Re…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L832
  const refundRows = await query<{ Month: string; refunds: number }>(
    `SELECT strftime('%Y-%m', r.created_at, 'localtime') as "Month",
       SUM(
         CASE WHEN s.total_amount IS NOT NULL AND s.total_amount != 0
           THEN r.total_refunded * (s.total_amount - IFNULL(s.tax_amount, 0)) / s.total_amount
           ELSE r.total_refunded
         END
       ) as refunds
     FROM returns r
     LEFT JOIN sales s ON s.id = r.sale_id
     WHERE ${retWhere}
     GROUP BY strftime('%Y-%m', r.created_at, 'localtime')`,
    retParams
  );
  // See returnedCogsData in getBIMetrics:
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L857
  const returnedCogsRows = await query<{ Month: string; returned_cogs: number }>(
    `SELECT strftime('%Y-%m', r.created_at, 'localtime') as "Month",
       SUM(ri.quantity * IFNULL(sic.avg_cost_price, 0)) as returned_cogs
     FROM return_items ri
     JOIN returns r ON ri.return_id = r.id
     LEFT JOIN sales s ON s.id = r.sale_id
     LEFT JOIN (SELECT sale_id, product_id, SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) as avg_cost_price FROM sale_items GROUP BY sale_id, product_id) sic
       ON sic.sale_id = r.sale_id AND sic.product_id = ri.product_id
     WHERE ${retWhere}
     GROUP BY strftime('%Y-%m', r.created_at, 'localtime')`,
    retParams
  );

  // Expenses, amortized (see getSmoothedExpensesByMonth) rather than a raw SUM(amount), so this agrees with the BI dashboard's expense figure.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L873
  const expensesFilterable = !filters?.staffId && !filters?.paymentMethod;
  const expensesByMonth = expensesFilterable
    ? await getSmoothedExpensesByMonth(dateFrom, dateTo)
    : new Map<string, number>();

  // Every month with ANY financial activity gets a row - revenue, refunds, or expenses.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L892
  const months = Array.from(
    new Set<string>([
      ...revenueRows.map((r) => String(r["Month"])),
      ...cogsRows.map((r) => String(r.Month)),
      ...refundRows.map((r) => String(r.Month)),
      ...returnedCogsRows.map((r) => String(r.Month)),
      ...expensesByMonth.keys(),
    ]),
  ).sort();

  return months.map((month) => {
    const grossRevenue = Number(
      revenueRows.find((r) => String(r["Month"]) === month)?.["Revenue"] || 0,
    );
    const refunds = Number(refundRows.find((r) => r.Month === month)?.refunds || 0);
    const grossCogs = Number(cogsRows.find((c) => c.Month === month)?.COGS || 0);
    const returnedCogs = Number(
      returnedCogsRows.find((c) => c.Month === month)?.returned_cogs || 0,
    );
    const exp = expensesByMonth.get(month) || 0;

    const revenue = grossRevenue - refunds;
    const cogs = grossCogs - returnedCogs;
    const gross = revenue - cogs;
    const net = gross - exp;
    return {
      "Month": month,
      "Revenue": revenue.toFixed(2),
      "COGS": cogs.toFixed(2),
      "Gross Profit": gross.toFixed(2),
      "Expenses": Number(exp).toFixed(2),
      "Net Profit": net.toFixed(2),
      "Margin %": revenue > 0 ? ((net / revenue) * 100).toFixed(1) + "%" : "0%",
    };
  });
}

export async function fetchCustomerReportData() {
  const storeId = getActiveStoreId();
  return query<Record<string, unknown>>(
    `SELECT
      c.first_name || ' ' || COALESCE(c.last_name, '') as "Name",
      c.phone as "Phone",
      c.email as "Email",
      c.loyalty_points as "Loyalty Points",
      c.outstanding_balance as "Outstanding Balance",
      c.credit_limit as "Credit Limit",
      COUNT(s.id) as "Total Purchases",
      COALESCE(SUM(
        s.total_amount - COALESCE(
          (SELECT SUM(r.total_refunded) FROM returns r WHERE r.sale_id = s.id AND (r._deleted = 0 OR r._deleted IS NULL)),
          0
        )
      ), 0) as "Total Spent",
      MAX(date(s.transaction_date, 'localtime')) as "Last Purchase"
     FROM customers c
     LEFT JOIN sales s ON s.customer_id = c.id AND s._deleted = 0${storeId ? " AND s.store_id = ?" : ""}
     WHERE c._deleted = 0${storeId ? " AND c.store_id = ?" : ""}
     GROUP BY c.id
     ORDER BY "Total Spent" DESC`,
    storeId ? [storeId, storeId] : [],
  );
}

export async function fetchExpensesReportData(dateFrom?: string, dateTo?: string) {
  const params: string[] = [];
  let where = "_deleted = 0";
  // See getSmoothedExpensesByMonth's comment above for why 'localtime' is needed here, not just bare date(?):
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-reports-ts-L963
  if (dateFrom) { where += " AND date(date) >= date(?, 'localtime')"; params.push(dateFrom); }
  if (dateTo) { where += " AND date(date) <= date(?, 'localtime')"; params.push(dateTo); }
  const storeId = getActiveStoreId();
  if (storeId) { where += " AND store_id = ?"; params.push(storeId); }

  return query<Record<string, unknown>>(
    `SELECT
      date(date) as "Date",
      category as "Category",
      description as "Description",
      vendor_name as "Vendor",
      amount as "Amount",
      payment_method as "Payment Method",
      reference_number as "Reference"
     FROM expenses
     WHERE ${where}
     ORDER BY date DESC`,
    params
  );
}
