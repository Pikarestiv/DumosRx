/**
 * LocalDatabase - SQLite wrapper for offline-first operation
 *
 * This file serves as the main entry point for database operations,
 * re-exporting core logic and specialized helpers.
 */

export * from "./core";
export * from "./base-helpers";
export * from "./procurement";
export * from "./schema";

import { query, execute } from "./core";
import { insert, update, softDelete } from "./base-helpers";

// --- Specialized Domain Helpers ---

/**
 * Products & Stock Batch
 */
export async function getProducts(page = 1, limit = 50, search = "") {
  const offset = (page - 1) * limit;
  let sql = `SELECT m.*, c.name as category_name, v.name as supplier_name, 
                    COALESCE(sb.total_qty, 0) as stock_quantity,
                    sb.earliest_expiry as expiry_date,
                    sb.batches as batch_number
             FROM products m 
             LEFT JOIN categories c ON m.category_id = c.id 
             LEFT JOIN suppliers v ON m.supplier_id = v.id 
             LEFT JOIN (
               SELECT product_id, 
                      SUM(quantity) as total_qty,
                      MIN(expiry_date) as earliest_expiry,
                      GROUP_CONCAT(batch_number, ', ') as batches
               FROM stock_batches 
               WHERE _deleted = 0 AND is_active = 1 
               GROUP BY product_id
             ) sb ON m.id = sb.product_id
             WHERE m._deleted = 0`;
  const params: any[] = [];

  if (search) {
    sql += " AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.barcode LIKE ?)";
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  sql += " ORDER BY m.name ASC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const data = await query<any>(sql, params);
  return { data, page, limit };
}

export async function getProductById(id: string) {
  const results = await query<any>(
    `SELECT p.*, 
            COALESCE(sb.total_qty, 0) as stock_quantity,
            sb.earliest_expiry as expiry_date,
            sb.batches as batch_number
     FROM products p 
     LEFT JOIN (
       SELECT product_id, 
              SUM(quantity) as total_qty,
              MIN(expiry_date) as earliest_expiry,
              GROUP_CONCAT(batch_number, ', ') as batches
       FROM stock_batches 
       WHERE _deleted = 0 AND is_active = 1 
       GROUP BY product_id
     ) sb ON p.id = sb.product_id 
     WHERE p.id = ?`,
    [id],
  );
  return results[0] || null;
}

export async function createProduct(data: any) {
  return await insert("products", data);
}

/**
 * Sales & Transactions
 */
export async function createSale(saleData: any, items: any[]) {
  const saleId = await insert("sales", saleData);

  for (const item of items) {
    await insert("sale_items", {
      ...item,
      sale_id: saleId,
    });

    // Update stock batch quantity
    if (item.stock_batch_id) {
      await execute(
        "UPDATE stock_batches SET quantity = quantity - ? WHERE id = ?",
        [item.quantity, item.stock_batch_id],
      );
    }

    // Log local stock movement
    await insert("stock_movements", {
      id: crypto.randomUUID(),
      product_id: item.product_id,
      stock_batch_id: item.stock_batch_id || null,
      movement_type: "sale",
      quantity: -Math.abs(item.quantity),
      unit_cost: item.cost_price || 0,
      total_cost: (item.cost_price || 0) * item.quantity,
      reference_id: saleId,
      reference_type: "sale",
      reason: "Customer sale",
      movement_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      _version: 1,
      _synced: 0,
      _deleted: 0,
    });
  }

  return saleId;
}

/**
 * Customers
 */
export async function getCustomers() {
  return await query<any>(
    "SELECT * FROM customers WHERE _deleted = 0 ORDER BY first_name ASC",
  );
}

/**
 * Expenses
 */
export async function getExpenses(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<any>(
    "SELECT * FROM expenses WHERE _deleted = 0 ORDER BY date DESC LIMIT ? OFFSET ?",
    [limit, offset],
  );
  return { data: results, page, limit };
}

export async function createExpense(data: any) {
  return await insert("expenses", data);
}

/**
 * Prescriptions
 */
export async function createPrescription(data: any, items: any[]) {
  const prescriptionId = await insert("prescriptions", data);

  for (const item of items) {
    try {
      await insert("prescription_items", {
        ...item,
        prescription_id: prescriptionId,
      });
    } catch (err: any) {
      if (err.message && err.message.includes("no column named product_name")) {
        const { product_name, ...rest } = item;
        await insert("prescription_items", {
          ...rest,
          medicine_name: item.product_name,
          prescription_id: prescriptionId,
        });
      } else if (err.message && err.message.includes("medicine_name")) {
        await insert("prescription_items", {
          ...item,
          medicine_name: item.product_name,
          prescription_id: prescriptionId,
        });
      } else {
        throw err;
      }
    }
  }

  return prescriptionId;
}

/**
 * Staff & Users
 */
export async function getUsers(storeId?: string | null) {
  if (storeId) {
    return await query<any>(
      "SELECT * FROM users WHERE _deleted = 0 AND (store_id = ? OR store_id IS NULL OR role = 'admin' OR role = 'store_owner') ORDER BY first_name ASC",
      [storeId],
    );
  }
  return await query<any>(
    "SELECT * FROM users WHERE _deleted = 0 ORDER BY first_name ASC",
  );
}

export async function createUser(data: any) {
  return await insert("users", {
    ...data,
    id: data.id || crypto.randomUUID(),
    is_active: 1,
    created_at: new Date().toISOString(),
    _version: 1,
    _synced: 0,
  });
}

export async function updateUser(id: string, data: any) {
  return await update("users", id, data);
}

export async function deleteUser(id: string) {
  return await softDelete("users", id);
}

/**
 * Stock Movements & Adjustments
 */
export async function getStockMovements(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<any>(
    `SELECT sm.*, m.name as product_name 
     FROM stock_movements sm 
     LEFT JOIN products m ON sm.product_id = m.id 
     WHERE sm._deleted = 0 
     ORDER BY sm.created_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return { data: results, page, limit };
}

export async function getStockAdjustments(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<any>(
    `SELECT sm.*, m.name as product_name 
     FROM stock_movements sm 
     LEFT JOIN products m ON sm.product_id = m.id 
     WHERE sm._deleted = 0 AND sm.movement_type IN ('adjustment', 'expired', 'damaged') 
     ORDER BY sm.created_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  // Map fields to match what frontend expects
  const mapped = results.map((r: any) => ({
    ...r,
    adjustment_type: r.quantity > 0 ? "increase" : "decrease",
    approved: 1,
  }));
  return { data: mapped, page, limit };
}

export async function createStockMovement(data: any) {
  return await insert("stock_movements", {
    ...data,
    id: data.id || crypto.randomUUID(),
    created_at: new Date().toISOString(),
    _version: 1,
    _synced: 0,
  });
}

// Dev utility to force sync all tables
export async function forceSyncAllData() {
  const tables = [
    "products",
    "stock_batches",
    "categories",
    "customers",
    "sales",
    "sale_items",
    "prescriptions",
    "prescription_items",
    "returns",
    "return_items",
    "customer_payments",
    "stores",
    "expenses",
    "users",
    "audit_logs",
    "purchase_orders",
    "purchase_order_items",
    "suppliers",
    "stock_audits",
    "held_transactions",
    "loyalty_transactions",
    "feedback",
    "stock_movements",
    "payment_accounts",
    "system_configs",
  ];

  console.log(
    "Marking all local data as un-synced and adding to sync queue...",
  );
  let count = 0;
  await execute(`DELETE FROM _sync_queue`); // Clear existing queue to prevent duplicates

  const now = new Date().toISOString();

  for (const table of tables) {
    try {
      await execute(`UPDATE ${table} SET _synced = 0`);
      const records = await query<any>(`SELECT * FROM ${table}`);

      for (const record of records) {
        await execute(
          `INSERT INTO _sync_queue (table_name, record_id, operation, payload, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          [table, record.id, "INSERT", JSON.stringify(record), now],
        );
        count++;
      }
    } catch (_e) {
      // Table might not exist or error, ignore
    }
  }
  console.log(
    `Successfully queued ${count} records for syncing. You can now press 'Sync' on the POS to push everything to the cloud.`,
  );
  return `Done! Queued ${count} records. You can now press 'Sync' on the POS to push everything to the cloud.`;
}

if (typeof window !== "undefined") {
  (window as any).forceSyncAllData = forceSyncAllData;
}
