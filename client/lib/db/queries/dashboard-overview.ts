import { query } from "@/lib/db";
import { getActiveStoreId } from "@/lib/db/core";
import { PRICE_ADJUSTMENT_COLUMNS_SQL } from "@/lib/db/queries/price-adjustment-sql";
import { getLocalTodayDate } from "@/lib/utils";
import type { DashboardActivity } from "@/lib/types/dashboard-activity";
import type { SaleWithDetails } from "@/lib/types/sale";
import type { StockMovementHistoryRow } from "@/lib/types/stock-movement";
import { HIDDEN_MOVEMENT_TYPES, HIDDEN_MOVEMENT_TYPES_SQL } from "@/lib/db/movement-types";
import type { PurchaseOrder } from "@/lib/db/procurement";
import type { Expense } from "@/lib/db/queries/finance";
import type { PrescriptionRow } from "@/lib/types/prescription";

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
      `SELECT s.*, TRIM(u.first_name || ' ' || u.last_name) as cashier_name, ${PRICE_ADJUSTMENT_COLUMNS_SQL}
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
