import { query } from "@/lib/db/local-database";
import { getActiveStoreId } from "@/lib/db/core";
import type { Product, ProductWithDetails, ProductWithStockRow, POSProduct } from "@/lib/types/product";
import type { AuditLogRow } from "@/lib/types/audit-log";
import type { StockMovementHistoryRow } from "@/lib/types/stock-movement";

export async function getProductsWithDetails() {
  const storeId = getActiveStoreId();
  return query<ProductWithDetails>(
    `SELECT m.*, c.name as category_name,
       (SELECT SUM(quantity) FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND is_active = 1) as stock_quantity,
       (SELECT AVG(cost_price) FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND is_active = 1 AND quantity > 0) as cost_price,
       (SELECT expiry_date FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC LIMIT 1) as expiry_date,
       (SELECT batch_number FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC LIMIT 1) as batch_number,
       (SELECT MAX(reconciled_at) FROM stock_audits WHERE product_id = m.id AND _deleted = 0 AND status = 'reconciled') as last_audited_at
     FROM products m
     LEFT JOIN categories c ON m.category_id = c.id
     WHERE m._deleted = 0${storeId ? " AND m.store_id = ?" : ""}
     ORDER BY m.created_at DESC`,
    storeId ? [storeId] : [],
  );
}

export async function getCategoriesList() {
  const storeId = getActiveStoreId();
  return query<{ name: string }>(
    `SELECT name FROM categories WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""} ORDER BY name ASC`,
    storeId ? [storeId] : [],
  );
}

export async function getCategoryByName(name: string) {
  const existing = await query<{ id: string }>(
    "SELECT id FROM categories WHERE name = ? AND _deleted = 0",
    [name],
  );
  if (existing && existing.length > 0) {
    return existing[0].id;
  }
  return null;
}

export async function getSupplierByName(name: string) {
  const storeId = getActiveStoreId();
  const existing = await query<{ id: string }>(
    `SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE AND _deleted = 0${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [name, storeId] : [name],
  );
  if (existing && existing.length > 0) {
    return existing[0].id;
  }
  return null;
}

export async function getSupplierNames() {
  const storeId = getActiveStoreId();
  const suppliers = await query<{ name: string }>(
    `SELECT name FROM suppliers WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}`,
    storeId ? [storeId] : [],
  );
  return suppliers.map((s) => s.name);
}

/** Lightweight product lookup for contexts (e.g. stock movement detail) that
 * only need the name/generic name/dosage form, not the full product record. */
export async function getProductBasicInfo(productId: string) {
  const rows = await query<{ name: string; generic_name?: string; dosage_form?: string }>(
    "SELECT name, generic_name, dosage_form FROM products WHERE id = ?",
    [productId],
  );
  return rows[0] || null;
}

export async function getProductByName(name: string) {
  const storeId = getActiveStoreId();
  const med = await query<{ id: string }>(
    `SELECT id FROM products WHERE name = ?${storeId ? " AND store_id = ?" : ""} LIMIT 1`,
    storeId ? [name, storeId] : [name],
  );
  return med && med.length > 0 ? med[0] : null;
}

export async function getProductList() {
  const storeId = getActiveStoreId();
  return query<Product>(
    `SELECT p.id, p.name, p.generic_name, p.category_id, c.name as category_name, p.manufacturer, p.strength, p.dosage_form
     FROM products p
     LEFT JOIN categories c ON c.id = p.category_id AND c._deleted = 0
     WHERE p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
     ORDER BY p.name ASC`,
    storeId ? [storeId] : [],
  );
}

export async function getProductsWithStock(): Promise<POSProduct[]> {
  const storeId = getActiveStoreId();
  const items = await query<ProductWithStockRow>(
    `SELECT p.*, c.name as category_name, COALESCE(SUM(sb.quantity), 0) as stock_quantity, GROUP_CONCAT(sb.batch_number, ', ') as batch_number, AVG(sb.cost_price) as avg_cost_price
     FROM products p
     LEFT JOIN categories c ON p.category_id = c.id AND c._deleted = 0
     LEFT JOIN stock_batches sb ON p.id = sb.product_id AND sb._deleted = 0 AND sb.is_active = 1
     WHERE p._deleted = 0${storeId ? " AND p.store_id = ?" : ""}
     GROUP BY p.id
     ORDER BY p.name ASC`,
    storeId ? [storeId] : [],
  );

  return items.map((m) => ({
    id: m.id,
    name: m.name,
    generic_name: m.generic_name || "",
    strength: m.strength || "",
    unit_price: m.selling_price || 0,
    stock: m.stock_quantity || 0,
    reorder_level: m.reorder_level || 10,
    cost_price: m.avg_cost_price || 0,
    barcode: m.barcode || "",
    batch_number: m.batch_number || "",
    category_id: m.category_id || "",
    category_name: m.category_name || "",
  }));
}

export interface ProductCreator {
  created_at: string;
  user_name: string | null;
}

/** Earliest audit_logs entry for this product, for the Details tab's
 * "Created by / Date created" line; the fuller trail lives in the
 * History tab via getProductHistory() below. */
export async function getProductCreator(
  productId: string,
): Promise<ProductCreator | null> {
  const rows = await query<ProductCreator>(
    `SELECT al.created_at, TRIM(u.first_name || ' ' || u.last_name) as user_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.table_name = 'products' AND al.record_id = ? AND UPPER(al.action) = 'INSERT'
     ORDER BY al.created_at ASC
     LIMIT 1`,
    [productId],
  );
  return rows[0] || null;
}

/** @param viewerId - when provided, restricts results to entries performed by this
 * user (pass undefined for viewers allowed to see everyone's activity, i.e.
 * checkCanViewAllActivity(role) === true). */
export async function getProductHistory(productId: string, viewerId?: string) {
  const auditLogs = await query<AuditLogRow>(
    `SELECT al.*, TRIM(u.first_name || ' ' || u.last_name) as user_name
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.record_id = ?${viewerId ? " AND al.user_id = ?" : ""}
     ORDER BY al.created_at DESC`,
    viewerId ? [productId, viewerId] : [productId]
  );

  const stockMovements = await query<StockMovementHistoryRow>(
    `SELECT sm.*, TRIM(u.first_name || ' ' || u.last_name) as performed_by_name
     FROM stock_movements sm
     LEFT JOIN users u ON u.id = sm.performed_by
     WHERE sm.product_id = ?${viewerId ? " AND sm.performed_by = ?" : ""}
     ORDER BY sm.created_at DESC`,
    viewerId ? [productId, viewerId] : [productId]
  );

  return {
    auditLogs: auditLogs || [],
    stockMovements: stockMovements || [],
  };
}
