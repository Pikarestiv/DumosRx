/**
 * Procurement Database Helpers
 */

import { query, logAction, generateId, transaction, getActiveStoreId } from "./core";
import { insert, update, softDelete } from "./base-helpers";
import type { SupplierPayload, SupplierDbRow } from "@/lib/types/supplier";

export interface PurchaseOrder {
  id: string;
  order_number?: string;
  order_date?: string;
  supplier_id: string;
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
  units_per_bulk: number;
  unit_cost: number;
  subtotal: number;
  product_name: string;
  base_unit: string;
  bulk_unit: string;
  /** Live conversion factor from the product record; always used for receiving math, since units_per_bulk above is a point-in-time snapshot that can go stale if the product's packaging is edited later. */
  product_units_per_bulk: number;
}

/** Per-line-item receiving overrides submitted from the "Receive Order" form:
 * only po_item_id is required, the rest default to the ordered quantity/PO id. */
export interface ReceivedItem {
  po_item_id: string;
  quantity?: number | string;
  lot_number?: string;
  expiry_date?: string;
  /** Overrides the PO line's unit cost for this receipt, if the actual
   * invoiced cost differs from what was ordered. */
  cost_price?: number | string;
  /** When set, updates the product's global selling price; lets a price
   * change discovered while receiving stock be applied immediately instead
   * of requiring a separate trip to the product's edit screen. */
  selling_price?: number | string;
}

/** A line item as it exists in the create/edit PO form before submission:
 * not yet persisted, so it has no `id`/`po_id` (those are assigned by
 * createPurchaseOrder()/updatePurchaseOrder()). */
export interface DraftPOLineItem {
  product_id: string;
  product_name: string;
  bulk_unit: string;
  bulk_quantity: number;
  units_per_bulk: number;
  unit_cost: number;
  subtotal: number;
}

export interface ImmediateLineItemDraft extends DraftPOLineItem {
  /** Overrides unit_cost for the batch actually created, if the invoiced
   * cost differs from what was typed while building the order. */
  cost_price_override?: number | string;
  lot_number?: string;
  expiry_date?: string;
  /** When set, updates the product's global selling price (same effect
   * as ReceivedItem.selling_price in receivePurchaseOrder). */
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
    `SELECT po.*, v.name as vendor_name,
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
    `SELECT po.*, v.name as vendor_name,
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
  supplierId: string,
  notes: string,
  items: DraftPOLineItem[],
  paymentStatus: string = 'unpaid',
  amountPaid: number = 0,
  dueDate: string | null = null
) {
  const poId = generateId();
  const now = new Date().toISOString();
  let totalAmount = 0;

  for (const item of items) {
    totalAmount += item.subtotal;
  }

  return transaction(async () => {
    await insert("purchase_orders", {
      id: poId,
      supplier_id: supplierId,
      status: "pending",
      type: "standard",
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
        units_per_bulk: item.units_per_bulk,
        unit_cost: item.unit_cost,
        subtotal: item.subtotal,
        created_at: now
      });
    }

    return poId;
  });
}

export async function updatePurchaseOrder(
  poId: string,
  supplierId: string,
  notes: string,
  items: DraftPOLineItem[],
  paymentStatus: string = 'unpaid',
  amountPaid: number = 0,
  dueDate: string | null = null
) {
  const now = new Date().toISOString();
  let totalAmount = 0;

  for (const item of items) {
    totalAmount += item.subtotal;
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
        units_per_bulk: item.units_per_bulk,
        unit_cost: item.unit_cost,
        subtotal: item.subtotal,
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

export async function receivePurchaseOrder(id: string, receivedItems?: ReceivedItem[]) {
  const poData = await getPurchaseOrderById(id);
  if (!poData || poData.status === "received") return;

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  return transaction(async () => {
    for (const item of poData.items) {
      const receivedItem = receivedItems?.find(ri => ri.po_item_id === item.id);

      // Default to the original ordered bulk quantity if not provided in payload
      const bulkQty = receivedItem?.quantity !== undefined ? Number(receivedItem.quantity) : Number(item.bulk_quantity);
      // Always use the product's current conversion factor, not the snapshot stored on the
      // PO line item: the product's packaging may have been corrected since the order was placed.
      const unitsPerBulk = Number(item.product_units_per_bulk) || Number(item.units_per_bulk) || 1;
      const totalBaseUnits = bulkQty * unitsPerBulk;

      const batchNumber = receivedItem?.lot_number?.trim() || poData.id.split('-')[0].toUpperCase();
      const expiryDate = receivedItem?.expiry_date ? new Date(receivedItem.expiry_date).toISOString().slice(0, 10) : null;

      const safeUnitsPerBulk = unitsPerBulk || 1;
      const baseUnitCost =
        receivedItem?.cost_price !== undefined && receivedItem.cost_price !== ""
          ? Number(receivedItem.cost_price)
          : Number(item.unit_cost) / safeUnitsPerBulk;

      const invId = await insert("stock_batches", {
        product_id: item.product_id,
        quantity: totalBaseUnits,
        cost_price: baseUnitCost,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        created_at: now,
        is_active: 1,
        _version: 1,
        _synced: 0,
        _deleted: 0
      });

      // Log local stock movement
      const dumosUser = JSON.parse(localStorage.getItem("dumos_user") || "{}");
      await insert("stock_movements", {
        id: crypto.randomUUID(),
        product_id: item.product_id,
        stock_batch_id: invId,
        movement_type: "purchase",
        quantity: totalBaseUnits,
        unit_cost: baseUnitCost,
        // Recalculated from what was actually received, not item.subtotal (the full
        // ordered-line total): those diverge whenever this is a partial receipt.
        total_cost: baseUnitCost * totalBaseUnits,
        reference_id: poData.id,
        reference_type: "purchase_order",
        reason: "Purchase order received",
        performed_by: dumosUser?.id || null,
        movement_date: now,
        created_at: now,
        _version: 1,
        _synced: 0,
        _deleted: 0
      });

      if (receivedItem?.selling_price !== undefined && receivedItem.selling_price !== "") {
        await update("products", item.product_id, {
          selling_price: Number(receivedItem.selling_price),
        });
      }
    }

    await updatePurchaseOrderStatus(id, "received");
    await logAction("RECEIVE_PO", "purchase_orders", id, { total_items: poData.items.length });
  });
}

/** Immediate Purchase: order and receipt happen in one transaction. Unlike
 * createPurchaseOrder() + receivePurchaseOrder(), this never leaves the PO
 * sitting in "pending" — it's created already "received", with its stock
 * batches, in a single atomic step. Reuses the exact per-item batch/cost/
 * expiry math receivePurchaseOrder() uses for Standard POs. */
export async function createAndReceivePurchaseOrder(
  supplierId: string,
  notes: string,
  items: ImmediateLineItemDraft[],
  paymentStatus: string = 'unpaid',
  amountPaid: number = 0,
  dueDate: string | null = null
) {
  const poId = generateId();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  let totalAmount = 0;
  for (const item of items) {
    totalAmount += item.subtotal;
  }

  return transaction(async () => {
    await insert("purchase_orders", {
      id: poId,
      supplier_id: supplierId,
      status: "received",
      type: "immediate",
      payment_status: paymentStatus,
      amount_paid: amountPaid,
      due_date: dueDate,
      total_amount: totalAmount,
      notes,
      created_at: now,
      received_at: now,
    });

    const dumosUser = JSON.parse(localStorage.getItem("dumos_user") || "{}");

    for (const item of items) {
      const poItemId = generateId();
      await insert("purchase_order_items", {
        id: poItemId,
        po_id: poId,
        product_id: item.product_id,
        bulk_quantity: item.bulk_quantity,
        units_per_bulk: item.units_per_bulk,
        unit_cost: item.unit_cost,
        subtotal: item.subtotal,
        created_at: now,
      });

      const totalBaseUnits = item.bulk_quantity * item.units_per_bulk;
      const batchNumber = item.lot_number?.trim() || poId.split('-')[0].toUpperCase();
      const expiryDate = item.expiry_date ? new Date(item.expiry_date).toISOString().slice(0, 10) : null;

      const safeUnitsPerBulk = item.units_per_bulk || 1;
      const baseUnitCost =
        item.cost_price_override !== undefined && item.cost_price_override !== ""
          ? Number(item.cost_price_override)
          : Number(item.unit_cost) / safeUnitsPerBulk;

      const invId = await insert("stock_batches", {
        product_id: item.product_id,
        quantity: totalBaseUnits,
        cost_price: baseUnitCost,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        created_at: now,
        is_active: 1,
        _version: 1,
        _synced: 0,
        _deleted: 0
      });

      await insert("stock_movements", {
        id: crypto.randomUUID(),
        product_id: item.product_id,
        stock_batch_id: invId,
        movement_type: "purchase",
        quantity: totalBaseUnits,
        unit_cost: baseUnitCost,
        total_cost: baseUnitCost * totalBaseUnits,
        reference_id: poId,
        reference_type: "purchase_order",
        reason: "Immediate purchase received",
        performed_by: dumosUser?.id || null,
        movement_date: now,
        created_at: now,
        _version: 1,
        _synced: 0,
        _deleted: 0
      });

      if (item.selling_price !== undefined && item.selling_price !== "") {
        await update("products", item.product_id, {
          selling_price: Number(item.selling_price),
        });
      }
    }

    await logAction("RECEIVE_PO", "purchase_orders", poId, { total_items: items.length });

    return poId;
  });
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
     LEFT JOIN purchase_orders po ON s.id = po.supplier_id AND po._deleted = 0 AND po.payment_status != 'paid'
     LEFT JOIN (
       SELECT supplier_id, COUNT(*) as total_orders, SUM(total_amount) as total_value, MAX(order_date) as last_order_date
       FROM purchase_orders
       WHERE _deleted = 0
       GROUP BY supplier_id
     ) po_stats ON po_stats.supplier_id = s.id
     WHERE s._deleted = 0${storeId ? " AND s.store_id = ?" : ""}
     GROUP BY s.id
     ORDER BY s.created_at DESC`,
    storeId ? [storeId] : [],
  );
  return { data: results };
}

export async function createSupplier(data: SupplierPayload) {
  return await insert("suppliers", data);
}

export async function deletePurchaseOrder(id: string) {
  return await softDelete('purchase_orders', id);
}
