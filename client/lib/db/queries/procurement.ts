import { query } from "@/lib/db/local-database";

export interface POVendor {
  id: string;
  name: string;
}

export interface POProduct {
  id: string;
  name: string;
  bulk_unit: string;
  base_unit: string;
  units_per_bulk: number;
  cost_price: number;
  stock_quantity: number;
}

export interface FullVendor {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  payment_terms: string;
}

export async function getActiveSuppliersForPO() {
  return query<POVendor>("SELECT id, name FROM suppliers WHERE _deleted = 0");
}

export async function getAllVendors() {
  return query<FullVendor>("SELECT * FROM suppliers WHERE _deleted = 0 ORDER BY name ASC");
}

export async function getActiveProductsForPO() {
  return query<POProduct>(
    `SELECT p.id, p.name, p.bulk_unit, p.base_unit, p.units_per_bulk,
       (SELECT AVG(cost_price) FROM stock_batches WHERE product_id = p.id AND _deleted = 0 AND is_active = 1 AND quantity > 0) as cost_price,
       COALESCE((SELECT SUM(quantity) FROM stock_batches WHERE product_id = p.id AND _deleted = 0 AND is_active = 1), 0) as stock_quantity
     FROM products p WHERE p._deleted = 0`
  );
}
