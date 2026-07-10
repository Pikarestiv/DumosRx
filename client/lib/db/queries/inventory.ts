import { query, insert, update } from "@/lib/db/local-database";

export async function getAvailableStockBatches() {
  return query<any>(
    `SELECT i.*, m.name as product_name, m.strength as m_strength FROM stock_batches i JOIN products m ON i.product_id = m.id WHERE i._deleted = 0 AND i.quantity > 0`
  );
}

export async function getBatchTrackingData() {
  return query<any>(
    `SELECT sb.id, p.name as product_name, p.brand_name as product_brand, sb.batch_number, sb.expiry_date, sb.quantity, sb.cost_price FROM stock_batches sb JOIN products p ON sb.product_id = p.id WHERE sb._deleted = 0 AND p._deleted = 0 ORDER BY sb.expiry_date ASC`
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
      p.id, p.name as product_name, p.brand_name, p.reorder_level, p.selling_price, p.barcode,
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
      COALESCE(SUM(sb.total_value), 0) AS total_stock_batch_value
    FROM products p
    LEFT JOIN (
      SELECT product_id,
        SUM(quantity) as total_qty,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) > date('now') AND date(expiry_date) <= date('now', '+' || ? || ' days') THEN 1 ELSE 0 END) as expiring_soon,
        SUM(CASE WHEN expiry_date IS NOT NULL AND date(expiry_date) <= date('now') THEN 1 ELSE 0 END) as expired,
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
