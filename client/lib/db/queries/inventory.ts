import { query, insert, update, transaction } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import type { FastMoverRow } from "@/lib/types/fast-mover";
import type { StockBatch, AvailableStockBatch } from "@/lib/types/stock-batch";

export async function getAvailableStockBatches() {
  const storeId = getActiveStoreId();
  return query<AvailableStockBatch>(
    `SELECT i.*, m.name as product_name, m.strength as m_strength, m.selling_price FROM stock_batches i JOIN products m ON i.product_id = m.id WHERE i._deleted = 0 AND i.quantity > 0${storeId ? " AND m.store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
}

export async function getBatchTrackingData() {
  const storeId = getActiveStoreId();
  return query<{
    id: string;
    product_name: string;
    batch_number?: string;
    expiry_date?: string;
    quantity: number;
    cost_price?: number;
  }>(
    `SELECT sb.id, p.name as product_name, sb.batch_number, sb.expiry_date, sb.quantity, sb.cost_price FROM stock_batches sb JOIN products p ON sb.product_id = p.id WHERE sb._deleted = 0 AND p._deleted = 0${storeId ? " AND p.store_id = ?" : ""} ORDER BY sb.expiry_date ASC`,
    storeId ? [storeId] : [],
  );
}

export async function getStockBatchesForProductDetails(productId: string) {
  return query<StockBatch>(
    "SELECT * FROM stock_batches WHERE product_id = ? AND _deleted = 0 ORDER BY expiry_date ASC",
    [productId]
  );
}

export async function getStockBatchById(id: string) {
  const result = await query<StockBatch>("SELECT * FROM stock_batches WHERE id = ?", [id]);
  return result.length > 0 ? result[0] : null;
}

export interface StockOverviewRow {
  id: string;
  product_name: string;
  reorder_level?: number;
  selling_price?: number;
  barcode?: string;
  cost_price?: number;
  quantity: number;
  expiry_date?: string;
  batch_number?: string;
  base_unit?: string;
}

export async function getStockOverviewData() {
  const storeId = getActiveStoreId();
  return query<StockOverviewRow>(
    `SELECT
      p.id, p.name as product_name, p.reorder_level, p.selling_price, p.barcode, p.base_unit,
      sb.avg_cost as cost_price,
      COALESCE(sb.total_qty, 0) as quantity,
      sb.earliest_expiry as expiry_date,
      sb.batches as batch_number
     FROM products p
     LEFT JOIN (
       SELECT product_id,
              SUM(quantity) as total_qty,
              SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) as avg_cost,
              MIN(expiry_date) as earliest_expiry,
              GROUP_CONCAT(batch_number, ', ') as batches
       FROM stock_batches
       WHERE _deleted = 0 AND is_active = 1
       GROUP BY product_id
     ) sb ON p.id = sb.product_id
     WHERE p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
     ORDER BY quantity ASC
     LIMIT 50`,
    storeId ? [storeId] : [],
  );
}

export interface ExpiringItem {
  id: string;
  name: string;
  batch_number: string;
  expiry_date: string;
  stock_quantity: number;
  base_unit?: string;
}

export async function getBatchesForProduct(productId: string) {
  return query<StockBatch>(
    "SELECT * FROM stock_batches WHERE product_id = ? AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC, created_at ASC",
    [productId],
  );
}

export async function getExpiringBatches(days: number) {
  const storeId = getActiveStoreId();
  return query<ExpiringItem>(
    `
    SELECT sb.id, p.name, sb.batch_number, sb.expiry_date, sb.quantity as stock_quantity, p.base_unit
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    WHERE sb.expiry_date IS NOT NULL
    AND sb.quantity > 0
    AND sb._deleted = 0
    AND p._deleted = 0
    AND date(sb.expiry_date) <= date('now', '+' || ? || ' days')${storeId ? " AND p.store_id = ?" : ""}
    ORDER BY sb.expiry_date ASC
  `,
    storeId ? [days.toString(), storeId] : [days.toString()],
  );
}

export async function getLowStockAlerts() {
  const storeId = getActiveStoreId();
  return query<{
    product: string;
    quantity: number;
    threshold: number;
    baseUnit: string;
  }>(
    `SELECT
      m.name as product,
      SUM(inv.quantity) as quantity,
      m.reorder_level as threshold,
      m.base_unit as baseUnit
     FROM stock_batches inv
     JOIN products m ON inv.product_id = m.id
     WHERE (inv._deleted = 0 OR inv._deleted IS NULL) AND (m._deleted = 0 OR m._deleted IS NULL)${storeId ? " AND m.store_id = ?" : ""}
     GROUP BY m.id
     HAVING quantity <= m.reorder_level AND m.reorder_level > 0
     ORDER BY quantity ASC
     LIMIT 5`,
    storeId ? [storeId] : [],
  );
}

export async function getExpiryAlerts() {
  const storeId = getActiveStoreId();
  return query<{
    product: string;
    expiryDate: string;
    daysLeft: number;
  }>(
    `SELECT
      m.name as product,
      inv.expiry_date as expiryDate,
      CAST((julianday(inv.expiry_date) - julianday('now')) AS INTEGER) as daysLeft
     FROM stock_batches inv
     JOIN products m ON inv.product_id = m.id
     WHERE (inv._deleted = 0 OR inv._deleted IS NULL) AND (m._deleted = 0 OR m._deleted IS NULL)
       AND inv.expiry_date IS NOT NULL
       AND inv.expiry_date != ''
       AND julianday(inv.expiry_date) <= julianday('now', '+30 days')
       AND julianday(inv.expiry_date) >= julianday('now')${storeId ? " AND m.store_id = ?" : ""}
     ORDER BY inv.expiry_date ASC
     LIMIT 5`,
    storeId ? [storeId] : [],
  );
}

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

export async function getStockBatchStats(expiryDays: number = 30) {
  const storeId = getActiveStoreId();
  const result = await query<StockBatchStatsRow>(
    `SELECT
      COUNT(p.id) AS total_products,
      SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END) AS active_products,
      SUM(CASE WHEN COALESCE(sb.total_qty, 0) <= p.reorder_level AND COALESCE(sb.total_qty, 0) > 0 THEN 1 ELSE 0 END) AS low_stock_count,
      SUM(CASE WHEN COALESCE(sb.total_qty, 0) = 0 THEN 1 ELSE 0 END) AS critical_stock_count,
      SUM(COALESCE(sb.expiring_soon, 0)) AS expiring_soon_count,
      SUM(COALESCE(sb.expired, 0)) AS expired_count,
      SUM(COALESCE(sb.missing_expiry, 0)) AS missing_expiry_count,
      COALESCE(SUM(sb.total_value), 0) AS total_stock_batch_value,
      COUNT(DISTINCT p.category_id) as active_categories
    FROM products p
    LEFT JOIN (
      SELECT product_id,
        SUM(quantity) as total_qty,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) > date('now') AND date(expiry_date) <= date('now', '+' || ? || ' days') THEN 1 ELSE 0 END) as expiring_soon,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) <= date('now') THEN 1 ELSE 0 END) as expired,
        SUM(CASE WHEN (expiry_date IS NULL OR expiry_date = '') AND quantity > 0 THEN 1 ELSE 0 END) as missing_expiry,
        SUM(quantity * cost_price) as total_value
      FROM stock_batches
      WHERE _deleted = 0 OR _deleted IS NULL
      GROUP BY product_id
    ) sb ON p.id = sb.product_id
    WHERE (p._deleted = 0 OR p._deleted IS NULL)${storeId ? " AND p.store_id = ?" : ""}`,
    storeId ? [expiryDays.toString(), storeId] : [expiryDays.toString()],
  );
  return result[0];
}

// Mutations
export async function createStockMovement(movement: {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  reason?: string;
  stock_batch_id?: string;
}) {
  return insert("stock_movements", movement);
}

export async function updateStockBatchQuantity(
  batchId: string,
  quantityDelta: number,
) {
  const batch = await query<{ quantity: number }>(
    "SELECT quantity FROM stock_batches WHERE id = ?",
    [batchId],
  );
  if (batch.length > 0) {
    return update("stock_batches", batchId, {
      quantity: Math.max(0, (batch[0].quantity || 0) + quantityDelta),
    });
  }
}

export async function createStockBatch(batch: {
  id: string;
  product_id: string;
  batch_number: string;
  quantity: number;
  expiry_date?: string;
  cost_price?: number;
}) {
  return insert("stock_batches", batch);
}

export interface StockAuditSubmission {
  productId: string;
  systemQty: number;
  countedQty: number;
  systemCostPrice?: number;
  countedCostPrice?: number;
  systemSellingPrice?: number;
  countedSellingPrice?: number;
  reason?: string;
}

/** Persists a completed cycle count: for each product whose counted quantity
 * and/or counted cost/selling price differs from what's on record, records a
 * reconciled stock_audits entry capturing every deviation. Quantity
 * differences are applied to stock_batches (FEFO: soonest-expiring batch
 * first, same convention as sale consumption/returns) with a matching
 * stock_movements("adjustment") entry; a corrected cost price is applied to
 * the product's active batches (cost is a per-batch acquisition cost, but an
 * audit-time correction is a master-data fix, not a new purchase); a
 * corrected selling price is applied to products.selling_price (the single
 * source of truth for selling price, unlike cost). */
export async function submitStockAudit(
  items: StockAuditSubmission[],
  performedBy: string | null,
) {
  return transaction(async () => {
    for (const item of items) {
      const diff = item.countedQty - item.systemQty;
      const costDiff =
        item.countedCostPrice !== undefined && item.systemCostPrice !== undefined
          ? item.countedCostPrice - item.systemCostPrice
          : 0;
      const sellingDiff =
        item.countedSellingPrice !== undefined && item.systemSellingPrice !== undefined
          ? item.countedSellingPrice - item.systemSellingPrice
          : 0;

      if (diff === 0 && costDiff === 0 && sellingDiff === 0) continue;

      const auditId = crypto.randomUUID();
      await insert("stock_audits", {
        id: auditId,
        product_id: item.productId,
        expected_quantity: item.systemQty,
        actual_quantity: item.countedQty,
        difference: diff,
        expected_cost_price: item.systemCostPrice ?? null,
        actual_cost_price: item.countedCostPrice ?? null,
        cost_price_difference: costDiff || null,
        expected_selling_price: item.systemSellingPrice ?? null,
        actual_selling_price: item.countedSellingPrice ?? null,
        selling_price_difference: sellingDiff || null,
        notes: item.reason || null,
        user_id: performedBy || "system",
        status: "reconciled",
        reconciled_at: new Date().toISOString(),
      });

      if (costDiff !== 0 && item.countedCostPrice !== undefined) {
        // A cost-price audit correction is a master-data fix, not a new
        // purchase at a new cost; apply it to every active batch of this
        // product rather than trying to attribute it to one batch.
        const activeBatches = await getBatchesForProduct(item.productId);
        for (const batch of activeBatches) {
          await update("stock_batches", batch.id, {
            cost_price: item.countedCostPrice,
          });
        }
      }

      if (sellingDiff !== 0 && item.countedSellingPrice !== undefined) {
        await update("products", item.productId, {
          selling_price: item.countedSellingPrice,
        });
      }

      if (diff === 0) continue;

      let remaining = Math.abs(diff);
      const batches = await getBatchesForProduct(item.productId);

      if (diff > 0) {
        // Found more stock than recorded: add it to the soonest-expiring
        // active batch, or open a new one if the product has none.
        if (batches.length > 0) {
          await updateStockBatchQuantity(batches[0].id, remaining);
          await insert("stock_movements", {
            product_id: item.productId,
            stock_batch_id: batches[0].id,
            movement_type: "adjustment",
            quantity: remaining,
            reason: item.reason || "Cycle count adjustment",
            reference_id: auditId,
            reference_type: "stock_audit",
            performed_by: performedBy || null,
            movement_date: new Date().toISOString(),
          });
        } else {
          const newBatchId = crypto.randomUUID();
          await createStockBatch({
            id: newBatchId,
            product_id: item.productId,
            batch_number: `AUDIT-${new Date().toISOString().slice(0, 10)}`,
            quantity: remaining,
          });
          await insert("stock_movements", {
            product_id: item.productId,
            stock_batch_id: newBatchId,
            movement_type: "adjustment",
            quantity: remaining,
            reason: item.reason || "Cycle count adjustment",
            reference_id: auditId,
            reference_type: "stock_audit",
            performed_by: performedBy || null,
            movement_date: new Date().toISOString(),
          });
        }
      } else {
        // Found less stock than recorded: deduct FEFO across batches until
        // the shortfall is accounted for or stock runs out.
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deductQty = Math.min(batch.quantity, remaining);
          if (deductQty <= 0) continue;

          await updateStockBatchQuantity(batch.id, -deductQty);
          await insert("stock_movements", {
            product_id: item.productId,
            stock_batch_id: batch.id,
            movement_type: "adjustment",
            quantity: -deductQty,
            reason: item.reason || "Cycle count adjustment",
            reference_id: auditId,
            reference_type: "stock_audit",
            performed_by: performedBy || null,
            movement_date: new Date().toISOString(),
          });
          remaining -= deductQty;
        }
      }
    }
  });
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
    WHERE created_at >= ? AND movement_type IN ('addition', 'IN', 'purchase', 'return') AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
  `, movementParams);

  // Value removed in last 30 days
  const removed30 = await query<{ total_removed?: number }>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_removed
    FROM stock_movements
    WHERE created_at >= ? AND movement_type IN ('deduction', 'OUT', 'sale', 'damaged', 'adjustment') AND (_deleted = 0 OR _deleted IS NULL) AND quantity < 0${storeId ? " AND store_id = ?" : ""}
  `, movementParams);

  // Adjusted additions from positive adjustments
  const positiveAdjustments = await query<{ total_added?: number }>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_added
    FROM stock_movements
    WHERE created_at >= ? AND movement_type = 'adjustment' AND (_deleted = 0 OR _deleted IS NULL) AND quantity > 0${storeId ? " AND store_id = ?" : ""}
  `, movementParams);

  const currentStock = await query<{ total_value?: number }>(`
    SELECT SUM(cost_price * quantity) as total_value
    FROM stock_batches
    WHERE is_active = 1 AND (_deleted = 0 OR _deleted IS NULL)${storeId ? " AND store_id = ?" : ""}
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
