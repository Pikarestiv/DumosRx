import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import type { Sale, SaleWithDetails, SaleItemDetail, ReturnRecord, ReturnItemDetail } from "@/lib/types/sale";
import type { StockBatch } from "@/lib/types/stock-batch";

export async function getSaleItems(saleId: string) {
  return query<SaleItemDetail>(
    "SELECT si.*, m.name as product_name FROM sale_items si JOIN products m ON si.product_id = m.id WHERE si.sale_id = ?",
    [saleId]
  );
}

export async function getTransactionDetails(saleId: string) {
  try {
    const items = await query<SaleItemDetail>(
      `SELECT
        si.*, 
        m.name as product_name, 
        si.cost_price as med_cost_price,
        COALESCE((
          SELECT SUM(ri.quantity) 
          FROM return_items ri 
          JOIN returns r ON ri.return_id = r.id 
          WHERE r.sale_id = si.sale_id AND ri.product_id = si.product_id AND (ri._deleted = 0 OR ri._deleted IS NULL) AND (r._deleted = 0 OR r._deleted IS NULL)
        ), 0) as returned_quantity
       FROM sale_items si 
       LEFT JOIN products m ON si.product_id = m.id 
       WHERE si.sale_id = ? AND (si._deleted = 0 OR si._deleted IS NULL)`,
      [saleId]
    );

    const returnsData = await query<{ total_refunded?: number }>(
      `SELECT SUM(total_refunded) as total_refunded FROM returns WHERE sale_id = ? AND (_deleted = 0 OR _deleted IS NULL)`,
      [saleId]
    );

    return { items, returnsData };
  } catch (error) {
    console.error("Failed to fetch transaction details:", error);
    
    // Fallback simple query just in case the complex one fails due to schema issues
    try {
      const fallbackItems = await query<SaleItemDetail>(
        `SELECT si.*, m.name as product_name, si.cost_price as med_cost_price, 0 as returned_quantity
         FROM sale_items si 
         LEFT JOIN products m ON si.product_id = m.id 
         WHERE si.sale_id = ? AND (si._deleted = 0 OR si._deleted IS NULL)`,
        [saleId]
      );
      return { items: fallbackItems, returnsData: [] };
    } catch (innerError) {
      console.error("Fallback query also failed:", innerError);
      return { items: [], returnsData: [] };
    }
  }
}

export interface HeldTransaction {
  id: string;
  customer_id?: string | null;
  customer_name: string;
  items_json: string;
  total_amount: number;
  discount?: number;
  discount_type?: string | null;
  created_at: string;
}

export async function getHeldTransactions() {
  const storeId = getActiveStoreId();
  return query<HeldTransaction>(
    `SELECT * FROM held_transactions${storeId ? " WHERE store_id = ?" : ""} ORDER BY created_at DESC`,
    storeId ? [storeId] : [],
  );
}

export async function getHeldTransactionCount() {
  const storeId = getActiveStoreId();
  const result = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM held_transactions${storeId ? " WHERE store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
  return result[0]?.count || 0;
}

export async function getStockBatchesForProduct(productId: string) {
  return query<{id: string, quantity: number}>(
    "SELECT id, quantity FROM stock_batches WHERE product_id = ? AND quantity > 0 ORDER BY created_at ASC",
    [productId]
  );
}

export async function getSaleItemBatches(saleItemId: string) {
  return query<{ id: string; stock_batch_id: string; quantity: number }>(
    "SELECT * FROM sale_item_batches WHERE sale_item_id = ? AND (_deleted = 0 OR _deleted IS NULL)",
    [saleItemId]
  );
}

export async function getStockBatchById(batchId: string) {
  const invs = await query<StockBatch>(
    "SELECT * FROM stock_batches WHERE id = ?",
    [batchId],
  );
  return invs[0] || null;
}

// --- EOD Summary Queries ---

export async function getSalesTotalsByPaymentMethod(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const startIso = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  const endIso = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
  const storeId = getActiveStoreId();

  return query<{ payment_method: string; total: number }>(`
    SELECT payment_method, SUM(total_amount) as total
    FROM sales
    WHERE transaction_date >= ? AND transaction_date <= ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}
    GROUP BY payment_method
  `, storeId ? [startIso, endIso, storeId] : [startIso, endIso]);
}

export async function getTransactionCountByDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  const startIso = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  const endIso = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
  const storeId = getActiveStoreId();

  const res = await query<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM sales
    WHERE transaction_date >= ? AND transaction_date <= ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}
  `, storeId ? [startIso, endIso, storeId] : [startIso, endIso]);
  return res[0]?.count || 0;
}

export async function getTopStaffByDate(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const startIso = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  const endIso = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
  const storeId = getActiveStoreId();

  return query<{ user_name: string; total_sales: number }>(
    `SELECT TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')) as user_name, SUM(s.total_amount) as total_sales
     FROM sales s
     JOIN users u ON s.user_id = u.id
     WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}
     GROUP BY s.user_id
     ORDER BY total_sales DESC
     LIMIT 5`,
    storeId ? [startIso, endIso, storeId] : [startIso, endIso],
  );
}

export async function getSaleById(saleId: string) {
  const rows = await query<SaleWithDetails>(
    `SELECT
      s.*,
      TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
      (SELECT SUM(quantity) FROM sale_items si WHERE si.sale_id = s.id AND (si._deleted = 0 OR si._deleted IS NULL)) as item_count
     FROM sales s
     LEFT JOIN customers c ON s.customer_id = c.id
     WHERE s.id = ? AND s._deleted = 0`,
    [saleId]
  );
  return rows[0] || null;
}

/** Most recent (non-deleted) sale a prescription was dispensed through, if any. */
export async function getSaleForPrescription(prescriptionId: string) {
  const rows = await query<Sale>(
    `SELECT * FROM sales WHERE prescription_id = ? AND _deleted = 0 ORDER BY created_at DESC LIMIT 1`,
    [prescriptionId]
  );
  return rows[0] || null;
}

export async function getRecentSales(userId?: string) {
  const storeId = getActiveStoreId();
  const userFilter = userId ? ` AND s.user_id = ?` : "";
  const storeFilter = storeId ? ` AND s.store_id = ?` : "";
  const params = [...(userId ? [userId] : []), ...(storeId ? [storeId] : [])];
  return query<SaleWithDetails>(
    `SELECT
      s.*,
      TRIM(c.first_name || ' ' || COALESCE(c.last_name, '')) as customer_name,
      TRIM(u.first_name || ' ' || u.last_name) as cashier_name,
      (SELECT SUM(quantity) FROM sale_items si WHERE si.sale_id = s.id AND (si._deleted = 0 OR si._deleted IS NULL)) as item_count,
      COALESCE((SELECT SUM(r.total_refunded) FROM returns r WHERE r.sale_id = s.id AND (r._deleted = 0 OR r._deleted IS NULL)), 0) as total_refunded
     FROM sales s
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s._deleted = 0${userFilter}${storeFilter}
     ORDER BY s.created_at DESC
     LIMIT 100`,
    params,
  );
}

export async function getRecentlySoldProductIds() {
  const storeId = getActiveStoreId();
  const data = await query<{ product_id: string }>(
    `SELECT DISTINCT product_id FROM sale_items${storeId ? " WHERE store_id = ?" : ""} ORDER BY created_at DESC LIMIT 5`,
    storeId ? [storeId] : [],
  );
  return data.map((d) => d.product_id);
}

export async function getCommonlySoldProductIds() {
  const storeId = getActiveStoreId();
  const data = await query<{ product_id: string; total_qty: number }>(
    `SELECT product_id, SUM(quantity) as total_qty FROM sale_items${storeId ? " WHERE store_id = ?" : ""} GROUP BY product_id ORDER BY total_qty DESC LIMIT 8`,
    storeId ? [storeId] : [],
  );
  return data.map((d) => d.product_id);
}

export async function getDailyCloseData(reportDate: string) {
  const [year, month, day] = reportDate.split('-').map(Number);
  const startIso = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
  const endIso = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
  const storeId = getActiveStoreId();

  const salesToday = await query<Sale>(
    `SELECT * FROM sales WHERE transaction_date >= ? AND transaction_date <= ? AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [startIso, endIso, storeId] : [startIso, endIso],
  );

  const itemsToday = await query<SaleItemDetail>(
    `SELECT si.*, m.name as product_name, si.cost_price as med_cost_price FROM sale_items si JOIN sales s ON si.sale_id = s.id LEFT JOIN products m ON si.product_id = m.id WHERE s.transaction_date >= ? AND s.transaction_date <= ? AND (si._deleted = 0 OR si._deleted IS NULL) AND (s._deleted = 0 OR s._deleted IS NULL)${storeId ? " AND s.store_id = ?" : ""}`,
    storeId ? [startIso, endIso, storeId] : [startIso, endIso],
  );

  const returnsToday = await query<ReturnRecord>(
    `SELECT r.*, s.payment_method, s.payment_details FROM returns r JOIN sales s ON r.sale_id = s.id WHERE r.created_at >= ? AND r.created_at <= ? AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND r.store_id = ?" : ""}`,
    storeId ? [startIso, endIso, storeId] : [startIso, endIso],
  );

  const returnItemsToday = await query<ReturnItemDetail & { med_cost_price?: number }>(
    `SELECT ri.*, IFNULL((SELECT SUM(cost_price * quantity) * 1.0 / NULLIF(SUM(quantity), 0) FROM stock_batches WHERE product_id = ri.product_id AND is_active = 1 AND _deleted = 0), 0) as med_cost_price FROM return_items ri JOIN returns r ON ri.return_id = r.id LEFT JOIN products m ON ri.product_id = m.id WHERE r.created_at >= ? AND r.created_at <= ? AND (ri._deleted = 0 OR ri._deleted IS NULL) AND (r._deleted = 0 OR r._deleted IS NULL)${storeId ? " AND ri.store_id = ?" : ""}`,
    storeId ? [startIso, endIso, storeId] : [startIso, endIso],
  );

  return { salesToday, itemsToday, returnsToday, returnItemsToday };
}
