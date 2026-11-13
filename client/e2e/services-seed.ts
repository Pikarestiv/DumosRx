import type { SeedStatement } from './local-db';

export const STAFF_PIN = '1234';
export const ROLE_USERS = {
  admin: 'e2e_admin',
  specialist: 'e2e_specialist',
  sales_staff: 'e2e_sales',
  auditor: 'e2e_auditor',
} as const;

export function roleUsers(storeId: string): SeedStatement[] {
  return Object.entries(ROLE_USERS).map(([role, username]) => [
    `INSERT INTO users (id, first_name, last_name, username, pin, role, store_id, is_active, created_at, updated_at)
     VALUES (?, 'E2E', ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [`user-${username}`, role, username, STAFF_PIN, role, storeId],
  ]);
}

export function service(storeId: string, id: string, name: string, price: number): SeedStatement {
  return [
    `INSERT INTO services (id, store_id, name, code, category, price, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'Consultation', ?, 1, datetime('now'), datetime('now'))`,
    [id, storeId, name, id.toUpperCase(), price],
  ];
}

export function stockedProduct(storeId: string, id: string, name: string, price: number, qty: number): SeedStatement[] {
  const statements: SeedStatement[] = [
    [
      `INSERT INTO products (id, name, selling_price, reorder_level, is_active, store_id, created_at, updated_at)
       VALUES (?, ?, ?, 2, 1, ?, datetime('now'), datetime('now'))`,
      [id, name, price, storeId],
    ],
  ];
  if (qty > 0) {
    statements.push([
      `INSERT INTO stock_batches (id, product_id, batch_number, expiry_date, quantity, cost_price, selling_price,
         is_active, received_date, store_id, created_at, updated_at)
       VALUES (?, ?, 'E2E-B1', '2030-12-31', ?, ?, ?, 1, date('now'), ?, datetime('now'), datetime('now'))`,
      [`${id}-batch`, id, qty, Math.round(price / 2), price, storeId],
    ]);
  }
  return statements;
}

export function allowSaleWithoutStock(storeId: string): SeedStatement {
  return ['UPDATE stores SET allow_sale_without_stock = 1 WHERE id = ?', [storeId]];
}
