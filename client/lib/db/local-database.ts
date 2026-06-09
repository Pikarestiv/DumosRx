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
 * Medicines & Inventory
 */
export async function getMedicines(page = 1, limit = 50, search = "") {
  const offset = (page - 1) * limit;
  let sql = `SELECT m.*, c.name as category_name, v.name as supplier_name 
             FROM medicines m 
             LEFT JOIN categories c ON m.category_id = c.id 
             LEFT JOIN vendors v ON m.supplier_id = v.id 
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

export async function getMedicineById(id: string) {
  const results = await query<any>("SELECT * FROM medicines WHERE id = ?", [id]);
  return results[0] || null;
}

export async function createMedicine(data: any) {
  return await insert("medicines", data);
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

    // Update inventory quantity
    if (item.inventory_id) {
      await execute(
        "UPDATE inventory SET quantity = quantity - ? WHERE id = ?",
        [item.quantity, item.inventory_id]
      );
    }
    
    // Update main medicine stock
    await execute(
      "UPDATE medicines SET stock_quantity = stock_quantity - ? WHERE id = ?",
      [item.quantity, item.medicine_id]
    );

    // Log local stock movement
    await insert("stock_movements", {
      id: crypto.randomUUID(),
      medicine_id: item.medicine_id,
      inventory_id: item.inventory_id || null,
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
      _deleted: 0
    });
  }

  return saleId;
}

/**
 * Customers
 */
export async function getCustomers() {
  return await query<any>("SELECT * FROM customers WHERE _deleted = 0 ORDER BY first_name ASC");
}

/**
 * Expenses
 */
export async function getExpenses(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<any>(
    "SELECT * FROM expenses WHERE _deleted = 0 ORDER BY date DESC LIMIT ? OFFSET ?",
    [limit, offset]
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
    await insert("prescription_items", {
      ...item,
      prescription_id: prescriptionId,
    });
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
      [storeId]
    );
  }
  return await query<any>("SELECT * FROM users WHERE _deleted = 0 ORDER BY first_name ASC");
}

export async function createUser(data: any) {
  return await insert("users", {
    ...data,
    id: data.id || crypto.randomUUID(),
    is_active: 1,
    created_at: new Date().toISOString(),
    _version: 1,
    _synced: 0
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
    `SELECT sm.*, m.name as medicine_name 
     FROM stock_movements sm 
     LEFT JOIN medicines m ON sm.medicine_id = m.id 
     WHERE sm._deleted = 0 
     ORDER BY sm.created_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return { data: results, page, limit };
}

export async function getStockAdjustments(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<any>(
    `SELECT sm.*, m.name as medicine_name 
     FROM stock_movements sm 
     LEFT JOIN medicines m ON sm.medicine_id = m.id 
     WHERE sm._deleted = 0 AND sm.movement_type IN ('adjustment', 'expired', 'damaged') 
     ORDER BY sm.created_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  // Map fields to match what frontend expects
  const mapped = results.map((r: any) => ({
    ...r,
    adjustment_type: r.quantity > 0 ? "increase" : "decrease",
    approved: 1
  }));
  return { data: mapped, page, limit };
}

export async function createStockMovement(data: any) {
  return await insert("stock_movements", {
    ...data,
    id: data.id || crypto.randomUUID(),
    created_at: new Date().toISOString(),
    _version: 1,
    _synced: 0
  });
}
