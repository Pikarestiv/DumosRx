import { query, insert } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
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

// Excludes deactivated batches and already-expired stock outright (FEFO prioritizes near-expiry stock, it doesn't dispense already-expired sto…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L97
export async function getBatchesForProduct(productId: string) {
  return query<StockBatch>(
    `SELECT * FROM stock_batches
     WHERE product_id = ? AND _deleted = 0 AND is_active = 1 AND quantity > 0
       AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) > date('now'))
     ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, created_at ASC`,
    [productId],
  );
}

// Same as getBatchesForProduct but without the `quantity > 0` filter — used where the caller needs to know "does this product have an existing…
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-L110
export async function getAllActiveBatchesForProduct(productId: string) {
  return query<StockBatch>(
    `SELECT * FROM stock_batches
     WHERE product_id = ? AND _deleted = 0 AND is_active = 1
       AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) > date('now'))
     ORDER BY (expiry_date IS NULL) ASC, expiry_date ASC, created_at ASC`,
    [productId],
  );
}

// Fallback for sale processing:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-L137
export async function getAnyActiveBatchForProduct(
  productId: string,
  options?: { includeExpired?: boolean },
) {
  const expiryFilter = options?.includeExpired
    ? ""
    : " AND (expiry_date IS NULL OR expiry_date = '' OR date(expiry_date) > date('now'))";
  return query<StockBatch>(
    `SELECT * FROM stock_batches
     WHERE product_id = ? AND _deleted = 0 AND is_active = 1${expiryFilter}
     ORDER BY updated_at DESC, created_at DESC LIMIT 1`,
    [productId],
  );
}

export async function createStockBatch(batch: {
  id: string;
  product_id: string;
  batch_number: string;
  quantity: number;
  expiry_date?: string;
  cost_price?: number;
  store_id?: string;
}) {
  return insert("stock_batches", batch);
}

// Finds a genuinely active, non-expired batch to land newly-found or restored stock into, or creates one if none exists.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-L558
export async function getOrCreateTargetBatchForProduct(
  productId: string,
  options: { unitCost: number; batchNumberPrefix?: string },
): Promise<StockBatch> {
  const targets = await getAllActiveBatchesForProduct(productId);
  if (targets.length > 0) return targets[0];

  // store_id is added to `products` via a schema migration rather than the base CREATE TABLE, so a device/test harness that hasn't (or doesn't n…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L517
  const productRows = await query<{ store_id: string | null }>(
    "SELECT store_id FROM products WHERE id = ?",
    [productId],
  ).catch(() => []);
  const newBatchId = crypto.randomUUID();
  const batchNumber = `${options.batchNumberPrefix || "ADJ"}-${new Date().toISOString().slice(0, 10)}`;
  const batch: StockBatch = {
    id: newBatchId,
    product_id: productId,
    batch_number: batchNumber,
    quantity: 0,
    cost_price: options.unitCost,
  };
  const storeId = productRows[0]?.store_id;
  await createStockBatch({
    ...batch,
    batch_number: batchNumber,
    // Only set explicitly when known — an explicit `store_id:
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-queries-inventory-ts-L539
    ...(storeId ? { store_id: storeId } : {}),
  });
  return batch;
}

// The product's live quantity:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-queries-inventory-ts-L560
export async function getProductStockQuantity(productId: string): Promise<number> {
  const rows = await query<{ qty: number }>(
    `SELECT COALESCE(SUM(quantity), 0) as qty FROM stock_batches WHERE product_id = ? AND _deleted = 0 AND is_active = 1`,
    [productId],
  );
  return rows[0]?.qty ?? 0;
}
