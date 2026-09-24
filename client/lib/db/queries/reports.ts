import { query } from "@/lib/db";
import { getActiveStoreId } from "@/lib/db/core";
import { getLocalTodayDate } from "@/lib/utils";
import type { DashboardActivity } from "@/lib/types/dashboard-activity";
import type { SaleWithDetails } from "@/lib/types/sale";
import type { StockMovementHistoryRow } from "@/lib/types/stock-movement";
import type { PurchaseOrder } from "@/lib/db/procurement";
import { addMonths, startOfMonth, endOfMonth } from "date-fns";
import { getSmoothedExpensesTotal, getSmoothedAmountInWindow } from "@/lib/db/queries/finance";
import type { Expense } from "@/lib/db/queries/finance";
import { parseLocalDateOnly } from "@/lib/utils/date-utils";
import type { PrescriptionRow } from "@/lib/types/prescription";

export interface SalesFilters {
  staffId?: string;
  paymentMethod?: string;
}

/** Builds the " AND alias.user_id = ? AND alias.payment_method = ?" tail
 * (plus matching params, in the same order) shared by every report/BI query
 * that aggregates the `sales` table - alias is "" for queries that select
 * FROM sales with no alias, or "s." for queries that join it as `s`. */
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

/**
 * Expenses per calendar month for a report window, SMOOTHED the same way
 * getSmoothedExpensesTotal/getCurrentMonthExpensesByCategory smooth them:
 * a prepaid expense (`covers_months` set) is recognised as equal calendar-
 * month installments from its own date rather than as a lump sum in the
 * single month it happened to be logged. A raw SUM(amount) per month (what
 * the P&L and the monthly analytics chart both used to do) disagreed with
 * the BI dashboard's expense figure - which already smooths - for the same
 * period, and made a month that merely happened to contain the annual rent
 * payment look catastrophically unprofitable.
 *
 * Reuses getSmoothedAmountInWindow() per installment rather than
 * reimplementing the proration, so the two can't drift apart. Each
 * installment's window is its own calendar month, CLIPPED to the report
 * range, so a range that only partially covers a month recognises only that
 * fraction of the installment.
 *
 * The returned map's keys are every month with any expense activity in the
 * window, including months whose only activity is an installment of an
 * expense logged long before the window - so a caller building a monthly
 * report can union these months with its revenue months and never drop an
 * expense-only month.
 */
async function getSmoothedExpensesByMonth(
  dateFrom?: string,
  dateTo?: string,
): Promise<Map<string, number>> {
  const storeId = getActiveStoreId();
  const params: string[] = [];
  // date() on both sides: expenses.date is a date-only "YYYY-MM-DD" column,
  // but dateFrom/dateTo (toQueryRange()) are full ISO timestamps like
  // "2026-09-21T00:00:00.000Z" - a plain string compare made
  // '2026-09-21' >= '2026-09-21T00:00:00.000Z' false, silently dropping
  // every expense dated exactly on the range's first day.
  let where = "_deleted = 0 AND (covers_months IS NULL OR covers_months <= 0)";
  if (dateFrom) { where += " AND date(date) >= date(?)"; params.push(dateFrom); }
  if (dateTo) { where += " AND date(date) <= date(?)"; params.push(dateTo); }
  if (storeId) { where += " AND store_id = ?"; params.push(storeId); }

  const plainRows = await query<{ month: string; expenses?: number }>(
    `SELECT strftime('%Y-%m', date) as month, SUM(amount) as expenses
     FROM expenses WHERE ${where}
     GROUP BY strftime('%Y-%m', date)`,
    params,
  );

  // Fetched unconditionally by date, not windowed - same rationale as
  // getSmoothedExpensesTotal: a prepaid expense logged well before this
  // window can still have unrecognised installments falling inside it.
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

/** @param viewerId - when provided, restricts the recent-activity feed (sales,
 * stock movements, purchase orders, expenses, prescriptions) to entries
 * performed by this user (pass undefined for viewers allowed to see everyone's
 * activity, i.e. checkCanViewAllActivity(role) === true). Today's revenue/
 * refund totals are NOT scoped by this: those stay store-wide regardless of
 * role, since cashiers need accurate shift/till totals for reconciliation.
 * Product-catalog additions have no creator/user column to scope by, so a
 * scoped viewer sees none of that feed source rather than everyone else's
 * additions. */
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
     WHERE date(transaction_date, 'localtime') = ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`,
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
     WHERE date(r.created_at, 'localtime') = ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}`,
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
  // below (a sale's stock deduction, a PO's receipt, a return's restock);
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

  // Products have no creator/user column, so unlike every other feed source
  // above, this can't be scoped to the viewer's own actions - skip it
  // entirely for a scoped viewer rather than showing everyone else's
  // catalog additions (e.g. a cashier seeing products the store owner added).
  const recentProducts = viewerId
    ? []
    : await query<{
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
    `SELECT SUM(total_amount) as total FROM sales WHERE date(transaction_date, 'localtime') = ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [yesterday, storeId] : [yesterday],
  );

  // Yesterday's refunds, so the dashboard's "x% vs yesterday" comparison
  // divides a net-of-refunds today by a net-of-refunds yesterday. Today's
  // side (salesToday - refundsToday, see use-dashboard-overview.ts) has
  // always netted refunds out; without this the denominator was gross
  // revenue, so a day with any refund at all reported a fake drop (or a
  // muted rise) against yesterday. Same date basis as refundsToday above:
  // the return's own created_at, i.e. refunds *issued* yesterday, not
  // refunds against sales made yesterday.
  const refundsYesterday = await query<{ total?: number }>(
    `SELECT SUM(r.total_refunded) as total
     FROM returns r
     WHERE date(r.created_at, 'localtime') = ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}`,
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

/** Ranked by revenue, not quantity: a product that sells a lot of cheap
 * units and one that sells fewer expensive units both matter to the
 * business, and revenue is the one number that makes them comparable.
 * Unlike getFastMovers() (inventory.ts: a fixed rolling-N-days window with
 * a week-over-week trend, capped at 5, for a small dashboard widget), this
 * takes an arbitrary date range for a full report. */
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
     JOIN products p ON si.product_id = p.id
     LEFT JOIN categories c ON p.category_id = c.id
     WHERE ${where}
     GROUP BY p.id
     ORDER BY "Revenue" DESC
     LIMIT 50`,
    params
  );
}

/**
 * @param dateFilter - inclusive lower bound of the selected period.
 * @param prevDateFilter - lower bound of the previous-period comparison
 * window; its upper bound is `dateFilter` (see the prev-* queries below).
 * @param toFilter - inclusive UPPER bound of the selected period. Optional:
 * callers that genuinely want an open-ended "from X up to today" window
 * (the dashboard's default, and most tests) can leave it unset and get
 * "now". When it IS passed it is still capped at "now", so a range whose
 * end is in the future can't pull future-dated/clock-skewed sales into
 * revenue while the expense side (getSmoothedExpensesTotal) excludes them.
 */
export async function getBIMetrics(
  dateFilter: string,
  prevDateFilter: string,
  filters?: SalesFilters,
  toFilter?: string,
) {
  const storeId = getActiveStoreId();
  const sPrev = storeId ? [prevDateFilter, dateFilter, storeId] : [prevDateFilter, dateFilter];
  const storeOnly = storeId ? [storeId] : [];
  // Bare-table queries (FROM sales, no alias) vs. joined queries (FROM
  // sale_items si JOIN sales s) need the filter clause/params on different
  // sides of the alias, but both append after the dateFilter(+to)+storeId
  // params already in the capped variants below/sPrev, since that's where
  // they land in the WHERE text.
  const bare = salesFilterClause(filters, "");
  const joined = salesFilterClause(filters, "s.");
  const sPrevBare = [...sPrev, ...bare.params];
  // Refunds/returned-COGS are filtered through the return's ORIGINAL SALE
  // (returns has no payment_method of its own, and its user_id is whoever
  // processed the refund, not whoever made the sale) - so a staff- or
  // payment-method-filtered report nets out the refunds against that
  // staff member's / that method's sales, the same rows its revenue side
  // counts. Same alias as the other joined queries.
  const sPrevJoined = [...sPrev, ...joined.params];

  // Upper bound of the current period: the caller's selected range end when
  // given, otherwise "now" - and never later than "now" (see the @param
  // note above). This is also the upper bound getSmoothedExpensesTotal gets,
  // so revenue and expenses always cover the same window.
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

  // Current Period
  const revenueData = await query<{ total: number }>(`SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, s1BareCapped);
  // Gross Sales: list-price total before any discount, tax, or refund -
  // subtotal is captured pre-discount at sale time (see pos-calculations.ts:
  // total_amount = subtotal + tax_amount - discount_total).
  const grossSalesData = await query<{ total: number }>(`SELECT SUM(subtotal) as total FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, s1BareCapped);
  // Tax collected is pass-through, not real business revenue - subtracted
  // out of total_amount to get Net Sales (see getBIMetrics's totalRevenue
  // caller, use-bi-data.ts).
  const taxData = await query<{ total: number }>(`SELECT SUM(tax_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, s1BareCapped);
  const totalRefundsData = await query<{ total: number }>(`SELECT SUM(r.total_refunded) as total FROM returns r LEFT JOIN sales s ON s.id = r.sale_id WHERE r.created_at >= ? AND r.created_at <= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause}`, s1CappedJoined);
  const cogsData = await query<{ total: number }>(`SELECT SUM(si.cost_price * si.quantity) as total FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause}`, s1JoinedCapped);
  // Uses the cost_price recorded on the original sale_items row, not a
  // recomputed current-stock average - the product's cost basis can change
  // between the sale and the return, and averaging over current active
  // batches also silently reports 0 once a product has none left.
  // return_items has no sale_item_id column, so this joins on (sale_id,
  // product_id) - normally at-most-one-row per the POS cart's merge-
  // duplicates behavior, but a prescription dispense (one row per
  // instruction line) or an online-order fulfillment (one row per raw
  // payload item) can legitimately produce >1 sale_items row for the same
  // product within one sale. Pre-aggregating to a single quantity-weighted
  // average cost_price per (sale_id, product_id) before joining keeps this
  // correct in that case, instead of fanning the return_items row out
  // across every matching sale_items row and overcounting the total.
  const returnedCogsData = await query<{ total: number }>(`SELECT SUM(ri.quantity * IFNULL(si.avg_cost_price, 0)) as total FROM return_items ri JOIN returns r ON ri.return_id = r.id LEFT JOIN sales s ON s.id = r.sale_id LEFT JOIN (SELECT sale_id, product_id, SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) as avg_cost_price FROM sale_items GROUP BY sale_id, product_id) si ON si.sale_id = r.sale_id AND si.product_id = ri.product_id WHERE r.created_at >= ? AND r.created_at <= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause}`, s1CappedJoined);
  // Smoothed, not a raw SUM: a prepaid expense (covers_months set) is split
  // into equal calendar-month installments instead of hitting this whole
  // window as a lump sum wherever it happened to be logged. See
  // getSmoothedExpensesTotal for the "why".
  const smoothedExpensesTotal = await getSmoothedExpensesTotal({
    from: dateFilter,
    to,
  });
  const expensesData = [{ total: smoothedExpensesTotal }];
  const transactionData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, s1BareCapped);
  const stock_batchValueData = await query<{ value: number }>(`SELECT SUM(inv.cost_price * inv.quantity) as value FROM stock_batches inv WHERE (inv._deleted = 0 OR inv._deleted IS NULL)${storeId ? " AND inv.store_id = ?" : ""}`, storeOnly);
  const customerData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}`, storeOnly);
  const loyaltyData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE loyalty_points > 0 AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`, storeOnly);
  const retentionData = await query<{ returning_count: number; total: number }>(`SELECT COUNT(DISTINCT CASE WHEN cnt > 1 THEN customer_id END) as returning_count, COUNT(DISTINCT customer_id) as total FROM (SELECT customer_id, COUNT(*) as cnt FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND (_deleted = 0 OR _deleted IS NULL) AND customer_id IS NOT NULL${storeId ? " AND store_id = ?" : ""} GROUP BY customer_id)`, s1Capped);

  // Previous Period
  const prevRevenueData = await query<{ total: number }>(`SELECT SUM(total_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, sPrevBare);
  // The previous period's tax and refunds, so the revenue-change and
  // avg-transaction-change percentages compare like with like. The current
  // period's figure those are measured against is Net Sales (total_amount
  // minus tax minus refunds - see useBIData's netSales); leaving the
  // denominator as gross, tax-inclusive total_amount understated every
  // growth number by roughly the tax rate plus the refund rate.
  const prevTaxData = await query<{ total: number }>(`SELECT SUM(tax_amount) as total FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, sPrevBare);
  const prevRefundsData = await query<{ total: number }>(`SELECT SUM(r.total_refunded) as total FROM returns r LEFT JOIN sales s ON s.id = r.sale_id WHERE r.created_at >= ? AND r.created_at < ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause}`, sPrevJoined);
  const prevTransactionData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM sales WHERE transaction_date >= ? AND transaction_date < ? AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}${bare.clause}`, sPrevBare);
  // The customer base as it stood at the start of the current period (i.e.
  // every customer created before it), NOT just the customers created during
  // the previous window: the figure this is the baseline for is the
  // all-time "Total Customers" count, so a window-only denominator made the
  // card's "+x% vs last period" a nonsense ratio (all customers ever over
  // one window's new signups - routinely several hundred percent).
  const prevCustomerData = await query<{ count: number }>(`SELECT COUNT(*) as count FROM customers WHERE created_at < ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`, storeId ? [dateFilter, storeId] : [dateFilter]);

  // Top Selling Products & Categories
  const topSellingByRevenue = await query<{ name: string; sales: number; units: number; category: string; }>(`SELECT m.name, SUM(si.total_price) as sales, SUM(si.quantity) as units, COALESCE(c.name, 'Uncategorized') as category FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY m.id ORDER BY sales DESC LIMIT 5`, s1JoinedCapped);
  const topSellingByQuantity = await query<{ name: string; sales: number; units: number; category: string; }>(`SELECT m.name, SUM(si.total_price) as sales, SUM(si.quantity) as units, COALESCE(c.name, 'Uncategorized') as category FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY m.id ORDER BY units DESC LIMIT 5`, s1JoinedCapped);
  const categoryDistribution = await query<{ name: string; value: number; }>(`SELECT COALESCE(c.name, 'Uncategorized') as name, SUM(si.total_price) as value FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY COALESCE(c.name, 'Uncategorized')`, s1JoinedCapped);

  // Full product performance (not top-N): revenue/units/cost per product so
  // the UI can sort by any column and compute margin. Doesn't net returns
  // against a specific product, matching the existing top-selling queries
  // above (they don't either) - the store-wide returnedCogsData/refunds
  // above already cover the aggregate P&L correction.
  const productPerformance = await query<{
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
     JOIN products m ON si.product_id = m.id
     LEFT JOIN categories c ON m.category_id = c.id
     JOIN sales s ON si.sale_id = s.id
     WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause}
     GROUP BY m.id
     ORDER BY revenue DESC`,
    s1JoinedCapped,
  );

  // Per-cashier performance: mirrors productPerformance's shape/scope
  // (no refund netting, same as the rest of this dashboard's per-entity
  // breakdowns). Note: when filters.staffId is set this naturally narrows
  // to a single row - no separate UI change needed in the Staff tab.
  const cashierPerformance = await query<{
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
  );

  return {
    revenueData, grossSalesData, taxData, totalRefundsData, cogsData, returnedCogsData, expensesData,
    transactionData, stock_batchValueData, customerData, loyaltyData, retentionData,
    prevRevenueData, prevTaxData, prevRefundsData, prevTransactionData, prevCustomerData,
    topSellingByRevenue, topSellingByQuantity, categoryDistribution,
    productPerformance, cashierPerformance
  };
}

export async function getAdvancedMonthlySalesData(dateFilter: string, filters?: SalesFilters) {
  const storeId = getActiveStoreId();
  const p1 = storeId ? [dateFilter, storeId] : [dateFilter];
  const joined = salesFilterClause(filters, "s.");
  const p1Joined = [...p1, ...joined.params];

  // Note: SUM(si.cost_price * si.quantity) alongside SUM(s.total_amount) in
  // one query double-counts total_amount/tax_amount once per sale_items row
  // (the LEFT JOIN fans sales out per item) - split into two queries to
  // avoid that, matching the non-monthly getBIMetrics queries above which
  // already keep sales-level and sale_items-level aggregates separate.
  const rawMonthlySales = await query<{ month: string; revenue: number; tax: number; transactions: number; }>(
    `SELECT strftime('%Y-%m', s.transaction_date, 'localtime') as month, SUM(s.total_amount) as revenue, SUM(s.tax_amount) as tax, COUNT(*) as transactions FROM sales s WHERE s.transaction_date >= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY strftime('%Y-%m', s.transaction_date, 'localtime') ORDER BY strftime('%Y-%m', s.transaction_date, 'localtime') ASC`, p1Joined
  );
  const rawMonthlyCogs = await query<{ month: string; cogs: number; }>(
    `SELECT strftime('%Y-%m', s.transaction_date, 'localtime') as month, SUM(si.cost_price * si.quantity) as cogs FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.transaction_date >= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY strftime('%Y-%m', s.transaction_date, 'localtime')`, p1Joined
  );
  const rawMonthlyData = rawMonthlySales.map((s) => ({
    ...s,
    cogs: rawMonthlyCogs.find((c) => c.month === s.month)?.cogs || 0,
  }));

  // SPLIT IN TWO, for exactly the reason rawMonthlySales/rawMonthlyCogs above
  // are: SUM(r.total_refunded) (a returns-level figure) in the same query as
  // a LEFT JOIN to return_items fans each return out once per returned line
  // item, multiplying its refund total by its item count. A one-line return
  // hid the bug entirely; a two-line return doubled the month's refunds.
  const rawMonthlyRefunds = await query<{ month: string; refunds: number; }>(
    `SELECT strftime('%Y-%m', r.created_at, 'localtime') as month, SUM(r.total_refunded) as refunds FROM returns r LEFT JOIN sales s ON s.id = r.sale_id WHERE r.created_at >= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause} GROUP BY strftime('%Y-%m', r.created_at, 'localtime') ORDER BY strftime('%Y-%m', r.created_at, 'localtime') ASC`, p1Joined
  );
  // See the matching comment on returnedCogsData in getBIMetrics above: uses
  // the sale-time cost_price (pre-aggregated per (sale_id, product_id) to
  // stay correct when a sale has >1 sale_items row for the same product),
  // not a recomputed current-stock average.
  const rawMonthlyReturnedCogs = await query<{ month: string; returned_cogs: number; }>(
    `SELECT strftime('%Y-%m', r.created_at, 'localtime') as month, SUM(ri.quantity * IFNULL(si.avg_cost_price, 0)) as returned_cogs FROM return_items ri JOIN returns r ON ri.return_id = r.id LEFT JOIN sales s ON s.id = r.sale_id LEFT JOIN (SELECT sale_id, product_id, SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) as avg_cost_price FROM sale_items GROUP BY sale_id, product_id) si ON si.sale_id = r.sale_id AND si.product_id = ri.product_id WHERE r.created_at >= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}${joined.clause} GROUP BY strftime('%Y-%m', r.created_at, 'localtime')`, p1Joined
  );
  // Merged by month in JS, the same way rawMonthlyData merges its two halves.
  // Months are unioned: a month with a refund but no returned line items (or
  // vice versa) still gets a row, with 0 for the missing side.
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
  // Omitted entirely under a staff/payment-method filter, for the same reason
  // fetchProfitLossReportData omits them: an expense carries no attribution
  // that means the same thing as a sales filter, so charging one cashier's
  // revenue with the whole store's overhead would be worse than showing none.
  const monthlyExpensesFilterable = !filters?.staffId && !filters?.paymentMethod;
  // Capped at "now": with no dateTo, a prepaid expense's amortized
  // installments were emitted all the way out to its final covers_months
  // bucket regardless of whether that month has happened yet, so the chart
  // showed future months with an expense and zero revenue.
  const expensesByMonth = monthlyExpensesFilterable
    ? await getSmoothedExpensesByMonth(dateFilter, new Date().toISOString())
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

  const slotCategoryData = await query<{ slot: string; category: string; }>(
    `SELECT slot, category FROM (SELECT CASE WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END as slot, COALESCE(c.name, 'General') as category, COUNT(*) as cnt, ROW_NUMBER() OVER (PARTITION BY CASE WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 6 AND 11 THEN 'Morning (6am-12pm)' WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 12 AND 16 THEN 'Afternoon (12pm-5pm)' WHEN CAST(strftime('%H', s.transaction_date, 'localtime') AS INTEGER) BETWEEN 17 AND 21 THEN 'Evening (5pm-10pm)' ELSE 'Night (10pm-6am)' END ORDER BY COUNT(*) DESC) as rn FROM sale_items si JOIN products m ON si.product_id = m.id LEFT JOIN categories c ON m.category_id = c.id JOIN sales s ON si.sale_id = s.id WHERE s.transaction_date >= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}${joined.clause} GROUP BY slot, c.name) WHERE rn = 1`, p1Joined
  );

  return { timeSlotData, slotCategoryData };
}

export async function fetchProfitLossReportData(dateFrom?: string, dateTo?: string, filters?: SalesFilters) {
  const params: string[] = [];
  // Permissive (OR IS NULL), matching retWhere below: a strict "= 0" here
  // paired with the permissive returns clause meant a sale row with a NULL
  // _deleted was excluded from Revenue/COGS while its refund was still
  // subtracted, producing a negative-revenue month out of nothing.
  let where = "(s._deleted = 0 OR s._deleted IS NULL)";
  if (dateFrom) { where += " AND s.transaction_date >= ?"; params.push(dateFrom); }
  if (dateTo) { where += " AND s.transaction_date <= ?"; params.push(dateTo); }
  const storeId = getActiveStoreId();
  if (storeId) { where += " AND s.store_id = ?"; params.push(storeId); }
  const extra = salesFilterClause(filters, "s.");
  where += extra.clause; params.push(...extra.params);

  // Revenue and COGS are aggregated in separate queries rather than one
  // query joined to sale_items: a LEFT JOIN fans each sale out once per line
  // item, so SUM(s.total_amount) alongside a sale_items aggregate in the
  // same query double(/triple/...)-counts every multi-item sale's revenue by
  // its item count. Matches the pattern getAdvancedMonthlySalesData already
  // uses for the same reason.
  // Revenue excludes tax_amount: VAT/tax collected on the government's
  // behalf is a liability, not profit, and useBIData's netSales already
  // backs it out the same way - Revenue here previously included it,
  // inflating Gross/Net Profit and Margin % relative to the Analytics
  // dashboard for the same period.
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
  // Returns/refunds, netted out of Revenue and COGS the same way every other
  // revenue surface in this codebase does (useBIData's netSales/totalCogs,
  // getCurrentMonthRevenue): without them the exported P&L reported GROSS
  // revenue and gross COGS while the Analytics dashboard reported net, so
  // the two disagreed for the same period by the whole refund volume.
  // Windowed on the return's own created_at (refunds ISSUED in the period),
  // the same basis getBIMetrics uses.
  // Split into two queries - a returns-level SUM(total_refunded) must never
  // share a query with a return_items join, which fans it out once per
  // returned line item.
  const retParams: string[] = [];
  let retWhere = "(r._deleted = 0 OR r._deleted IS NULL)";
  if (dateFrom) { retWhere += " AND r.created_at >= ?"; retParams.push(dateFrom); }
  if (dateTo) { retWhere += " AND r.created_at <= ?"; retParams.push(dateTo); }
  if (storeId) { retWhere += " AND r.store_id = ?"; retParams.push(storeId); }
  // Same staff/payment-method filter as the revenue side, applied through the
  // return's ORIGINAL SALE: `returns` has no payment_method of its own, and
  // its user_id is whoever processed the refund rather than whoever made the
  // sale. A filtered P&L must filter every term that feeds it, not just
  // revenue - otherwise one cashier's report netted out the whole store's
  // refunds.
  retWhere += extra.clause; retParams.push(...extra.params);

  // r.total_refunded is VAT-INCLUSIVE (calculateProportionalRefund in
  // pos-calculations.ts bakes the refunded line's tax share into it), while
  // Revenue above is ex-VAT (total_amount - tax_amount). Subtracting the raw
  // refund from ex-VAT revenue over-subtracts by the refunded VAT share -
  // exactly the bug already fixed in the Daily Close report (see the
  // matching comment/derivation in use-daily-close-data.ts). Net out only
  // the ex-VAT portion here: refund * (sale.total_amount - sale.tax_amount)
  // / sale.total_amount. Falls back to the full refund when the original
  // sale row isn't available to compute the ratio from (LEFT JOIN can miss
  // it) - conservative, matches the old (still-wrong-but-not-worse) behavior
  // only in that edge case.
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
  // See returnedCogsData in getBIMetrics: sale-time cost_price, pre-aggregated
  // per (sale_id, product_id) so a sale with >1 line for the same product
  // doesn't fan the return_items row out.
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

  // Expenses, amortized (see getSmoothedExpensesByMonth) rather than a raw
  // SUM(amount), so this agrees with the BI dashboard's expense figure.
  //
  // JUDGEMENT CALL - expenses are NOT staff/payment-method filterable: an
  // expense carries no attribution that means the same thing as the sales
  // filter (expenses.user_id is whoever keyed the expense in, not whose
  // shift it belongs to, and expenses.payment_method is how the STORE paid a
  // vendor, unrelated to how a customer paid for a sale). Forcing the sales
  // filter onto them would answer a question nobody asked; leaving them
  // unfiltered would charge one cashier's revenue with the entire store's
  // overhead and report a wildly negative Net Profit. So a filtered P&L
  // reports 0 expenses and its "Net Profit" column is really the filtered
  // slice's CONTRIBUTION (Gross Profit), with store-wide overhead excluded.
  // Run the report unfiltered for a true bottom line.
  const expensesFilterable = !filters?.staffId && !filters?.paymentMethod;
  const expensesByMonth = expensesFilterable
    ? await getSmoothedExpensesByMonth(dateFrom, dateTo)
    : new Map<string, number>();

  // Every month with ANY financial activity gets a row - revenue, refunds, or
  // expenses. Mapping over revenue months alone silently dropped a month that
  // had expenses (or refunds) but no sales, which is exactly the month an
  // owner most wants to see.
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
  // See the matching comment in fetchProfitLossReportData above.
  if (dateFrom) { where += " AND date(date) >= date(?)"; params.push(dateFrom); }
  if (dateTo) { where += " AND date(date) <= date(?)"; params.push(dateTo); }
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
