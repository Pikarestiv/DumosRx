import { query } from "@/lib/db";
import { getLocalTodayDate } from "@/lib/utils";

export async function getDashboardOverviewData(userId?: string, isRestrictedRole?: boolean) {
  const userFilter = isRestrictedRole && userId ? ` AND user_id = '${userId}'` : "";
  const userFilterAliasS = isRestrictedRole && userId ? ` AND s.user_id = '${userId}'` : "";
  const today = getLocalTodayDate();

  const salesToday = await query<any>(
    `SELECT 
      SUM(total_amount) as total, 
      COUNT(*) as count,
      SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash,
      SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END) as card,
      SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END) as debt
     FROM sales 
     WHERE date(transaction_date) = ? AND (_deleted = 0 OR _deleted IS NULL)${userFilter}`,
    [today]
  );

  const refundsToday = await query<any>(
    `SELECT 
      SUM(r.total_refunded) as total,
      SUM(CASE WHEN s.payment_method = 'cash' OR s.payment_method = 'mixed' THEN r.total_refunded ELSE 0 END) as cash,
      SUM(CASE WHEN s.payment_method = 'card' THEN r.total_refunded ELSE 0 END) as card,
      SUM(CASE WHEN s.payment_method = 'credit' THEN r.total_refunded ELSE 0 END) as debt
     FROM returns r
     JOIN sales s ON r.sale_id = s.id
     WHERE date(r.created_at) = ? AND (r._deleted = 0 OR r._deleted IS NULL)${userFilterAliasS}`,
    [today]
  );

  const recentSales = await query<any>(
    `SELECT * FROM sales WHERE _deleted = 0${userFilter} ORDER BY created_at DESC LIMIT 5`
  );

  const smFilter = isRestrictedRole && userId ? ` AND performed_by = '${userId}'` : "";
  const recentMovements = await query<any>(
    `SELECT * FROM stock_movements WHERE _deleted = 0${smFilter} ORDER BY created_at DESC LIMIT 5`
  );

  const poFilter = isRestrictedRole && userId ? ` AND ordered_by = '${userId}'` : "";
  const recentPurchaseOrders = await query<any>(
    `SELECT * FROM purchase_orders WHERE _deleted = 0${poFilter} ORDER BY created_at DESC LIMIT 5`
  );

  const expFilter = isRestrictedRole && userId ? ` AND user_id = '${userId}'` : "";
  const recentExpenses = await query<any>(
    `SELECT * FROM expenses WHERE _deleted = 0${expFilter} ORDER BY created_at DESC LIMIT 5`
  );

  const rxFilter = isRestrictedRole && userId ? ` AND user_id = '${userId}'` : "";
  const recentPrescriptions = await query<any>(
    `SELECT * FROM prescriptions WHERE _deleted = 0${rxFilter} ORDER BY created_at DESC LIMIT 5`
  );

  const allActivities = [
    ...(recentSales || []).map((s: any) => ({ ...s, activity_type: 'sale' })),
    ...(recentMovements || []).map((m: any) => ({ ...m, activity_type: 'stock_movement' })),
    ...(recentPurchaseOrders || []).map((po: any) => ({ ...po, activity_type: 'purchase_order' })),
    ...(recentExpenses || []).map((e: any) => ({ ...e, activity_type: 'expense' })),
    ...(recentPrescriptions || []).map((p: any) => ({ ...p, activity_type: 'prescription' }))
  ].sort((a, b) => {
    const timeA = new Date(a.created_at || a.date || a.transaction_date).getTime();
    const timeB = new Date(b.created_at || b.date || b.transaction_date).getTime();
    return timeB - timeA;
  }).slice(0, 10);

  const dateYesterday = new Date();
  dateYesterday.setDate(dateYesterday.getDate() - 1);
  const yesterday = `${dateYesterday.getFullYear()}-${String(dateYesterday.getMonth() + 1).padStart(2, '0')}-${String(dateYesterday.getDate()).padStart(2, '0')}`;

  const salesYesterday = await query<any>(
    `SELECT SUM(total_amount) as total FROM sales WHERE date(transaction_date) = ? AND (_deleted = 0 OR _deleted IS NULL)${userFilter}`,
    [yesterday]
  );

  const activeCategories = await query<any>(
    `SELECT COUNT(DISTINCT category_id) as count FROM products WHERE _deleted = 0`
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

  return query<Record<string, any>>(
    `SELECT
      s.transaction_number as "Transaction #",
      s.transaction_date as "Date",
      COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), 'Walk-in') as "Customer",
      s.payment_method as "Payment Method",
      s.subtotal as "Subtotal",
      s.tax_amount as "Tax",
      s.discount_total as "Discount",
      s.total_amount as "Total",
      s.payment_status as "Status"
     FROM sales s
     LEFT JOIN customers c ON s.customer_id = c.id
     WHERE ${where}
     ORDER BY s.transaction_date DESC`,
    params
  );
}

export async function fetchStockBatchReportData() {
  return query<Record<string, any>>(
    `SELECT
      m.name as "Product",
      m.generic_name as "Generic Name",
      m.dosage_form as "Form",
      m.strength as "Strength",
      SUM(inv.quantity) as "Stock Qty",
      m.reorder_level as "Reorder Level",
      inv.cost_price as "Cost Price",
      inv.selling_price as "Selling Price",
      SUM(inv.quantity * inv.cost_price) as "Stock Value",
      MIN(inv.expiry_date) as "Nearest Expiry"
     FROM stock_batches inv
     JOIN products m ON inv.product_id = m.id
     WHERE inv._deleted = 0 AND m._deleted = 0
     GROUP BY m.id
     ORDER BY m.name ASC`
  );
}

export async function getMonthlySalesData(dateFilter: string) {
  const result = await query<any>(
    `SELECT
      strftime('%Y-%m', transaction_date) as month,
      SUM(total_amount) as sales,
      SUM(total_amount) * 0.8 as profit 
     FROM sales
     WHERE transaction_date >= ? AND _deleted = 0
     GROUP BY strftime('%Y-%m', transaction_date)
     ORDER BY month ASC`,
    [dateFilter]
  );
  return result;
}

export async function getBIMetrics(dateFilter: string, prevDateFilter: string) {
  // Current Period
  const revenueData = await query<{ total: number }>(`SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND (_deleted = 0 OR _deleted IS NULL)`, [dateFilter]);
  const totalRefundsData = await query<{ total: number }>(`SELECT SUM(total_refunded) as total FROM returns WHERE created_at >= ? AND (_deleted = 0 OR _deleted IS NULL)`, [dateFilter]);
  const cogsData = await query<{ total: number }>(`SELECT SUM(si.cost_price * si.quantity) as total FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND (s._deleted = 0 OR s._deleted IS NULL)`, [dateFilter]);
  const returnedCogsData = await query<{ total: number }>(`SELECT SUM(ri.quantity * IFNULL((SELECT AVG(cost_price) FROM stock_batches WHERE product_id = m.id AND is_active = 1), 0)) as total FROM return_items ri JOIN returns r ON ri.return_id = r.id LEFT JOIN products m ON ri.product_id = m.id WHERE r.created_at >= ? AND (r._deleted = 0 OR r._deleted IS NULL)`, [dateFilter]);
  const expensesData = await query<{ total: number }>(`SELECT SUM(amount) as total FROM expenses WHERE date >= ? AND _deleted = 0`, [dateFilter]);
  const transactionData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND _deleted = 0`, [dateFilter]);
  const stock_batchValueData = await query<{ value: number }>(`SELECT SUM(inv.cost_price * inv.quantity) as value FROM stock_batches inv WHERE inv._deleted = 0 OR inv._deleted IS NULL`);
  const customerData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE _deleted = 0`);
  const loyaltyData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE loyalty_points > 0 AND _deleted = 0`);
  const retentionData = await query<{ returning: number; total: number }>(`SELECT COUNT(DISTINCT CASE WHEN cnt > 1 THEN customer_id END) as returning, COUNT(DISTINCT customer_id) as total FROM (SELECT customer_id, COUNT(*) as cnt FROM sales WHERE transaction_date >= ? AND _deleted = 0 AND customer_id IS NOT NULL GROUP BY customer_id)`, [dateFilter]);

  // Previous Period
  const prevRevenueData = await query<{ total: number }>(`SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND _deleted = 0`, [prevDateFilter, dateFilter]);
  const prevTransactionData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND _deleted = 0`, [prevDateFilter, dateFilter]);
  const prevCustomerData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE created_at >= ? AND created_at < ? AND _deleted = 0`, [prevDateFilter, dateFilter]);

  // Top Selling Products & Categories
  const topSellingByRevenue = await query<{ name: string; sales: number; units: number; category: string; }>(`SELECT m.name, SUM(si.total_price) as sales, SUM(si.quantity) as units, COALESCE(c.name, 'Uncategorized') as category FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s._deleted = 0 GROUP BY m.id ORDER BY sales DESC LIMIT 5`, [dateFilter]);
  const topSellingByQuantity = await query<{ name: string; sales: number; units: number; category: string; }>(`SELECT m.name, SUM(si.total_price) as sales, SUM(si.quantity) as units, COALESCE(c.name, 'Uncategorized') as category FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s._deleted = 0 GROUP BY m.id ORDER BY units DESC LIMIT 5`, [dateFilter]);
  const categoryDistribution = await query<{ name: string; value: number; }>(`SELECT COALESCE(c.name, 'Uncategorized') as name, SUM(si.total_price) as value FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s._deleted = 0 GROUP BY COALESCE(c.name, 'Uncategorized')`, [dateFilter]);

  return {
    revenueData, totalRefundsData, cogsData, returnedCogsData, expensesData,
    transactionData, stock_batchValueData, customerData, loyaltyData, retentionData,
    prevRevenueData, prevTransactionData, prevCustomerData,
    topSellingByRevenue, topSellingByQuantity, categoryDistribution
  };
}

export async function getAdvancedMonthlySalesData(dateFilter: string) {
  const rawMonthlyData = await query<{ month: string; revenue: number; cogs: number; transactions: number; }>(
    `SELECT strftime('%Y-%m', s.transaction_date) as month, SUM(s.total_amount) as revenue, SUM(si.cost_price * si.quantity) as cogs, COUNT(DISTINCT s.id) as transactions FROM sales s LEFT JOIN sale_items si ON s.id = si.sale_id WHERE s.transaction_date >= ? AND (s._deleted = 0 OR s._deleted IS NULL) GROUP BY strftime('%Y-%m', s.transaction_date) ORDER BY strftime('%Y-%m', s.transaction_date) ASC`, [dateFilter]
  );

  const rawMonthlyReturns = await query<{ month: string; refunds: number; returned_cogs: number; }>(
    `SELECT strftime('%Y-%m', r.created_at) as month, SUM(r.total_refunded) as refunds, SUM(ri.quantity * IFNULL((SELECT AVG(cost_price) FROM stock_batches WHERE product_id = m.id AND is_active = 1), 0)) as returned_cogs FROM returns r LEFT JOIN return_items ri ON ri.return_id = r.id LEFT JOIN products m ON ri.product_id = m.id WHERE r.created_at >= ? AND (r._deleted = 0 OR r._deleted IS NULL) GROUP BY strftime('%Y-%m', r.created_at) ORDER BY strftime('%Y-%m', r.created_at) ASC`, [dateFilter]
  );

  const rawExpenseData = await query<{ month: string; expenses: number; }>(
    `SELECT strftime('%Y-%m', date) as month, SUM(amount) as expenses FROM expenses WHERE date >= ? AND _deleted = 0 GROUP BY strftime('%Y-%m', date)`, [dateFilter]
  );

  return { rawMonthlyData, rawMonthlyReturns, rawExpenseData };
}

export async function getPurchasePatterns(dateFilter: string) {
  const timeSlotData = await query<{ slot: string; transactions: number; avg_value: number; }>(
    `SELECT CASE WHEN CAST(strftime('%H', transaction_date) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', transaction_date) AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', transaction_date) AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END as slot, COUNT(*) as transactions, AVG(total_amount) as avg_value FROM sales WHERE transaction_date >= ? AND _deleted = 0 GROUP BY slot ORDER BY MIN(strftime('%H', transaction_date)) ASC`, [dateFilter]
  );
  
  const slotCategoryData = await query<{ slot: string; category: string; }>(
    `SELECT slot, category FROM (SELECT CASE WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END as slot, COALESCE(c.name, 'General') as category, COUNT(*) as cnt, ROW_NUMBER() OVER (PARTITION BY CASE WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', s.transaction_date) AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END ORDER BY COUNT(*) DESC) as rn FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s._deleted = 0 GROUP BY slot, c.name) WHERE rn = 1`, [dateFilter]
  );

  return { timeSlotData, slotCategoryData };
}

export async function fetchProfitLossReportData(dateFrom?: string, dateTo?: string) {
  const params: string[] = [];
  let where = "s._deleted = 0";
  if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }

  const salesRows = await query<Record<string, any>>(
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

  const expRows = await query<Record<string, any>>(
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
  return query<Record<string, any>>(
    `SELECT
      c.first_name || ' ' || COALESCE(c.last_name, '') as "Name",
      c.phone as "Phone",
      c.email as "Email",
      c.loyalty_points as "Loyalty Points",
      c.outstanding_balance as "Outstanding Balance",
      c.credit_limit as "Credit Limit",
      COUNT(s.id) as "Total Purchases",
      SUM(s.total_amount) as "Total Spent",
      MAX(s.transaction_date) as "Last Purchase"
     FROM customers c
     LEFT JOIN sales s ON s.customer_id = c.id AND s._deleted = 0
     WHERE c._deleted = 0
     GROUP BY c.id
     ORDER BY SUM(s.total_amount) DESC NULLS LAST`
  );
}

export async function fetchExpensesReportData(dateFrom?: string, dateTo?: string) {
  const params: string[] = [];
  let where = "_deleted = 0";
  if (dateFrom) { where += " AND date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND date <= ?"; params.push(dateTo); }

  return query<Record<string, any>>(
    `SELECT
      date as "Date",
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
