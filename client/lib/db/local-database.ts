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
import { insert, update } from "./base-helpers";

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
