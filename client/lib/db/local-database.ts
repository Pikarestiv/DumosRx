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
import { insert, remove } from "./base-helpers";

// --- Specialized Domain Helpers ---

/**
 * Medicines & Inventory
 */
export async function getMedicines(page = 1, limit = 50, search = "") {
  const offset = (page - 1) * limit;
  let sql = "SELECT * FROM medicines WHERE _deleted = 0";
  const params: any[] = [];

  if (search) {
    sql += " AND (name LIKE ? OR generic_name LIKE ? OR barcode LIKE ?)";
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  sql += " ORDER BY name ASC LIMIT ? OFFSET ?";
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
export async function getUsers() {
  return await query<any>("SELECT * FROM users WHERE _deleted = 0 ORDER BY name ASC");
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
  const sets = Object.keys(data).map(key => `${key} = ?`).join(", ");
  const params = [...Object.values(data), new Date().toISOString(), id] as (string | number | null | Uint8Array)[];
  return await execute(`UPDATE users SET ${sets}, updated_at = ? WHERE id = ?`, params);
}

export async function deleteUser(id: string) {
  return await execute("UPDATE users SET _deleted = 1, updated_at = ? WHERE id = ?", [new Date().toISOString(), id]);
}
