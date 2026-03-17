/**
 * Procurement Database Helpers
 */

import { query, execute, logAction, generateId } from "./core";
import { insert, update } from "./base-helpers";

export interface PurchaseOrder {
  id: string;
  vendor_id: string;
  status: string;
  total_amount: number;
  notes?: string;
  created_at: string;
  received_at?: string;
  vendor_name: string;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  medicine_id: string;
  bulk_quantity: number;
  units_per_bulk: number;
  unit_cost: number;
  subtotal: number;
  medicine_name: string;
  base_unit: string;
  bulk_unit: string;
}

export async function getPurchaseOrders(page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const results = await query<PurchaseOrder>(
    `SELECT po.*, v.name as vendor_name 
     FROM purchase_orders po 
     JOIN vendors v ON po.vendor_id = v.id 
     WHERE po._deleted = 0 
     ORDER BY po.created_at DESC 
     LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return { data: results, page, limit };
}

export async function getPurchaseOrderById(id: string) {
  const po = await query<PurchaseOrder>(
    `SELECT po.*, v.name as vendor_name 
     FROM purchase_orders po 
     JOIN vendors v ON po.vendor_id = v.id 
     WHERE po.id = ? AND po._deleted = 0`,
    [id]
  );
  
  if (!po[0]) return null;

  const items = await query<PurchaseOrderItem>(
    `SELECT poi.*, m.name as medicine_name, m.base_unit, m.bulk_unit 
     FROM purchase_order_items poi 
     JOIN medicines m ON poi.medicine_id = m.id 
     WHERE poi.po_id = ?`,
    [id]
  );

  return { ...po[0], items };
}

export async function createPurchaseOrder(vendorId: string, notes: string, items: any[]) {
  const poId = generateId();
  const now = new Date().toISOString();
  let totalAmount = 0;

  for (const item of items) {
    totalAmount += item.subtotal;
  }

  await insert("purchase_orders", {
    id: poId,
    vendor_id: vendorId,
    status: "draft",
    total_amount: totalAmount,
    notes,
    created_at: now
  });

  for (const item of items) {
    await insert("purchase_order_items", {
      id: generateId(),
      po_id: poId,
      medicine_id: item.medicine_id,
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
    updateData.received_at = new Date().toISOString();
  }
  await update("purchase_orders", id, updateData);
}

export async function receivePurchaseOrder(id: string) {
  const poData = await getPurchaseOrderById(id);
  if (!poData || poData.status === "received") return;

  const now = new Date().toISOString();

  for (const item of poData.items) {
    const bulkQty = Number(item.bulk_quantity);
    const unitsPerBulk = Number(item.units_per_bulk);
    const totalBaseUnits = bulkQty * unitsPerBulk;
    
    await execute(
      `UPDATE medicines SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?`,
      [totalBaseUnits, now, item.medicine_id]
    );

    await insert("inventory", {
      medicine_id: item.medicine_id,
      quantity: totalBaseUnits,
      cost_price: Number(item.unit_cost) / unitsPerBulk,
      selling_price: 0,
      batch_number: poData.id.split('-')[0].toUpperCase(),
      expiry_date: null,
      created_at: now
    });
  }

  await updatePurchaseOrderStatus(id, "received");
  await logAction("RECEIVE_PO", "purchase_orders", id, { total_items: poData.items.length });
}
