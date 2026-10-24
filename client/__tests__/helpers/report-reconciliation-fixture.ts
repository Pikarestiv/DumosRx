import type { Database } from "sql.js";

export const STORE_A = "store-a";
export const STORE_B = "store-b";

/** Local (Africa/Lagos) 2026-03-02 00:00 .. 2026-03-04 23:59:59.999, as the
 * UTC ISO strings toQueryRange() would hand the report queries. */
export const RANGE_FROM = "2026-03-01T23:00:00.000Z";
export const RANGE_TO = "2026-03-04T22:59:59.999Z";

export interface RawSale {
  id: string;
  store_id: string | null;
  transaction_date: string;
  total_amount: number;
  tax_amount?: number;
  _deleted: number | null;
}
export interface RawSaleItem {
  id: string;
  sale_id: string;
  quantity: number;
  cost_price: number;
  total_price: number;
  _deleted: number | null;
}
export interface RawReturn {
  id: string;
  sale_id: string;
  store_id: string | null;
  created_at: string;
  total_refunded: number;
  _deleted: number | null;
}
export interface RawReturnItem {
  id: string;
  return_id: string;
  product_id: string;
  quantity: number;
  _deleted: number | null;
}
export interface RawBatch {
  id: string;
  product_id: string;
  store_id: string | null;
  quantity: number;
  cost_price: number | null;
  _deleted: number | null;
}

export function seedReconciliationFixture(db: Database): void {
  db.run(
    `INSERT INTO users (id, first_name, last_name, _deleted) VALUES ('u1', 'Ada', 'Cashier', 0)`,
  );
  db.run(
    `INSERT INTO categories (id, name, store_id, _deleted) VALUES ('cat1', 'Analgesics', '${STORE_A}', 0)`,
  );
  db.run(
    `INSERT INTO products (id, name, category_id, selling_price, store_id, created_at, _deleted) VALUES
      ('p1', 'Paracetamol', 'cat1', 500, '${STORE_A}', '2026-01-01T00:00:00.000Z', 0),
      ('p2', 'Amoxicillin', 'cat1', 1200, '${STORE_A}', '2026-01-01T00:00:00.000Z', 0),
      ('p3', 'Ibuprofen',  NULL,   800, '${STORE_B}', '2026-01-01T00:00:00.000Z', 0)`,
  );

  // Inventory: live store-a batches, a zero-quantity one, a soft-deleted
  // one, a store-b batch, and a store-b-attributed batch hanging off a
  // store-a product (the cross-store leak shape).
  db.run(
    `INSERT INTO stock_batches (id, product_id, store_id, quantity, cost_price, is_active, _deleted) VALUES
      ('b1', 'p1', '${STORE_A}', 40, 300, 1, 0),
      ('b2', 'p1', '${STORE_A}', 10, 320, 1, 0),
      ('b3', 'p2', '${STORE_A}',  6, 900, 1, 0),
      ('b4', 'p2', '${STORE_A}',  0, 880, 1, 0),
      ('b5', 'p1', '${STORE_A}', 25, 310, 1, 1),
      ('b6', 'p3', '${STORE_B}', 70, 500, 1, 0),
      ('b7', 'p1', '${STORE_B}', 99, 999, 1, 0)`,
  );

  // Sales. Timestamps are UTC; the local (UTC+1) day is noted per row.
  //   sA0  2026-02-28T23:30Z -> local 2026-03-01 00:30  (UTC month Feb,
  //                                                      LOCAL month Mar)
  //   sA1  2026-03-01T22:30Z -> local 2026-03-01 23:30  (before range)
  //   sA2  2026-03-01T23:30Z -> local 2026-03-02 00:30  (range's first ms+)
  //   sA3  2026-03-03T12:00Z -> local 2026-03-03 13:00  (mid range)
  //   sA4  2026-03-04T22:30Z -> local 2026-03-04 23:30  (range's last day)
  //   sA5  2026-03-04T23:30Z -> local 2026-03-05 00:30  (after range)
  //   sAX  soft-deleted, mid range
  //   sB1  store-b, mid range
  db.run(
    `INSERT INTO sales (id, transaction_number, user_id, subtotal, tax_amount, discount_total, total_amount, payment_method, transaction_date, created_at, store_id, _deleted) VALUES
      ('sA0', 'TXN-A0', 'u1', 4000,  200, 0, 4200, 'cash',   '2026-02-28T23:30:00.000Z', '2026-02-28T23:30:00.000Z', '${STORE_A}', 0),
      ('sA1', 'TXN-A1', 'u1', 1000,   50, 0, 1050, 'cash',   '2026-03-01T22:30:00.000Z', '2026-03-01T22:30:00.000Z', '${STORE_A}', 0),
      ('sA2', 'TXN-A2', 'u1', 2500,  125, 0, 2625, 'card',   '2026-03-01T23:30:00.000Z', '2026-03-01T23:30:00.000Z', '${STORE_A}', 0),
      ('sA3', 'TXN-A3', 'u1', 7300,  365, 0, 7665, 'cash',   '2026-03-03T12:00:00.000Z', '2026-03-03T12:00:00.000Z', '${STORE_A}', 0),
      ('sA4', 'TXN-A4', 'u1', 1800,   90, 0, 1890, 'credit', '2026-03-04T22:30:00.000Z', '2026-03-04T22:30:00.000Z', '${STORE_A}', 0),
      ('sA5', 'TXN-A5', 'u1',  900,   45, 0,  945, 'cash',   '2026-03-04T23:30:00.000Z', '2026-03-04T23:30:00.000Z', '${STORE_A}', 0),
      ('sAX', 'TXN-AX', 'u1', 5000,  250, 0, 5250, 'cash',   '2026-03-03T09:00:00.000Z', '2026-03-03T09:00:00.000Z', '${STORE_A}', 1),
      ('sB1', 'TXN-B1', 'u1', 6000,  300, 0, 6300, 'cash',   '2026-03-03T12:00:00.000Z', '2026-03-03T12:00:00.000Z', '${STORE_B}', 0)`,
  );

  // sA3 is deliberately a 3-line sale (two lines for the same product) so a
  // revenue query that joins sale_items would fan its total_amount out.
  db.run(
    `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, _deleted) VALUES
      ('iA0a', 'sA0', 'p1', 8, 500, 300, 4000, 0),
      ('iA1a', 'sA1', 'p1', 2, 500, 300, 1000, 0),
      ('iA2a', 'sA2', 'p1', 2, 500, 300, 1000, 0),
      ('iA2b', 'sA2', 'p2', 1, 1500, 900, 1500, 0),
      ('iA3a', 'sA3', 'p1', 4, 500, 300, 2000, 0),
      ('iA3b', 'sA3', 'p1', 2, 400, 320, 800, 0),
      ('iA3c', 'sA3', 'p2', 3, 1500, 900, 4500, 0),
      ('iA4a', 'sA4', 'p2', 1, 1800, 950, 1800, 0),
      ('iA5a', 'sA5', 'p1', 1, 900, 300, 900, 0),
      ('iAXa', 'sAX', 'p1', 9, 500, 300, 5000, 0),
      ('iB1a', 'sB1', 'p3', 6, 1000, 500, 6000, 0)`,
  );

  db.run(
    `INSERT INTO returns (id, sale_id, user_id, total_refunded, created_at, store_id, _deleted) VALUES
      ('r1', 'sA3', 'u1', 800, '2026-03-03T15:00:00.000Z', '${STORE_A}', 0)`,
  );
  db.run(
    `INSERT INTO return_items (id, return_id, product_id, quantity, unit_price, subtotal, _deleted) VALUES
      ('ri1', 'r1', 'p1', 2, 400, 800, 0)`,
  );

  db.run(
    `INSERT INTO expenses (id, category, description, amount, date, store_id, _deleted) VALUES
      ('e1', 'rent', 'March rent',  15000, '2026-03-02', '${STORE_A}', 0),
      ('e2', 'power', 'Diesel',      3000, '2026-03-04', '${STORE_A}', 0),
      ('e3', 'power', 'Other store', 9000, '2026-03-03', '${STORE_B}', 0)`,
  );
}
