/**
 * Procurement Database Helpers
 */

import { query, generateId, transaction, getActiveStoreId } from "./core";
import { insert, update, softDelete } from "./base-helpers";
import type { SupplierPayload, SupplierDbRow } from "@/lib/types/supplier";

/** Line-item form fields (selling_price, cost_price_override) come in as
 * `number | string | undefined` from raw form inputs - blank/undefined
 * means "not overridden," not zero. Also accepts `null` even though the
 * declared type doesn't advertise it: a PO reloaded from the DB via
 * getPurchaseOrderById() genuinely hands back SQL NULL for an unset
 * override (not `undefined`), and re-saving that PO (e.g. via
 * updatePurchaseOrder after editing something else) routes the same value
 * straight back through this function - `Number(null) === 0` would
 * silently turn "no override" into a literal, permanent 0 override. */
export function coerceOptionalNumber(
  value: number | string | null | undefined,
): number | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** `partially_received` sits between `sent` and `received`: at least one
 * line has some stock in, but at least one line still has an outstanding
 * balance, so the order stays receivable. */
export const PURCHASE_ORDER_STATUSES = [
  "pending",
  "sent",
  "partially_received",
  "received",
] as const;

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export function isReceivablePurchaseOrderStatus(status: string): boolean {
  return status === "pending" || status === "sent" || status === "partially_received";
}

export interface PurchaseOrder {
  id: string;
  order_number?: string;
  order_date?: string;
  /** Null for a self/walk-in purchase with no real vendor on file — same
   * convention as sales.customer_id supporting a null "Walk-in Customer". */
  supplier_id: string | null;
  status: string;
  type: string;
  total_amount: number;
  notes?: string;
  created_at: string;
  received_at?: string;
  vendor_name: string;
  payment_status: string;
  amount_paid: number;
  due_date?: string;
  has_missing_expiry?: boolean;
  items?: PurchaseOrderItem[];
  ordered_by?: string;
  ordered_by_name?: string;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  product_id: string;
  bulk_quantity: number;
  /** Cumulative quantity received so far against this line, in the same
   * unit as bulk_quantity. A line is outstanding while it's below
   * bulk_quantity, which is what keeps a short-delivered PO receivable. */
  quantity_received?: number;
  units_per_bulk: number;
  unit_cost: number;
  subtotal: number;
  product_name: string;
  base_unit: string;
  bulk_unit: string;
  /** Live conversion factor from the product record; always used for receiving math, since units_per_bulk above is a point-in-time snapshot that can go stale if the product's packaging is edited later. */
  product_units_per_bulk: number;
  selling_price?: number | string;
  cost_price_override?: number | string;
  lot_number?: string;
  expiry_date?: string;
}

/** A line item as it exists in the create/edit PO form before submission:
 * not yet persisted, so it has no `id`/`po_id` (those are assigned by
 * createPurchaseOrder()/updatePurchaseOrder()). Immediate-purchase-only
 * fields are optional here (rather than only on ImmediateLineItemDraft)
 * so a Standard PO's items - which never set them - and an Immediate
 * Purchase's - which do - can share one persistence path and both survive
 * being saved as a draft. */
export interface DraftPOLineItem {
  product_id: string;
  product_name: string;
  bulk_unit: string;
  bulk_quantity: number;
  units_per_bulk: number;
  unit_cost: number;
  subtotal: number;
  cost_price_override?: number | string;
  lot_number?: string;
  expiry_date?: string;
  selling_price?: number | string;
}

export interface PODetailItem {
  id: string;
  product_name?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

/** Line items for the purchase order detail view: aliased to the display
 * field names the dialog renders directly. */
export async function getPurchaseOrderItemsForDetail(poId: string) {
  return query<PODetailItem>(
    `SELECT
      poi.*,
      p.name as product_name,
      poi.bulk_quantity as quantity,
      poi.unit_cost as unit_price,
      poi.subtotal as total_price
     FROM purchase_order_items poi
     LEFT JOIN products p ON poi.product_id = p.id
     WHERE poi.po_id = ? AND poi._deleted = 0`,
    [poId],
  );
}

/**
 * Loads every purchase order, not a page of them: the caller runs search/filter
 * over the result, and this data set is small enough (dozens to low hundreds per
 * store) that in-memory filtering stays correct without needing SQL-level WHERE
 * clauses, matching the pattern used by getCustomers()/getDebtors() etc.
 *
 * @param viewerId - when provided, restricts results to orders placed by this
 * user (pass undefined for viewers allowed to see everyone's activity, i.e.
 * checkCanViewAllActivity(role) === true).
 */
export async function getPurchaseOrders(viewerId?: string) {
  const storeId = getActiveStoreId();
  const params = [...(viewerId ? [viewerId] : []), ...(storeId ? [storeId] : [])];
  const results = await query<PurchaseOrder>(
    `SELECT po.*, COALESCE(v.name, 'Self / Walk-in Purchase') as vendor_name,
       TRIM(u.first_name || ' ' || u.last_name) as ordered_by_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM stock_movements sm
         JOIN stock_batches sb ON sm.stock_batch_id = sb.id
         WHERE sm.reference_id = po.id AND sm.reference_type = 'purchase_order'
         AND (sb.expiry_date IS NULL OR sb.expiry_date = '')
       ) THEN 1 ELSE 0 END as has_missing_expiry
     FROM purchase_orders po
     LEFT JOIN suppliers v ON po.supplier_id = v.id
     LEFT JOIN users u ON u.id = po.ordered_by
     WHERE po._deleted = 0${viewerId ? " AND po.ordered_by = ?" : ""}${storeId ? " AND po.store_id = ?" : ""}
     ORDER BY po.created_at DESC`,
    params,
  );
  return { data: results };
}

export async function getPurchaseOrderById(id: string) {
  const po = await query<PurchaseOrder>(
    `SELECT po.*, COALESCE(v.name, 'Self / Walk-in Purchase') as vendor_name,
       TRIM(u.first_name || ' ' || u.last_name) as ordered_by_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM stock_movements sm
         JOIN stock_batches sb ON sm.stock_batch_id = sb.id
         WHERE sm.reference_id = po.id AND sm.reference_type = 'purchase_order'
         AND (sb.expiry_date IS NULL OR sb.expiry_date = '')
       ) THEN 1 ELSE 0 END as has_missing_expiry
     FROM purchase_orders po
     LEFT JOIN suppliers v ON po.supplier_id = v.id
     LEFT JOIN users u ON u.id = po.ordered_by
     WHERE po.id = ? AND po._deleted = 0`,
    [id]
  );
  
  if (!po[0]) return null;

  const items = await query<PurchaseOrderItem>(
    `SELECT poi.*, m.name as product_name, m.base_unit, m.bulk_unit, m.units_per_bulk as product_units_per_bulk
     FROM purchase_order_items poi
     JOIN products m ON poi.product_id = m.id
     WHERE poi.po_id = ? AND poi._deleted = 0`,
    [id]
  );

  return { ...po[0], items };
}

export async function createPurchaseOrder(
  supplierId: string | null,
  notes: string,
  items: DraftPOLineItem[],
  paymentStatus: string = 'unpaid',
  amountPaid: number = 0,
  dueDate: string | null = null,
  type: "standard" | "immediate" = "standard"
) {
  const poId = generateId();
  const now = new Date().toISOString();
  let totalAmount = 0;

  // Derived from bulk_quantity * unit_cost, not item.subtotal: that field is
  // only ever set once when a row is first added and goes stale the moment
  // quantity or cost is edited afterward.
  for (const item of items) {
    totalAmount += item.bulk_quantity * item.unit_cost;
  }

  return transaction(async () => {
    await insert("purchase_orders", {
      id: poId,
      supplier_id: supplierId,
      status: "pending",
      type,
      payment_status: paymentStatus,
      amount_paid: amountPaid,
      due_date: dueDate,
      total_amount: totalAmount,
      notes,
      created_at: now
    });

    for (const item of items) {
      await insert("purchase_order_items", {
        id: generateId(),
        po_id: poId,
        product_id: item.product_id,
        bulk_quantity: item.bulk_quantity,
        quantity_received: 0,
        units_per_bulk: item.units_per_bulk,
        unit_cost: item.unit_cost,
        subtotal: item.bulk_quantity * item.unit_cost,
        selling_price: coerceOptionalNumber(item.selling_price),
        cost_price_override: coerceOptionalNumber(item.cost_price_override),
        lot_number: item.lot_number || null,
        expiry_date: item.expiry_date || null,
        created_at: now
      });
    }

    return poId;
  });
}

export async function updatePurchaseOrder(
  poId: string,
  supplierId: string | null,
  notes: string,
  items: DraftPOLineItem[],
  paymentStatus: string = 'unpaid',
  amountPaid: number = 0,
  dueDate: string | null = null
) {
  const now = new Date().toISOString();
  let totalAmount = 0;

  for (const item of items) {
    totalAmount += item.bulk_quantity * item.unit_cost;
  }

  return transaction(async () => {
    // Soft delete existing items
    const existingItems = await query<{ id: string }>(
      "SELECT id FROM purchase_order_items WHERE po_id = ? AND _deleted = 0",
      [poId]
    );

    for (const item of existingItems) {
      await softDelete("purchase_order_items", item.id);
    }

    // Update PO details
    await update("purchase_orders", poId, {
      supplier_id: supplierId,
      payment_status: paymentStatus,
      amount_paid: amountPaid,
      due_date: dueDate,
      total_amount: totalAmount,
      notes,
      updated_at: now
    });

    // Insert new items
    for (const item of items) {
      await insert("purchase_order_items", {
        id: generateId(),
        po_id: poId,
        product_id: item.product_id,
        bulk_quantity: item.bulk_quantity,
        quantity_received: 0,
        units_per_bulk: item.units_per_bulk,
        unit_cost: item.unit_cost,
        subtotal: item.bulk_quantity * item.unit_cost,
        selling_price: coerceOptionalNumber(item.selling_price),
        cost_price_override: coerceOptionalNumber(item.cost_price_override),
        lot_number: item.lot_number || null,
        expiry_date: item.expiry_date || null,
        created_at: now
      });
    }

    return poId;
  });
}

export async function updatePurchaseOrderStatus(id: string, status: string) {
  const updateData: { status: string; received_at?: string } = { status };
  if (status === "received") {
    updateData.received_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  await update("purchase_orders", id, updateData);
}

/**
 * Loads every supplier, not a page of them: the caller runs search/filter over
 * the result, and suppliers stay small by nature (tens, rarely hundreds), so
 * in-memory filtering stays correct without needing SQL-level WHERE clauses,
 * matching the pattern used by getCustomers()/getPurchaseOrders() etc.
 */
export async function getSuppliers() {
  const storeId = getActiveStoreId();
  const results = await query<SupplierDbRow>(
    `SELECT s.*,
            COALESCE(SUM(po.total_amount - po.amount_paid), 0) as total_debt,
            COALESCE(po_stats.total_orders, 0) as total_orders,
            COALESCE(po_stats.total_value, 0) as total_value,
            po_stats.last_order_date as last_order_date
     FROM suppliers s
     LEFT JOIN purchase_orders po ON s.id = po.supplier_id AND po._deleted = 0 AND po.payment_status != 'paid'${storeId ? " AND po.store_id = ?" : ""}
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

export async function deletePurchaseOrder(id: string) {
  return await softDelete('purchase_orders', id);
}
