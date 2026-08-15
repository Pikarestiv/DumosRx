import { query } from "@/lib/db";
import { getActiveStoreId } from "@/lib/db/core";
import { getLocalTodayDate } from "@/lib/utils";
import type { DashboardActivity } from "@/lib/types/dashboard-activity";
import type { SaleWithDetails } from "@/lib/types/sale";
import type { StockMovementHistoryRow } from "@/lib/types/stock-movement";
import type { PurchaseOrder } from "@/lib/db/procurement";
import { getSmoothedExpensesTotal } from "@/lib/db/queries/finance";
import type { Expense } from "@/lib/db/queries/finance";
import type { PrescriptionRow } from "@/lib/types/prescription";

/** @param viewerId - when provided, restricts the recent-activity feed (sales,
 * stock movements, purchase orders, expenses, prescriptions) to entries
 * performed by this user (pass undefined for viewers allowed to see everyone's
 * activity, i.e. checkCanViewAllActivity(role) === true). Today's revenue/
 * refund totals are NOT scoped by this — those stay store-wide regardless of
 * role, since cashiers need accurate shift/till totals for reconciliation.
 * Product-catalog additions are also unscoped by viewerId — products have no
 * creator/user column, unlike the other feed sources. */
export async function getDashboardOverviewData(viewerId?: string) {
  const today = getLocalTodayDate();
  const storeId = getActiveStoreId();

  const salesToday = await query<{
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
     WHERE date(transaction_date) = ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [today, storeId] : [today],
  );

  const refundsToday = await query<{
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
     WHERE date(r.created_at) = ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}`,
    storeId ? [today, storeId] : [today],
  );

  const recentSales = await query<SaleWithDetails>(
    `SELECT s.*, TRIM(u.first_name || ' ' || u.last_name) as cashier_name
     FROM sales s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s._deleted = 0${viewerId ? " AND s.user_id = ?" : ""}${storeId ? " AND s.store_id = ?" : ""}
     ORDER BY s.created_at DESC LIMIT 5`,
    [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
  );

  // Excludes movements already represented by their own richer feed entry
  // below (a sale's stock deduction, a PO's receipt, a return's restock) —
  // otherwise every one of those events produced two feed rows for the same
  // action, one showing revenue/refund and one showing cost basis, with
  // nothing distinguishing them. Movements with no reference_type (manual
  // adjustments, stock audit reconciliation) have no other feed
  // representation, so they still show up here.
  const recentMovements = await query<StockMovementHistoryRow>(
    `SELECT sm.*, TRIM(u.first_name || ' ' || u.last_name) as performed_by_name
     FROM stock_movements sm
     LEFT JOIN users u ON u.id = sm.performed_by
     WHERE sm._deleted = 0
       AND (sm.reference_type IS NULL OR sm.reference_type NOT IN ('sale', 'purchase_order', 'return'))
       ${viewerId ? " AND sm.performed_by = ?" : ""}${storeId ? " AND sm.store_id = ?" : ""}
     ORDER BY sm.created_at DESC LIMIT 5`,
    [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
  );

  const recentReturns = await query<{
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
  );

  const recentPurchaseOrders = await query<PurchaseOrder>(
    `SELECT po.*, TRIM(u.first_name || ' ' || u.last_name) as ordered_by_name
     FROM purchase_orders po
     LEFT JOIN users u ON u.id = po.ordered_by
     WHERE po._deleted = 0${viewerId ? " AND po.ordered_by = ?" : ""}${storeId ? " AND po.store_id = ?" : ""}
     ORDER BY po.created_at DESC LIMIT 5`,
    [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
  );

  const recentExpenses = await query<Expense>(
    `SELECT e.*, TRIM(u.first_name || ' ' || u.last_name) as recorded_by_name
     FROM expenses e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e._deleted = 0${viewerId ? " AND e.user_id = ?" : ""}${storeId ? " AND e.store_id = ?" : ""}
     ORDER BY e.created_at DESC LIMIT 5`,
    [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
  );

  const recentPrescriptions = await query<PrescriptionRow>(
    `SELECT p.*, TRIM(u.first_name || ' ' || u.last_name) as created_by_name
     FROM prescriptions p
     LEFT JOIN users u ON u.id = p.user_id
     WHERE p._deleted = 0${viewerId ? " AND p.user_id = ?" : ""}${storeId ? " AND p.store_id = ?" : ""}
     ORDER BY p.created_at DESC LIMIT 5`,
    [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])],
  );

  const recentProducts = await query<{
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
  );

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

  const dateYesterday = new Date();
  dateYesterday.setDate(dateYesterday.getDate() - 1);
  const yesterday = `${dateYesterday.getFullYear()}-${String(dateYesterday.getMonth() + 1).padStart(2, '0')}-${String(dateYesterday.getDate()).padStart(2, '0')}`;

  const salesYesterday = await query<{ total?: number }>(
    `SELECT SUM(total_amount) as total FROM sales WHERE date(transaction_date) = ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [yesterday, storeId] : [yesterday],
  );

  const activeCategories = await query<{ count?: number }>(
    `SELECT COUNT(DISTINCT category_id) as count FROM products WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );

  return {
    salesToday: salesToday[0] || { total: 0, count: 0, cash: 0, card: 0, debt: 0 },
    refundsToday: refundsToday[0] || { total: 0, cash: 0, card: 0, debt: 0 },
    salesYesterday: salesYesterday[0] || { total: 0 },
    activeCategories: activeCategories[0]?.count || 0,
    recentSales: recentSales || [],
    recentActivities: allActivities || []
  };
}

export async function fetchSalesReportData(dateFrom?: string, dateTo?: string) {
  const params: string[] = [];
  let where = "s._deleted = 0";
  if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }
  const storeId = getActiveStoreId();
  if (storeId) { where += " AND s.store_id = ?"; params.push(storeId); }

  return query<Record<string, unknown>>(
    `SELECT
      s.transaction_number as "Transaction #",
      date(s.transaction_date) as "Date",
      COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), 'Walk-in') as "Customer",
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
      AVG(inv.cost_price) as "Cost Price",
      m.selling_price as "Selling Price",
      SUM(inv.quantity * inv.cost_price) as "Stock Value",
      MIN(date(inv.expiry_date)) as "Nearest Expiry"
     FROM stock_batches inv
     JOIN products m ON inv.product_id = m.id
     WHERE inv._deleted = 0 AND m._deleted = 0${storeId ? " AND m.store_id = ?" : ""}
     GROUP BY m.id
     ORDER BY m.name ASC`,
    storeId ? [storeId] : [],
  );
}

/** Ranked by revenue, not quantity — a product that sells a lot of cheap
 * units and one that sells fewer expensive units both matter to the
 * business, and revenue is the one number that makes them comparable.
 * Unlike getFastMovers() (inventory.ts — a fixed rolling-N-days window with
 * a week-over-week trend, capped at 5, for a small dashboard widget), this
 * takes an arbitrary date range for a full report. */
export async function fetchTopSellersReportData(dateFrom?: string, dateTo?: string) {
  const params: string[] = [];
  let where = "s._deleted = 0 AND (si._deleted = 0 OR si._deleted IS NULL)";
  if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }
  const storeId = getActiveStoreId();
  if (storeId) { where += " AND s.store_id = ?"; params.push(storeId); }

  return query<Record<string, unknown>>(
    `SELECT
      p.name as "Product",
      c.name as "Category",
      SUM(si.quantity) as "Qty Sold",
      SUM(si.total_price) as "Revenue",
      ROUND(SUM(si.total_price) * 1.0 / NULLIF(SUM(si.quantity), 0), 2) as "Avg Price"
     FROM sale_items si
     JOIN sales s ON si.sale_id = s.id
     JOIN products p ON si.product_id = p.id
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE ${where}
     GROUP BY p.id
     ORDER BY "Revenue" DESC
     LIMIT 50`,
    params
  );
}

export async function getBIMetrics(dateFilter: string, prevDateFilter: string) {
  const storeId = getActiveStoreId();
  const s1 = storeId ? [dateFilter, storeId] : [dateFilter];
  const sPrev = storeId ? [prevDateFilter, dateFilter, storeId] : [prevDateFilter, dateFilter];
  const storeOnly = storeId ? [storeId] : [];

  // Current Period
  const revenueData = await query<{ total: number }>(`SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`, s1);
  const totalRefundsData = await query<{ total: number }>(`SELECT SUM(total_refunded) as total FROM returns WHERE created_at >= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`, s1);
  const cogsData = await query<{ total: number }>(`SELECT SUM(si.cost_price * si.quantity) as total FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}`, s1);
  const returnedCogsData = await query<{ total: number }>(`SELECT SUM(ri.quantity * IFNULL((SELECT AVG(cost_price) FROM stock_batches WHERE product_id = m.id AND is_active = 1), 0)) as total FROM return_items ri JOIN returns r ON ri.return_id = r.id LEFT JOIN products m ON ri.product_id = m.id WHERE r.created_at >= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}`, s1);
  // Smoothed, not a raw SUM: a prepaid expense (covers_months set) is split
  // into equal calendar-month installments instead of hitting this whole
  // window as a lump sum wherever it happened to be logged. See
  // getSmoothedExpensesTotal for the "why".
  const smoothedExpensesTotal = await getSmoothedExpensesTotal({
    from: dateFilter,
    to: new Date().toISOString(),
  });
  const expensesData = [{ total: smoothedExpensesTotal }];
  const transactionData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`, s1);
  const stock_batchValueData = await query<{ value: number }>(`SELECT SUM(inv.cost_price * inv.quantity) as value FROM stock_batches inv WHERE (inv._deleted = 0 OR inv._deleted IS NULL)${storeId ? " AND inv.store_id = ?" : ""}`, storeOnly);
  const customerData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}`, storeOnly);
  const loyaltyData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE loyalty_points > 0 AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`, storeOnly);
  const retentionData = await query<{ returning_count: number; total: number }>(`SELECT COUNT(DISTINCT CASE WHEN cnt > 1 THEN customer_id END) as returning_count, COUNT(DISTINCT customer_id) as total FROM (SELECT customer_id, COUNT(*) as cnt FROM sales WHERE transaction_date >= ? AND _deleted = 0 AND customer_id IS NOT NULL${storeId ? " AND store_id = ?" : ""} GROUP BY customer_id)`, s1);

  // Previous Period
  const prevRevenueData = await query<{ total: number }>(`SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`, sPrev);
  const prevTransactionData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`, sPrev);
  const prevCustomerData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE created_at >= ? AND created_at < ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`, sPrev);

  // Top Selling Products & Categories
  const topSellingByRevenue = await query<{ name: string; sales: number; units: number; category: string; }>(`SELECT m.name, SUM(si.total_price) as sales, SUM(si.quantity) as units, COALESCE(c.name, 'Uncategorized') as category FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s._deleted = 0${storeId ? " AND s.store_id = ?" : ""} GROUP BY m.id ORDER BY sales DESC LIMIT 5`, s1);
  const topSellingByQuantity = await query<{ name: string; sales: number; units: number; category: string; }>(`SELECT m.name, SUM(si.total_price) as sales, SUM(si.quantity) as units, COALESCE(c.name, 'Uncategorized') as category FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s._deleted = 0${storeId ? " AND s.store_id = ?" : ""} GROUP BY m.id ORDER BY units DESC LIMIT 5`, s1);
  const categoryDistribution = await query<{ name: string; value: number; }>(`SELECT COALESCE(c.name, 'Uncategorized') as name, SUM(si.total_price) as value FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s._deleted = 0${storeId ? " AND s.store_id = ?" : ""} GROUP BY COALESCE(c.name, 'Uncategorized')`, s1);

  return {
    revenueData, totalRefundsData, cogsData, returnedCogsData, expensesData,
    transactionData, stock_batchValueData, customerData, loyaltyData, retentionData,
    prevRevenueData, prevTransactionData, prevCustomerData,
    topSellingByRevenue, topSellingByQuantity, categoryDistribution
  };
}

export async function getAdvancedMonthlySalesData(dateFilter: string) {
  const storeId = getActiveStoreId();
  const p1 = storeId ? [dateFilter, storeId] : [dateFilter];

  const rawMonthlyData = await query<{ month: string; revenue: number; cogs: number; transactions: number; }>(
    `SELECT strftime('%Y-%m', s.transaction_date) as month, SUM(s.total_amount) as revenue, SUM(si.cost_price * si.quantity) as cogs, COUNT(DISTINCT s.id) as transactions FROM sales s LEFT JOIN sale_items si ON s.id = si.sale_id WHERE s.transaction_date >= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""} GROUP BY strftime('%Y-%m', s.transaction_date) ORDER BY strftime('%Y-%m', s.transaction_date) ASC`, p1
  );

  const rawMonthlyReturns = await query<{ month: string; refunds: number; returned_cogs: number; }>(
    `SELECT strftime('%Y-%m', r.created_at) as month, SUM(r.total_refunded) as refunds, SUM(ri.quantity * IFNULL((SELECT AVG(cost_price) FROM stock_batches WHERE product_id = m.id AND is_active = 1), 0)) as returned_cogs FROM returns r LEFT JOIN return_items ri ON ri.return_id = r.id LEFT JOIN products m ON ri.product_id = m.id WHERE r.created_at >= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""} GROUP BY strftime('%Y-%m', r.created_at) ORDER BY strftime('%Y-%m', r.created_at) ASC`, p1
  );

  const rawExpenseData = await query<{ month: string; expenses: number; }>(
    `SELECT strftime('%Y-%m', date) as month, SUM(amount) as expenses FROM expenses WHERE date >= ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""} GROUP BY strftime('%Y-%m', date)`, p1
  );

  return { rawMonthlyData, rawMonthlyReturns, rawExpenseData };
}

export async function getPurchasePatterns(dateFilter: string) {
  const storeId = getActiveStoreId();
  const p1 = storeId ? [dateFilter, storeId] : [dateFilter];

  const timeSlotData = await query<{ slot: string; transactions: number; avg_value: number; }>(
    `SELECT CASE WHEN CAST(strftime('%H', transaction_date) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', transaction_date) AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', transaction_date) AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END as slot, COUNT(*) as transactions, AVG(total_amount) as avg_value FROM sales WHERE transaction_date >= ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""} GROUP BY slot ORDER BY MIN(strftime('%H', transaction_date)) ASC`, p1
  );

  const slotCategoryData = await query<{ slot: string; category: string; }>(
    `SELECT slot, category FROM (SELECT CASE WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END as slot, COALESCE(c.name, 'General') as category, COUNT(*) as cnt, ROW_NUMBER() OVER (PARTITION BY CASE WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END ORDER BY COUNT(*) DESC) as rn FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s._deleted = 0${storeId ? " AND s.store_id = ?" : ""} GROUP BY slot, c.name) WHERE rn = 1`, p1
  );

  return { timeSlotData, slotCategoryData };
}

export async function fetchProfitLossReportData(dateFrom?: string, dateTo?: string) {
  const params: string[] = [];
  let where = "s._deleted = 0";
  if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }
  const storeId = getActiveStoreId();
  if (storeId) { where += " AND s.store_id = ?"; params.push(storeId); }

  const salesRows = await query<Record<string, unknown>>(
    `SELECT
      strftime('%Y-%m', s.transaction_date) as "Month",
      SUM(s.total_amount) as "Revenue",
      SUM(si.cost_price * si.quantity) as "COGS"
     FROM sales s
     LEFT JOIN sale_items si ON s.id = si.sale_id
     WHERE ${where}
     GROUP BY strftime('%Y-%m', s.transaction_date)
     ORDER BY 1 ASC`,
    params
  );

  const expParams: string[] = [];
  let expWhere = "_deleted = 0";
  if (dateFrom) { expWhere += " AND date >= ?"; expParams.push(dateFrom); }
  if (dateTo) { expWhere += " AND date <= ?"; expParams.push(dateTo); }
  if (storeId) { expWhere += " AND store_id = ?"; expParams.push(storeId); }

  const expRows = await query<{ month: string; expenses?: number }>(
    `SELECT strftime('%Y-%m', date) as month, SUM(amount) as expenses
     FROM expenses WHERE ${expWhere}
     GROUP BY strftime('%Y-%m', date)`,
    expParams
  );

  return salesRows.map((r) => {
    const exp = expRows.find((e) => e.month === r["Month"])?.expenses || 0;
    const revenue = Number(r["Revenue"] || 0);
    const cogs = Number(r["COGS"] || 0);
    const gross = revenue - cogs;
    const net = gross - exp;
    return {
      "Month": r["Month"],
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
      SUM(s.total_amount) as "Total Spent",
      MAX(date(s.transaction_date)) as "Last Purchase"
     FROM customers c
     LEFT JOIN sales s ON s.customer_id = c.id AND s._deleted = 0
     WHERE c._deleted = 0${storeId ? " AND c.store_id = ?" : ""}
     GROUP BY c.id
     ORDER BY SUM(s.total_amount) DESC NULLS LAST`,
    storeId ? [storeId] : [],
  );
}

export async function fetchExpensesReportData(dateFrom?: string, dateTo?: string) {
  const params: string[] = [];
  let where = "_deleted = 0";
  if (dateFrom) { where += " AND date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND date <= ?"; params.push(dateTo); }
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
