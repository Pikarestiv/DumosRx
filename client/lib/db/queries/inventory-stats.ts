import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import type { FastMoverRow } from "@/lib/types/fast-mover";

export interface StockBatchStatsRow {
  total_products: number;
  active_products: number;
  low_stock_count: number;
  critical_stock_count: number;
  expiring_soon_count: number;
  expired_count: number;
  missing_expiry_count: number;
  total_stock_batch_value: number;
  active_categories: number;
}

// Default 90, matching `expiry_warning_days INTEGER DEFAULT 90` in the schema and every UI caption/fallback.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L430
export async function getStockBatchStats(expiryDays: number = 90) {
  const storeId = getActiveStoreId();
  const result = await query<StockBatchStatsRow>(
    `SELECT
      COUNT(p.id) AS total_products,
      SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END) AS active_products,
      -- Both require is_active = 1 AND reorder_level > 0, matching the
      -- "Low stock" drill-down list's own HAVING clause below - without
      -- these, critical_stock_count in particular counted every deactivated/
      -- never-restocked product (reorder_level defaults to 0) as needing
      -- reorder, so the card overshot the very list it links to.
      SUM(CASE WHEN p.is_active = 1 AND p.reorder_level > 0 AND COALESCE(sb.total_qty, 0) <= p.reorder_level AND COALESCE(sb.total_qty, 0) > 0 THEN 1 ELSE 0 END) AS low_stock_count,
      SUM(CASE WHEN p.is_active = 1 AND p.reorder_level > 0 AND COALESCE(sb.total_qty, 0) = 0 THEN 1 ELSE 0 END) AS critical_stock_count,
      SUM(COALESCE(sb.expiring_soon, 0)) AS expiring_soon_count,
      SUM(COALESCE(sb.expired, 0)) AS expired_count,
      SUM(COALESCE(sb.missing_expiry, 0)) AS missing_expiry_count,
      COALESCE(SUM(sb.total_value), 0) AS total_stock_batch_value,
      COUNT(DISTINCT p.category_id) as active_categories
    FROM products p
    LEFT JOIN (
      SELECT product_id,
        -- Only active, non-expired stock counts toward "on hand" for the
        -- low/critical stock counts below — the sale path can't dispense an
        -- expired or deactivated batch, so it shouldn't count as available
        -- stock here either (see getBatchesForProduct).
        SUM(CASE WHEN (is_active = 1 OR is_active IS NULL) AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) > date('now')) THEN quantity ELSE 0 END) as total_qty,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) > date('now') AND date(expiry_date) <= date('now', '+' || ? || ' days') THEN 1 ELSE 0 END) as expiring_soon,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) <= date('now') THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN (expiry_date IS NULL OR expiry_date = '') AND quantity > 0 THEN 1 ELSE 0 END) as missing_expiry,
        SUM(quantity * cost_price) as total_value
      FROM stock_batches
      -- Scoped to the active store, not just to products of the active store:
      -- filtering only products.store_id on the join let a batch attributed to
      -- another store (or to a store_id-less legacy row) that hangs off one of
      -- this store's products be summed into this store's valuation, on-hand
      -- quantity, and expiry counts. fetchStockBatchReportData and
      -- getBIMetrics's stock_batchValueData both scope stock_batches.store_id
      -- directly (strict equality, no NULL fallback), so the three could
      -- report different inventory values for the same store. The
      -- _deleted predicate needs its own parentheses here, otherwise SQL
      -- precedence turns this into
      -- "_deleted = 0 OR (_deleted IS NULL AND store_id = ?)".
      WHERE (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
      GROUP BY product_id
    ) sb ON p.id = sb.product_id
    WHERE (p._deleted = 0 OR p._deleted IS NULL)${storeId ? " AND p.store_id = ?" : ""}`,
    storeId ? [expiryDays.toString(), storeId, storeId] : [expiryDays.toString()],
  );
  return result[0];
}

export async function getFastMovers(days: number = 7) {
  // Returned quantities/amounts are netted out of both periods below: a
  // sale that was largely returned shouldn't still count as a "fast mover".
  const storeId = getActiveStoreId();
  const result = await query<FastMoverRow>(
    `WITH current_period AS (
      SELECT
        p.id,
        p.name,
        p.generic_name as genericName,
        p.category_id,
        SUM(si.quantity) as grossQuantity,
        SUM(si.total_price) as grossRevenue,
        COALESCE((
          SELECT SUM(ri.quantity) FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE ri.product_id = p.id AND (ri._deleted = 0 OR ri._deleted IS NULL)
            AND (r._deleted = 0 OR r._deleted IS NULL)
            AND r.created_at >= date('now', '-' || ? || ' days')
        ), 0) as returnedQuantity,
        COALESCE((
          SELECT SUM(ri.subtotal) FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE ri.product_id = p.id AND (ri._deleted = 0 OR ri._deleted IS NULL)
            AND (r._deleted = 0 OR r._deleted IS NULL)
            AND r.created_at >= date('now', '-' || ? || ' days')
        ), 0) as returnedRevenue
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id AND (si._deleted = 0 OR si._deleted IS NULL)
      JOIN products p ON si.product_id = p.id
      WHERE s.created_at >= date('now', '-' || ? || ' days')
        AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND p.store_id = ?" : ""}
      GROUP BY p.id
    ),
    previous_period AS (
      SELECT
        si.product_id,
        SUM(si.quantity) as grossPrevQuantity,
        COALESCE((
          SELECT SUM(ri.quantity) FROM return_items ri
          JOIN returns r ON ri.return_id = r.id
          WHERE ri.product_id = si.product_id AND (ri._deleted = 0 OR ri._deleted IS NULL)
            AND (r._deleted = 0 OR r._deleted IS NULL)
            AND r.created_at >= date('now', '-' || (? * 2) || ' days')
            AND r.created_at < date('now', '-' || ? || ' days')
        ), 0) as returnedPrevQuantity
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id AND (si._deleted = 0 OR si._deleted IS NULL)
      WHERE s.created_at >= date('now', '-' || (? * 2) || ' days')
        AND s.created_at < date('now', '-' || ? || ' days')
        AND (s._deleted = 0 OR s._deleted IS NULL)
      GROUP BY si.product_id
    )
    SELECT
      c.id, c.name, c.genericName, c.category_id,
      MAX(c.grossQuantity - c.returnedQuantity, 0) as soldQuantity,
      MAX(c.grossRevenue - c.returnedRevenue, 0) as revenue,
      COALESCE(MAX(p.grossPrevQuantity - p.returnedPrevQuantity, 0), 0) as prevQuantity
    FROM current_period c
    LEFT JOIN previous_period p ON c.id = p.product_id
    ORDER BY soldQuantity DESC
    LIMIT 5`,
    // previous_period deliberately carries no store filter of its own:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L914
    storeId
      ? [days.toString(), days.toString(), days.toString(), storeId, days.toString(), days.toString(), days.toString(), days.toString()]
      : [days.toString(), days.toString(), days.toString(), days.toString(), days.toString(), days.toString(), days.toString()]
  );
  
  const items = result.map((row) => {
    let percentageChange = 0;
    if (row.prevQuantity > 0) {
      percentageChange = ((row.soldQuantity - row.prevQuantity) / row.prevQuantity) * 100;
    } else if (row.soldQuantity > 0) {
      percentageChange = 100;
    }
    return { ...row, percentageChange };
  });

  return { items };
}

export async function getStockMoM() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFilter30 = thirtyDaysAgo.toISOString();
  const storeId = getActiveStoreId();
  const movementParams = storeId ? [dateFilter30, storeId] : [dateFilter30];

  // Value added in last 30 days
  const added30 = await query<{ total_added?: number }>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_added
    FROM stock_movements
    WHERE created_at >= ? AND movement_type IN ('purchase', 'return', 'transfer_in') AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
  `, movementParams);

  // Value removed in last 30 days
  const removed30 = await query<{ total_removed?: number }>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_removed
    FROM stock_movements
    WHERE created_at >= ? AND movement_type IN ('sale', 'adjustment', 'transfer_out') AND (_deleted = 0 OR _deleted IS NULL) AND quantity < 0${storeId ? " AND store_id = ?" : ""}
  `, movementParams);

  // Adjusted additions from positive adjustments
  const positiveAdjustments = await query<{ total_added?: number }>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_added
    FROM stock_movements
    WHERE created_at >= ? AND movement_type = 'adjustment' AND (_deleted = 0 OR _deleted IS NULL) AND quantity > 0${storeId ? " AND store_id = ?" : ""}
  `, movementParams);

  // Same population as getStockBatchStats's total_stock_batch_value (every non-deleted batch, no is_active filter):
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L964
  const currentStock = await query<{ total_value?: number }>(`
    SELECT SUM(cost_price * quantity) as total_value
    FROM stock_batches
    WHERE (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
  `, storeId ? [storeId] : []);

  const currentVal = currentStock[0]?.total_value || 0;
  const addedVal = (added30[0]?.total_added || 0) + (positiveAdjustments[0]?.total_added || 0);
  const removedVal = removed30[0]?.total_removed || 0;
  const netChange30 = addedVal - removedVal;

  const previousVal = currentVal - netChange30;
  const percentChange = previousVal > 0 ? (netChange30 / previousVal) * 100 : (netChange30 > 0 ? 100 : 0);

  return {
    currentValue: currentVal,
    previousValue: previousVal,
    percentChange: percentChange,
  };
}
