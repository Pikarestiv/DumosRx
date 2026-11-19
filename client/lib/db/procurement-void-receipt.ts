import { query, transaction, logAction } from "./core";
import { insert, update } from "./base-helpers";
import { AUDIT_ACTIONS } from "./audit-actions";
import { deterministicId, receiptBatchId } from "./deterministic-id";
import { getStoredUser } from "@/lib/storage-keys";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { BACKORDER_SETTLEMENT_REFERENCE_TYPE } from "@/lib/constants/stock-adjustments";

export const RECEIPT_REVERSAL_REFERENCE_TYPE = "purchase_order_reversal";

export type ReceiptBlock = "partly_sold" | "settled_backorders" | "already_voided";
export type VoidReceiptOutcome = "voided" | "not_found" | ReceiptBlock;

export interface PurchaseOrderReceipt {
  batch_id: string;
  product_id: string;
  product_name: string;
  batch_number: string | null;
  expiry_date: string | null;
  units: number;
  unit_cost: number;
  received_at: string | null;
  blocked: ReceiptBlock | null;
}

interface ReceiptRow {
  batch_id: string;
  product_id: string;
  product_name: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  units: number;
  unit_cost: number | null;
  received_at: string | null;
  batch_quantity: number | null;
  settlements: number;
  reversals: number;
}

export function receiptReversalId(batchId: string): string {
  return deterministicId("po_receipt_reversal", batchId);
}

function blockFor(row: ReceiptRow): ReceiptBlock | null {
  if (row.reversals > 0) return "already_voided";
  if (row.settlements > 0) return "settled_backorders";
  if (Number(row.batch_quantity) < Number(row.units)) return "partly_sold";
  return null;
}

async function receiptRows(poId: string, batchId?: string): Promise<ReceiptRow[]> {
  return query<ReceiptRow>(
    `SELECT sm.stock_batch_id as batch_id, sm.product_id, p.name as product_name, sb.batch_number, sb.expiry_date,
       sm.quantity as units, sm.unit_cost, sm.movement_date as received_at, sb.quantity as batch_quantity,
       (SELECT COUNT(*) FROM stock_movements s WHERE s.stock_batch_id = sm.stock_batch_id AND s.reference_type = ? AND s._deleted = 0) as settlements,
       (SELECT COUNT(*) FROM stock_movements r WHERE r.stock_batch_id = sm.stock_batch_id AND r.reference_type = ? AND r._deleted = 0) as reversals
     FROM stock_movements sm
     JOIN stock_batches sb ON sb.id = sm.stock_batch_id
     LEFT JOIN products p ON p.id = sm.product_id
     WHERE sm.reference_id = ? AND sm.reference_type = 'purchase_order' AND sm.movement_type = 'purchase'
       AND sm._deleted = 0${batchId ? " AND sm.stock_batch_id = ?" : ""}
     ORDER BY sm.movement_date ASC, sm.created_at ASC`,
    batchId
      ? [BACKORDER_SETTLEMENT_REFERENCE_TYPE, RECEIPT_REVERSAL_REFERENCE_TYPE, poId, batchId]
      : [BACKORDER_SETTLEMENT_REFERENCE_TYPE, RECEIPT_REVERSAL_REFERENCE_TYPE, poId],
  );
}

export async function getPurchaseOrderReceipts(poId: string): Promise<PurchaseOrderReceipt[]> {
  const rows = await receiptRows(poId);
  return rows.map((row) => ({
    batch_id: row.batch_id,
    product_id: row.product_id,
    product_name: row.product_name ?? "Unknown product",
    batch_number: row.batch_number,
    expiry_date: row.expiry_date,
    units: Number(row.units) || 0,
    unit_cost: Number(row.unit_cost) || 0,
    received_at: row.received_at,
    blocked: blockFor(row),
  }));
}

interface ReceiptLine {
  id: string;
  product_id: string;
  bulk_quantity: number;
  quantity_received: number | null;
  units_per_bulk: number;
  product_units_per_bulk: number | null;
}

function lineForBatch(lines: ReceiptLine[], batchId: string, productId: string): ReceiptLine | undefined {
  const byId = lines.find((line) => {
    const received = Number(line.quantity_received) || 0;
    for (let already = 0; already < received; already++) {
      if (receiptBatchId(line.id, already) === batchId) return true;
    }
    return false;
  });
  return byId ?? lines.find((line) => line.product_id === productId && Number(line.quantity_received) > 0);
}

export async function voidPurchaseOrderReceipt(poId: string, batchId: string): Promise<VoidReceiptOutcome> {
  return transaction(async () => {
    const [row] = await receiptRows(poId, batchId);
    if (!row) return "not_found";
    const block = blockFor(row);
    if (block) return block;

    const units = Number(row.units) || 0;
    const unitCost = Number(row.unit_cost) || 0;
    const now = new Date().toISOString();
    await insert("stock_movements", {
      id: receiptReversalId(batchId),
      product_id: row.product_id,
      stock_batch_id: batchId,
      movement_type: "adjustment",
      quantity: -units,
      unit_cost: unitCost,
      total_cost: roundMoney(unitCost * units),
      reference_id: poId,
      reference_type: RECEIPT_REVERSAL_REFERENCE_TYPE,
      reason: "Purchase order receipt voided",
      performed_by: getStoredUser()?.id ?? null,
      movement_date: now,
      created_at: now,
    });

    await reopenLine(poId, batchId, row.product_id, units);
    await logAction(AUDIT_ACTIONS.RECEIVE_PO_REVERSED, "purchase_orders", poId, {
      stock_batch_id: batchId,
      product_id: row.product_id,
      units,
    });
    return "voided";
  });
}

async function reopenLine(poId: string, batchId: string, productId: string, units: number): Promise<void> {
  const lines = await query<ReceiptLine>(
    `SELECT poi.id, poi.product_id, poi.bulk_quantity, poi.quantity_received, poi.units_per_bulk, p.units_per_bulk as product_units_per_bulk
     FROM purchase_order_items poi LEFT JOIN products p ON p.id = poi.product_id
     WHERE poi.po_id = ? AND poi._deleted = 0`,
    [poId],
  );
  const line = lineForBatch(lines, batchId, productId);
  if (line) {
    const unitsPerBulk = Number(line.product_units_per_bulk) || Number(line.units_per_bulk) || 1;
    const received = Number(line.quantity_received) || 0;
    const reversed = Math.min(received, Math.round(units / unitsPerBulk));
    await update("purchase_order_items", line.id, {
      quantity_received: received - reversed,
      bulk_quantity: line.bulk_quantity,
      units_per_bulk: line.units_per_bulk,
    });
  }

  const [order] = await query<{ supplier_id: string | null }>("SELECT supplier_id FROM purchase_orders WHERE id = ?", [poId]);
  const [left] = await query<{ received: number | null }>(
    "SELECT SUM(quantity_received) as received FROM purchase_order_items WHERE po_id = ? AND _deleted = 0",
    [poId],
  );
  const status = Number(left?.received) > 0 ? "partially_received" : order?.supplier_id ? "sent" : "pending";
  await update("purchase_orders", poId, { status });
}
