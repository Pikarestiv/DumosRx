import { query } from "@/lib/db/local-database";

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
  batch_number: string;
  product_name: string;
  expiry_date: string;
  quantity: number;
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
    [productId]
  );
}

export async function getExpiringBatches() {
  return query<ExpiringItem>(`
    SELECT 
      sb.id, 
      sb.batch_number,
      p.name as product_name,
      sb.expiry_date,
      sb.quantity
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    WHERE sb._deleted = 0 AND p._deleted = 0 AND sb.quantity > 0
    ORDER BY sb.expiry_date ASC
    LIMIT 10
  `);
}
