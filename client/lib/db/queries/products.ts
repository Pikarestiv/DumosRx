import { query } from "@/lib/db/local-database";

export async function getProductsWithDetails() {
  return query<any>(
    `SELECT m.*, c.name as category_name, v.name as supplier_name,
       (SELECT SUM(quantity) FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND is_active = 1) as stock_quantity,
       (SELECT cost_price FROM stock_batches WHERE product_id = m.id AND _deleted = 0 ORDER BY created_at DESC LIMIT 1) as cost_price,
       (SELECT expiry_date FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC LIMIT 1) as expiry_date,
       (SELECT batch_number FROM stock_batches WHERE product_id = m.id AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC LIMIT 1) as batch_number
     FROM products m
     LEFT JOIN categories c ON m.category_id = c.id
     LEFT JOIN suppliers v ON m.supplier_id = v.id
     WHERE m._deleted = 0
     ORDER BY m.created_at DESC`
  );
}

export async function getCategoriesList() {
  return query<any>(
    "SELECT name FROM categories WHERE _deleted = 0 ORDER BY name ASC"
  );
}

export async function getCategoryByName(name: string) {
  const existing = await query<any>(
    "SELECT id FROM categories WHERE name = ? AND _deleted = 0",
    [name],
  );
  if (existing && existing.length > 0) {
    return existing[0].id;
  }
  return null;
}

export async function getSupplierByName(name: string) {
  const existing = await query<any>(
    "SELECT id FROM suppliers WHERE name = ? AND _deleted = 0",
    [name],
  );
  if (existing && existing.length > 0) {
    return existing[0].id;
  }
  return null;
}

export async function getProductByName(name: string) {
  const med = await query<any>(
    "SELECT id FROM products WHERE name = ? LIMIT 1",
    [name],
  );
  return med && med.length > 0 ? med[0] : null;
}

export async function getProductList() {
  return query<any>(
    "SELECT id, name, brand_name, generic_name, category_id, manufacturer FROM products WHERE _deleted = 0 ORDER BY name ASC",
  );
}

export async function getProductsWithStock() {
  const items = await query<any>(
    "SELECT p.*, COALESCE(SUM(sb.quantity), 0) as stock_quantity, GROUP_CONCAT(sb.batch_number, ', ') as batch_number, AVG(sb.cost_price) as avg_cost_price FROM products p LEFT JOIN stock_batches sb ON p.id = sb.product_id AND sb._deleted = 0 AND sb.is_active = 1 WHERE p._deleted = 0 GROUP BY p.id ORDER BY p.name ASC",
  );

  return items.map((m: any) => ({
    id: m.id,
    name: m.name,
    generic_name: m.generic_name || "",
    brand: m.brand_name || m.brand || "",
    strength: m.strength || "",
    unit_price: m.selling_price || 0,
    stock: m.stock_quantity || 0,
    reorder_level: m.reorder_level || 10,
    cost_price: m.avg_cost_price || 0,
    barcode: m.barcode || "",
    batch_number: m.batch_number || "",
    category_id: m.category_id || "",
  }));
}

export async function getProductHistory(productId: string) {
  const auditLogs = await query<any>(
    "SELECT * FROM audit_logs WHERE record_id = ? ORDER BY created_at DESC",
    [productId]
  );
  
  const stockMovements = await query<any>(
    "SELECT * FROM stock_movements WHERE product_id = ? ORDER BY created_at DESC",
    [productId]
  );

  return {
    auditLogs: auditLogs || [],
    stockMovements: stockMovements || [],
  };
}
