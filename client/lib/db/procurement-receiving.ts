/**
 * Purchase Order Receiving
 *
 * Split out from procurement.ts (which keeps PO/supplier CRUD): everything
 * here is specifically about turning an order into real stock — creating
 * stock_batches/stock_movements rows and marking the order received, for
 * both a Standard PO (receivePurchaseOrder, after createPurchaseOrder) and
 * an Immediate Purchase (createAndReceivePurchaseOrder, order + receipt in
 * one atomic step).
 */

import { generateId, logAction, transaction } from "./core";
import { insert, update } from "./base-helpers";
import {
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  type DraftPOLineItem,
} from "./procurement";

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

/** Cost per single base unit (e.g. per tablet), for an Immediate Purchase
 * line: the override typed into "New Cost" if present, otherwise the
 * catalog unit_cost (which is per-bulk-unit, e.g. per carton) converted
 * down by units_per_bulk. Both this and computeImmediateLineTotal() must
 * stay the single source of truth for this math — it's what's stored as
 * stock_batches.cost_price, and what the order total is derived from, so
 * a second, differently-scaled copy of this formula is how "New Cost" and
 * "Total" drift out of sync with each other. */
function immediateBaseUnitCost(item: ImmediateLineItemDraft): number {
  const safeUnitsPerBulk = item.units_per_bulk || 1;
  return item.cost_price_override !== undefined && item.cost_price_override !== ""
    ? Number(item.cost_price_override)
    : Number(item.unit_cost) / safeUnitsPerBulk;
}

/** Line total in currency, from the same per-base-unit cost used for stock
 * costing — not item.subtotal, which is only ever set once when the row is
 * first added and never kept in sync with later quantity/cost edits. */
function computeImmediateLineTotal(item: ImmediateLineItemDraft): number {
  const totalBaseUnits = item.bulk_quantity * (item.units_per_bulk || 1);
  return immediateBaseUnitCost(item) * totalBaseUnits;
}

/** Immediate Purchase: order and receipt happen in one transaction. Unlike
 * createPurchaseOrder() + receivePurchaseOrder(), this never leaves the PO
 * sitting in "pending" — it's created already "received", with its stock
 * batches, in a single atomic step. Reuses the exact per-item batch/cost/
 * expiry math receivePurchaseOrder() uses for Standard POs. */
export async function createAndReceivePurchaseOrder(
  supplierId: string | null,
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
    totalAmount += computeImmediateLineTotal(item);
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
        subtotal: computeImmediateLineTotal(item),
        created_at: now,
      });

      const totalBaseUnits = item.bulk_quantity * item.units_per_bulk;
      const batchNumber = item.lot_number?.trim() || poId.split('-')[0].toUpperCase();
      const expiryDate = item.expiry_date ? new Date(item.expiry_date).toISOString().slice(0, 10) : null;

      const baseUnitCost = immediateBaseUnitCost(item);

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
