import { query, generateId } from "./core";
import { insert, update, softDelete } from "./base-helpers";
import { coerceOptionalNumber } from "./procurement-selling-price";
import { roundMoney } from "@/lib/utils/pos-calculations";
import { immediateLineAmount } from "@/components/procurement/po-line-item-math";
import type { DraftPOLineItem } from "./procurement";

interface LivePOLineItem {
  id: string;
  po_id: string;
  product_id: string;
  bulk_quantity: number;
  units_per_bulk: number;
  unit_cost: number;
  subtotal: number;
  selling_price: number | null;
  cost_price_override: number | null;
  lot_number: string | null;
  expiry_date: string | null;
}

export async function reconcilePurchaseOrderLines(
  poId: string,
  lines: DraftPOLineItem[],
  now: string
): Promise<void> {
  const existingItems = await query<LivePOLineItem>(
    `SELECT id, po_id, product_id, bulk_quantity, units_per_bulk, unit_cost, subtotal, selling_price, cost_price_override, lot_number, expiry_date
     FROM purchase_order_items
     WHERE po_id = ? AND _deleted = 0`,
    [poId]
  );

  const remainingExisting = [...existingItems];
  const matchedPairs: Array<{ line: DraftPOLineItem; existing: LivePOLineItem }> = [];
  const unmatchedLines: DraftPOLineItem[] = [];

  for (const line of lines) {
    if (line.id) {
      const idx = remainingExisting.findIndex((e) => e.id === line.id);
      if (idx !== -1) {
        matchedPairs.push({ line, existing: remainingExisting[idx] });
        remainingExisting.splice(idx, 1);
        continue;
      }
    }
    unmatchedLines.push(line);
  }

  const inserts: DraftPOLineItem[] = [];
  for (const line of unmatchedLines) {
    const idx = remainingExisting.findIndex((e) => e.product_id === line.product_id);
    if (idx !== -1) {
      matchedPairs.push({ line, existing: remainingExisting[idx] });
      remainingExisting.splice(idx, 1);
    } else {
      inserts.push(line);
    }
  }

  for (const { line, existing } of matchedPairs) {
    const desiredSubtotal = roundMoney(immediateLineAmount(line));
    const desiredSellingPrice = coerceOptionalNumber(line.selling_price);
    const desiredCostOverride = coerceOptionalNumber(line.cost_price_override);
    const desiredLotNumber = line.lot_number || null;
    const desiredExpiryDate = line.expiry_date || null;

    const hasChanged =
      Number(existing.bulk_quantity) !== Number(line.bulk_quantity) ||
      Number(existing.units_per_bulk) !== Number(line.units_per_bulk) ||
      Number(existing.unit_cost) !== Number(line.unit_cost) ||
      Number(existing.subtotal) !== desiredSubtotal ||
      (existing.selling_price ?? null) !== desiredSellingPrice ||
      (existing.cost_price_override ?? null) !== desiredCostOverride ||
      (existing.lot_number ?? null) !== desiredLotNumber ||
      (existing.expiry_date ?? null) !== desiredExpiryDate;

    if (hasChanged) {
      await update("purchase_order_items", existing.id, {
        bulk_quantity: line.bulk_quantity,
        units_per_bulk: line.units_per_bulk,
        unit_cost: line.unit_cost,
        subtotal: desiredSubtotal,
        selling_price: desiredSellingPrice,
        cost_price_override: desiredCostOverride,
        lot_number: desiredLotNumber,
        expiry_date: desiredExpiryDate,
      });
    }
  }

  for (const line of inserts) {
    await insert("purchase_order_items", {
      id: line.id || generateId(),
      po_id: poId,
      product_id: line.product_id,
      bulk_quantity: line.bulk_quantity,
      quantity_received: 0,
      units_per_bulk: line.units_per_bulk,
      unit_cost: line.unit_cost,
      subtotal: roundMoney(immediateLineAmount(line)),
      selling_price: coerceOptionalNumber(line.selling_price),
      cost_price_override: coerceOptionalNumber(line.cost_price_override),
      lot_number: line.lot_number || null,
      expiry_date: line.expiry_date || null,
      created_at: now,
    });
  }

  for (const removed of remainingExisting) {
    await softDelete("purchase_order_items", removed.id);
  }
}
