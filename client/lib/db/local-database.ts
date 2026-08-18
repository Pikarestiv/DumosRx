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

import { query, execute, transaction, getActiveStoreId } from "./core";
import { insert, update, softDelete } from "./base-helpers";
import { queryClient } from "../query-client";
import { AUDIT_ACTIONS } from "./audit-actions";
import { queryKeys } from "../query-keys";
import type { NewProductPayload } from "@/lib/types/product";
import type { StockMovementDbRow } from "@/lib/types/stock-movement";
import type { PrescriptionItemInsertPayload } from "@/lib/types/prescription";
import type { StaffCreatePayload, StaffUpdatePayload, StaffListItem } from "@/lib/types/user";
import type { Product } from "@/lib/types/product";
import type { CustomerDbRow } from "@/lib/types/customer";

const STOCK_MOVEMENT_AUDIT_ACTIONS: Record<string, string> = {
  adjustment: AUDIT_ACTIONS.STOCK_ADJUSTMENT,
  expired: AUDIT_ACTIONS.STOCK_EXPIRED,
  damaged: AUDIT_ACTIONS.STOCK_DAMAGED,
};

// --- Specialized Domain Helpers ---

/**
 * Products & Stock Batch
 */
export async function getProducts(page = 1, limit = 50, search = "") {
  const offset = (page - 1) * limit;
  const storeId = getActiveStoreId();
  let sql = `SELECT m.*, c.name as category_name,
                    COALESCE(sb.total_qty, 0) as stock_quantity,
                    sb.earliest_expiry as expiry_date,
                    sb.batches as batch_number
             FROM products m
             LEFT JOIN categories c ON m.category_id = c.id
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
  const params: (string | number)[] = [];

  if (storeId) {
    sql += " AND m.store_id = ?";
    params.push(storeId);
  }

  if (search) {
    sql += " AND (m.name LIKE ? OR m.generic_name LIKE ? OR m.barcode LIKE ?)";
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  sql += " ORDER BY m.name ASC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const data = await query<Product>(sql, params);
  return { data, page, limit };
}

export async function getProductById(id: string) {
  const results = await query<Product>(
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

export async function createProduct(data: NewProductPayload) {
  // Ensure we have a valid UUID for category, else wait for sync
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (data.category_id && !UUID_REGEX.test(data.category_id)) {
    const storeId = getActiveStoreId();
    const categories = await query<{ id: string }>(
      `SELECT id FROM categories WHERE name = ? COLLATE NOCASE${storeId ? " AND store_id = ?" : ""}`,
      storeId ? [data.category_id, storeId] : [data.category_id],
    );
    if (categories.length > 0) {
      data.category_id = categories[0].id;
    } else {
      const newCatId = crypto.randomUUID();
      await insert("categories", { id: newCatId, name: data.category_id });
      data.category_id = newCatId;
    }
  }


  return await insert("products", data);
}

/**
 * Sales & Transactions
 */
interface CreateSaleItem {
  product_id: string;
  stock_batch_id?: string;
  quantity: number;
  cost_price?: number;
  [key: string]: unknown;
}

export async function createSale(saleData: Record<string, unknown>, items: CreateSaleItem[]) {
  return transaction(async () => {
    const saleId = await insert("sales", saleData);
    // stock_movements.performed_by is a required foreign key on the cloud
    // DB (no default) — reading it here the same way receivePurchaseOrder()
    // does, since it was never set on this insert before and every sale's
    // movement row was silently failing to sync as a result.
    const dumosUser = JSON.parse(localStorage.getItem("dumos_user") || "{}");

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
        performed_by: dumosUser?.id || null,
        movement_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        _version: 1,
        _synced: 0,
        _deleted: 0,
      });
    }

    return saleId;
  });
}

/**
 * Customers
 */
export async function getCustomers() {
  return await query<CustomerDbRow>(
    "SELECT * FROM customers WHERE _deleted = 0 ORDER BY first_name ASC",
  );
}

/**
 * Prescriptions
 */
export async function createPrescription(
  data: Record<string, unknown>,
  items: Omit<PrescriptionItemInsertPayload, "prescription_id">[],
) {
  const prescriptionId = await insert("prescriptions", data);

  for (const item of items) {
    await insert("prescription_items", {
      ...item,
      prescription_id: prescriptionId,
    });
  }

  // insert("prescriptions", ...) above already invalidated the prescriptions
  // query and refetched, but that refetch can race the prescription_items
  // inserts still running in this loop, caching a partial medications list.
  // Invalidate again now that all items exist.
  if (typeof window !== "undefined") {
    queryClient.invalidateQueries(queryKeys.prescriptions.all());
  }

  return prescriptionId;
}

/**
 * Staff & Users
 */
const STAFF_LIST_COLUMNS = "id, first_name, last_name, username, email, role, store_id, is_active, created_at";

export async function getUsers(storeId?: string | null) {
  // Fall back to the module-scope resolver (same one every other query file
  // uses) when the caller doesn't pass an explicit id — keeps this in step
  // with the rest of the app's store-scoping instead of being its own thing.
  storeId = storeId ?? getActiveStoreId();
  if (storeId) {
    return await query<StaffListItem>(
      `SELECT ${STAFF_LIST_COLUMNS} FROM users WHERE _deleted = 0 AND (store_id = ? OR store_id IS NULL OR role = 'admin' OR role = 'store_owner') ORDER BY first_name ASC`,
      [storeId],
    );
  }
  return await query<StaffListItem>(
    `SELECT ${STAFF_LIST_COLUMNS} FROM users WHERE _deleted = 0 ORDER BY first_name ASC`,
  );
}

export async function createUser(data: StaffCreatePayload) {
  return await insert("users", {
    ...data,
    id: data.id || crypto.randomUUID(),
    is_active: 1,
    created_at: new Date().toISOString(),
    _version: 1,
    _synced: 0,
  });
}

export async function updateUser(id: string, data: StaffUpdatePayload) {
  return await update("users", id, data);
}

export async function deleteUser(id: string) {
  return await softDelete("users", id);
}

/**
 * Stock Movements & Adjustments
 */
/**
 * Stock movements log a row per sale/receive/adjustment, so it's the fastest-growing
 * table in the schema — unlike other lists, we can't just load the full table forever.
 * Pass `sinceDays` for the default recent-activity view (cheap, bounded); omit it to
 * load full history, which the caller should only do when the user is actively
 * searching/filtering, so those still match against every record, not just what's
 * been loaded for browsing.
 */
/**
 * `from`/`to` (YYYY-MM-DD) take precedence over `sinceDays` when both are passed —
 * an explicit date-range pick from the UI overrides the relative window.
 */
export async function getStockMovements(
  options: { sinceDays?: number; from?: string; to?: string } = {},
) {
  const { sinceDays, from, to } = options;
  const storeId = getActiveStoreId();
  const params: string[] = [];
  let dateFilter = "";
  if (from || to) {
    if (from) {
      dateFilter += " AND sm.created_at >= ?";
      params.push(`${from} 00:00:00`);
    }
    if (to) {
      dateFilter += " AND sm.created_at <= ?";
      params.push(`${to} 23:59:59`);
    }
  } else if (sinceDays) {
    dateFilter = `AND sm.created_at >= datetime('now', '-${sinceDays} days')`;
  }
  const results = await query<StockMovementDbRow>(
    `SELECT sm.*, m.name as product_name,
            TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')) as performed_by_name,
            sb.batch_number, sp.name as supplier_name
     FROM stock_movements sm
     LEFT JOIN products m ON sm.product_id = m.id
     LEFT JOIN users u ON sm.performed_by = u.id
     LEFT JOIN stock_batches sb ON sm.stock_batch_id = sb.id
     LEFT JOIN suppliers sp ON sb.supplier_id = sp.id
     WHERE sm._deleted = 0 ${dateFilter}${storeId ? " AND sm.store_id = ?" : ""}
     ORDER BY sm.created_at DESC`,
    [...params, ...(storeId ? [storeId] : [])],
  );
  return { data: results };
}

export async function getStockAdjustments(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const storeId = getActiveStoreId();
  const results = await query<StockMovementDbRow>(
    `SELECT sm.*, m.name as product_name,
            TRIM(u.first_name || ' ' || COALESCE(u.last_name, '')) as performed_by_name,
            sb.batch_number, sp.name as supplier_name
     FROM stock_movements sm
     LEFT JOIN products m ON sm.product_id = m.id
     LEFT JOIN users u ON sm.performed_by = u.id
     LEFT JOIN stock_batches sb ON sm.stock_batch_id = sb.id
     LEFT JOIN suppliers sp ON sb.supplier_id = sp.id
     WHERE sm._deleted = 0 AND sm.movement_type IN ('adjustment', 'expired', 'damaged')${storeId ? " AND sm.store_id = ?" : ""}
     ORDER BY sm.created_at DESC
     LIMIT ? OFFSET ?`,
    storeId ? [storeId, limit, offset] : [limit, offset],
  );
  // Map fields to match what frontend expects
  const mapped = results.map((r) => ({
    ...r,
    adjustment_type: r.quantity > 0 ? "increase" : "decrease",
    approved: 1,
  }));
  return { data: mapped, page, limit };
}

export async function createStockMovement(data: Partial<StockMovementDbRow> & { id?: string }) {
  return await insert(
    "stock_movements",
    {
      ...data,
      id: data.id || crypto.randomUUID(),
      created_at: new Date().toISOString(),
      _version: 1,
      _synced: 0,
    },
    { action: STOCK_MOVEMENT_AUDIT_ACTIONS[data.movement_type as string] },
  );
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
      const records = await query<{ id: string; [key: string]: unknown }>(`SELECT * FROM ${table}`);

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
  window.forceSyncAllData = forceSyncAllData;
}
