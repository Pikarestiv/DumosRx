import { query, getActiveStoreId } from "./core";
import { insert, update, softDelete } from "./base-helpers";
import type { SupplierPayload, SupplierDbRow } from "@/lib/types/supplier";

// Loads every supplier, not a page of them:
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-procurement-ts-L347
export async function getSuppliers() {
  const storeId = getActiveStoreId();
  const results = await query<SupplierDbRow>(
    `SELECT s.*,
            COALESCE(SUM(po.total_amount - po.amount_paid), 0) as total_debt,
            COALESCE(po_stats.total_orders, 0) as total_orders,
            COALESCE(po_stats.total_value, 0) as total_value,
            po_stats.last_order_date as last_order_date
     FROM suppliers s
     LEFT JOIN purchase_orders po ON s.id = po.supplier_id AND po._deleted = 0 AND COALESCE(po.payment_status, 'unpaid') != 'paid'${storeId ? " AND po.store_id = ?" : ""}
     LEFT JOIN (
       SELECT supplier_id, COUNT(*) as total_orders, SUM(total_amount) as total_value, MAX(order_date) as last_order_date
       FROM purchase_orders
       WHERE _deleted = 0${storeId ? " AND store_id = ?" : ""}
       GROUP BY supplier_id
     ) po_stats ON po_stats.supplier_id = s.id
     WHERE s._deleted = 0${storeId ? " AND s.store_id = ?" : ""}
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
    storeId ? [storeId, storeId, storeId] : [],
  );
  return { data: results };
}

export async function createSupplier(data: SupplierPayload) {
  return await insert("suppliers", data);
}

export async function updateSupplier(id: string, data: SupplierPayload) {
  return await update("suppliers", id, data);
}

export async function getSupplierOutstandingBalance(id: string): Promise<number> {
  const rows = await query<{ outstanding: number | null }>(
    `SELECT COALESCE(SUM(total_amount - amount_paid), 0) as outstanding
     FROM purchase_orders
     WHERE supplier_id = ? AND _deleted = 0 AND COALESCE(payment_status, 'unpaid') != 'paid'`,
    [id],
  );
  return Math.max(0, Number(rows[0]?.outstanding) || 0);
}

export async function deleteSupplier(id: string): Promise<void> {
  const outstanding = await getSupplierOutstandingBalance(id);
  if (outstanding > 0) {
    throw new Error(
      "This supplier is still owed money on an unpaid purchase order. Settle or write off the balance before deleting them.",
    );
  }
  await softDelete("suppliers", id);
}
