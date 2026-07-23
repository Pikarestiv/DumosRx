import { query, insert, update } from "@/lib/db/local-database";

export async function getAvailableStockBatches() {
  return query<any>(
    `SELECT i.*, m.name as product_name, m.strength as m_strength, m.selling_price FROM stock_batches i JOIN products m ON i.product_id = m.id WHERE i._deleted = 0 AND i.quantity > 0`
  );
}

export async function getBatchTrackingData() {
  return query<any>(
    `SELECT sb.id, p.name as product_name, sb.batch_number, sb.expiry_date, sb.quantity, sb.cost_price FROM stock_batches sb JOIN products p ON sb.product_id = p.id WHERE sb._deleted = 0 AND p._deleted = 0 ORDER BY sb.expiry_date ASC`
  );
}

export async function getStockBatchesForProductDetails(productId: string) {
  return query<any>(
    "SELECT * FROM stock_batches WHERE product_id = ? AND _deleted = 0 ORDER BY expiry_date ASC",
    [productId]
  );
}

export async function getStockBatchById(id: string) {
  const result = await query<any>("SELECT * FROM stock_batches WHERE id = ?", [id]);
  return result.length > 0 ? result[0] : null;
}

export async function getStockOverviewData() {
  return query<any>(
    `SELECT 
      p.id, p.name as product_name, p.reorder_level, p.selling_price, p.barcode,
      sb.avg_cost as cost_price,
      COALESCE(sb.total_qty, 0) as quantity,
      sb.earliest_expiry as expiry_date,
      sb.batches as batch_number
     FROM products p
     LEFT JOIN (
       SELECT product_id, 
              SUM(quantity) as total_qty,
              AVG(cost_price) as avg_cost,
              MIN(expiry_date) as earliest_expiry,
              GROUP_CONCAT(batch_number, ', ') as batches
       FROM stock_batches 
       WHERE _deleted = 0 AND is_active = 1 
       GROUP BY product_id
     ) sb ON p.id = sb.product_id
     WHERE p._deleted = 0
     ORDER BY quantity ASC
     LIMIT 50`
  );
}

export interface AuditProduct {
  id: string;
  name: string;
  stock_quantity: number;
  base_unit: string;
  cost_price?: number;
  selling_price?: number;
}

export interface ExpiringItem {
  id: string;
  name: string;
  batch_number: string;
  expiry_date: string;
  stock_quantity: number;
}

export async function getProductsForAudit() {
  return query<AuditProduct>(`
    SELECT p.id, p.name, p.base_unit, AVG(sb.cost_price) as cost_price, p.selling_price, COALESCE(SUM(sb.quantity), 0) as stock_quantity 
    FROM products p 
    LEFT JOIN stock_batches sb ON p.id = sb.product_id AND sb._deleted = 0 AND sb.is_active = 1 
    WHERE p.is_active = 1 AND p._deleted = 0
    GROUP BY p.id
  `);
}

export async function getBatchesForProduct(productId: string) {
  return query<any>(
    "SELECT * FROM stock_batches WHERE product_id = ? AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC, created_at ASC",
    [productId],
  );
}

export async function getExpiringBatches(days: number) {
  return query<ExpiringItem>(
    `
    SELECT sb.id, p.name, sb.batch_number, sb.expiry_date, sb.quantity as stock_quantity 
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    WHERE sb.expiry_date IS NOT NULL 
    AND sb.quantity > 0
    AND sb._deleted = 0
    AND p._deleted = 0
    AND date(sb.expiry_date) <= date('now', '+' || ? || ' days')
    ORDER BY sb.expiry_date ASC
  `,
    [days.toString()],
  );
}

export async function getLowStockAlerts() {
  return query<{
    product: string;
    quantity: number;
    threshold: number;
  }>(
    `SELECT
      m.name as product,
      SUM(inv.quantity) as quantity,
      m.reorder_level as threshold
     FROM stock_batches inv
     JOIN products m ON inv.product_id = m.id
     WHERE (inv._deleted = 0 OR inv._deleted IS NULL) AND (m._deleted = 0 OR m._deleted IS NULL)
     GROUP BY m.id
     HAVING quantity <= m.reorder_level AND m.reorder_level > 0
     ORDER BY quantity ASC
     LIMIT 5`,
  );
}

export async function getExpiryAlerts() {
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
       AND julianday(inv.expiry_date) >= julianday('now')
     ORDER BY inv.expiry_date ASC
     LIMIT 5`,
  );
}

export async function getStockBatchStats(expiryDays: number = 30) {
  const result = await query<any>(
    `SELECT
      COUNT(p.id) AS total_products,
      SUM(CASE WHEN p.is_active = 1 THEN 1 ELSE 0 END) AS active_products,
      SUM(CASE WHEN COALESCE(sb.total_qty, 0) <= p.reorder_level AND COALESCE(sb.total_qty, 0) > 0 THEN 1 ELSE 0 END) AS low_stock_count,
      SUM(CASE WHEN COALESCE(sb.total_qty, 0) = 0 THEN 1 ELSE 0 END) AS critical_stock_count,
      SUM(CASE WHEN sb.expiring_soon > 0 THEN 1 ELSE 0 END) AS expiring_soon_count,
      SUM(CASE WHEN sb.expired > 0 THEN 1 ELSE 0 END) AS expired_count,
      SUM(CASE WHEN sb.missing_expiry > 0 THEN 1 ELSE 0 END) AS missing_expiry_count,
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
    WHERE p._deleted = 0 OR p._deleted IS NULL`,
    [expiryDays.toString()],
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
  // We need to fetch it first to add the delta, or just use raw query to update directly
  // Using update from local-database requires passing all fields we want to update.
  // Actually, raw update query is better here to avoid race conditions.
  const { execute: coreExecute } = await import("@/lib/db/core");
  await coreExecute(
    "UPDATE stock_batches SET quantity = quantity + ?, updated_at = ? WHERE id = ?",
    [quantityDelta, new Date().toISOString(), batchId],
  );

  // also add a sync queue entry manually if we bypass the helper
  // But let's just use local-database update. We have to fetch it first.
  const batch = await query<any>(
    "SELECT quantity FROM stock_batches WHERE id = ?",
    [batchId],
  );
  if (batch.length > 0) {
    return update("stock_batches", batchId, {
      quantity: batch[0].quantity + quantityDelta,
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

export async function getFastMovers(days: number = 7) {
  const result = await query<any>(
    `WITH current_period AS (
      SELECT 
        p.id, 
        p.name, 
        p.generic_name as genericName, 
        p.category_id, 
        SUM(si.quantity) as soldQuantity, 
        SUM(si.total_price) as revenue
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      JOIN products p ON si.product_id = p.id
      WHERE s.created_at >= date('now', '-' || ? || ' days')
        AND (s._deleted = 0 OR s._deleted IS NULL)
      GROUP BY p.id
    ),
    previous_period AS (
      SELECT 
        si.product_id, 
        SUM(si.quantity) as prevQuantity
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      WHERE s.created_at >= date('now', '-' || (? * 2) || ' days')
        AND s.created_at < date('now', '-' || ? || ' days')
        AND (s._deleted = 0 OR s._deleted IS NULL)
      GROUP BY si.product_id
    )
    SELECT 
      c.*,
      COALESCE(p.prevQuantity, 0) as prevQuantity
    FROM current_period c
    LEFT JOIN previous_period p ON c.id = p.product_id
    ORDER BY c.soldQuantity DESC
    LIMIT 5`,
    [days.toString(), days.toString(), days.toString()]
  );
  
  const items = result.map((row: any) => {
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

  // Value added in last 30 days
  const added30 = await query<any>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_added
    FROM stock_movements
    WHERE created_at >= ? AND movement_type IN ('addition', 'IN', 'purchase', 'return') AND (_deleted = 0 OR _deleted IS NULL)
  `, [dateFilter30]);

  // Value removed in last 30 days
  const removed30 = await query<any>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_removed
    FROM stock_movements
    WHERE created_at >= ? AND movement_type IN ('deduction', 'OUT', 'sale', 'damaged', 'adjustment') AND (_deleted = 0 OR _deleted IS NULL) AND quantity < 0
  `, [dateFilter30]);
  
  // Adjusted additions from positive adjustments
  const positiveAdjustments = await query<any>(`
    SELECT SUM(ABS(quantity) * IFNULL(unit_cost, 0)) as total_added
    FROM stock_movements
    WHERE created_at >= ? AND movement_type = 'adjustment' AND (_deleted = 0 OR _deleted IS NULL) AND quantity > 0
  `, [dateFilter30]);

  const currentStock = await query<any>(`
    SELECT SUM(cost_price * quantity) as total_value
    FROM stock_batches
    WHERE is_active = 1 AND (_deleted = 0 OR _deleted IS NULL)
  `);

  const currentVal = currentStock[0]?.total_value || 0;
  const addedVal = (added30[0]?.total_added || 0) + (positiveAdjustments[0]?.total_added || 0);
  const removedVal = removed30[0]?.total_removed || 0;
  const netChange30 = addedVal - removedVal;

  const previousVal = currentVal - netChange30;
  const percentChange = previousVal > 0 ? (netChange30 / previousVal) * 100 : 0;

  return {
    currentValue: currentVal,
    previousValue: previousVal,
    percentChange: percentChange,
  };
}
