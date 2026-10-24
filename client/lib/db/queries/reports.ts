import { query } from "@/lib/db";
import { getActiveStoreId } from "@/lib/db/core";
import {
  salesFilterClause,
  getSmoothedExpensesByMonth,
  type SalesFilters,
} from "./report-helpers";

export { getDashboardOverviewData } from "./dashboard-overview";
export type { SalesFilters } from "./report-helpers";
export { getBIMetrics } from "./bi-metrics";
export { getAdvancedMonthlySalesData, getPurchasePatterns } from "./report-trends";

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
