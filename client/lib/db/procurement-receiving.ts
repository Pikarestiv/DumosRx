// Purchase Order Receiving
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-procurement-receiving-L1

import { generateId, logAction, query, transaction } from "./core";
import { receiptBatchId, receiptMovementId } from "./deterministic-id";
import { insert, update } from "./base-helpers";
import {
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  coerceOptionalNumber,
  type DraftPOLineItem,
} from "./procurement";
import { getStoredUser } from "@/lib/storage-keys";
import {
  immediateLineAmount,
  resolveBaseUnitCost,
} from "@/components/procurement/po-line-item-math";
import { roundMoney } from "@/lib/utils/pos-calculations";

/** Per-line-item receiving overrides submitted from the "Receive Order" form:
 * only po_item_id is required, the rest default to the ordered quantity/PO id. */
export interface ReceivedItem {
  po_item_id: string;
  quantity?: number | string;
  lot_number?: string;
  expiry_date?: string;
  // Overrides the PO line's cost for this receipt, if the actual invoiced cost differs from what was ordered.
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-procurement-receiving-ts-L27
  cost_price?: number | string;
  // When set, updates the product's global selling price; lets a price change discovered while receiving stock be applied immediately instead of…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-procurement-receiving-ts-L32
  selling_price?: number | string;
  // The product's live selling_price when the receive panel was opened - not written anywhere, just carried through so a caller can tell whether…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#db-procurement-receiving-ts-L36
  current_selling_price?: number | null;
  product_id?: string;
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
    let outstandingRemains = false;
    let anyQuantityReceived = false;

    for (const item of poData.items) {
      const receivedItem = receivedItems?.find(ri => ri.po_item_id === item.id);

      // Re-read the line's received balance INSIDE the transaction rather than trusting the poData snapshot taken before it:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-procurement-receiving-ts-L63
      const receivedRows = await query<{ quantity_received: number | null }>(
        "SELECT quantity_received FROM purchase_order_items WHERE id = ?",
        [item.id],
      );
      const alreadyReceived = Math.max(
        0,
        Number(receivedRows[0]?.quantity_received ?? item.quantity_received) || 0,
      );
      const outstanding = Math.max(0, Number(item.bulk_quantity) - alreadyReceived);

      // Default to the whole outstanding balance if not provided in payload.
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-procurement-receiving-ts-L80
      const bulkQty = receivedItem?.quantity !== undefined
        ? Math.min(outstanding, Math.max(0, Number(receivedItem.quantity)))
        : outstanding;

      if (bulkQty < outstanding) outstandingRemains = true;
      if (alreadyReceived + bulkQty > 0) anyQuantityReceived = true;

      if (bulkQty === 0) continue;

      // Always use the product's current conversion factor, not the snapshot stored on the
      // PO line item: the product's packaging may have been corrected since the order was placed.
      const unitsPerBulk = Number(item.product_units_per_bulk) || Number(item.units_per_bulk) || 1;
      const totalBaseUnits = bulkQty * unitsPerBulk;

      const batchNumber = receivedItem?.lot_number?.trim() || poData.id.split('-')[0].toUpperCase();
      const expiryDate = receivedItem?.expiry_date ? new Date(receivedItem.expiry_date).toISOString().slice(0, 10) : null;

      // Same helper the Immediate Purchase flow uses, so the two paths can't drift on what "cost" means:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-procurement-receiving-ts-L102
      const baseUnitCost = resolveBaseUnitCost({
        costOverride: receivedItem?.cost_price,
        unitCost: Number(item.unit_cost),
        unitsPerBulk,
      });

      // Deterministic, not random:
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-procurement-receiving-ts-L111
      const invId = await insert("stock_batches", {
        id: receiptBatchId(item.id, alreadyReceived),
        product_id: item.product_id,
        quantity: 0,
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
      const dumosUser = getStoredUser() ?? {};
      await insert("stock_movements", {
        id: receiptMovementId(item.id, alreadyReceived),
        product_id: item.product_id,
        stock_batch_id: invId,
        movement_type: "purchase",
        quantity: totalBaseUnits,
        unit_cost: baseUnitCost,
        // Recalculated from what was actually received, not item.subtotal (the full
        // ordered-line total): those diverge whenever this is a partial receipt.
        total_cost: roundMoney(baseUnitCost * totalBaseUnits),
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
          selling_price: Math.max(0, Number(receivedItem.selling_price)),
        });
      }

      // bulk_quantity/units_per_bulk are re-sent unchanged so the sync push's purchase_order_items mapping (SyncController::push) can scale quantity…
      // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-procurement-receiving-ts-L166
      await update("purchase_order_items", item.id, {
        quantity_received: alreadyReceived + bulkQty,
        bulk_quantity: item.bulk_quantity,
        units_per_bulk: item.units_per_bulk,
      });
    }

    // A submit with every line left at 0 against a PO that has nothing received yet isn't a partial receipt, it's a no-op — the order stays exactl…
    // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-db-procurement-receiving-ts-L178
    if (outstandingRemains && !anyQuantityReceived) return;

    const status = outstandingRemains ? "partially_received" : "received";
    await updatePurchaseOrderStatus(id, status);
    await logAction("RECEIVE_PO", "purchase_orders", id, {
      total_items: poData.items.length,
      status,
    });

    return status;
  });
}

/** Cost per single base unit for an Immediate Purchase line. Delegates
 * rather than repeating the conversion - see A-261. */
function immediateBaseUnitCost(item: ImmediateLineItemDraft): number {
  return resolveBaseUnitCost({
    costOverride: item.cost_price_override,
    unitCost: item.unit_cost,
    unitsPerBulk: item.units_per_bulk,
  });
}

// What the line costs on the ORDER - the figure the owner is invoiced for - not item.subtotal, which is only set when the row is first added.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-procurement-receiving-ts-L208
function computeImmediateLineTotal(item: ImmediateLineItemDraft): number {
  return roundMoney(immediateLineAmount(item));
}

// Immediate Purchase: order and receipt happen in one transaction.
// Rationale: docs/CLIENT_LIB_COMMENTS.md#db-procurement-receiving-ts-L217
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
      total_amount: roundMoney(totalAmount),
      notes,
      created_at: now,
      received_at: now,
    });

    const dumosUser = getStoredUser() ?? {};

    for (const item of items) {
      const poItemId = generateId();
      await insert("purchase_order_items", {
        id: poItemId,
        po_id: poId,
        product_id: item.product_id,
        bulk_quantity: item.bulk_quantity,
        quantity_received: item.bulk_quantity,
        units_per_bulk: item.units_per_bulk,
        unit_cost: item.unit_cost,
        subtotal: computeImmediateLineTotal(item),
        selling_price: coerceOptionalNumber(item.selling_price),
        cost_price_override: coerceOptionalNumber(item.cost_price_override),
        lot_number: item.lot_number || null,
        expiry_date: item.expiry_date || null,
        created_at: now,
      });

      const totalBaseUnits = item.bulk_quantity * item.units_per_bulk;
      const batchNumber = item.lot_number?.trim() || poId.split('-')[0].toUpperCase();
      const expiryDate = item.expiry_date ? new Date(item.expiry_date).toISOString().slice(0, 10) : null;

      const baseUnitCost = immediateBaseUnitCost(item);

      const invId = await insert("stock_batches", {
        product_id: item.product_id,
        quantity: 0,
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
        total_cost: roundMoney(baseUnitCost * totalBaseUnits),
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
          selling_price: Math.max(0, Number(item.selling_price)),
        });
      }
    }

    await logAction("RECEIVE_PO", "purchase_orders", poId, { total_items: items.length });

    return poId;
  });
}
