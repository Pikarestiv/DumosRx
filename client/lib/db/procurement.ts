/**
 * Procurement Database Helpers
 */

import { query, logAction, generateId } from "./core";
import { insert, update, softDelete } from "./base-helpers";

export interface PurchaseOrder {
  id: string;
  supplier_id: string;
  status: string;
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
}

export async function getPurchaseOrders(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<PurchaseOrder>(
    `SELECT po.*, v.name as vendor_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM stock_movements sm
         JOIN stock_batches sb ON sm.stock_batch_id = sb.id
         WHERE sm.reference_id = po.id AND sm.reference_type = 'purchase_order' 
         AND (sb.expiry_date IS NULL OR sb.expiry_date = '')
       ) THEN 1 ELSE 0 END as has_missing_expiry
     FROM purchase_orders po 
     LEFT JOIN suppliers v ON po.supplier_id = v.id 
     WHERE po._deleted = 0 
     ORDER BY po.created_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return { data: results, page, limit };
}

export async function getPurchaseOrderById(id: string) {
  const po = await query<PurchaseOrder>(
    `SELECT po.*, v.name as vendor_name,
       CASE WHEN EXISTS (
         SELECT 1 FROM stock_movements sm
         JOIN stock_batches sb ON sm.stock_batch_id = sb.id
         WHERE sm.reference_id = po.id AND sm.reference_type = 'purchase_order' 
         AND (sb.expiry_date IS NULL OR sb.expiry_date = '')
       ) THEN 1 ELSE 0 END as has_missing_expiry
     FROM purchase_orders po 
     LEFT JOIN suppliers v ON po.supplier_id = v.id 
     WHERE po.id = ? AND po._deleted = 0`,
    [id]
  );
  
  if (!po[0]) return null;

  const items = await query<PurchaseOrderItem>(
    `SELECT poi.*, m.name as product_name, m.base_unit, m.bulk_unit 
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
  items: any[],
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

  await insert("purchase_orders", {
    id: poId,
    supplier_id: supplierId,
    status: "pending",
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
}

export async function updatePurchaseOrder(
  poId: string,
  supplierId: string, 
  notes: string, 
  items: any[],
  paymentStatus: string = 'unpaid',
  amountPaid: number = 0,
  dueDate: string | null = null
) {
  const now = new Date().toISOString();
  let totalAmount = 0;

  for (const item of items) {
    totalAmount += item.subtotal;
  }

  // Soft delete existing items
  const existingItems = await query<any>(
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
}

export async function updatePurchaseOrderStatus(id: string, status: string) {
  const updateData: any = { status };
  if (status === "received") {
    updateData.received_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
  await update("purchase_orders", id, updateData);
}

export async function receivePurchaseOrder(id: string, receivedItems?: any[]) {
  const poData = await getPurchaseOrderById(id);
  if (!poData || poData.status === "received") return;

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  for (const item of poData.items) {
    const receivedItem = receivedItems?.find(ri => ri.po_item_id === item.id);
    
    // Default to the original ordered bulk quantity if not provided in payload
    const bulkQty = receivedItem?.quantity !== undefined ? Number(receivedItem.quantity) : Number(item.bulk_quantity);
    const unitsPerBulk = Number(item.units_per_bulk);
    const totalBaseUnits = bulkQty * unitsPerBulk;
    
    const batchNumber = receivedItem?.lot_number?.trim() || poData.id.split('-')[0].toUpperCase();
    const expiryDate = receivedItem?.expiry_date ? new Date(receivedItem.expiry_date).toISOString().slice(0, 10) : null;

    const safeUnitsPerBulk = unitsPerBulk || 1;
    const baseUnitCost = Number(item.unit_cost) / safeUnitsPerBulk;

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
      total_cost: Number(item.subtotal),
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
  }

  await updatePurchaseOrderStatus(id, "received");
  await logAction("RECEIVE_PO", "purchase_orders", id, { total_items: poData.items.length });
}

export async function getSuppliers(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<any>(
    `SELECT s.*, 
            COALESCE(SUM(po.total_amount - po.amount_paid), 0) as total_debt
     FROM suppliers s
     LEFT JOIN purchase_orders po ON s.id = po.supplier_id AND po._deleted = 0 AND po.payment_status != 'paid'
     WHERE s._deleted = 0 
     GROUP BY s.id
     ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return { data: results, page, limit };
}

export async function createSupplier(data: any) {
  return await insert("suppliers", data);
}

export async function deletePurchaseOrder(id: string) {
  return await softDelete('purchase_orders', id);
}
